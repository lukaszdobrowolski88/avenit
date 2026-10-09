// Połączenia audio/wideo (src/calls): reguły czyste, token LiveKit, dostęp (uczestnik, posting_policy,
// blokady, niepełnoletni 1:1), maszyna stanów na PRAWDZIWYM SQL (PGlite + migracja 096), webhook
// (podpis, idempotencja), zakres odczytu przez /api/db i 503 bez kluczy.
//
// PGlite i livekit-server-sdk: testy z nich korzystające pomijają się, gdy modułu brak. Lokalnie:
//   PGLITE_MODULE=/…/@electric-sql/pglite/dist/index.js LIVEKIT_SDK_MODULE=/…/livekit-server-sdk/dist/index.js npm test
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import Fastify from 'fastify';
import { decodeJwt } from 'jose';
import * as L from '../src/calls/logic.js';
import { livekitSettings, createLivekit } from '../src/calls/livekit.js';
import {
  startCall, joinCall, declineCall, cancelCall, leaveCall, callConfig, expireRinging, sweepCalls,
  handleLivekitEvent, runCallFn, setCallDeps,
} from '../src/calls/service.js';
import { buildCallsRoutes, WEBHOOK_PATH } from '../src/calls/routes.js';
import { conversationScope, conversationAudience, enforceConversationWrite } from '../src/dataapi/komunikator.js';
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
const C_DM = id(1), C_KID = id(2), C_BLOCK = id(3), C_GROUP = id(4), C_ANN = id(5), C_OTHER = id(6), C_FAMILY = id(7);
const U = (name) => ({ id: name, email: `${name}@x.pl` });

// ── Reguły czyste ───────────────────────────────────────────────────────────
test('pokój: nazwa z tenantem i id połączenia, parsowanie odwrotne', () => {
  const room = L.roomNameFor('schwro', id(9));
  assert.equal(room, `avn_schwro_${id(9)}`);
  assert.deepEqual(L.parseRoomName(room), { tenantSlug: 'schwro', callId: id(9) });
  assert.deepEqual(L.parseRoomName(`avn_moj-kosciol_${id(9)}`), { tenantSlug: 'moj-kosciol', callId: id(9) });
  assert.equal(L.parseRoomName('inny-pokoj'), null);
  assert.equal(L.parseRoomName(`avn_Zly_${id(9)}`), null);
});

test('czas trwania i treść wiadomości w czacie (zwykły tekst, bez emoji)', () => {
  assert.equal(L.formatDuration(42), '42 s');
  assert.equal(L.formatDuration(12 * 60 + 10), '12 min');
  assert.equal(L.formatDuration(3600 + 5 * 60), '1 h 05 min');
  assert.equal(L.callMessageText({ status: 'ended', kind: 'audio', duration_sec: 720 }), 'Połączenie głosowe · 12 min');
  assert.equal(L.callMessageText({ status: 'ended', kind: 'video', duration_sec: 30 }), 'Połączenie wideo · 30 s');
  assert.equal(L.callMessageText({ status: 'missed', kind: 'audio' }), 'Nieodebrane połączenie');
  assert.equal(L.callMessageText({ status: 'cancelled', kind: 'audio' }), 'Nieodebrane połączenie');
  assert.equal(L.callMessageText({ status: 'declined', kind: 'audio' }), 'Połączenie odrzucone');
  assert.equal(L.callMessageText({ status: 'ringing', kind: 'audio', is_group: true }), 'Rozmowa grupowa trwa — dołącz');
  assert.equal(L.callMessageText({ status: 'ended', kind: 'audio', is_group: true, duration_sec: 600 }), 'Rozmowa grupowa · 10 min');
  for (const s of ['ringing', 'active', 'ended', 'missed', 'declined', 'cancelled']) {
    for (const g of [true, false]) {
      // eslint-disable-next-line no-control-regex
      assert.doesNotMatch(L.callMessageText({ status: s, kind: 'video', is_group: g, duration_sec: 5 }), /[\u{1F300}-\u{1FAFF}☀-➿]/u);
    }
  }
});

