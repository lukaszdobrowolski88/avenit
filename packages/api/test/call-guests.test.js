// Goście w rozmowach audio/wideo (link „zaproś gościa”, src/calls/guests.js, migracja 097):
// kto tworzy link (admin grupy vs członek, 1:1, odmowa przy niepełnoletnich), wygaśnięcie
// i wyłączenie, poczekalnia (prośba → wpuszczenie → token; odrzucenie), grant tokenu (jeden pokój,
// tożsamość gościa), publiczne endpointy bez danych rozmowy, limit per IP, webhook z gościem.
//
// PGlite i livekit-server-sdk: testy z nich korzystające pomijają się, gdy modułu brak. Lokalnie:
//   PGLITE_MODULE=/…/@electric-sql/pglite/dist/index.js LIVEKIT_SDK_MODULE=/…/livekit-server-sdk/dist/index.js npm test
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { decodeJwt } from 'jose';
import * as L from '../src/calls/logic.js';
import { createLivekit } from '../src/calls/livekit.js';
import { startCall, joinCall, leaveCall, handleLivekitEvent, setCallDeps } from '../src/calls/service.js';
import {
  normalizeGuestName, linkState, ttlSeconds, normalizeMaxUses, hashSecret, secretMatches, guestDisplayName,
  createGuestLink, listGuestLinks, revokeGuestLink, admitGuest, denyGuest,
  guestInfo, guestRequest, guestStatus, guestLeave, expireStaleGuestRequests, MAX_PENDING_PER_LINK,
} from '../src/calls/guests.js';
import { conversationScope } from '../src/dataapi/komunikator.js';
import { buildQuery } from '../src/dataapi/querybuilder.js';
import { canAccess } from '../src/dataapi/registry.js';

