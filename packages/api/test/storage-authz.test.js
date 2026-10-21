// Audyt uprawnień 2026-10-11, runda 4 — storage: kto wgrywa, nadpisuje, usuwa i listuje pliki,
// oraz nagłówki serwowania (SVG bez wykonywania skryptów w originie aplikacji).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-authz-'));
process.env.STORAGE_DIR = dir;
const { default: storageRoutes, STORAGE_CSP, parseRange, mimeFor } = await import('../src/storage/routes.js');
const { presetGrantRows } = await import('@avenit/shared/src/permissions/presets.js');

const USERS = {
  admin: { id: 'a', email: 'admin@k.pl', role: 'superadmin' },
  anna: { id: 'u-anna', email: 'anna@k.pl', role: 'czlonek' },
  bob: { id: 'u-bob', email: 'bob@k.pl', role: 'czlonek' },
  lider: { id: 'u-l', email: 'lider@k.pl', role: 'lider' },
  koord: { id: 'u-k', email: 'koord@k.pl', role: 'koordynator' },
};
const objects = new Map(); // `${bucket}|${path}` -> uploaded_by
const participants = [{ conversation_id: '11111111-1111-1111-1111-111111111111', user_email: 'anna@k.pl' }];
let messages = [];
let dbSeq = 0;

function fakeDb(user) {
  return {
    async query(sql, params = []) {
      if (/FROM app_users WHERE id/.test(sql)) return { rows: [{ is_super_admin: false, role: user.role }] };
      if (/FROM app_modules/.test(sql)) return { rows: [] };
      if (/FROM permission_grants/.test(sql)) return { rows: presetGrantRows() };
      if (/FROM app_roles WHERE is_admin/.test(sql)) return { rows: [{ key: 'superadmin' }] };
      if (/FROM ministry_memberships/.test(sql)) return { rows: [] };
      if (/SELECT lower\(uploaded_by\)/.test(sql)) {
        const u = objects.get(`${params[0]}|${params[1]}`);
        return { rows: u ? [{ u }] : [] };
      }
      if (/INSERT INTO storage_objects/.test(sql)) { objects.set(`${params[0]}|${params[1]}`, params[2]); return { rows: [] }; }
      if (/DELETE FROM storage_objects/.test(sql)) { objects.delete(`${params[0]}|${params[1]}`); return { rows: [] }; }
      if (/FROM conversation_participants WHERE conversation_id/.test(sql)) {
        return { rows: participants.filter((p) => p.conversation_id === params[0] && p.user_email === params[1]).map(() => ({ '?column?': 1 })) };
      }
      if (/FROM messages m/.test(sql)) {
        const needle = params[0].slice(1, -1).replace(/\\(.)/g, '$1');
        const hits = messages.filter((m) => m.attachments.includes(needle));
        const mine = hits.filter((m) => participants.some((p) => p.conversation_id === m.conversation_id && p.user_email === params[1]));
        return { rows: [{ n: hits.length, mine: mine.length }] };
      }
      if (/chat_private_files/.test(sql)) return { rows: [] };
      throw new Error(`nieoczekiwane zapytanie: ${sql}`);
    },
  };
}