test('maszyna stanów: koniec pokoju, okno dzwonienia, wyjście uczestnika', () => {
  const now = Date.parse('2026-10-09T12:00:00Z');
  const at = (s) => new Date(now - s * 1000).toISOString();
  // room_finished
  assert.equal(L.finalStatusOnRoomEnd({ status: 'active', answered_at: at(60), started_at: at(90) }, now), 'ended');
  assert.equal(L.finalStatusOnRoomEnd({ status: 'ringing', started_at: at(10) }, now), 'cancelled');
  assert.equal(L.finalStatusOnRoomEnd({ status: 'ringing', started_at: at(50) }, now), 'missed');
  assert.equal(L.finalStatusOnRoomEnd({ status: 'ringing', is_group: true, started_at: at(10) }, now), 'missed');
  assert.equal(L.finalStatusOnRoomEnd({ status: 'active', is_group: true, started_at: at(100) }, now), 'missed');
  assert.equal(L.finalStatusOnRoomEnd({ status: 'ended' }, now), null);
  // 45 s bez odpowiedzi
  assert.equal(L.ringTimeoutDecision({ status: 'ringing' }), 'missed');
  assert.equal(L.ringTimeoutDecision({ status: 'ringing', is_group: true }, { inRoom: 1 }), 'active');
  assert.equal(L.ringTimeoutDecision({ status: 'ringing', is_group: true }, { inRoom: 0 }), 'missed');
  assert.equal(L.ringTimeoutDecision({ status: 'ringing', is_group: true, answered_at: at(5) }), 'active');
  assert.equal(L.ringTimeoutDecision({ status: 'active' }), null);
  // wyjście
  const dm = { status: 'active', started_by_email: 'jan@x.pl' };
  assert.equal(L.decisionOnLeave(dm, 'ola@x.pl'), 'ended');
  assert.equal(L.decisionOnLeave({ ...dm, status: 'ringing' }, 'JAN@x.pl'), 'cancelled');
  assert.equal(L.decisionOnLeave({ ...dm, status: 'ringing' }, 'ola@x.pl'), null);
  const grp = { status: 'active', is_group: true, started_by_email: 'jan@x.pl', answered_at: at(5) };
  assert.equal(L.decisionOnLeave(grp, 'jan@x.pl', { remaining: 2 }), null);
  assert.equal(L.decisionOnLeave(grp, 'jan@x.pl', { remaining: 0 }), 'ended');
  assert.equal(L.decisionOnLeave({ ...grp, answered_at: null }, 'jan@x.pl', { remaining: 0 }), 'missed');
  assert.equal(L.decisionOnLeave({ ...grp, status: 'ended' }, 'jan@x.pl', { remaining: 0 }), null);
});

test('grant tokenu: tylko ten pokój; kanał tylko dla adminów — słuchanie', () => {
  const g = L.videoGrant('avn_t_x', { canPublish: true });
  assert.deepEqual(g, { room: 'avn_t_x', roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true, canUpdateOwnMetadata: false });
  assert.equal(L.videoGrant('r', { canPublish: false }).canPublish, false);
  assert.equal(L.canPublishIn({ posting_policy: 'admins' }, 'member'), false);
  assert.equal(L.canPublishIn({ posting_policy: 'admins' }, 'admin'), true);
  assert.equal(L.canPublishIn({ posting_policy: 'everyone' }, 'member'), true);
});

test('konfiguracja: bez klucza lub sekretu połączenia wyłączone; domyślny wss://rtc.<domena>', () => {
  assert.equal(livekitSettings({ APP_DOMAIN: 'avenit.pl' }).enabled, false);
  assert.equal(livekitSettings({ APP_DOMAIN: 'avenit.pl', LIVEKIT_API_KEY: 'k' }).enabled, false);
  const s = livekitSettings({ APP_DOMAIN: 'avenit.pl', LIVEKIT_API_KEY: 'k', LIVEKIT_API_SECRET: 's' });
  assert.equal(s.enabled, true);
  assert.equal(s.url, 'wss://rtc.avenit.pl');
  assert.equal(s.host, 'http://livekit:7880');
  assert.equal(livekitSettings({ APP_DOMAIN: 'a.pl', LIVEKIT_URL: 'wss://x.pl', LIVEKIT_API_KEY: 'k', LIVEKIT_API_SECRET: 's' }).url, 'wss://x.pl');
});

test('503 calls_disabled bez kluczy (serwis i handler fn)', async () => {
  const disabled = { enabled: false, settings: { url: null } };
  const ctx = { db: { query: async () => { throw new Error('nie powinno pytać bazy'); } }, tenantSlug: 't', log, deps: { livekit: disabled } };
  await assert.rejects(startCall(ctx, U('jan'), { conversation_id: C_DM }), (e) => e.status === 503 && e.code === 'calls_disabled');
  await assert.rejects(joinCall(ctx, U('jan'), { call_id: id(99) }), (e) => e.status === 503 && e.code === 'calls_disabled');
  assert.deepEqual(await callConfig(ctx), { enabled: false, url: null });
  setCallDeps({ livekit: disabled });
  try {
    const r = { statusCode: 200, body: null, code(n) { this.statusCode = n; return this; }, send(b) { this.body = b; return this; } };
    await runCallFn({ db: ctx.db, tenant: { slug: 't' }, user: U('jan'), body: { conversation_id: C_DM }, log }, r, startCall);
    assert.equal(r.statusCode, 503);
    assert.equal(r.body.code, 'calls_disabled');
  } finally {
    setCallDeps(null);
  }
});