let PGlite = null;
try { ({ PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')); } catch { PGlite = null; }
let SDK = null;
try { SDK = await import(process.env.LIVEKIT_SDK_MODULE || 'livekit-server-sdk'); } catch { SDK = null; }
const skipDb = PGlite ? false : 'brak @electric-sql/pglite (ustaw PGLITE_MODULE)';
const skipSdk = SDK ? false : 'brak livekit-server-sdk (npm install albo LIVEKIT_SDK_MODULE)';

const settle = () => new Promise((r) => setTimeout(r, 30));
const log = { error() {}, warn() {}, info() {} };
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const C_DM = id(1), C_KID = id(2), C_TEAM = id(3), C_KIDS_GROUP = id(4), C_OTHER = id(5);
const U = (name) => ({ id: name, email: `${name}@x.pl` });

// ── Reguły czyste ───────────────────────────────────────────────────────────
test('imię gościa: bez znaków sterujących, spacje złączone, najwyżej 60 znaków', () => {
  assert.equal(normalizeGuestName('  Anna \n  Nowak\u0007 '), 'Anna Nowak');
  assert.equal(normalizeGuestName('\u202eevil'), 'evil');
  assert.equal(normalizeGuestName('   '), '');
  assert.equal(normalizeGuestName(null), '');
  assert.equal(Array.from(normalizeGuestName('ż'.repeat(100))).length, 60);
  assert.equal(guestDisplayName('Anna'), 'Anna (gość)');
});

test('link: czas ważności, limit osób, stan (wyłączony / wygasły / pełny)', () => {
  assert.equal(ttlSeconds('1h'), 3600);
  assert.equal(ttlSeconds('7d'), 604800);
  assert.equal(ttlSeconds('100y'), 86400, 'domyślnie 24 h');
  assert.equal(normalizeMaxUses(''), null);
  assert.equal(normalizeMaxUses(0), null);
  assert.equal(normalizeMaxUses('3'), 3);
  assert.equal(normalizeMaxUses(-2), null);
  assert.equal(normalizeMaxUses(10_000), 500);
  const now = Date.parse('2026-10-10T12:00:00Z');
  const future = new Date(now + 60_000).toISOString();
  assert.equal(linkState({ expires_at: future, uses: 0 }, now), 'ok');
  assert.equal(linkState({ expires_at: future, revoked_at: future }, now), 'revoked');
  assert.equal(linkState({ expires_at: new Date(now - 1).toISOString() }, now), 'expired');
  assert.equal(linkState({ expires_at: future, max_uses: 2, uses: 2 }, now), 'full');
  assert.equal(linkState(null), 'missing');
});

test('sekret prośby: porównanie skrótu, zły / pusty sekret odrzucony', () => {
  const s = 'a'.repeat(43);
  const h = hashSecret(s);
  assert.equal(secretMatches(h, s), true);
  assert.equal(secretMatches(h, 'b'.repeat(43)), false);
  assert.equal(secretMatches(h, ''), false);
  assert.equal(secretMatches(h, 'krótki'), false);
  assert.equal(secretMatches(null, s), false);
});

test('grant gościa: tylko ten pokój, nadaje audio/wideo, bez kanału danych; tożsamość gościa', () => {
  assert.deepEqual(L.videoGrant('avn_t_x', { canPublish: true, canPublishData: false }), {
    room: 'avn_t_x', roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: false, canUpdateOwnMetadata: false,
  });
  assert.equal(L.videoGrant('r').canPublishData, true, 'konta bez zmian');
  assert.equal(L.isGuestIdentity('guest:abc'), true);
  assert.equal(L.isGuestIdentity('jan@x.pl'), false);
});

test('token gościa (prawdziwy SDK): tożsamość guest:…, nazwa „(gość)”, 15 min, jeden pokój, bez admina', { skip: skipSdk }, async () => {
  const lk = createLivekit({ settings: { enabled: true, apiKey: 'APIkey', apiSecret: 'a'.repeat(32), url: 'wss://rtc.t', host: 'http://x' }, sdk: SDK });
  const jwt = await lk.mintToken({ identity: 'guest:ab12', name: 'Anna (gość)', room: 'avn_t_r', canPublish: true, canPublishData: false, ttl: '15m', metadata: { guest: true } });
  const c = decodeJwt(jwt);
  assert.equal(c.sub, 'guest:ab12');
  assert.equal(c.name, 'Anna (gość)');
  assert.equal(c.exp - c.nbf, 900);
  assert.equal(c.video.room, 'avn_t_r');
  assert.equal(c.video.roomJoin, true);
  assert.equal(c.video.canPublish, true);
  assert.equal(c.video.canPublishData, false);
  assert.ok(!c.video.roomAdmin && !c.video.roomCreate && !c.video.roomList && !c.video.roomRecord);
});

test('registry: poczekalnia tylko do odczytu, sekret ukryty, linki poza /api/db', async () => {
  for (const op of ['insert', 'update', 'delete', 'upsert']) {
    const r = await canAccess({ pool: null, dbName: 'x', table: 'call_guest_requests', op, user: { role: 'superadmin', is_super_admin: true } });
    assert.equal(r.ok, false, op);
  }
  const b = buildQuery({ table: 'call_guest_requests', op: 'select', select: '*', filters: [], __ownerScope: conversationScope('call_guest_requests', { email: 'a@x.pl' }) });
  assert.match(b.sql, /- 'secret_hash'/, 'sekret wycięty z wiersza');
  assert.throws(() => buildQuery({ table: 'call_guest_requests', op: 'select', select: '*', filters: [{ type: 'eq', column: 'secret_hash', value: 'x' }] }));
  assert.throws(() => buildQuery({ table: 'call_guest_links', op: 'select', select: '*', filters: [] }), (e) => e.status === 403);
});

// ── Baza (PGlite) ───────────────────────────────────────────────────────────
function poolOf(pg) {
  let lock = Promise.resolve();
  const run = async (sql, params) => {
    const r = await pg.query(sql, params);
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
  };
  return {
    async query(sql, params) { await lock; return run(sql, params); },
    async connect() {
      let release; const prev = lock;
      lock = new Promise((res) => { release = res; });
      await prev;
      return { query: run, release: () => release() };
    },
  };
}

let db;
const q1 = async (sql, params) => (await db.query(sql, params)).rows;

function fakeLivekit() {
  const lk = {
    enabled: true,
    settings: { url: 'wss://rtc.test', enabled: true },
    minted: [], deleted: [], removed: [], occupancy: new Map(),
    async mintToken(o) { lk.minted.push(o); return `tok:${o.identity}:${o.room}`; },
    async deleteRoom(r) { lk.deleted.push(r); return true; },
    async removeParticipant(r, i) { lk.removed.push([r, i]); return true; },
    async roomOccupancy() { return lk.occupancy; },
  };
  return lk;
}
function harness({ blocked = false } = {}) {
  const h = { emitted: [], livekit: fakeLivekit() };
  h.ctx = {
    db, tenantSlug: 'kosciol', log, tenant: { name: 'Kościół Testowy', blocked },
    deps: {
      livekit: h.livekit,
      emit: (slug, table, op, rows, opts) => h.emitted.push({ slug, table, op, rows, audience: [...(opts?.audience || [])].sort() }),
      sendPush: async () => ({ status: 200 }),
      notifyMessage: async () => {},
      timers: false,
    },
  };
  return h;
}
const backdateLink = (linkId, sec) => db.query(`UPDATE call_guest_links SET expires_at = now() - $2 * interval '1 second' WHERE id = $1`, [linkId, sec]);

before(async () => {
  if (skipDb) return;
  const pg = new PGlite();
  db = poolOf(pg);
  await pg.exec(`
    CREATE TABLE app_users (id serial PRIMARY KEY, email text, full_name text, name text, role text, is_super_admin boolean DEFAULT false,
      is_active boolean DEFAULT true, member_id int, avatar_url text);
    CREATE TABLE app_roles (key text PRIMARY KEY, is_admin boolean DEFAULT false);
    CREATE TABLE app_settings (key text PRIMARY KEY, value text);
    CREATE TABLE members (id serial PRIMARY KEY, email text, birth_date date, household_id int);
    CREATE TABLE user_blocks (blocker_email text, blocked_email text, created_at timestamptz DEFAULT now(), PRIMARY KEY (blocker_email, blocked_email));
    CREATE TABLE account_events (id bigserial PRIMARY KEY, email varchar(255), action varchar(40) NOT NULL, actor varchar(255), detail text, created_at timestamptz DEFAULT now());
    CREATE TABLE conversations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), type text, name text, ministry_key text,
      posting_policy text DEFAULT 'everyone', created_by text, last_message_at timestamptz, last_message_preview text,
      created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE TABLE conversation_participants (id serial PRIMARY KEY, conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
      user_email text, role text, muted boolean DEFAULT false, muted_until timestamptz, archived boolean DEFAULT false,
      UNIQUE (conversation_id, user_email));
    CREATE TABLE messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
      sender_email text NOT NULL, content text NOT NULL, message_type text DEFAULT 'text', metadata jsonb DEFAULT '{}'::jsonb,
      mentions jsonb DEFAULT '[]'::jsonb, attachments jsonb DEFAULT '[]', created_at timestamptz DEFAULT now());
  `);
  await db.query(`INSERT INTO app_settings (key, value) VALUES ('org_name', 'Społeczność Testowa')`);
  await db.query(`INSERT INTO app_users (email, full_name, role, member_id, is_super_admin) VALUES
    ('jan@x.pl', 'Jan Kowalski', 'czlonek', 1, false), ('ola@x.pl', 'Ola Nowak', 'czlonek', 2, false),
    ('kid@x.pl', 'Dziecko', 'czlonek', 3, false), ('boss@x.pl', 'Pastor', 'czlonek', 4, true),
    ('obcy@x.pl', 'Obcy', 'czlonek', 5, false)`);
  await db.query(`INSERT INTO members (id, email, birth_date, household_id) VALUES
    (1, 'jan@x.pl', '1980-01-01', 10), (2, 'ola@x.pl', '1990-01-01', 11), (3, 'kid@x.pl', '2015-05-05', 12),
    (4, 'boss@x.pl', '1970-01-01', 13), (5, 'obcy@x.pl', '1970-01-01', 14)`);
  const conv = (cid, type, name, people) => db.query(
    `INSERT INTO conversations (id, type, name, created_by) VALUES ($1, $2, $3, $4)`, [cid, type, name, people[0][0]],
  ).then(() => Promise.all(people.map(([e, role]) => db.query(
    `INSERT INTO conversation_participants (conversation_id, user_email, role) VALUES ($1, $2, $3)`, [cid, e, role]))));
  await conv(C_DM, 'direct', null, [['jan@x.pl', 'admin'], ['ola@x.pl', 'admin']]);
  await conv(C_KID, 'direct', null, [['jan@x.pl', 'admin'], ['kid@x.pl', 'admin']]);
  await conv(C_TEAM, 'group', 'Zespół uwielbienia', [['jan@x.pl', 'admin'], ['ola@x.pl', 'member'], ['boss@x.pl', null]]);
  await conv(C_KIDS_GROUP, 'group', 'Młodzież', [['jan@x.pl', 'admin'], ['kid@x.pl', 'member']]);
  await conv(C_OTHER, 'group', 'Inna', [['obcy@x.pl', 'admin']]);
  for (const f of ['096_calls.sql', '097_call_guest_links.sql', '098_meetings.sql']) {
    const sql = fs.readFileSync(new URL(`../db/tenant-migrations/${f}`, import.meta.url), 'utf8');
    await pg.exec(sql);
    await pg.exec(sql); // idempotentna
  }
});

test('tworzenie linku: admin grupy tak, członek nie; admin aplikacji tak; 1:1 obie strony; obcy nie', { skip: skipDb }, async () => {
  const { ctx } = harness();
  const { link } = await createGuestLink(ctx, U('jan'), { conversation_id: C_TEAM, expires_in: '1h', show_title: true, max_uses: '3' });
  assert.match(link.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(link.path, `/rozmowa/${link.token}`);
  assert.equal(link.max_uses, 3);
  assert.equal(link.show_title, true);
  const ttl = (Date.parse(link.expires_at) - Date.parse(link.created_at)) / 1000;
  assert.ok(Math.abs(ttl - 3600) < 5);
  await assert.rejects(createGuestLink(ctx, U('ola'), { conversation_id: C_TEAM }), (e) => e.status === 403 && e.code === 'GUEST_LINK_FORBIDDEN');
  assert.ok((await createGuestLink(ctx, U('boss'), { conversation_id: C_TEAM })).link.id, 'admin aplikacji (nie admin rozmowy)');
  assert.ok((await createGuestLink(ctx, U('jan'), { conversation_id: C_DM })).link.id);
  const dm = (await createGuestLink(ctx, U('ola'), { conversation_id: C_DM, show_title: true, expires_in: '7d' })).link;
  assert.equal(dm.show_title, false, 'w rozmowie 1:1 nazwy rozmowy nie pokazujemy');
  await assert.rejects(createGuestLink(ctx, U('obcy'), { conversation_id: C_DM }), (e) => e.status === 403 && e.code === 'NOT_PARTICIPANT');
  await assert.rejects(createGuestLink(ctx, U('jan'), { conversation_id: 'zle' }), (e) => e.status === 400);
  const audit = await q1(`SELECT action, actor FROM account_events WHERE action = 'call_link_created'`);
  assert.equal(audit.length, 4);
  // Lista: zarządzający widzi linki, zwykły członek grupy — pustą listę z powodem.
  const mine = await listGuestLinks(ctx, U('jan'), { conversation_id: C_TEAM });
  assert.equal(mine.can_manage, true);
  assert.equal(mine.links.length, 2);
  const member = await listGuestLinks(ctx, U('ola'), { conversation_id: C_TEAM });
  assert.deepEqual([member.can_manage, member.links.length, member.reason], [false, 0, 'GUEST_LINK_FORBIDDEN']);
  await assert.rejects(listGuestLinks(ctx, U('obcy'), { conversation_id: C_TEAM }), (e) => e.status === 403);
});

test('niepełnoletni: bez linków w rozmowie z dzieckiem (grupa i 1:1); 503 bez LiveKit', { skip: skipDb }, async () => {
  const { ctx } = harness();
  await assert.rejects(createGuestLink(ctx, U('jan'), { conversation_id: C_KIDS_GROUP }), (e) => e.status === 403 && e.code === 'GUESTS_MINORS');
  await assert.rejects(createGuestLink(ctx, U('jan'), { conversation_id: C_KID }), (e) => e.status === 403);
  const list = await listGuestLinks(ctx, U('jan'), { conversation_id: C_KIDS_GROUP });
  assert.equal(list.can_create, false);
  assert.equal(list.reason, 'GUESTS_MINORS');
  assert.equal((await q1(`SELECT count(*)::int AS n FROM call_guest_links WHERE conversation_id = ANY($1::uuid[])`, [[C_KIDS_GROUP, C_KID]]))[0].n, 0);
  const off = { ...ctx, deps: { ...ctx.deps, livekit: { enabled: false, settings: {} } } };
  await assert.rejects(createGuestLink(off, U('jan'), { conversation_id: C_TEAM }), (e) => e.status === 503 && e.code === 'calls_disabled');
  await assert.rejects(guestInfo(off, { token: 'x'.repeat(43) }), (e) => e.status === 503);

  // Dziecko dołącza do grupy po utworzeniu linku → strona gościa przestaje działać.
  const { link } = await createGuestLink(ctx, U('obcy'), { conversation_id: C_OTHER });
  await db.query(`INSERT INTO conversation_participants (conversation_id, user_email, role) VALUES ($1, 'kid@x.pl', 'member')`, [C_OTHER]);
  await assert.rejects(guestInfo(ctx, { token: link.token }), (e) => e.status === 410 && e.code === 'LINK_UNAVAILABLE');
  await assert.rejects(guestRequest(ctx, { token: link.token, name: 'Gość' }), (e) => e.status === 410);
  // …ale istniejący link nadal można wyłączyć.
  assert.equal((await revokeGuestLink(ctx, U('obcy'), { link_id: link.id })).ok, true);
  await db.query(`DELETE FROM conversation_participants WHERE conversation_id = $1 AND user_email = 'kid@x.pl'`, [C_OTHER]);
});

test('wygaśnięcie i wyłączenie linku; nieistniejący token; nieaktywny kościół', { skip: skipDb }, async () => {
  const { ctx } = harness();
  await assert.rejects(guestInfo(ctx, { token: 'nie-ma-takiego-linku-0000000000000000000000' }), (e) => e.status === 404 && e.code === 'LINK_NOT_FOUND');
  await assert.rejects(guestInfo(ctx, { token: '../../etc' }), (e) => e.status === 404);
  const a = (await createGuestLink(ctx, U('jan'), { conversation_id: C_DM })).link;
  assert.equal((await guestInfo(ctx, { token: a.token })).call_live, false);
  await backdateLink(a.id, 5);
  await assert.rejects(guestInfo(ctx, { token: a.token }), (e) => e.status === 410 && e.code === 'LINK_EXPIRED');
  await assert.rejects(guestRequest(ctx, { token: a.token, name: 'Ktoś' }), (e) => e.status === 410 && e.code === 'LINK_EXPIRED');

  const b = (await createGuestLink(ctx, U('jan'), { conversation_id: C_TEAM })).link;
  await assert.rejects(revokeGuestLink(ctx, U('ola'), { link_id: b.id }), (e) => e.status === 403, 'zwykły członek grupy nie wyłącza cudzego linku');
  const pend = await guestRequest(ctx, { token: b.token, name: 'Czekający' });
  assert.equal((await revokeGuestLink(ctx, U('boss'), { link_id: b.id })).ok, true);
  await assert.rejects(guestInfo(ctx, { token: b.token }), (e) => e.status === 410 && e.code === 'LINK_EXPIRED');
  assert.deepEqual(await guestStatus(ctx, { request_id: pend.request_id, secret: pend.secret }), { status: 'expired' });
  assert.ok((await q1(`SELECT 1 FROM account_events WHERE action = 'call_link_revoked'`)).length);

  const c = (await createGuestLink(ctx, U('jan'), { conversation_id: C_DM })).link;
  const blocked = harness({ blocked: true });
  await assert.rejects(guestInfo(blocked.ctx, { token: c.token }), (e) => e.status === 410 && e.code === 'LINK_UNAVAILABLE');
  await assert.rejects(guestRequest(blocked.ctx, { token: c.token, name: 'X' }), (e) => e.status === 410);
});

test('publiczne endpointy nie zdradzają danych rozmowy', { skip: skipDb }, async () => {
  const { ctx } = harness();
  const hidden = (await createGuestLink(ctx, U('jan'), { conversation_id: C_TEAM })).link;
  const info = await guestInfo(ctx, { token: hidden.token });
  assert.deepEqual(Object.keys(info).sort(), ['auto_admit', 'call_live', 'church_name', 'expires_at', 'kind', 'title']);
  assert.equal(info.church_name, 'Społeczność Testowa');
  assert.equal(info.title, null, 'nazwa rozmowy domyślnie ukryta');
  const shown = (await createGuestLink(ctx, U('jan'), { conversation_id: C_TEAM, show_title: true })).link;
  assert.equal((await guestInfo(ctx, { token: shown.token })).title, 'Zespół uwielbienia');
  const req = await guestRequest(ctx, { token: hidden.token, name: 'Anna' });
  assert.deepEqual(Object.keys(req).sort(), ['name', 'request_id', 'secret', 'status']);
  const st = await guestStatus(ctx, { request_id: req.request_id, secret: req.secret });
  const json = JSON.stringify([info, req, st]);
  for (const leak of ['@x.pl', C_TEAM, 'Jan', 'Ola', hidden.id]) assert.ok(!json.includes(leak), `bez „${leak}”`);
  await assert.rejects(guestStatus(ctx, { request_id: req.request_id, secret: 'z'.repeat(43) }), (e) => e.status === 404);
  await assert.rejects(guestLeave(ctx, { request_id: req.request_id, secret: '' }), (e) => e.status === 404);
  await assert.rejects(guestRequest(ctx, { token: hidden.token, name: '   ' }), (e) => e.status === 400 && e.code === 'BAD_NAME');
  assert.equal((await guestLeave(ctx, { request_id: req.request_id, secret: req.secret })).status, 'left');
});

test('poczekalnia: prośba → realtime do uczestników (bez sekretu) → wpuszczenie → czeka na rozmowę → token', { skip: skipDb }, async () => {
  const h = harness();
  const { link } = await createGuestLink(h.ctx, U('jan'), { conversation_id: C_DM });
  const req = await guestRequest(h.ctx, { token: link.token, name: '  Anna  ' });
  assert.equal(req.status, 'pending');
  assert.equal(req.name, 'Anna');
  const ins = h.emitted.find((e) => e.table === 'call_guest_requests' && e.op === 'insert');
  assert.deepEqual(ins.audience, ['jan@x.pl', 'ola@x.pl']);
  assert.equal(ins.rows[0].guest_name, 'Anna');
  assert.equal(ins.rows[0].secret_hash, undefined, 'bez skrótu sekretu w realtime');
  assert.match(ins.rows[0].identity, /^guest:[0-9a-f]{24}$/);
  assert.deepEqual(await guestStatus(h.ctx, { request_id: req.request_id, secret: req.secret }), { status: 'pending', waiting: 'admission', call_live: false });

  await assert.rejects(admitGuest(h.ctx, U('obcy'), { request_id: req.request_id }), (e) => e.status === 403);
  const adm = await admitGuest(h.ctx, U('ola'), { request_id: req.request_id });
  assert.equal(adm.request.status, 'admitted');
  assert.equal(adm.request.decided_by_email, 'ola@x.pl');
  assert.equal(adm.request.secret_hash, undefined);
  assert.equal((await admitGuest(h.ctx, U('jan'), { request_id: req.request_id })).request.status, 'admitted', 'idempotentne');
  assert.equal((await q1(`SELECT uses FROM call_guest_links WHERE id = $1`, [link.id]))[0].uses, 1);
  // Nikogo z rozmowy w połączeniu — gość czeka, token nie wychodzi.
  assert.deepEqual(await guestStatus(h.ctx, { request_id: req.request_id, secret: req.secret }), { status: 'admitted', waiting: 'host' });
  assert.equal(h.livekit.minted.length, 0);

  const call = await startCall(h.ctx, U('jan'), { conversation_id: C_DM, kind: 'video' });
  const st = await guestStatus(h.ctx, { request_id: req.request_id, secret: req.secret });
  assert.equal(st.status, 'admitted');
  assert.equal(st.room, call.room);
  assert.equal(st.url, 'wss://rtc.test');
  assert.equal(st.kind, 'video');
  const minted = h.livekit.minted.at(-1);
  assert.deepEqual(minted, {
    identity: ins.rows[0].identity, name: 'Anna (gość)', room: call.room, canPublish: true, canPublishData: false,
    ttl: '15m', metadata: { guest: true, name: 'Anna' },
  });
  assert.equal(st.token, `tok:${ins.rows[0].identity}:${call.room}`);

  // Gość wchodzi do pokoju (webhook): „odbiera” 1:1, nie trafia do call_participants.
  assert.deepEqual(await handleLivekitEvent(h.ctx, { event: 'participant_joined', room: { name: call.room }, participant: { identity: 'jan@x.pl' } }), { action: 'joined' });
  assert.deepEqual(await handleLivekitEvent(h.ctx, { event: 'participant_joined', room: { name: call.room }, participant: { identity: ins.rows[0].identity } }), { action: 'answered' });
  assert.equal((await q1(`SELECT status FROM calls WHERE id = $1`, [call.call.id]))[0].status, 'active');
  assert.equal((await q1(`SELECT count(*)::int AS n FROM call_participants WHERE user_email LIKE 'guest:%'`))[0].n, 0);
  const g = (await q1(`SELECT * FROM call_guest_requests WHERE id = $1`, [req.request_id]))[0];
  assert.ok(g.joined_at && !g.left_at);
  assert.equal(g.call_id, call.call.id);

  // Ola dołącza, potem wychodzi — Jan i gość zostają (1:1 z gościem nie kończy się po jednym wyjściu).
  await joinCall(h.ctx, U('ola'), { call_id: call.call.id });
  await handleLivekitEvent(h.ctx, { event: 'participant_joined', room: { name: call.room }, participant: { identity: 'ola@x.pl' } });
  assert.deepEqual(await handleLivekitEvent(h.ctx, { event: 'participant_left', room: { name: call.room }, participant: { identity: 'ola@x.pl' } }), { action: 'left' });
  assert.equal((await q1(`SELECT status FROM calls WHERE id = $1`, [call.call.id]))[0].status, 'active');
  // Gość wychodzi — rozmowa trwa.
  assert.deepEqual(await handleLivekitEvent(h.ctx, { event: 'participant_left', room: { name: call.room }, participant: { identity: ins.rows[0].identity } }), { action: 'guest_left' });
  assert.equal((await q1(`SELECT status FROM calls WHERE id = $1`, [call.call.id]))[0].status, 'active');
  // Ostatnia osoba z rozmowy wychodzi — koniec; link nie wpuszcza gościa do kolejnej rozmowy.
  const left = await leaveCall(h.ctx, U('jan'), { call_id: call.call.id });
  assert.equal(left.call.status, 'ended');
  assert.deepEqual(await guestStatus(h.ctx, { request_id: req.request_id, secret: req.secret }), { status: 'ended' });
  assert.ok((await q1(`SELECT 1 FROM account_events WHERE action = 'call_guest_admitted'`)).length);
  await settle();
});

test('grupa: wyjście ostatniej osoby z rozmowy kończy połączenie także dla gości', { skip: skipDb }, async () => {
  const h = harness();
  const { link } = await createGuestLink(h.ctx, U('jan'), { conversation_id: C_TEAM, auto_admit: true });
  const call = await startCall(h.ctx, U('jan'), { conversation_id: C_TEAM });
  const req = await guestRequest(h.ctx, { token: link.token, name: 'Piotr' });
  assert.equal(req.status, 'admitted', 'wpuszczaj bez pytania');
  const st = await guestStatus(h.ctx, { request_id: req.request_id, secret: req.secret });
  assert.ok(st.token);
  const identity = (await q1(`SELECT identity FROM call_guest_requests WHERE id = $1`, [req.request_id]))[0].identity;
  await handleLivekitEvent(h.ctx, { event: 'participant_joined', room: { name: call.room }, participant: { identity: 'jan@x.pl' } });
  await handleLivekitEvent(h.ctx, { event: 'participant_joined', room: { name: call.room }, participant: { identity } });
  await db.query(`UPDATE calls SET answered_at = now() - interval '3 minutes' WHERE id = $1`, [call.call.id]);
  assert.deepEqual(await handleLivekitEvent(h.ctx, { event: 'participant_left', room: { name: call.room }, participant: { identity: 'jan@x.pl' } }), { action: 'ended' });
  assert.ok(h.livekit.deleted.includes(call.room), 'pokój zamknięty — gość rozłączony');
  await settle();
});

test('odrzucenie: gość dostaje „denied” i nigdy token; limit osób; „wpuszczaj bez pytania” z limitem', { skip: skipDb }, async () => {
  const h = harness();
  const { link } = await createGuestLink(h.ctx, U('jan'), { conversation_id: C_DM, max_uses: 1 });
  const a = await guestRequest(h.ctx, { token: link.token, name: 'Natręt' });
  const d = await denyGuest(h.ctx, U('ola'), { request_id: a.request_id });
  assert.equal(d.request.status, 'denied');
  assert.deepEqual(await guestStatus(h.ctx, { request_id: a.request_id, secret: a.secret }), { status: 'denied' });
  await assert.rejects(admitGuest(h.ctx, U('jan'), { request_id: a.request_id }), (e) => e.status === 410);
  assert.ok((await q1(`SELECT 1 FROM account_events WHERE action = 'call_guest_denied'`)).length);
  // Limit 1: pierwsza wpuszczona osoba wyczerpuje link.
  const b = await guestRequest(h.ctx, { token: link.token, name: 'Pierwsza' });
  const c = await guestRequest(h.ctx, { token: link.token, name: 'Druga' });
  await admitGuest(h.ctx, U('jan'), { request_id: b.request_id });
  await assert.rejects(admitGuest(h.ctx, U('jan'), { request_id: c.request_id }), (e) => e.status === 409 && e.code === 'LINK_FULL');
  await assert.rejects(guestRequest(h.ctx, { token: link.token, name: 'Trzecia' }), (e) => e.status === 410 && e.code === 'LINK_FULL');

  const auto = (await createGuestLink(h.ctx, U('jan'), { conversation_id: C_DM, auto_admit: true, max_uses: 1 })).link;
  assert.equal((await guestRequest(h.ctx, { token: auto.token, name: 'A' })).status, 'admitted');
  await assert.rejects(guestRequest(h.ctx, { token: auto.token, name: 'B' }), (e) => e.status === 410 && e.code === 'LINK_FULL');
});

test('poczekalnia: najwyżej 20 oczekujących na link; porzucone prośby wygasają', { skip: skipDb }, async () => {
  const h = harness();
  const { link } = await createGuestLink(h.ctx, U('jan'), { conversation_id: C_TEAM });
  const reqs = [];
  for (let i = 0; i < MAX_PENDING_PER_LINK; i++) reqs.push(await guestRequest(h.ctx, { token: link.token, name: `G${i}` }));
  await assert.rejects(guestRequest(h.ctx, { token: link.token, name: 'Nadmiar' }), (e) => e.status === 429 && e.code === 'LOBBY_FULL');
  await db.query(`UPDATE call_guest_requests SET last_seen_at = now() - interval '5 minutes' WHERE link_id = $1`, [link.id]);
  h.emitted.length = 0;
  assert.equal(await expireStaleGuestRequests(h.ctx), MAX_PENDING_PER_LINK);
  assert.equal(h.emitted.filter((e) => e.table === 'call_guest_requests').reduce((n, e) => n + e.rows.length, 0), MAX_PENDING_PER_LINK);
  assert.deepEqual(await guestStatus(h.ctx, { request_id: reqs[0].request_id, secret: reqs[0].secret }), { status: 'expired' });
  assert.equal((await guestRequest(h.ctx, { token: link.token, name: 'Nowy' })).status, 'pending');
});

test('wyłączenie linku usuwa z pokoju gości z tego linku', { skip: skipDb }, async () => {
  const h = harness();
  const { link } = await createGuestLink(h.ctx, U('jan'), { conversation_id: C_TEAM, auto_admit: true });
  const call = await startCall(h.ctx, U('jan'), { conversation_id: C_TEAM });
  const r = await guestRequest(h.ctx, { token: link.token, name: 'Gość' });
  await guestStatus(h.ctx, { request_id: r.request_id, secret: r.secret });
  const identity = (await q1(`SELECT identity FROM call_guest_requests WHERE id = $1`, [r.request_id]))[0].identity;
  await handleLivekitEvent(h.ctx, { event: 'participant_joined', room: { name: call.room }, participant: { identity } });
  await revokeGuestLink(h.ctx, U('jan'), { link_id: link.id });
  await settle();
  assert.deepEqual(h.livekit.removed, [[call.room, identity]]);
  assert.deepEqual(await guestStatus(h.ctx, { request_id: r.request_id, secret: r.secret }), { status: 'expired' });
  await leaveCall(h.ctx, U('jan'), { call_id: call.call.id });
  await handleLivekitEvent(h.ctx, { event: 'room_finished', room: { name: call.room } });
  await settle();
});

test('odczyt przez /api/db: poczekalnię widzą tylko uczestnicy rozmowy', { skip: skipDb }, async () => {
  const sel = async (email) => {
    const b = buildQuery({ table: 'call_guest_requests', op: 'select', select: '*', filters: [], __ownerScope: conversationScope('call_guest_requests', { email }) });
    return (await db.query(b.sql, b.params)).rows.map((r) => r.__row || r);
  };
  const all = (await q1(`SELECT count(*)::int AS n FROM call_guest_requests`))[0].n;
  assert.ok(all > 0);
  assert.equal((await sel('kid@x.pl')).length, 0);
  const mine = await sel('OLA@x.pl');
  assert.ok(mine.length > 0 && mine.every((r) => [C_DM, C_TEAM].includes(r.conversation_id)));
  assert.ok(mine.every((r) => !('secret_hash' in r)));
});

// ── HTTP: limit per IP i publiczne trasy ────────────────────────────────────
async function publicApp(ctxDb) {
  const app = Fastify();
  await app.register(rateLimit, { global: false });
  app.decorate('requireTenant', async (req) => { req.tenant = { slug: 'kosciol', name: 'Kościół' }; req.db = ctxDb; });
  for (const f of ['call-guest-info', 'call-guest-request', 'call-guest-status', 'call-guest-leave']) {
    const mod = await import(`../src/fn/${f}.js`);
    assert.equal(mod.isPublic, true, `${f} publiczne`);
    assert.ok(mod.rateLimit?.max > 0, `${f} z limitem`);
    app.post(`/api/fn/${mod.name}`, { preHandler: app.requireTenant, config: { rateLimit: mod.rateLimit } }, mod.default);
  }
  return app;
}

test('HTTP: fn z sesją mają capability, publiczne mają limit per IP (429 po przekroczeniu)', { skip: skipDb }, async () => {
  for (const f of ['call-link-create', 'call-link-list', 'call-link-revoke', 'call-guest-admit', 'call-guest-deny']) {
    const mod = await import(`../src/fn/${f}.js`);
    assert.equal(mod.capability, 'module:komunikator', f);
    assert.ok(!mod.isPublic, f);
  }
  const h = harness();
  setCallDeps({ livekit: h.livekit, emit: () => {}, timers: false });
  try {
    const { link } = await createGuestLink(h.ctx, U('jan'), { conversation_id: C_TEAM });
    const app = await publicApp(db);
    const info = await app.inject({ method: 'POST', url: '/api/fn/call-guest-info', payload: { token: link.token } });
    assert.equal(info.statusCode, 200);
    assert.equal(info.json().church_name, 'Społeczność Testowa');
    const nf = await app.inject({ method: 'POST', url: '/api/fn/call-guest-info', payload: { token: 'x' } });
    assert.equal(nf.statusCode, 404);
    assert.equal(nf.json().code, 'LINK_NOT_FOUND');
    const codes = [];
    for (let i = 0; i < 11; i++) {
      const r = await app.inject({ method: 'POST', url: '/api/fn/call-guest-request', payload: { token: link.token, name: `Spam ${i}` }, remoteAddress: '10.0.0.9' });
      codes.push(r.statusCode);
    }
    assert.deepEqual(codes.slice(0, 10), Array(10).fill(200));
    assert.equal(codes[10], 429);
    const other = await app.inject({ method: 'POST', url: '/api/fn/call-guest-request', payload: { token: link.token, name: 'Inny' }, remoteAddress: '10.0.0.10' });
    assert.equal(other.statusCode, 200, 'limit per IP');
    await app.close();
  } finally {
    setCallDeps(null);
  }
});
