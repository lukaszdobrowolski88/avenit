// Natywne dzwonienie (VoIP push, src/push/voip.js): payload IncomingCallEvent (kontrakt z aplikacją),
// JWT APNs (ES256) i asercja FCM (RS256), kształt żądań APNs/FCM, zerowanie martwych tokenów,
// brak kluczy = kanał wyłączony bez wyjątku; integracja z ringParticipants na PRAWDZIWYM SQL
// (PGlite + migracja 107): VoIP na urządzenie z tokenem, push Expo tylko na pozostałe.
//
// PGlite: testy bazy pomijają się, gdy modułu brak. Lokalnie:
//   PGLITE_MODULE=/…/@electric-sql/pglite/dist/index.js node --test test/voip.test.js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http2 from 'node:http2';
import { generateKeyPairSync, verify } from 'node:crypto';
import {
  buildIncomingCallEvent, absoluteUrl, apnsJwt, fcmAssertion, apnsRequest, fcmMessage,
  apnsTokenInvalid, fcmTokenInvalid, createVoipSender, voipSettings, http2Post,
} from '../src/push/voip.js';
import { ringParticipants } from '../src/calls/service.js';
import { sendPushCore } from '../src/fn/send-push.js';
import { buildQuery } from '../src/dataapi/querybuilder.js';
import { ownerScope, enforceOwnedWrite } from '../src/dataapi/ownership.js';