test('token LiveKit: tożsamość = e-mail, nazwa, metadane, ważny 2 h, grant jednego pokoju', { skip: skipSdk }, async () => {
  const lk = createLivekit({ settings: { enabled: true, apiKey: 'APIkey', apiSecret: 'a'.repeat(32), url: 'wss://rtc.t', host: 'http://x' }, sdk: SDK });
  const jwt = await lk.mintToken({ identity: 'Jan@X.pl', name: 'Jan Kowalski', room: 'avn_t_r', canPublish: false, metadata: { avatar_url: '/a.png' } });
  const c = decodeJwt(jwt);
  assert.equal(c.sub, 'jan@x.pl');
  assert.equal(c.name, 'Jan Kowalski');
  assert.equal(c.iss, 'APIkey');
  assert.equal(c.exp - c.nbf, 7200);
  assert.deepEqual(JSON.parse(c.metadata), { avatar_url: '/a.png' });
  assert.equal(c.video.room, 'avn_t_r');
  assert.equal(c.video.roomJoin, true);
  assert.equal(c.video.canPublish, false);
  assert.equal(c.video.canSubscribe, true);
  assert.ok(!c.video.roomAdmin && !c.video.roomCreate && !c.video.roomList, 'bez uprawnień administracyjnych');
});

// ── Zakres odczytu przez /api/db ────────────────────────────────────────────
test('registry: calls / call_participants tylko do odczytu, zapis 403 (także admin)', async () => {
  for (const table of ['calls', 'call_participants']) {
    for (const op of ['insert', 'update', 'delete', 'upsert']) {
      const r = await canAccess({ pool: null, dbName: 'x', table, op, user: { role: 'superadmin', is_super_admin: true } });
      assert.equal(r.ok, false, `${table} ${op}`);
    }
  }
  await assert.rejects(enforceConversationWrite({ table: 'calls', op: 'insert', values: { conversation_id: C_DM } }, { user: { email: 'a@x.pl' }, db: null }), (e) => e.status === 403);
});