let app;
before(async () => {
  app = Fastify();
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));
  app.decorate('requireUser', async () => {});
  app.addHook('onRequest', async (req) => {
    const who = req.headers['x-test-user'];
    req.tenant = { slug: 'kosciol', db_name: `st_${process.pid}_${++dbSeq}` };
    if (who) {
      req.user = USERS[who];
      req.db = fakeDb(USERS[who]);
    }
  });
  await app.register(storageRoutes);
});
after(async () => {
  await app?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const upload = (who, bucket, p, { upsert = false, body = 'x' } = {}) => app.inject({
  method: 'POST', url: `/api/storage/${bucket}/${p}`, payload: Buffer.from(body),
  headers: { 'x-test-user': who, 'content-type': 'application/octet-stream', ...(upsert ? { 'x-upsert': 'true' } : {}) },
});
const remove = (who, bucket, paths) => app.inject({
  method: 'DELETE', url: `/api/storage/${bucket}`, payload: { paths }, headers: { 'x-test-user': who },
});
const list = (who, bucket) => app.inject({
  method: 'POST', url: `/api/storage/${bucket}/list`, payload: { prefix: '' }, headers: { 'x-test-user': who },
});

test('materiały: wgrać może każdy, nadpisać/usunąć — autor, obsługa i admin', async () => {
  assert.equal((await upload('anna', 'materials', 'f/plan.pdf')).statusCode, 200);
  assert.equal(objects.get('materials|f/plan.pdf'), 'anna@k.pl');
  assert.equal((await upload('bob', 'materials', 'f/plan.pdf', { upsert: true })).statusCode, 403, 'cudzy plik');
  assert.equal((await upload('anna', 'materials', 'f/plan.pdf', { upsert: true, body: 'v2' })).statusCode, 200);
  assert.equal((await remove('bob', 'materials', ['f/plan.pdf'])).statusCode, 403);
  assert.ok(fs.existsSync(path.join(dir, 'kosciol/materials/f/plan.pdf')));
  assert.equal((await remove('anna', 'materials', ['f/plan.pdf'])).statusCode, 200);
  assert.ok(!fs.existsSync(path.join(dir, 'kosciol/materials/f/plan.pdf')));
  assert.equal(objects.has('materials|f/plan.pdf'), false);
  // Plik sprzed rejestru (bez wpisu) — tylko admin / obsługa.
  fs.mkdirSync(path.join(dir, 'kosciol/materials/old'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'kosciol/materials/old/a.pdf'), 'x');
  assert.equal((await remove('anna', 'materials', ['old/a.pdf'])).statusCode, 403);
  assert.equal((await remove('admin', 'materials', ['old/a.pdf'])).statusCode, 200);
});

test('programy: PDF programu nadpisuje lider (res:programs:update), członek nie', async () => {
  assert.equal((await upload('lider', 'programs', '7/Program.pdf')).statusCode, 200);
  assert.equal((await upload('lider', 'programs', '7/Program.pdf', { upsert: true })).statusCode, 200);
  assert.equal((await upload('bob', 'programs', '7/Program.pdf', { upsert: true })).statusCode, 403);
});

test('listowanie bucketów: tylko admin i obsługa (nie członek)', async () => {
  for (const b of ['form-uploads', 'materials', 'messenger-attachments', 'public-assets']) {
    assert.equal((await list('bob', b)).statusCode, 403, b);
  }
  assert.equal((await list('admin', 'materials')).statusCode, 200);
});

test('czat: załącznik tylko w swojej rozmowie; cudze — bez usuwania i podpisu', async () => {
  const conv = '11111111-1111-1111-1111-111111111111';
  assert.equal((await upload('anna', 'messenger-attachments', `${conv}/foto.jpg`)).statusCode, 200);
  assert.equal((await upload('bob', 'messenger-attachments', `${conv}/x.jpg`)).statusCode, 403);
  assert.equal((await upload('bob', 'messenger-attachments', 'mailing-images/x.png')).statusCode, 403, 'grafiki mailingu — obsługa');
  assert.equal((await remove('bob', 'messenger-attachments', [`${conv}/foto.jpg`])).statusCode, 403);
  assert.equal((await remove('anna', 'messenger-attachments', [`${conv}/foto.jpg`])).statusCode, 200);

  // Stara ścieżka: Bob wkleja cudzy plik do własnej rozmowy — podpisu nie dostaje.
  const bobConv = '22222222-2222-2222-2222-222222222222';
  participants.push({ conversation_id: bobConv, user_email: 'bob@k.pl' });
  messages = [
    { conversation_id: conv, attachments: '[{"url":"/storage/messenger-attachments/attachments/tajne.jpg"}]' },
    { conversation_id: bobConv, attachments: '[{"url":"/storage/messenger-attachments/attachments/tajne.jpg"}]' },
  ];
  const sign = (who) => app.inject({
    method: 'POST', url: '/api/storage/messenger-attachments/sign',
    payload: { path: 'attachments/tajne.jpg' }, headers: { 'x-test-user': who },
  });
  assert.equal((await sign('bob')).statusCode, 403);
  messages = messages.slice(0, 1);
  assert.equal((await sign('anna')).statusCode, 200);
});

test('serwowanie: SVG w piaskownicy CSP i nosniff, PDF bez CSP', async () => {
  assert.equal((await upload('anna', 'public-assets', 'logo.svg', { body: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' })).statusCode, 200);
  const host = { 'x-test-user': '' };
  const svg = await app.inject({ method: 'GET', url: '/storage/public-assets/logo.svg', headers: host });
  assert.equal(svg.statusCode, 200);
  assert.equal(svg.headers['content-security-policy'], STORAGE_CSP);
  assert.match(STORAGE_CSP, /sandbox/);
  assert.equal(svg.headers['x-content-type-options'], 'nosniff');
  await upload('anna', 'public-assets', 'a.pdf');
  const pdf = await app.inject({ method: 'GET', url: '/storage/public-assets/a.pdf', headers: host });
  assert.equal(pdf.headers['content-security-policy'], undefined);
  assert.equal(pdf.headers['x-content-type-options'], 'nosniff');
});

// Głosówki na iPhonie (AVPlayer): plik z sieci gra tylko z obsługą zakresów i typem audio.
test('serwowanie: zakresy bajtów (206), długość i typ audio dla nagrań głosowych', async () => {
  const body = 'ABCDEFGHIJ';
  assert.equal((await upload('anna', 'public-assets', 'voice-1-3s.m4a', { body })).statusCode, 200);
  const host = { 'x-test-user': '' };
  const full = await app.inject({ method: 'GET', url: '/storage/public-assets/voice-1-3s.m4a', headers: host });
  assert.equal(full.statusCode, 200);
  assert.equal(full.headers['content-type'], 'audio/mp4');
  assert.equal(full.headers['accept-ranges'], 'bytes');
  assert.equal(full.headers['content-length'], '10');
  assert.equal(full.body, body);
  // AVPlayer pyta najpierw o 2 bajty.
  const probe = await app.inject({ method: 'GET', url: '/storage/public-assets/voice-1-3s.m4a', headers: { ...host, range: 'bytes=0-1' } });
  assert.equal(probe.statusCode, 206);
  assert.equal(probe.headers['content-range'], 'bytes 0-1/10');
  assert.equal(probe.headers['content-length'], '2');
  assert.equal(probe.body, 'AB');
  const tail = await app.inject({ method: 'GET', url: '/storage/public-assets/voice-1-3s.m4a', headers: { ...host, range: 'bytes=7-' } });
  assert.equal(tail.statusCode, 206);
  assert.equal(tail.body, 'HIJ');
  const bad = await app.inject({ method: 'GET', url: '/storage/public-assets/voice-1-3s.m4a', headers: { ...host, range: 'bytes=50-60' } });
  assert.equal(bad.statusCode, 416);
  assert.equal(bad.headers['content-range'], 'bytes */10');

  assert.deepEqual(parseRange('bytes=-3', 10), { start: 7, end: 9 });
  assert.deepEqual(parseRange('bytes=2-100', 10), { start: 2, end: 9 });
  assert.equal(parseRange('bytes=0-1,4-5', 10), null); // kilka przedziałów — całość
  assert.equal(parseRange(undefined, 10), null);
  assert.equal(parseRange('bytes=5-2', 10), 'invalid');
  for (const [f, t] of [['a.m4a', 'audio/mp4'], ['a.webm', 'audio/webm'], ['a.3gp', 'audio/3gpp'], ['a.aac', 'audio/aac'], ['a.mp4', 'video/mp4']]) {
    assert.equal(mimeFor(f), t);
  }
});

// Runda 5: przestrzenie wrażliwe bucketu materials (Finanse, Członkowie…) — tylko podpisany link,
// podpis i wgrywanie z dostępem do modułu przestrzeni; reszta bucketu czytelna jak dotąd.
test('materiały: materials/finance/… tylko podpisanym linkiem dla osoby z modułem Finanse', async () => {
  const host = { 'x-test-user': '' };
  assert.equal((await upload('bob', 'materials', 'finance/f.pdf')).statusCode, 403, 'członek nie wgra do Finansów');
  assert.equal((await upload('koord', 'materials', 'finance/f.pdf')).statusCode, 200);
  assert.equal((await upload('bob', 'materials', 'worship/plan.pdf')).statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: '/storage/materials/finance/f.pdf', headers: host })).statusCode, 403);
  assert.equal((await app.inject({ method: 'GET', url: '/storage/materials/finance/f.pdf?w=96', headers: host })).statusCode, 403, 'bez miniatur');
  assert.equal((await app.inject({ method: 'GET', url: '/storage/materials/worship/plan.pdf', headers: host })).statusCode, 200);
  const sign = (who, p) => app.inject({ method: 'POST', url: '/api/storage/materials/sign', payload: { path: p }, headers: { 'x-test-user': who } });
  assert.equal((await sign('bob', 'finance/f.pdf')).statusCode, 403);
  assert.equal((await sign('lider', 'members/x.pdf')).statusCode, 403, 'lider bez Członków');
  const ok = await sign('koord', 'finance/f.pdf');
  assert.equal(ok.statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: ok.json().signedPath, headers: host })).statusCode, 200);
  assert.equal((await sign('bob', 'worship/plan.pdf')).statusCode, 200, 'ścieżka publiczna — podpis bez znaczenia');
});