let PGlite = null;
try { ({ PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')); } catch { PGlite = null; }
const skipDb = PGlite ? false : 'brak @electric-sql/pglite (ustaw PGLITE_MODULE)';

const log = { error() {}, warn() {}, info() {} };
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const decode = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

const CALL = {
  id: id(77), conversation_id: id(1), kind: 'video', is_group: false,
  started_by_email: 'Jan@X.pl', started_at: new Date('2026-10-12T10:00:00Z'),
};

// ── Payload ─────────────────────────────────────────────────────────────────
test('IncomingCallEvent: dokładnie kontrakt z aplikacją, metadane jako tekst', () => {
  const ev = buildIncomingCallEvent({
    call: CALL, callerName: 'Jan Kowalski', displayName: 'Jan Kowalski',
    avatarUrl: 'https://kosciol.avenit.pl/jan.png', tenantSlug: 'kosciol', eventId: 'ev-1',
  });
  assert.deepEqual(ev, {
    eventId: 'ev-1',
    serverCallId: id(77),
    hasVideo: true,
    startedAt: '2026-10-12T10:00:00.000Z',
    caller: { id: 'jan@x.pl', displayName: 'Jan Kowalski', avatarUrl: 'https://kosciol.avenit.pl/jan.png' },
    metadata: { conversationId: id(1), tenant: 'kosciol', isGroup: 'false', kind: 'video', callerName: 'Jan Kowalski' },
  });
  for (const v of Object.values(ev.metadata)) assert.equal(typeof v, 'string');

  // Grupa: nazwa rozmowy w displayName, bez awatara; losowe eventId (uuid).
  const g = buildIncomingCallEvent({
    call: { ...CALL, kind: 'audio', is_group: true, started_at: '2026-10-12T10:00:00Z' },
    callerName: 'Jan Kowalski', displayName: 'Zespół uwielbienia', tenantSlug: 'kosciol',
  });
  assert.match(g.eventId, /^[0-9a-f-]{36}$/);
  assert.equal(g.hasVideo, false);
  assert.equal(g.caller.displayName, 'Zespół uwielbienia');
  assert.equal('avatarUrl' in g.caller, false);
  assert.equal(g.metadata.isGroup, 'true');
  assert.equal(g.metadata.callerName, 'Jan Kowalski');
});

test('awatar: bezwzględny bez zmian, ścieżka względem webu tenanta, reszta pominięta', () => {
  assert.equal(absoluteUrl('https://cdn.x/a.png', 't', 'avenit.pl'), 'https://cdn.x/a.png');
  assert.equal(absoluteUrl('/storage/a.png', 'schwro', 'avenit.pl'), 'https://schwro.avenit.pl/storage/a.png');
  assert.equal(absoluteUrl('//evil.pl/a.png', 'schwro', 'avenit.pl'), null);
  assert.equal(absoluteUrl('a.png', 'schwro', 'avenit.pl'), null);
  assert.equal(absoluteUrl(null, 'schwro', 'avenit.pl'), null);
});

// ── JWT ─────────────────────────────────────────────────────────────────────
const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = (k) => k.export({ type: 'pkcs8', format: 'pem' });

test('JWT APNs: ES256, kid, iss = zespół, iat; podpis r||s weryfikowalny kluczem publicznym', () => {
  const now = Date.parse('2026-10-12T10:00:00Z');
  const jwt = apnsJwt({ key: ec.privateKey, keyId: 'KEY123', teamId: 'TEAM42', now });
  const [h, c, s] = jwt.split('.');
  assert.deepEqual(decode(h), { alg: 'ES256', kid: 'KEY123' });
  assert.deepEqual(decode(c), { iss: 'TEAM42', iat: now / 1000 });
  const sig = Buffer.from(s, 'base64url');
  assert.equal(sig.length, 64, 'format JOSE, nie DER');
  assert.ok(verify('sha256', Buffer.from(`${h}.${c}`), { key: ec.publicKey, dsaEncoding: 'ieee-p1363' }, sig));
});

test('asercja FCM: RS256, zakres firebase.messaging, aud = token_uri, ważna 1 h', () => {
  const now = Date.parse('2026-10-12T10:00:00Z');
  const jwt = fcmAssertion({ clientEmail: 'sa@proj.iam.gserviceaccount.com', key: rsa.privateKey, now });
  const [h, c, s] = jwt.split('.');
  assert.deepEqual(decode(h), { alg: 'RS256', typ: 'JWT' });
  assert.deepEqual(decode(c), {
    iss: 'sa@proj.iam.gserviceaccount.com', scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: now / 1000, exp: now / 1000 + 3600,
  });
  assert.ok(verify('sha256', Buffer.from(`${h}.${c}`), rsa.publicKey, Buffer.from(s, 'base64url')));
});

// ── Kształt żądań ───────────────────────────────────────────────────────────
test('żądanie APNs: host wg środowiska, nagłówki VoIP, temat <bundle>.voip, body { incomingCall }', () => {
  const ev = { eventId: 'e' };
  const r = apnsRequest({ token: 'abc', env: 'production', bundleId: 'pl.avenit.app', jwt: 'J', event: ev });
  assert.equal(r.origin, 'https://api.push.apple.com');
  assert.equal(r.path, '/3/device/abc');
  assert.deepEqual(r.headers, {
    authorization: 'bearer J', 'apns-push-type': 'voip', 'apns-topic': 'pl.avenit.app.voip',
    'apns-priority': '10', 'apns-expiration': '0', 'content-type': 'application/json',
  });
  assert.deepEqual(JSON.parse(r.body), { incomingCall: ev });
  assert.equal(apnsRequest({ token: 'abc', env: 'sandbox', bundleId: 'b', jwt: 'J', event: ev }).origin, 'https://api.sandbox.push.apple.com');
  assert.equal(apnsRequest({ token: 'abc', env: null, bundleId: 'b', jwt: 'J', event: ev }).origin, 'https://api.push.apple.com');
});

test('wiadomość FCM: data-only, priorytet HIGH, ttl 45s, wartości data jako tekst', () => {
  const ev = buildIncomingCallEvent({ call: CALL, callerName: 'Jan', tenantSlug: 't', eventId: 'e' });
  const m = fcmMessage('tok', ev);
  assert.deepEqual(Object.keys(m.message).sort(), ['android', 'data', 'token']);
  assert.equal(m.message.token, 'tok');
  assert.deepEqual(m.message.android, { priority: 'HIGH', ttl: '45s' });
  assert.equal(m.message.data.messageType, 'incomingCall');
  assert.deepEqual(JSON.parse(m.message.data.incomingCall), ev);
  for (const v of Object.values(m.message.data)) assert.equal(typeof v, 'string');
  assert.equal('notification' in m.message, false);
});

test('martwe tokeny: APNs 410 / BadDeviceToken / Unregistered; FCM 404 / UNREGISTERED / zły token', () => {
  assert.equal(apnsTokenInvalid(410, '{"reason":"Unregistered"}'), true);
  assert.equal(apnsTokenInvalid(400, '{"reason":"BadDeviceToken"}'), true);
  assert.equal(apnsTokenInvalid(400, '{"reason":"BadTopic"}'), false);
  assert.equal(apnsTokenInvalid(403, '{"reason":"ExpiredProviderToken"}'), false);
  assert.equal(apnsTokenInvalid(500, ''), false);
  assert.equal(fcmTokenInvalid(404, JSON.stringify({ error: { status: 'NOT_FOUND' } })), true);
  assert.equal(fcmTokenInvalid(400, JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message: 'x', details: [{ errorCode: 'UNREGISTERED' }] } })), true);
  assert.equal(fcmTokenInvalid(400, JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message: 'The registration token is not a valid FCM registration token' } })), true);
  assert.equal(fcmTokenInvalid(400, JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message: 'Invalid value at message.data' } })), false);
  assert.equal(fcmTokenInvalid(500, 'x'), false);
});

