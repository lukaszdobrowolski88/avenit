// Tłumaczenie na żywo (migracja 116, src/interpretation): reguły czyste, nazwy pokoi (avi_ nie psuje
// avn_ rozmów), token słuchacza/tłumacza (prawdziwy JWT z SDK), uprawnienia zarządzania, wejście
// tylko przypisanego tłumacza, publiczne info bez wnętrzności, zmiana tłumacza, webhook i sprzątanie.
//
// PGlite: testy bazy pomijają się, gdy modułu brak. Lokalnie:
//   PGLITE_MODULE=/…/@electric-sql/pglite/dist/index.js node --test packages/api/test/interpretation.test.js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Fastify from 'fastify';
import { decodeJwt } from 'jose';
import * as L from '../src/calls/logic.js';
import { createLivekit } from '../src/calls/livekit.js';
import { buildCallsRoutes, WEBHOOK_PATH } from '../src/calls/routes.js';
import * as I from '../src/interpretation/logic.js';
import {
  getSession, upsertSession, interpreterJoin, takeOver, release, stats, originalJoin, memberListen,
  publicInfo, publicListen, handleLivekitEvent, sweepInterpretation, runPublicInterpFn, MANAGE_CAPABILITY,
} from '../src/interpretation/service.js';
import { utcToZoned } from '../src/meetings/logic.js';
import { MODULES } from '@avenit/shared/src/permissions/catalog.js';