test('zakres SQL: połączenia i uczestnicy połączeń tylko z moich rozmów', () => {
  const p1 = [];
  const s1 = conversationScope('calls', { email: 'Jan@X.pl' });
  assert.match(s1.select('t', (v) => { p1.push(v); return p1.length; }), /conversation_participants cp_ WHERE cp_\."conversation_id" = t\."conversation_id"/);
  assert.deepEqual(p1, ['jan@x.pl']);
  assert.equal(s1.update('t', () => 1), 'FALSE');
  const s2 = conversationScope('call_participants', { email: 'jan@x.pl' });
  assert.match(s2.select('t', () => 1), /FROM calls c_ WHERE c_\."id" = t\."call_id"/);
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
    minted: [], deleted: [], occupancy: new Map(),
    async mintToken(o) { lk.minted.push(o); return `tok:${o.identity}:${o.room}:${o.canPublish ? 'pub' : 'sub'}`; },
    async deleteRoom(r) { lk.deleted.push(r); return true; },
    async roomOccupancy() { return lk.occupancy; },
  };
  return lk;
}
function harness() {
  const h = { emitted: [], pushes: [], notified: [], livekit: fakeLivekit() };
  h.ctx = {
    db, tenantSlug: 'kosciol', log,
    deps: {
      livekit: h.livekit,
      emit: (slug, table, op, rows, opts) => h.emitted.push({ slug, table, op, rows, audience: [...(opts?.audience || [])].sort() }),
      sendPush: async (_db, p) => { h.pushes.push(p); return { status: 200 }; },
      notifyMessage: async (o) => { h.notified.push(o); },
      timers: false,
    },
  };
  return h;
}
const backdate = (callId, sec) => db.query(`UPDATE calls SET started_at = now() - $2 * interval '1 second' WHERE id = $1`, [callId, sec]);
const messagesOf = (conv) => q1(`SELECT * FROM messages WHERE conversation_id = $1 AND message_type = 'call' ORDER BY created_at`, [conv]);

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
    CREATE TABLE conversations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), type text, name text, ministry_key text,
      posting_policy text DEFAULT 'everyone', created_by text, last_message_at timestamptz, last_message_preview text,
      created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE TABLE conversation_participants (id serial PRIMARY KEY, conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
      user_email text, role text, muted boolean DEFAULT false, muted_until timestamptz, archived boolean DEFAULT false,
      UNIQUE (conversation_id, user_email));
    CREATE TABLE messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
      sender_email text NOT NULL, content text NOT NULL, message_type text DEFAULT 'text', metadata jsonb DEFAULT '{}'::jsonb,
      mentions jsonb DEFAULT '[]'::jsonb, attachments jsonb DEFAULT '[]', created_at timestamptz DEFAULT now());
    ALTER TABLE messages ADD CONSTRAINT messages_message_type_check CHECK (message_type IN ('text', 'poll', 'prayer', 'event', 'system'));
  `);
  await db.query(`INSERT INTO app_users (email, full_name, role, avatar_url, member_id) VALUES
    ('jan@x.pl', 'Jan Kowalski', 'czlonek', '/jan.png', 1), ('ola@x.pl', 'Ola Nowak', 'czlonek', null, 2),
    ('kid@x.pl', 'Dziecko', 'czlonek', null, 3), ('anna@x.pl', 'Anna', 'czlonek', null, 4),
    ('piotr@x.pl', 'Piotr', 'czlonek', null, 5), ('obcy@x.pl', 'Obcy', 'czlonek', null, 6),
    ('mama@x.pl', 'Mama', 'czlonek', null, 7)`);
  await db.query(`INSERT INTO members (id, email, birth_date, household_id) VALUES
    (1, 'jan@x.pl', '1980-01-01', 10), (2, 'ola@x.pl', '1990-01-01', 11), (3, 'kid@x.pl', '2015-05-05', 12),
    (4, 'anna@x.pl', '1985-01-01', 13), (5, 'piotr@x.pl', '1970-01-01', 14), (6, 'obcy@x.pl', '1970-01-01', 15),
    (7, 'mama@x.pl', '1984-01-01', 12)`);
  const conv = (cid, type, name, policy, people) => db.query(
    `INSERT INTO conversations (id, type, name, posting_policy, created_by) VALUES ($1, $2, $3, $4, $5)`, [cid, type, name, policy, people[0][0]],
  ).then(() => Promise.all(people.map(([e, role]) => db.query(
    `INSERT INTO conversation_participants (conversation_id, user_email, role) VALUES ($1, $2, $3)`, [cid, e, role]))));
  await conv(C_DM, 'direct', null, 'everyone', [['jan@x.pl', 'admin'], ['Ola@X.pl', 'admin']]);
  await conv(C_KID, 'direct', null, 'everyone', [['jan@x.pl', 'admin'], ['kid@x.pl', 'admin']]);
  await conv(C_BLOCK, 'direct', null, 'everyone', [['jan@x.pl', 'admin'], ['anna@x.pl', 'admin']]);
  await conv(C_FAMILY, 'direct', null, 'everyone', [['mama@x.pl', 'admin'], ['kid@x.pl', 'admin']]);
  await conv(C_GROUP, 'group', 'Zespół uwielbienia', 'everyone', [['jan@x.pl', 'admin'], ['ola@x.pl', 'member'], ['kid@x.pl', 'member'], ['piotr@x.pl', null]]);
  await conv(C_ANN, 'announcement', 'Ogłoszenia', 'admins', [['jan@x.pl', 'admin'], ['ola@x.pl', 'member']]);
  await conv(C_OTHER, 'group', 'Inna', 'everyone', [['piotr@x.pl', 'admin'], ['obcy@x.pl', 'member']]);
  await db.query(`UPDATE conversation_participants SET muted = true WHERE conversation_id = $1 AND user_email = 'piotr@x.pl'`, [C_GROUP]);
  await db.query(`INSERT INTO user_blocks (blocker_email, blocked_email) VALUES ('anna@x.pl', 'jan@x.pl')`);
  await db.query(`INSERT INTO messages (conversation_id, sender_email, content, message_type) VALUES ($1, 'jan@x.pl', 'hej', 'text')`, [C_DM]);
  const sql = fs.readFileSync(new URL('../db/tenant-migrations/096_calls.sql', import.meta.url), 'utf8');
  await pg.exec(sql);
  await pg.exec(sql); // idempotentna
});

test('migracja 096: typ wiadomości call dopuszczony, nieznany odrzucony, jedno trwające połączenie na rozmowę', { skip: skipDb }, async () => {
  await db.query(`INSERT INTO messages (conversation_id, sender_email, content, message_type) VALUES ($1, 'jan@x.pl', 'x', 'call')`, [C_OTHER]);
  await assert.rejects(db.query(`INSERT INTO messages (conversation_id, sender_email, content, message_type) VALUES ($1, 'jan@x.pl', 'x', 'bzdura')`, [C_OTHER]));
  await db.query(`DELETE FROM messages WHERE conversation_id = $1`, [C_OTHER]);
  await db.query(`INSERT INTO calls (id, conversation_id, room_name, started_by_email) VALUES ($1, $2, 'r1', 'piotr@x.pl')`, [id(500), C_OTHER]);
  await assert.rejects(db.query(`INSERT INTO calls (id, conversation_id, room_name, started_by_email) VALUES ($1, $2, 'r2', 'piotr@x.pl')`, [id(501), C_OTHER]));
  await assert.rejects(db.query(`UPDATE calls SET status = 'zly' WHERE id = $1`, [id(500)]));
  await db.query(`UPDATE calls SET status = 'ended' WHERE id = $1`, [id(500)]);
  await db.query(`INSERT INTO calls (id, conversation_id, room_name, started_by_email) VALUES ($1, $2, 'r2', 'piotr@x.pl')`, [id(501), C_OTHER]);
  await db.query(`DELETE FROM calls WHERE conversation_id = $1`, [C_OTHER]);
});

test('dostęp: tylko uczestnik; kanał „tylko administratorzy”; blokada; dziecko↔dorosły 1:1', { skip: skipDb }, async () => {
  const { ctx } = harness();
  await assert.rejects(startCall(ctx, U('obcy'), { conversation_id: C_DM }), (e) => e.status === 403 && e.code === 'NOT_PARTICIPANT');
  await assert.rejects(startCall(ctx, U('ola'), { conversation_id: C_ANN }), (e) => e.status === 403 && e.code === 'POSTING_RESTRICTED');
  await assert.rejects(startCall(ctx, U('jan'), { conversation_id: C_BLOCK }), (e) => e.status === 403 && e.code === 'BLOCKED');
  await assert.rejects(startCall(ctx, U('jan'), { conversation_id: C_KID }), (e) => e.status === 403 && e.code === 'DM_NOT_ALLOWED');
  await assert.rejects(startCall(ctx, U('kid'), { conversation_id: C_KID }), (e) => e.status === 403 && e.code === 'DM_NOT_ALLOWED');
  await assert.rejects(startCall(ctx, U('jan'), { conversation_id: 'nie-uuid' }), (e) => e.status === 400);
  assert.equal((await q1(`SELECT count(*)::int AS n FROM calls`))[0].n, 0, 'odmowa nie zakłada połączenia');
  // Rodzic ↔ dziecko (wspólne gospodarstwo) — wyjątek jak w czacie.
  const fam = await startCall(ctx, U('mama'), { conversation_id: C_FAMILY });
  assert.equal(fam.call.status, 'ringing');
  await cancelCall(ctx, U('mama'), { call_id: fam.call.id });
  // Grupa z niepełnoletnim — członkostwo rozmowy wystarcza.
  const g = await startCall(ctx, U('jan'), { conversation_id: C_GROUP });
  assert.equal(g.call.is_group, true);
  await cancelCall(ctx, U('jan'), { call_id: g.call.id });
  // Admin kanału ogłoszeń dzwoni, członek dołącza tylko do słuchania.
  const a = await startCall(ctx, U('jan'), { conversation_id: C_ANN });
  assert.equal(a.can_publish, true);
  const listen = await joinCall(ctx, U('ola'), { call_id: a.call.id });
  assert.equal(listen.can_publish, false);
  assert.match(listen.token, /:sub$/);
  await assert.rejects(joinCall(ctx, U('obcy'), { call_id: a.call.id }), (e) => e.status === 403);
  await leaveCall(ctx, U('jan'), { call_id: a.call.id });
  await handleLivekitEvent(ctx, { event: 'room_finished', room: { name: a.call.room_name } });
  await settle();
});

test('1:1: dzwoni → odebrane → rozłączone; wiadomość „Połączenie głosowe · …”, realtime do uczestników', { skip: skipDb }, async () => {
  const h = harness();
  const r = await startCall(h.ctx, U('jan'), { conversation_id: C_DM, kind: 'audio' });
  assert.equal(r.call.status, 'ringing');
  assert.equal(r.room, `avn_kosciol_${r.call.id}`);
  assert.equal(r.url, 'wss://rtc.test');
  assert.equal(r.joined_existing, false);
  assert.deepEqual(h.livekit.minted[0], {
    identity: 'jan@x.pl', name: 'Jan Kowalski', room: r.room, canPublish: true,
    metadata: { email: 'jan@x.pl', name: 'Jan Kowalski', avatar_url: '/jan.png' },
  });
  const ins = h.emitted.find((e) => e.table === 'calls' && e.op === 'insert');
  assert.deepEqual(ins.audience, ['jan@x.pl', 'ola@x.pl']);
  assert.equal(ins.slug, 'kosciol');
  await settle();
  assert.equal(h.pushes.length, 1);
  assert.equal(h.pushes[0].user_email.toLowerCase(), 'ola@x.pl');
  assert.equal(h.pushes[0].data.type, 'call');
  assert.equal(h.pushes[0].data.call_id, r.call.id);
  assert.equal(h.pushes[0].data.from_name, 'Jan Kowalski');
  assert.equal(h.pushes[0].data.kind, 'audio');

  // Drugie „Zadzwoń” w tej rozmowie łączy z trwającym połączeniem.
  const again = await startCall(h.ctx, U('ola'), { conversation_id: C_DM, kind: 'video' });
  assert.equal(again.joined_existing, true);
  assert.equal(again.call.id, r.call.id);
  assert.equal(again.call.status, 'active', 'odebranie przez drugą osobę');
  assert.ok(again.call.answered_at);

  await db.query(`UPDATE calls SET answered_at = now() - interval '125 seconds' WHERE id = $1`, [r.call.id]);
  const left = await leaveCall(h.ctx, U('ola'), { call_id: r.call.id });
  assert.equal(left.call.status, 'ended');
  assert.ok(left.call.duration_sec >= 125 && left.call.duration_sec < 130);
  await settle();
  const msgs = await messagesOf(C_DM);
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].content, 'Połączenie głosowe · 2 min');
  assert.equal(msgs[0].sender_email, 'jan@x.pl');
  assert.equal(msgs[0].metadata.call_id, r.call.id);
  assert.equal(msgs[0].metadata.status, 'ended');
  assert.equal((await q1(`SELECT message_id FROM calls WHERE id = $1`, [r.call.id]))[0].message_id, msgs[0].id);
  assert.equal((await q1(`SELECT last_message_preview FROM conversations WHERE id = $1`, [C_DM]))[0].last_message_preview, 'Połączenie głosowe · 2 min');
  assert.deepEqual(h.livekit.deleted, [r.room], 'pokój zamknięty — druga osoba rozłączona');
  assert.equal(h.notified.length, 0, 'bez pushu o zakończonej rozmowie');

  // Webhooki po fakcie niczego nie zmieniają (idempotencja).
  assert.deepEqual(await handleLivekitEvent(h.ctx, { event: 'room_finished', room: { name: r.room } }), { action: 'noop' });
  assert.deepEqual(await handleLivekitEvent(h.ctx, { event: 'participant_left', room: { name: r.room }, participant: { identity: 'jan@x.pl' } }), { action: 'left' });
  assert.equal((await messagesOf(C_DM)).length, 1);
  await assert.rejects(joinCall(h.ctx, U('jan'), { call_id: r.call.id }), (e) => e.status === 410 && e.code === 'CALL_ENDED');
});

test('1:1: bez odpowiedzi 45 s → nieodebrane (raz), push „Nieodebrane połączenie”, worker idempotentny', { skip: skipDb }, async () => {
  const h = harness();
  const r = await startCall(h.ctx, U('jan'), { conversation_id: C_DM, kind: 'video' });
  assert.equal(await expireRinging(h.ctx, r.call.id), null, 'przed upływem 45 s nic');
  await backdate(r.call.id, 50);
  const done = await expireRinging(h.ctx, r.call.id);
  assert.equal(done.status, 'missed');
  assert.equal(await expireRinging(h.ctx, r.call.id), null);
  assert.equal(await sweepCalls(h.ctx), 0);
  await settle();
  const msgs = (await messagesOf(C_DM)).filter((m) => m.metadata.call_id === r.call.id);
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].content, 'Nieodebrane połączenie wideo');
  assert.equal(h.notified.length, 1);
  assert.equal(h.notified[0].values.id, msgs[0].id);
  assert.equal(h.notified[0].actingUserEmail, 'jan@x.pl');
  assert.deepEqual(h.livekit.deleted, [r.room]);
});

test('1:1: odrzucenie i anulowanie; anulować może tylko dzwoniący', { skip: skipDb }, async () => {
  const h = harness();
  const a = await startCall(h.ctx, U('jan'), { conversation_id: C_DM });
  const d = await declineCall(h.ctx, U('ola'), { call_id: a.call.id });
  assert.equal(d.call.status, 'declined');
  assert.equal((await q1(`SELECT response FROM call_participants WHERE call_id = $1 AND user_email = 'ola@x.pl'`, [a.call.id]))[0].response, 'declined');
  const b = await startCall(h.ctx, U('jan'), { conversation_id: C_DM });
  await assert.rejects(cancelCall(h.ctx, U('ola'), { call_id: b.call.id }), (e) => e.status === 403 && e.code === 'NOT_CALLER');
  await assert.rejects(declineCall(h.ctx, U('obcy'), { call_id: b.call.id }), (e) => e.status === 403);
  const c = await cancelCall(h.ctx, U('jan'), { call_id: b.call.id });
  assert.equal(c.call.status, 'cancelled');
  assert.deepEqual(await cancelCall(h.ctx, U('jan'), { call_id: b.call.id }).then((x) => x.call.status), 'cancelled');
  await settle();
  const texts = (await messagesOf(C_DM)).filter((m) => [a.call.id, b.call.id].includes(m.metadata.call_id)).map((m) => m.content);
  assert.deepEqual(texts, ['Połączenie odrzucone', 'Nieodebrane połączenie']);
  assert.equal(h.notified.length, 1, 'push tylko o anulowanym (dla rozmówcy nieodebrane)');
});

test('grupa: wiadomość „trwa — dołącz” od razu, wyciszeni bez pushu, okno 45 s → trwa, koniec pokoju → czas trwania', { skip: skipDb }, async () => {
  const h = harness();
  const r = await startCall(h.ctx, U('jan'), { conversation_id: C_GROUP, kind: 'video' });
  assert.equal(r.call.is_group, true);
  const ofCall = async () => (await messagesOf(C_GROUP)).filter((m) => m.metadata.call_id === r.call.id);
  let msgs = await ofCall();
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].content, 'Rozmowa grupowa wideo trwa — dołącz');
  assert.equal(r.call.message_id, msgs[0].id);
  await settle();
  assert.deepEqual(h.pushes.map((p) => p.user_email).sort(), ['kid@x.pl', 'ola@x.pl'], 'piotr wyciszył rozmowę');
  assert.equal(h.pushes[0].title, 'Zespół uwielbienia');
  assert.equal(h.pushes[0].data.is_group, true);

  // Webhook: dzwoniący w pokoju, Ola dołącza — dalej dzwoni u pozostałych (okno 45 s).
  await handleLivekitEvent(h.ctx, { event: 'participant_joined', room: { name: r.room }, participant: { identity: 'jan@x.pl' } });
  assert.deepEqual(await handleLivekitEvent(h.ctx, { event: 'participant_joined', room: { name: r.room }, participant: { identity: 'OLA@x.pl' } }), { action: 'answered' });
  let call = (await q1(`SELECT * FROM calls WHERE id = $1`, [r.call.id]))[0];
  assert.equal(call.status, 'ringing');
  assert.ok(call.answered_at);
  // Odrzucenie w grupie dotyczy tylko mnie.
  const d = await declineCall(h.ctx, U('kid'), { call_id: r.call.id });
  assert.equal(d.call.status, 'ringing');
  await backdate(r.call.id, 50);
  assert.equal((await expireRinging(h.ctx, r.call.id)).status, 'active');
  // Wyjście jednej osoby nie kończy rozmowy grupowej.
  assert.deepEqual(await handleLivekitEvent(h.ctx, { event: 'participant_left', room: { name: r.room }, participant: { identity: 'ola@x.pl' } }), { action: 'left' });
  await db.query(`UPDATE calls SET answered_at = now() - interval '10 minutes' WHERE id = $1`, [r.call.id]);
  assert.deepEqual(await handleLivekitEvent(h.ctx, { event: 'participant_left', room: { name: r.room }, participant: { identity: 'jan@x.pl' } }), { action: 'ended' });
  assert.deepEqual(await handleLivekitEvent(h.ctx, { event: 'room_finished', room: { name: r.room } }), { action: 'noop' });
  await settle();
  msgs = await ofCall();
  assert.equal(msgs.length, 1, 'ta sama wiadomość zaktualizowana');
  assert.equal(msgs[0].content, 'Rozmowa grupowa wideo · 10 min');
  assert.equal(msgs[0].metadata.status, 'ended');
  call = (await q1(`SELECT * FROM calls WHERE id = $1`, [r.call.id]))[0];
  assert.equal(call.status, 'ended');
  const msgUpdate = h.emitted.find((e) => e.table === 'messages' && e.op === 'update');
  assert.deepEqual(msgUpdate.audience, ['jan@x.pl', 'kid@x.pl', 'ola@x.pl', 'piotr@x.pl']);
  const partEmit = h.emitted.find((e) => e.table === 'call_participants');
  assert.deepEqual(partEmit.audience, ['jan@x.pl', 'kid@x.pl', 'ola@x.pl', 'piotr@x.pl']);
});

test('grupa bez odzewu: dzwoniący nie wszedł do pokoju → po 45 s nieodebrana', { skip: skipDb }, async () => {
  const h = harness();
  const r = await startCall(h.ctx, U('jan'), { conversation_id: C_GROUP });
  await backdate(r.call.id, 50);
  h.livekit.occupancy = new Map(); // pokoju nie ma
  const done = await expireRinging(h.ctx, r.call.id);
  assert.equal(done.status, 'missed');
  await settle();
  const m = (await messagesOf(C_GROUP)).find((x) => x.metadata.call_id === r.call.id);
  assert.equal(m.content, 'Nieodebrana rozmowa grupowa');
  assert.equal(h.notified.length, 0, 'bez masowego pushu o nieodebranej grupie');
});

test('webhook: odebranie 1:1 przez participant_joined; nieznany pokój ignorowany; wejście do zakończonej rozmowy zamyka pokój', { skip: skipDb }, async () => {
  const h = harness();
  const r = await startCall(h.ctx, U('jan'), { conversation_id: C_DM });
  assert.deepEqual(await handleLivekitEvent(h.ctx, { event: 'participant_joined', room: { name: r.room }, participant: { identity: 'jan@x.pl' } }), { action: 'joined' });
  assert.deepEqual(await handleLivekitEvent(h.ctx, { event: 'participant_joined', room: { name: r.room }, participant: { identity: 'ola@x.pl' } }), { action: 'answered' });
  assert.equal((await q1(`SELECT status FROM calls WHERE id = $1`, [r.call.id]))[0].status, 'active');
  assert.deepEqual(await handleLivekitEvent(h.ctx, { event: 'participant_left', room: { name: r.room }, participant: { identity: 'jan@x.pl' } }), { action: 'ended' });
  assert.deepEqual(await handleLivekitEvent(h.ctx, { event: 'participant_joined', room: { name: r.room }, participant: { identity: 'ola@x.pl' } }), { action: 'closed_stale_room' });
  assert.deepEqual(await handleLivekitEvent(h.ctx, { event: 'room_finished', room: { name: `avn_kosciol_${id(777)}` } }), { ignored: 'unknown_room' });
  assert.deepEqual(await handleLivekitEvent(h.ctx, { event: 'track_published', room: { name: r.room } }), { ignored: 'track_published' });
});

test('worker: trwające połączenie bez pokoju w LiveKit zostaje zakończone', { skip: skipDb }, async () => {
  const h = harness();
  const r = await startCall(h.ctx, U('jan'), { conversation_id: C_DM });
  await joinCall(h.ctx, U('ola'), { call_id: r.call.id });
  await backdate(r.call.id, 200);
  h.livekit.occupancy = new Map([[r.room, 2]]);
  assert.equal(await sweepCalls(h.ctx), 0, 'pokój żyje — bez zmian');
  h.livekit.occupancy = new Map();
  assert.equal(await sweepCalls(h.ctx), 1);
  assert.equal((await q1(`SELECT status FROM calls WHERE id = $1`, [r.call.id]))[0].status, 'ended');
  await settle();
});

test('odczyt przez /api/db: obcy nie widzi połączeń ani uczestników cudzej rozmowy', { skip: skipDb }, async () => {
  const sel = async (table, email) => {
    const b = buildQuery({ table, op: 'select', select: '*', filters: [], __ownerScope: conversationScope(table, { email }) });
    return (await db.query(b.sql, b.params)).rows;
  };
  const all = (await q1(`SELECT count(*)::int AS n FROM calls`))[0].n;
  assert.ok(all > 0);
  assert.equal((await sel('calls', 'obcy@x.pl')).length, 0);
  assert.equal((await sel('call_participants', 'obcy@x.pl')).length, 0);
  const mine = await sel('calls', 'OLA@x.pl');
  assert.ok(mine.length > 0);
  assert.ok(mine.every((c) => [C_DM, C_GROUP, C_ANN].includes(c.conversation_id)));
  assert.ok((await sel('call_participants', 'ola@x.pl')).length > 0);
  const parts = await q1(`SELECT * FROM call_participants LIMIT 5`);
  const aud = await conversationAudience(db, 'call_participants', parts);
  assert.ok(aud.size > 0 && !aud.has('obcy@x.pl'));
});

// ── Webhook HTTP ────────────────────────────────────────────────────────────
async function webhookApp(livekit, serviceDeps = {}) {
  const app = Fastify();
  await app.register(buildCallsRoutes({
    livekit,
    resolveTenant: async (slug) => (slug === 'kosciol' ? { slug: 'kosciol', db_name: 'x' } : null),
    getTenantPool: () => db,
    serviceDeps: { emit: () => {}, sendPush: async () => {}, notifyMessage: async () => {}, timers: false, ...serviceDeps },
  }));
  return app;
}

test('webhook HTTP: 503 bez kluczy, 401 przy złym podpisie (bez dotykania bazy)', async () => {
  const off = await webhookApp({ enabled: false });
  const r1 = await off.inject({ method: 'POST', url: WEBHOOK_PATH, headers: { 'content-type': 'application/webhook+json' }, payload: '{}' });
  assert.equal(r1.statusCode, 503);
  assert.equal(r1.json().code, 'calls_disabled');
  const bad = await webhookApp({ enabled: true, async receiveWebhook() { throw new Error('zły podpis'); } });
  const r2 = await bad.inject({ method: 'POST', url: WEBHOOK_PATH, headers: { 'content-type': 'application/json', authorization: 'x' }, payload: '{"event":"room_finished"}' });
  assert.equal(r2.statusCode, 401);
});

test('webhook HTTP: prawdziwy podpis LiveKit — poprawny przechodzi, zmieniona treść / obcy klucz / brak nagłówka → 401', { skip: skipSdk || skipDb }, async () => {
  const settings = { enabled: true, apiKey: 'APIwebhook', apiSecret: 'b'.repeat(40), url: 'wss://rtc.test', host: 'http://x' };
  const lk = createLivekit({ settings, sdk: SDK });
  lk.deleteRoom = async () => true;
  const app = await webhookApp(lk);
  const h = harness();
  const r = await startCall(h.ctx, U('jan'), { conversation_id: C_DM });
  const sign = async (body, secret = settings.apiSecret) => {
    const at = new SDK.AccessToken(settings.apiKey, secret);
    at.sha256 = createHash('sha256').update(body).digest('base64');
    return at.toJwt();
  };
  const post = (payload, authorization) => app.inject({
    method: 'POST', url: WEBHOOK_PATH,
    headers: { 'content-type': 'application/webhook+json', ...(authorization ? { authorization } : {}) }, payload,
  });
  const body = JSON.stringify({ event: 'participant_joined', id: 'EV_1', createdAt: '1791582393', room: { name: r.room, sid: 'RM_1' }, participant: { identity: 'ola@x.pl', sid: 'PA_1' } });
  assert.equal((await post(body)).statusCode, 401);
  assert.equal((await post(body.replace('ola@x.pl', 'obcy@x.pl'), await sign(body))).statusCode, 401);
  assert.equal((await post(body, await sign(body, 'c'.repeat(40)))).statusCode, 401);
  assert.equal((await q1(`SELECT status FROM calls WHERE id = $1`, [r.call.id]))[0].status, 'ringing');
  const ok = await post(body, await sign(body));
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().action, 'answered');
  assert.equal((await q1(`SELECT status FROM calls WHERE id = $1`, [r.call.id]))[0].status, 'active');
  const again = await post(body, await sign(body));
  assert.equal(again.json().action, 'joined', 'powtórzony webhook nie zmienia stanu');
  const foreign = JSON.stringify({ event: 'room_finished', room: { name: 'cudzy-pokoj' } });
  assert.equal((await post(foreign, await sign(foreign))).json().ignored, 'foreign_room');
  const fin = JSON.stringify({ event: 'room_finished', room: { name: r.room } });
  assert.equal((await post(fin, await sign(fin))).json().action, 'ended');
  await settle();
});