test('ustawienia z env: domyślny bundle pl.avenit.app', () => {
  const s = voipSettings({ APNS_KEY_PATH: '/k.p8', APNS_KEY_ID: 'K', APNS_TEAM_ID: 'T', FCM_SERVICE_ACCOUNT_PATH: '/sa.json' });
  assert.deepEqual(s, { apns: { keyPath: '/k.p8', keyId: 'K', teamId: 'T', bundleId: 'pl.avenit.app' }, fcm: { serviceAccountPath: '/sa.json' } });
});

// ── Nadawca (podmieniona sieć i pliki) ──────────────────────────────────────
const SETTINGS = {
  apns: { keyPath: '/s/key.p8', keyId: 'KID', teamId: 'TEAM', bundleId: 'pl.avenit.app' },
  fcm: { serviceAccountPath: '/s/sa.json' },
};
const FILES = {
  '/s/key.p8': pem(ec.privateKey),
  '/s/sa.json': JSON.stringify({ project_id: 'avenit-app', client_email: 'sa@avenit-app.iam.gserviceaccount.com', private_key: pem(rsa.privateKey), token_uri: 'https://oauth2.googleapis.com/token' }),
};
const readFiles = (files) => (p) => { if (!(p in files)) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; } return files[p]; };
const fakeDb = () => { const d = { queries: [], async query(sql, params) { d.queries.push({ sql, params }); return { rows: [] }; } }; return d; };
const jsonRes = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });

function fakeTransport({ apns = () => ({ status: 200, body: '' }), fcm = () => jsonRes(200, { name: 'm' }) } = {}) {
  const t = { apnsCalls: [], fetchCalls: [] };
  t.http2Post = async (req) => { t.apnsCalls.push(req); return apns(req); };
  t.fetch = async (url, opts) => {
    t.fetchCalls.push({ url, opts });
    if (url === 'https://oauth2.googleapis.com/token') return jsonRes(200, { access_token: 'ya29.T', expires_in: 3600 });
    return fcm(url, opts);
  };
  return t;
}
const dev = (n, type, token, env = 'production') => ({ id: id(n), expo_token: `ExponentPushToken[${n}]`, voip_token: token, voip_type: type, voip_env: env });
const EV = buildIncomingCallEvent({ call: CALL, callerName: 'Jan', tenantSlug: 't', eventId: 'e' });