let PGlite = null;
try { ({ PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')); } catch { PGlite = null; }
let SDK = null;
try { SDK = await import(process.env.LIVEKIT_SDK_MODULE || 'livekit-server-sdk'); } catch { SDK = null; }
const skipDb = PGlite ? false : 'brak @electric-sql/pglite (ustaw PGLITE_MODULE)';
const skipSdk = SDK ? false : 'brak livekit-server-sdk';

const log = { error() {}, warn() {}, info() {} };
const U = (name) => ({ id: name, email: `${name}@x.pl` });
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DAY = 86_400_000;

// ── Reguły czyste ───────────────────────────────────────────────────────────
test('pokoje: avi_ tłumaczeń obok avn_ rozmów — rozmowy bez zmian', () => {
  const call = L.roomNameFor('schwro', uuid(1));
  assert.deepEqual(L.parseRoomName(call), { tenantSlug: 'schwro', callId: uuid(1) });
  const room = L.interpRoomNameFor('moj-kosciol', uuid(2));
  assert.equal(room, `avi_moj-kosciol_${uuid(2)}`);
  assert.deepEqual(L.parseRoomName(room), { kind: 'interpretation', tenantSlug: 'moj-kosciol', id: uuid(2) });
  assert.equal(L.parseRoomName(`avx_t_${uuid(2)}`), null);
  assert.equal(L.parseRoomName(`avi_Zly_${uuid(2)}`), null);
});

test('grant: hidden i canPublishSources tylko gdy podane (token rozmów bez zmian)', () => {
  assert.deepEqual(L.videoGrant('r', { canPublish: false }), {
    room: 'r', roomJoin: true, canPublish: false, canSubscribe: true, canPublishData: false, canUpdateOwnMetadata: false,
  });
  const g = L.videoGrant('r', { canPublish: false, canPublishData: false, hidden: true });
  assert.equal(g.hidden, true);
  assert.equal(g.canPublishSources, undefined);
  const t = L.videoGrant('r', { canPublish: true, canPublishSources: ['microphone', 'zly'] });
  assert.deepEqual(t.canPublishSources, ['microphone']);
});

test('kanały z formularza: kody, etykiety z presetów, duplikaty, limity, tłumacze', () => {
  const out = I.normalizeChannels([
    { lang_code: 'EN', interpreters: ['Ola@X.pl', 'ola@x.pl', 'zly'] },
    { lang_code: 'pt_BR', label: '  Português\u0000 (BR) ' },
  ]);
  assert.deepEqual(out.map((c) => [c.lang_code, c.label, c.sort]), [['en', 'English', 0], ['pt-br', 'Português (BR)', 1]]);
  assert.deepEqual(out[0].interpreters, ['ola@x.pl']);
  assert.throws(() => I.normalizeChannels([{ lang_code: 'en' }, { lang_code: 'en' }]), /już na liście/);
  assert.throws(() => I.normalizeChannels([{ lang_code: 'angielski' }]), /kod języka/);
  assert.throws(() => I.normalizeChannels(Array.from({ length: 9 }, (_, i) => ({ lang_code: `l${'abcdefghi'[i]}` }))), /Najwyżej 8/);
  assert.throws(() => I.normalizeChannels([{ lang_code: 'en', interpreters: Array.from({ length: 7 }, (_, i) => `t${i}@x.pl`) }]), /tłumaczy/);
});

test('koniec sesji 6 h po wydarzeniu, słuchacze i nadający, wyciszane ścieżki', () => {
  const ev = { date: '2026-10-12', time: '10:00', end_time: '12:00' };
  assert.equal(I.eventEndsAt(ev).toISOString(), '2026-10-12T10:00:00.000Z');
  assert.equal(I.sessionExpired(ev, Date.parse('2026-10-12T15:59:00Z')), false);
  assert.equal(I.sessionExpired(ev, Date.parse('2026-10-12T16:01:00Z')), true);
  assert.ok(I.eventEndsAt({ date: '2026-10-12' }), 'bez godziny — koniec dnia');
  const parts = [
    { identity: 'listener:aa', tracks: [] }, { identity: 'listener:bb', tracks: [] },
    { identity: 'ola@x.pl', tracks: [{ sid: 'TR_1', kind: 'audio', source: 'microphone', muted: false }, { sid: 'TR_2', kind: 'audio', source: 'microphone', muted: true }] },
  ];
  assert.equal(I.countListeners(parts), 2);
  assert.equal(I.hasPublisher(parts), true);
  assert.equal(I.hasPublisher(parts.slice(0, 2)), false);
  assert.equal(I.hasPublisher([{ identity: 'ola@x.pl' }], { original: true }), false);
  assert.equal(I.hasPublisher([{ identity: 'orig:ola@x.pl' }], { original: true }), true);
  assert.deepEqual(I.micTracksOf(parts, 'OLA@x.pl').map((t) => t.sid), ['TR_1']);
  assert.match(I.newListenerIdentity(), /^listener:[0-9a-f]{16}$/);
  assert.equal(I.isPublicToken(I.newPublicToken()), true);
});

test('katalog: akcja kalendarza „Zarządzaj tłumaczeniem na żywo”', () => {
  const cal = MODULES.find((m) => m.key === 'calendar');
  assert.ok(cal.actions.some((a) => `action:calendar:${a.key}` === MANAGE_CAPABILITY));
});

test('token słuchacza i tłumacza (prawdziwy JWT): ukryty bez publikowania / tylko mikrofon', { skip: skipSdk }, async () => {
  const lk = createLivekit({ settings: { enabled: true, apiKey: 'APIkey', apiSecret: 'a'.repeat(32), url: 'wss://rtc.t', host: 'http://x' }, sdk: SDK });
  const listener = decodeJwt(await lk.mintToken({ identity: 'listener:abc', name: 'Słuchacz', room: 'avi_t_r', canPublish: false, canPublishData: false, hidden: true, ttl: I.LISTENER_TTL }));
  assert.equal(listener.sub, 'listener:abc');
  assert.equal(listener.exp - listener.nbf, 4 * 3600);
  assert.equal(listener.video.hidden, true);
  assert.equal(listener.video.canPublish, false);
  assert.equal(listener.video.canPublishData, false);
  assert.equal(listener.video.canSubscribe, true);
  assert.equal(listener.video.canPublishSources, undefined);
  assert.ok(!listener.video.roomAdmin && !listener.video.roomCreate);
  const interp = decodeJwt(await lk.mintToken({ identity: 'Ola@x.pl', name: 'Ola', room: 'avi_t_r', canPublish: true, canPublishSources: ['microphone'], canPublishData: false }));
  assert.equal(interp.sub, 'ola@x.pl');
  assert.deepEqual(interp.video.canPublishSources, ['microphone']);
  assert.equal(interp.video.hidden, undefined);
  assert.equal(interp.video.canPublishData, false);
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
    enabled: true, settings: { url: 'wss://rtc.test' },
    minted: [], created: [], deleted: [], muted: [], meta: [], rooms: new Map(),
    async mintToken(o) { lk.minted.push(o); return `tok:${o.identity}:${o.room}`; },
    async createRoom(o) { lk.created.push(o); return true; },
    async deleteRoom(r) { lk.deleted.push(r); return true; },
    async listParticipants(r) { return lk.rooms.get(r) || []; },
    async mutePublishedTrack(r, identity, sid, muted) { lk.muted.push({ r, identity, sid, muted }); return true; },
    async updateRoomMetadata(r, m) { lk.meta.push({ r, m: JSON.parse(m) }); return true; },
    async removeParticipant() { return true; },
    async roomOccupancy() { return new Map(); },
  };
  return lk;
}

function harness() {
  const livekit = fakeLivekit();
  const ctx = {
    db, tenantSlug: 'kosciol', log,
    tenant: { name: 'Kościół', slug: 'kosciol', subdomain: 'kosciol', dbName: `t_${Math.random()}` },
    deps: { livekit },
  };
  return { ctx, livekit };
}

async function newEvent(fields) {
  const cols = Object.keys(fields);
  const [row] = await q1(`INSERT INTO events (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`, cols.map((c) => fields[c]));
  return String(row.id);
}
const soon = () => utcToZoned(Date.now() + DAY).date;

before(async () => {
  if (skipDb) return;
  const pg = new PGlite();
  db = poolOf(pg);
  await pg.exec(`
    CREATE TABLE app_users (id serial PRIMARY KEY, email text, full_name text, name text, role text, is_super_admin boolean DEFAULT false,
      is_active boolean DEFAULT true, member_id int, avatar_url text, campus_id int);
    CREATE TABLE app_roles (key text PRIMARY KEY, is_admin boolean DEFAULT false);
    CREATE TABLE permission_grants (role text, user_id text, capability text, allowed boolean);
    CREATE TABLE app_settings (key text PRIMARY KEY, value text);
    CREATE TABLE members (id serial PRIMARY KEY, email text, birth_date date, household_id int, home_group_id int, ministries jsonb DEFAULT '[]', tags jsonb DEFAULT '[]');
    CREATE TABLE conversations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), type text, name text);
    CREATE TABLE conversation_participants (id serial PRIMARY KEY, conversation_id uuid, user_email text, role text);
    CREATE TABLE meetings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid, event_id text);
    CREATE TABLE rsvp_campaigns (id serial PRIMARY KEY, event_id int);
    CREATE TABLE rsvp_invitations (id serial PRIMARY KEY, campaign_id int, member_id int, email text);
    CREATE TABLE events (id serial PRIMARY KEY, title text NOT NULL, description text, date date, time text, end_time text, end_date date,
      location text, module_key text, campus_id int, created_by text, is_archived boolean DEFAULT false, visibility_segments jsonb, format text);
    CREATE TABLE app_modules (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key text UNIQUE NOT NULL, label text, icon text, path text,
      resource_key text, display_order int DEFAULT 0, is_system boolean DEFAULT false, is_enabled boolean DEFAULT true, component_name text);
    CREATE TABLE app_module_tabs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), module_id uuid, key text NOT NULL, label text NOT NULL,
      icon text, display_order int DEFAULT 0, is_system boolean DEFAULT false);
    CREATE TABLE team_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), team_type text NOT NULL, name text NOT NULL,
      display_order int DEFAULT 0, is_active boolean DEFAULT true);
  `);
  await db.query(`INSERT INTO app_roles (key, is_admin) VALUES ('superadmin', true), ('czlonek', false), ('koordynator', false)`);
  await db.query(`INSERT INTO permission_grants (role, capability, allowed) VALUES
    ('czlonek', 'module:calendar', true), ('czlonek', 'res:events:read', true),
    ('koordynator', 'module:calendar', true), ('koordynator', 'res:events:read', true), ('koordynator', $1, true)`, [MANAGE_CAPABILITY]);
  await db.query(`INSERT INTO app_users (email, full_name, role, member_id, is_super_admin, is_active) VALUES
    ('boss@x.pl', 'Pastor', 'superadmin', 1, true, true), ('koord@x.pl', 'Koordynator', 'koordynator', 2, false, true),
    ('jan@x.pl', 'Jan Kowalski', 'czlonek', 3, false, true), ('ola@x.pl', 'Ola Nowak', 'czlonek', 4, false, true),
    ('ewa@x.pl', 'Ewa Tłumacz', 'czlonek', 5, false, true), ('stary@x.pl', 'Nieaktywny', 'czlonek', 6, false, false)`);
  await db.query(`INSERT INTO app_settings (key, value) VALUES ('org_name', '"Kościół Testowy"')`);
  const sql = fs.readFileSync(new URL('../db/tenant-migrations/116_interpretation.sql', import.meta.url), 'utf8');
  await pg.exec(sql);
  await pg.exec(sql); // idempotentna
  // Moduł Tłumaczenia (117): języki en/uk/ru z migracji + de; zespół: Ola i Ewa (konta po e-mailu).
  await pg.exec(fs.readFileSync(new URL('../db/tenant-migrations/117_tlumaczenia_module.sql', import.meta.url), 'utf8'));
  await db.query(`INSERT INTO team_roles (team_type, name, field_key, display_order) VALUES ('tlumaczenia', 'Tłumacz DE', 'de', 4)`);
  await db.query(`INSERT INTO custom_tlumaczenia_members (full_name, email, status) VALUES
    ('Ola Nowak', 'ola@x.pl', 'Aktywny'), ('Ewa Tłumacz', 'ewa@x.pl', 'Aktywny'), ('Nieaktywny', 'stary@x.pl', 'Aktywny')`);
});

test('zarządzanie: tylko z uprawnieniem (albo admin); członek widzi tylko języki, bez linku i osób', { skip: skipDb }, async () => {
  const { ctx, livekit } = harness();
  const evId = await newEvent({ title: 'Nabożeństwo', date: soon(), time: '10:00', end_time: '12:00' });
  await assert.rejects(upsertSession(ctx, U('jan'), { event_id: evId, enable: true }), (e) => e.status === 403 && e.code === 'INTERP_FORBIDDEN');
  const empty = await getSession(ctx, U('koord'), { event_id: evId });
  assert.equal(empty.can_manage, true);
  assert.equal(empty.session, null);
  assert.ok(empty.people.some((p) => p.email === 'ola@x.pl'));
  assert.ok(!empty.people.some((p) => p.email === 'stary@x.pl'), 'bez nieaktywnych kont');
  assert.ok(!empty.people.some((p) => p.email === 'jan@x.pl'), 'tylko zespół Tłumaczeń');
  assert.deepEqual(empty.module.languages.map((l) => [l.lang_code, l.role_name, l.label]),
    [['en', 'Tłumacz EN', 'English'], ['uk', 'Tłumacz UK', 'Українська'], ['ru', 'Tłumacz RU', 'Русский'], ['de', 'Tłumacz DE', 'Deutsch']]);

  await assert.rejects(upsertSession(ctx, U('koord'), { event_id: evId, channels: [{ lang_code: 'en', interpreters: ['stary@x.pl'] }] }),
    (e) => e.status === 400 && e.code === 'NOT_IN_TEAM', 'konto nieaktywne = bez konta w aplikacji');
  const v = await upsertSession(ctx, U('koord'), {
    event_id: evId, original_enabled: true,
    channels: [{ lang_code: 'en', interpreters: ['ola@x.pl', 'ewa@x.pl'] }, { lang_code: 'uk' }],
  });
  assert.equal(v.session.status, 'idle');
  assert.equal(v.session.original_enabled, true);
  assert.deepEqual(v.session.channels.map((c) => [c.lang_code, c.label]), [['en', 'English'], ['uk', 'Українська']]);
  assert.deepEqual(v.session.channels[0].interpreters.map((i) => i.name), ['Ola Nowak', 'Ewa Tłumacz']);
  assert.ok(I.isPublicToken(v.session.public_token));
  assert.ok(v.session.public_url.endsWith(`/tlumaczenie/${v.session.public_token}`));
  assert.equal(v.session.public_path, `/tlumaczenie/${v.session.public_token}`);
  const [s] = await q1(`SELECT * FROM interpretation_sessions WHERE event_id = $1`, [evId]);
  const rooms = await q1(`SELECT room_name FROM interpretation_channels WHERE session_id = $1 ORDER BY sort`, [s.id]);
  for (const r of rooms) assert.equal(L.parseRoomName(r.room_name).kind, 'interpretation');
  assert.equal(L.parseRoomName(s.original_room_name).id, s.id);

  // Członek (widzi wydarzenie): języki i stan — bez tokenu linku, tłumaczy, osób.
  const member = await getSession(ctx, U('jan'), { event_id: evId });
  assert.equal(member.can_manage, false);
  assert.equal(member.people, undefined);
  assert.equal(member.session.public_token, undefined);
  assert.equal(member.session.public_url, undefined);
  assert.equal(member.session.channels[0].interpreters, undefined);
  assert.equal(member.session.channels[0].active_interpreter_email, undefined);
  assert.ok(!JSON.stringify(member).includes(s.public_token));

  // Tłumacz: widzi swój kanał i partnerów, nadal bez linku.
  const ola = await getSession(ctx, U('ola'), { event_id: evId });
  assert.deepEqual(ola.my_channels, [v.session.channels[0].id]);
  assert.equal(ola.session.channels[0].mine, true);
  assert.ok(ola.session.channels[0].interpreters.length === 2);
  assert.equal(ola.session.public_token, undefined);

  // Usunięcie języka zamyka jego pokój; nowy link unieważnia stary.
  const ukRoom = rooms[1].room_name;
  const v2 = await upsertSession(ctx, U('boss'), { event_id: evId, regenerate_token: true, channels: [{ id: v.session.channels[0].id, lang_code: 'en', label: 'English (US)', interpreters: ['ola@x.pl'] }] });
  assert.deepEqual(v2.session.channels.map((c) => [c.label, c.role_name]), [['English', 'Tłumacz EN']], 'etykieta z modułu, nie z formularza');
  assert.equal(v2.session.channels[0].id, v.session.channels[0].id, 'kanał zachowany (ten sam pokój)');
  assert.ok(livekit.deleted.includes(ukRoom));
  assert.notEqual(v2.session.public_token, v.session.public_token);
  await assert.rejects(publicInfo(ctx, { token: v.session.public_token }), (e) => e.status === 404);
});

test('konsola: tylko przypisany tłumacz (albo zarządzający); token tylko-mikrofon + odsłuch Oryginału', { skip: skipDb }, async () => {
  const { ctx, livekit } = harness();
  const evId = await newEvent({ title: 'Konferencja', date: soon(), time: '18:00' });
  const v = await upsertSession(ctx, U('boss'), { event_id: evId, original_enabled: true, channels: [{ lang_code: 'en', interpreters: ['ola@x.pl'] }] });
  const chId = v.session.channels[0].id;
  await assert.rejects(interpreterJoin(ctx, U('jan'), { channel_id: chId }), (e) => e.status === 403 && e.code === 'NOT_INTERPRETER');
  await assert.rejects(interpreterJoin(ctx, U('ola'), { channel_id: 'zly' }), (e) => e.status === 404);
  const j = await interpreterJoin(ctx, U('ola'), { channel_id: chId });
  assert.equal(j.url, 'wss://rtc.test');
  assert.ok(j.original?.token);
  const [chTok, origTok] = livekit.minted.slice(-2);
  assert.deepEqual([chTok.identity, chTok.canPublish, chTok.canPublishData, chTok.hidden], ['ola@x.pl', true, false, undefined]);
  assert.deepEqual(chTok.canPublishSources, ['microphone']);
  assert.deepEqual([origTok.canPublish, origTok.hidden, origTok.canPublishData], [false, true, false]);
  // Pokoje założone jawnie z limitem 500 PRZED wydaniem tokenu.
  const created = livekit.created.find((c) => c.name === chTok.room);
  assert.equal(created.maxParticipants, 500);
  assert.ok(livekit.created.some((c) => c.name === origTok.room));
  // Zarządzający może wejść do konsoli; nadawanie Oryginału — zarządzający / tłumacz, nie członek.
  await interpreterJoin(ctx, U('koord'), { channel_id: chId });
  const o = await originalJoin(ctx, U('ola'), { event_id: evId });
  assert.match(livekit.minted.at(-1).identity, /^orig:ola@x\.pl$/);
  assert.deepEqual(livekit.minted.at(-1).canPublishSources, ['microphone']);
  assert.ok(o.token);
  await assert.rejects(originalJoin(ctx, U('jan'), { event_id: evId }), (e) => e.status === 403);
  await upsertSession(ctx, U('boss'), { event_id: evId, original_enabled: false });
  await assert.rejects(originalJoin(ctx, U('ola'), { event_id: evId }), (e) => e.code === 'ORIGINAL_DISABLED');
});

test('słuchacz: publiczne info bez wnętrzności, token tylko do nadającego kanału, ukryty bez publikowania', { skip: skipDb }, async () => {
  const { ctx, livekit } = harness();
  const evId = await newEvent({ title: 'Nabożeństwo niedzielne', date: soon(), time: '10:00', end_time: '11:30', visibility_segments: null });
  const v = await upsertSession(ctx, U('boss'), { event_id: evId, channels: [{ lang_code: 'en', interpreters: ['ola@x.pl'] }, { lang_code: 'uk', interpreters: ['ewa@x.pl'] }] });
  const token = v.session.public_token;
  const [en, uk] = v.session.channels;
  const info = await publicInfo(ctx, { token });
  assert.equal(info.church_name, 'Kościół Testowy');
  assert.equal(info.event.title, 'Nabożeństwo niedzielne');
  assert.deepEqual(info.channels.map((c) => [c.lang_code, c.live]), [['en', false], ['uk', false]]);
  const raw = JSON.stringify(info);
  for (const secret of [token, 'ola@x.pl', 'avi_', v.session.id, 'room', 'interpreter']) assert.ok(!raw.includes(secret), `bez ${secret}`);
  assert.equal(info.event.id, undefined, 'bez id wydarzenia');
  await assert.rejects(publicInfo(ctx, { token: 'x'.repeat(32) }), (e) => e.status === 404 && e.code === 'INTERP_NOT_FOUND');
  await assert.rejects(publicInfo(ctx, { token: '../etc' }), (e) => e.status === 404);

  await assert.rejects(publicListen(ctx, { token, channel_id: en.id }), (e) => e.status === 409 && e.code === 'CHANNEL_NOT_LIVE');
  await takeOver(ctx, U('ola'), { channel_id: en.id });
  assert.equal((await publicInfo(ctx, { token })).status, 'live');
  const r = await publicListen(ctx, { token, channel_id: en.id });
  assert.equal(r.url, 'wss://rtc.test');
  assert.deepEqual(r.channel, { id: en.id, lang_code: 'en', label: 'English', live: true });
  const minted = livekit.minted.at(-1);
  assert.match(minted.identity, /^listener:[0-9a-f]{16}$/);
  assert.deepEqual([minted.canPublish, minted.canPublishData, minted.hidden, minted.ttl], [false, false, true, '4h']);
  assert.equal(minted.canPublishSources, undefined);
  // Kanał innej sesji — nie z tym linkiem.
  const ev2 = await newEvent({ title: 'Inne', date: soon(), time: '12:00' });
  const v3 = await upsertSession(ctx, U('boss'), { event_id: ev2, channels: [{ lang_code: 'de', interpreters: ['ola@x.pl'] }] });
  await takeOver(ctx, U('ola'), { channel_id: v3.session.channels[0].id });
  await assert.rejects(publicListen(ctx, { token, channel_id: v3.session.channels[0].id }), (e) => e.status === 404);
  // Zalogowany członek z aplikacji — ten sam token słuchacza.
  const m = await memberListen(ctx, U('jan'), { event_id: evId, channel_id: en.id });
  assert.ok(m.token);
  assert.equal(livekit.minted.at(-1).hidden, true);
  await assert.rejects(memberListen(ctx, U('jan'), { event_id: evId, channel_id: uk.id }), (e) => e.code === 'CHANNEL_NOT_LIVE');
  // Zawieszony kościół / wyłączony LiveKit.
  await assert.rejects(publicInfo({ ...ctx, tenant: { ...ctx.tenant, blocked: true } }, { token }), (e) => e.status === 410);
  await assert.rejects(publicListen({ ...ctx, deps: { livekit: { enabled: false } } }, { token, channel_id: en.id }), (e) => e.status === 503);
  // Handler publiczny: bez bazy → 404, bez szczegółów błędów.
  const reply = { statusCode: 200, body: null, code(n) { this.statusCode = n; return this; }, send(b) { this.body = b; return this; } };
  await runPublicInterpFn({ db: null, body: { token } }, reply, publicInfo);
  assert.equal(reply.statusCode, 404);
});

test('zmiana tłumacza: przejmij → poprzedni wyciszony na serwerze, metadane pokoju; oddaj', { skip: skipDb }, async () => {
  const { ctx, livekit } = harness();
  const evId = await newEvent({ title: 'Wieczór uwielbienia', date: soon(), time: '19:00' });
  const v = await upsertSession(ctx, U('boss'), { event_id: evId, channels: [{ lang_code: 'en', interpreters: ['ola@x.pl', 'ewa@x.pl'] }] });
  const ch = v.session.channels[0];
  const [{ room_name: room }] = await q1(`SELECT room_name FROM interpretation_channels WHERE id = $1`, [ch.id]);
  const a = await takeOver(ctx, U('ola'), { channel_id: ch.id });
  assert.equal(a.channel.active_interpreter_email, 'ola@x.pl');
  assert.equal(a.channel.status, 'live');
  assert.equal(a.muted, null);
  assert.deepEqual(livekit.meta.at(-1), { r: room, m: { active: 'ola@x.pl' } });
  livekit.rooms.set(room, [
    { identity: 'ola@x.pl', tracks: [{ sid: 'TR_ola', kind: 'audio', source: 'microphone', muted: false }] },
    { identity: 'ewa@x.pl', tracks: [] },
    { identity: 'listener:1', tracks: [] },
  ]);
  await assert.rejects(takeOver(ctx, U('jan'), { channel_id: ch.id }), (e) => e.status === 403);
  const b = await takeOver(ctx, U('ewa'), { channel_id: ch.id });
  assert.equal(b.channel.active_interpreter_email, 'ewa@x.pl');
  assert.equal(b.muted, 'ola@x.pl');
  assert.deepEqual(livekit.muted, [{ r: room, identity: 'ola@x.pl', sid: 'TR_ola', muted: true }]);
  assert.deepEqual(livekit.meta.at(-1).m, { active: 'ewa@x.pl' });
  // Oddać może tylko aktywny (Ola już nie jest) — bez zmiany.
  const notMine = await release(ctx, U('ola'), { channel_id: ch.id });
  assert.equal(notMine.channel.active_interpreter_email, 'ewa@x.pl');
  const rel = await release(ctx, U('ewa'), { channel_id: ch.id });
  assert.equal(rel.channel.active_interpreter_email, null);
  assert.deepEqual(livekit.meta.at(-1).m, { active: null });
  // Licznik: słuchacze bez tłumaczy; członek bez dostępu.
  const st = await stats(ctx, U('ola'), { event_id: evId });
  assert.equal(st.channels[0].listeners, 1);
  assert.equal(st.channels[0].publishing, true);
  assert.equal(st.total_listeners, 1);
  await assert.rejects(stats(ctx, U('jan'), { event_id: evId }), (e) => e.status === 403);
  // Usunięcie tłumacza z listy zwalnia go jako aktywnego.
  await takeOver(ctx, U('ola'), { channel_id: ch.id });
  await upsertSession(ctx, U('boss'), { event_id: evId, channels: [{ id: ch.id, lang_code: 'en', interpreters: ['ewa@x.pl'] }] });
  const [row] = await q1(`SELECT active_interpreter_email FROM interpretation_channels WHERE id = $1`, [ch.id]);
  assert.equal(row.active_interpreter_email, null);
  await assert.rejects(interpreterJoin(ctx, U('ola'), { channel_id: ch.id }), (e) => e.status === 403);
});

test('webhook (avi_) i sprzątanie: kanał bez tłumacza → idle, sesja po wydarzeniu → koniec i zamknięte pokoje', { skip: skipDb }, async () => {
  const { ctx, livekit } = harness();
  const evId = await newEvent({ title: 'Stare', date: soon(), time: '09:00' });
  const v = await upsertSession(ctx, U('boss'), { event_id: evId, original_enabled: true, channels: [{ lang_code: 'en', interpreters: ['ola@x.pl'] }] });
  const ch = v.session.channels[0];
  const [{ room_name: room }] = await q1(`SELECT room_name FROM interpretation_channels WHERE id = $1`, [ch.id]);
  const [{ original_room_name: orig }] = await q1(`SELECT original_room_name FROM interpretation_sessions WHERE id = $1`, [v.session.id]);

  assert.deepEqual(await handleLivekitEvent(ctx, { event: 'track_published', room: { name: room }, participant: { identity: 'listener:x' } }), { ignored: 'listener' });
  assert.deepEqual(await handleLivekitEvent(ctx, { event: 'track_published', room: { name: room }, participant: { identity: 'ola@x.pl' } }), { action: 'live' });
  assert.equal((await q1(`SELECT status FROM interpretation_channels WHERE id = $1`, [ch.id]))[0].status, 'live');
  assert.deepEqual(await handleLivekitEvent(ctx, { event: 'track_published', room: { name: orig }, participant: { identity: 'orig:boss@x.pl' } }), { action: 'original_live' });
  assert.deepEqual(await handleLivekitEvent(ctx, { event: 'participant_joined', room: { name: `avi_kosciol_${uuid(99)}` }, participant: { identity: 'x' } }), { ignored: 'unknown_room' });

  // Tłumacz w pokoju — kanał zostaje; nikt od > 3 min — idle i zwolniony aktywny.
  await takeOver(ctx, U('ola'), { channel_id: ch.id });
  livekit.rooms.set(room, [{ identity: 'ola@x.pl', tracks: [] }, { identity: 'listener:1', tracks: [] }]);
  await sweepInterpretation(ctx);
  assert.equal((await q1(`SELECT status FROM interpretation_channels WHERE id = $1`, [ch.id]))[0].status, 'live');
  livekit.rooms.set(room, [{ identity: 'listener:1', tracks: [] }]);
  await db.query(`UPDATE interpretation_channels SET last_active_at = now() - interval '4 minutes' WHERE id = $1`, [ch.id]);
  await db.query(`UPDATE interpretation_sessions SET original_last_active_at = now() - interval '4 minutes' WHERE id = $1`, [v.session.id]);
  await sweepInterpretation(ctx);
  const [c1] = await q1(`SELECT status, active_interpreter_email FROM interpretation_channels WHERE id = $1`, [ch.id]);
  assert.deepEqual([c1.status, c1.active_interpreter_email], ['idle', null]);
  assert.deepEqual(livekit.meta.at(-1), { r: room, m: { active: null } });
  const [s1] = await q1(`SELECT status, original_status FROM interpretation_sessions WHERE id = $1`, [v.session.id]);
  assert.deepEqual([s1.status, s1.original_status], ['idle', 'idle']);
  // LiveKit nie odpowiada — kanałów nie ruszamy.
  await takeOver(ctx, U('ola'), { channel_id: ch.id });
  await db.query(`UPDATE interpretation_channels SET last_active_at = now() - interval '10 minutes' WHERE id = $1`, [ch.id]);
  livekit.listParticipants = async () => null;
  await sweepInterpretation(ctx);
  assert.equal((await q1(`SELECT status FROM interpretation_channels WHERE id = $1`, [ch.id]))[0].status, 'live');

  // Wydarzenie wczoraj → sesja zakończona 6 h po końcu, pokoje zamknięte, słuchacz dostaje 410.
  await db.query(`UPDATE events SET date = $2 WHERE id = $1`, [Number(evId), utcToZoned(Date.now() - 2 * DAY).date]);
  livekit.deleted.length = 0;
  await sweepInterpretation(ctx);
  const [s2] = await q1(`SELECT status FROM interpretation_sessions WHERE id = $1`, [v.session.id]);
  assert.equal(s2.status, 'ended');
  assert.ok(livekit.deleted.includes(room) && livekit.deleted.includes(orig));
  assert.equal((await q1(`SELECT status FROM interpretation_channels WHERE id = $1`, [ch.id]))[0].status, 'idle');
  await assert.rejects(publicListen(ctx, { token: v.session.public_token, channel_id: ch.id }), (e) => e.status === 410 && e.code === 'INTERP_ENDED');
  assert.deepEqual((await publicInfo(ctx, { token: v.session.public_token })).channels, []);
  await assert.rejects(interpreterJoin(ctx, U('ola'), { channel_id: ch.id }), (e) => e.status === 410);
  // Wejście starym tokenem do zakończonej sesji — pokój zamykany.
  assert.deepEqual(await handleLivekitEvent(ctx, { event: 'participant_joined', room: { name: room }, participant: { identity: 'listener:z' } }), { action: 'closed_stale_room' });
  // Wznowienie przez zarządzającego.
  const re = await upsertSession(ctx, U('boss'), { event_id: evId, reopen: true });
  assert.equal(re.session.status, 'idle');

  // Usunięte wydarzenie → sesja zakończona; „Wyłącz tłumaczenie” usuwa sesję.
  const ev3 = await newEvent({ title: 'Do usunięcia', date: soon(), time: '09:00' });
  const v3 = await upsertSession(ctx, U('boss'), { event_id: ev3, enable: true });
  await db.query(`DELETE FROM events WHERE id = $1`, [Number(ev3)]);
  await sweepInterpretation(ctx);
  assert.equal((await q1(`SELECT status FROM interpretation_sessions WHERE id = $1`, [v3.session.id]))[0].status, 'ended');
  const off = await upsertSession(ctx, U('boss'), { event_id: evId, remove: true });
  assert.equal(off.session, null);
  assert.equal((await q1(`SELECT count(*)::int AS n FROM interpretation_sessions WHERE event_id = $1`, [evId]))[0].n, 0);
});

test('webhook HTTP: pokój avi_ trafia do tłumaczeń, avn_ dalej do rozmów', { skip: skipDb }, async () => {
  const seen = [];
  const livekit = { enabled: true, settings: {}, async receiveWebhook(raw) { return JSON.parse(raw); }, async deleteRoom() { return true; } };
  const app = Fastify();
  await app.register(buildCallsRoutes({
    livekit,
    resolveTenant: async (slug) => (slug === 'kosciol' ? { slug: 'kosciol', db_name: 'x' } : null),
    getTenantPool: () => db,
    serviceDeps: { emit: () => {}, sendPush: async () => {}, notifyMessage: async () => {}, timers: false },
    handleInterpretationEvent: async (ctx, ev) => { seen.push(ev.room.name); return { action: 'interp' }; },
  }));
  const post = (name) => app.inject({ method: 'POST', url: WEBHOOK_PATH, headers: { 'content-type': 'application/webhook+json', authorization: 'x' }, payload: JSON.stringify({ event: 'room_finished', room: { name } }) });
  const r1 = await post(`avi_kosciol_${uuid(5)}`);
  assert.equal(r1.statusCode, 200);
  assert.equal(r1.json().action, 'interp');
  assert.deepEqual(seen, [`avi_kosciol_${uuid(5)}`]);
  const r2 = await post(`avi_obcy_${uuid(5)}`);
  assert.equal(r2.json().ignored, 'unknown_tenant');
  await app.close();
});