test('APNs: wysyłka z JWT (cache między wysyłkami), sandbox wg urządzenia; duplikat tokenu wysłany raz', async () => {
  const t = fakeTransport();
  const s = createVoipSender({ settings: SETTINGS, transport: t, readFile: readFiles(FILES) });
  const r = await s.send(fakeDb(), [dev(1, 'APNS_VOIP', 'aaa'), dev(2, 'APNS_VOIP', 'aaa'), dev(3, 'APNS_VOIP', 'bbb', 'sandbox')], EV, { log });
  assert.deepEqual(r.map((x) => [x.expo_token, x.ok]), [['ExponentPushToken[1]', true], ['ExponentPushToken[2]', true], ['ExponentPushToken[3]', true]]);
  assert.equal(t.apnsCalls.length, 2);
  const byPath = Object.fromEntries(t.apnsCalls.map((c) => [c.path, c]));
  assert.equal(byPath['/3/device/aaa'].origin, 'https://api.push.apple.com');
  assert.equal(byPath['/3/device/bbb'].origin, 'https://api.sandbox.push.apple.com');
  assert.equal(byPath['/3/device/aaa'].headers['apns-topic'], 'pl.avenit.app.voip');
  const bearer = byPath['/3/device/aaa'].headers.authorization;
  assert.equal(bearer, byPath['/3/device/bbb'].headers.authorization, 'jeden JWT na oba żądania');
  const [h, c] = bearer.replace('bearer ', '').split('.');
  assert.deepEqual(decode(h), { alg: 'ES256', kid: 'KID' });
  assert.equal(decode(c).iss, 'TEAM');
  await s.send(fakeDb(), [dev(1, 'APNS_VOIP', 'ccc')], EV, { log });
  assert.equal(t.apnsCalls[2].headers.authorization, bearer, 'JWT z pamięci podręcznej');
  assert.deepEqual(JSON.parse(t.apnsCalls[0].body), { incomingCall: EV });
});

test('APNs: martwy token (410, BadDeviceToken) zerowany; inny błąd i wyjątek transportu — bez zerowania, bez rzucania', async () => {
  const replies = {
    '/3/device/dead': { status: 410, body: '{"reason":"Unregistered"}' },
    '/3/device/bad': { status: 400, body: '{"reason":"BadDeviceToken"}' },
    '/3/device/topic': { status: 400, body: '{"reason":"BadTopic"}' },
  };
  const t = fakeTransport({ apns: (req) => { if (req.path === '/3/device/boom') throw new Error('ECONNRESET'); return replies[req.path]; } });
  const db = fakeDb();
  const s = createVoipSender({ settings: SETTINGS, transport: t, readFile: readFiles(FILES) });
  const r = await s.send(db, [dev(1, 'APNS_VOIP', 'dead'), dev(2, 'APNS_VOIP', 'bad'), dev(3, 'APNS_VOIP', 'topic'), dev(4, 'APNS_VOIP', 'boom')], EV, { log });
  assert.deepEqual(r.map((x) => [x.ok, !!x.invalid]), [[false, true], [false, true], [false, false], [false, false]]);
  assert.equal(r[3].error, 'ECONNRESET');
  const cleared = db.queries.map((q) => q.params[0]).sort();
  assert.deepEqual(cleared, ['bad', 'dead']);
  assert.match(db.queries[0].sql, /UPDATE push_tokens SET voip_token = NULL/);
});

test('FCM: token OAuth raz (cache), POST v1 na projekt, data-only; UNREGISTERED zerowany', async () => {
  const t = fakeTransport({
    fcm: (_url, opts) => (JSON.parse(opts.body).message.token === 'gone'
      ? jsonRes(404, { error: { code: 404, status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } })
      : jsonRes(200, { name: 'projects/avenit-app/messages/1' })),
  });
  const db = fakeDb();
  const s = createVoipSender({ settings: SETTINGS, transport: t, readFile: readFiles(FILES) });
  const r = await s.send(db, [dev(1, 'FCM', 'ok1'), dev(2, 'FCM', 'gone'), dev(3, 'FCM', 'ok2')], EV, { log });
  assert.deepEqual(r.map((x) => x.ok), [true, false, true]);
  assert.equal(r[1].invalid, true);
  const oauth = t.fetchCalls.filter((c) => c.url.includes('oauth2'));
  assert.equal(oauth.length, 1, 'jeden token OAuth dla równoległych wysyłek');
  const form = new URLSearchParams(oauth[0].opts.body);
  assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  assert.equal(decode(form.get('assertion').split('.')[1]).iss, 'sa@avenit-app.iam.gserviceaccount.com');
  const sends = t.fetchCalls.filter((c) => c.url.includes('fcm.googleapis.com'));
  assert.equal(sends.length, 3);
  assert.equal(sends[0].url, 'https://fcm.googleapis.com/v1/projects/avenit-app/messages:send');
  assert.equal(sends[0].opts.headers.authorization, 'Bearer ya29.T');
  const msg = JSON.parse(sends[0].opts.body);
  assert.deepEqual(msg, fcmMessage('ok1', EV));
  assert.deepEqual(db.queries.map((q) => q.params[0]), ['gone']);
  await s.send(db, [dev(1, 'FCM', 'ok1')], EV, { log });
  assert.equal(t.fetchCalls.filter((c) => c.url.includes('oauth2')).length, 1, 'token OAuth z pamięci podręcznej');
});

test('brak plików kluczy: kanał wyłączony (skipped), ostrzeżenie raz, bez sieci i bez wyjątku', async () => {
  const t = fakeTransport();
  const warns = [];
  const wlog = { warn: (o, m) => warns.push(m) };
  const s = createVoipSender({ settings: SETTINGS, transport: t, readFile: readFiles({}) });
  const r1 = await s.send(fakeDb(), [dev(1, 'APNS_VOIP', 'a'), dev(2, 'FCM', 'b')], EV, { log: wlog });
  const r2 = await s.send(fakeDb(), [dev(1, 'APNS_VOIP', 'a'), dev(2, 'FCM', 'b')], EV, { log: wlog });
  for (const r of [...r1, ...r2]) { assert.equal(r.ok, false); assert.equal(r.skipped, 'disabled'); }
  assert.equal(t.apnsCalls.length + t.fetchCalls.length, 0);
  assert.equal(warns.length, 2, 'po jednym ostrzeżeniu na kanał');
  assert.equal(s.enabledFor('APNS_VOIP'), false);
  // Nieznany typ / pusty token — pominięte.
  assert.deepEqual(await s.send(fakeDb(), [{ id: 'x', expo_token: 'E', voip_token: null, voip_type: 'FCM' }], EV, { log }), []);
});

test('transport HTTP/2: nagłówki i body dochodzą, status + odpowiedź wracają; przekroczony czas = błąd', async () => {
  const seen = [];
  const server = http2.createServer();
  const open = [];
  server.on('session', (sess) => open.push(sess));
  server.on('stream', (stream, headers) => {
    let body = '';
    stream.setEncoding('utf8');
    stream.on('data', (c) => { body += c; });
    stream.on('end', () => {
      seen.push({ headers, body });
      if (headers[':path'] === '/3/device/slow') return; // bez odpowiedzi
      stream.respond({ ':status': 410, 'content-type': 'application/json' });
      stream.end('{"reason":"Unregistered"}');
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const req = apnsRequest({ token: 'tok', env: 'production', bundleId: 'pl.avenit.app', jwt: 'J', event: { eventId: 'e' } });
    const res = await http2Post({ ...req, origin });
    assert.deepEqual(res, { status: 410, body: '{"reason":"Unregistered"}' });
    assert.equal(seen[0].headers[':method'], 'POST');
    assert.equal(seen[0].headers[':path'], '/3/device/tok');
    assert.equal(seen[0].headers['apns-push-type'], 'voip');
    assert.equal(seen[0].headers['apns-topic'], 'pl.avenit.app.voip');
    assert.deepEqual(JSON.parse(seen[0].body), { incomingCall: { eventId: 'e' } });
    await assert.rejects(http2Post({ ...req, origin, path: '/3/device/slow', timeoutMs: 100 }), /czas/);
  } finally {
    for (const sess of open) sess.destroy();
    server.close();
  }
});

// ── Integracja: ringParticipants (PGlite) ───────────────────────────────────
function poolOf(pg) {
  return { async query(sql, params) { const r = await pg.query(sql, params); return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length }; } };
}
let db;
const C_DM = id(1), C_GROUP = id(2);

before(async () => {
  if (skipDb) return;
  const pg = new PGlite();
  db = poolOf(pg);
  await pg.exec(`
    CREATE TABLE app_users (id serial PRIMARY KEY, email text, full_name text, name text, avatar_url text);
    CREATE TABLE user_blocks (blocker_email text, blocked_email text, PRIMARY KEY (blocker_email, blocked_email));
    CREATE TABLE conversations (id uuid PRIMARY KEY, type text, name text);
    CREATE TABLE conversation_participants (id serial PRIMARY KEY, conversation_id uuid, user_email text, role text,
      muted boolean DEFAULT false, muted_until timestamptz);
    CREATE TABLE push_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_email TEXT NOT NULL, expo_token TEXT NOT NULL UNIQUE,
      platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')), device_name TEXT, app_version TEXT,
      last_seen_at TIMESTAMPTZ DEFAULT NOW(), created_at TIMESTAMPTZ DEFAULT NOW());
  `);
  await db.query(`INSERT INTO app_users (email, full_name, avatar_url) VALUES
    ('jan@x.pl', 'Jan Kowalski', '/jan.png'), ('ola@x.pl', 'Ola Nowak', null), ('anna@x.pl', 'Anna', null), ('piotr@x.pl', 'Piotr', null)`);
  await db.query(`INSERT INTO conversations (id, type, name) VALUES ($1, 'direct', null), ($2, 'group', 'Zespół uwielbienia')`, [C_DM, C_GROUP]);
  await db.query(`INSERT INTO conversation_participants (conversation_id, user_email, role) VALUES
    ($1, 'jan@x.pl', 'admin'), ($1, 'Ola@X.pl', 'admin'),
    ($2, 'jan@x.pl', 'admin'), ($2, 'ola@x.pl', 'member'), ($2, 'anna@x.pl', 'member'), ($2, 'piotr@x.pl', 'member')`, [C_DM, C_GROUP]);
  await db.query(`UPDATE conversation_participants SET muted = true WHERE conversation_id = $1 AND user_email = 'piotr@x.pl'`, [C_GROUP]);
  await db.query(`INSERT INTO user_blocks (blocker_email, blocked_email) VALUES ('anna@x.pl', 'jan@x.pl')`);
  // Ola: iPhone (rejestruje VoIP) + Android bez VoIP; Anna (zablokowała Jana) i Piotr (wyciszył) — iPhone z VoIP.
  await db.query(`INSERT INTO push_tokens (user_email, expo_token, platform) VALUES
    ('ola@x.pl', 'ExponentPushToken[ola-ios]', 'ios'), ('ola@x.pl', 'ExponentPushToken[ola-android]', 'android'),
    ('anna@x.pl', 'ExponentPushToken[anna-ios]', 'ios'), ('piotr@x.pl', 'ExponentPushToken[piotr-ios]', 'ios')`);
  const sql = fs.readFileSync(new URL('../db/tenant-migrations/107_push_tokens_voip.sql', import.meta.url), 'utf8');
  await pg.exec(sql);
  await pg.exec(sql); // idempotentna
});

test('migracja 107: kolumny VoIP, domyślne production, typ/środowisko z listy', { skip: skipDb }, async () => {
  const cols = (await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'push_tokens' AND column_name LIKE 'voip%' ORDER BY 1`)).rows.map((r) => r.column_name);
  assert.deepEqual(cols, ['voip_env', 'voip_token', 'voip_type', 'voip_updated_at']);
  await assert.rejects(db.query(`UPDATE push_tokens SET voip_type = 'GCM' WHERE expo_token = 'ExponentPushToken[anna-ios]'`));
  await assert.rejects(db.query(`UPDATE push_tokens SET voip_env = 'dev' WHERE expo_token = 'ExponentPushToken[anna-ios]'`));
  const r = (await db.query(`SELECT voip_env FROM push_tokens WHERE expo_token = 'ExponentPushToken[anna-ios]'`)).rows[0];
  assert.equal(r.voip_env, 'production');
});

test('rejestracja tokenu przez /api/db: właściciel aktualizuje swój wiersz po expo_token, cudzego nie', { skip: skipDb }, async () => {
  const OLA = { id: 'u-ola', email: 'Ola@X.pl' };
  const upd = (user, expo, token) => {
    const q = {
      table: 'push_tokens', op: 'update',
      values: { voip_token: token, voip_type: 'APNS_VOIP', voip_env: 'production', voip_updated_at: new Date().toISOString() },
      filters: [{ column: 'expo_token', type: 'eq', value: expo }],
      __ownerScope: ownerScope('push_tokens', user),
    };
    enforceOwnedWrite(q, user);
    const b = buildQuery(q);
    return db.query(b.sql, b.params);
  };
  await upd(OLA, 'ExponentPushToken[ola-ios]', 'voip-ola');
  await upd(OLA, 'ExponentPushToken[anna-ios]', 'przejety'); // cudzy wiersz — zakres właściciela
  const rows = (await db.query(`SELECT expo_token, voip_token FROM push_tokens WHERE voip_token IS NOT NULL ORDER BY expo_token`)).rows;
  assert.deepEqual(rows, [{ expo_token: 'ExponentPushToken[ola-ios]', voip_token: 'voip-ola' }]);
  await db.query(`UPDATE push_tokens SET voip_token = 'voip-' || split_part(user_email, '@', 1), voip_type = 'APNS_VOIP'
    WHERE expo_token IN ('ExponentPushToken[anna-ios]', 'ExponentPushToken[piotr-ios]')`);
});

// Prawdziwy sendPushCore z podmienionym fetch (Expo) — sprawdzamy, na które urządzenia poszedł push.
async function withExpo(fn) {
  const sent = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes('exp.host')) {
      const batch = JSON.parse(opts.body);
      sent.push(...batch);
      return { json: async () => ({ data: batch.map(() => ({ status: 'ok', id: 't' })) }) };
    }
    throw new Error(`nieoczekiwany fetch ${url}`);
  };
  try { await fn(); } finally { globalThis.fetch = orig; }
  return sent;
}
function deps(voipResult) {
  const h = { voip: [], pushes: [] };
  h.ctx = {
    db, tenantSlug: 'kosciol', log,
    deps: {
      sendPush: async (pool, p) => { h.pushes.push(p); return sendPushCore(pool, p); },
      sendVoip: async (_db, devices, event) => { h.voip.push({ devices, event }); return devices.map((d) => ({ id: d.id, expo_token: d.expo_token, ...voipResult })); },
    },
  };
  return h;
}

test('1:1: VoIP na iPhone z tokenem, push Expo tylko na Androida bez tokenu', { skip: skipDb }, async () => {
  const h = deps({ ok: true });
  const call = { ...CALL, conversation_id: C_DM, kind: 'audio' };
  let out;
  const expo = await withExpo(async () => { out = await ringParticipants(h.ctx, call); });
  assert.deepEqual(out, { sent: 1, voip: 1 });
  assert.equal(h.voip.length, 1);
  assert.deepEqual(h.voip[0].devices.map((d) => [d.user_email, d.expo_token, d.voip_token, d.voip_type, d.voip_env]),
    [['ola@x.pl', 'ExponentPushToken[ola-ios]', 'voip-ola', 'APNS_VOIP', 'production']]);
  const ev = h.voip[0].event;
  assert.equal(ev.serverCallId, call.id);
  assert.equal(ev.hasVideo, false);
  assert.deepEqual(ev.caller, { id: 'jan@x.pl', displayName: 'Jan Kowalski', avatarUrl: 'https://kosciol.localhost/jan.png' });
  assert.deepEqual(ev.metadata, { conversationId: C_DM, tenant: 'kosciol', isGroup: 'false', kind: 'audio', callerName: 'Jan Kowalski' });
  assert.deepEqual(h.pushes[0].exclude_expo_tokens, ['ExponentPushToken[ola-ios]']);
  assert.deepEqual(expo.map((m) => m.to), ['ExponentPushToken[ola-android]']);
  assert.equal(expo[0].data.type, 'call');
  assert.equal(expo[0].data.exclude_expo_tokens, undefined, 'opcja nie wycieka do danych powiadomienia');
});

test('VoIP nieudany / kanał wyłączony — zwykły push na wszystkie urządzenia (jak dotąd)', { skip: skipDb }, async () => {
  const h = deps({ ok: false, skipped: 'disabled' });
  let out;
  const expo = await withExpo(async () => { out = await ringParticipants(h.ctx, { ...CALL, conversation_id: C_DM }); });
  assert.deepEqual(out, { sent: 1, voip: 0 });
  assert.equal(h.pushes[0].exclude_expo_tokens, undefined);
  assert.deepEqual(expo.map((m) => m.to).sort(), ['ExponentPushToken[ola-android]', 'ExponentPushToken[ola-ios]']);
  // sendVoip rzuca — dzwonienie i tak idzie zwykłym pushem.
  const h2 = deps({});
  h2.ctx.deps.sendVoip = async () => { throw new Error('boom'); };
  const expo2 = await withExpo(async () => { await ringParticipants(h2.ctx, { ...CALL, conversation_id: C_DM }); });
  assert.equal(expo2.length, 2);
});

test('grupa: te same filtry co push — bez blokujących dzwoniącego i wyciszonych; displayName = nazwa rozmowy', { skip: skipDb }, async () => {
  const h = deps({ ok: true });
  let out;
  const expo = await withExpo(async () => { out = await ringParticipants(h.ctx, { ...CALL, conversation_id: C_GROUP, is_group: true }); });
  assert.deepEqual(out, { sent: 1, voip: 1 });
  assert.deepEqual(h.voip[0].devices.map((d) => d.user_email), ['ola@x.pl'], 'Anna (blokada) i Piotr (wyciszenie) bez VoIP');
  assert.deepEqual(h.pushes.map((p) => p.user_email.toLowerCase()), ['ola@x.pl']);
  const ev = h.voip[0].event;
  assert.equal(ev.caller.displayName, 'Zespół uwielbienia');
  assert.equal(ev.metadata.callerName, 'Jan Kowalski');
  assert.equal(ev.metadata.isGroup, 'true');
  assert.equal(ev.hasVideo, true);
  assert.deepEqual(expo.map((m) => m.to), ['ExponentPushToken[ola-android]']);
});

test('tenant bez migracji 107 / bez sendVoip — dzwonienie bez zmian', { skip: skipDb }, async () => {
  const h = deps({ ok: true });
  delete h.ctx.deps.sendVoip;
  const expo = await withExpo(async () => { await ringParticipants(h.ctx, { ...CALL, conversation_id: C_DM }); });
  assert.equal(expo.length, 2);
  const failing = { query: async (sql, p) => (/voip_token/.test(sql) ? Promise.reject(new Error('column "voip_token" does not exist')) : db.query(sql, p)) };
  const h2 = deps({ ok: true });
  h2.ctx.db = failing;
  const expo2 = await withExpo(async () => { await ringParticipants(h2.ctx, { ...CALL, conversation_id: C_DM }); });
  assert.equal(h2.voip.length, 0);
  assert.equal(expo2.length, 2);
});
