// Social Media (migracja 121, src/social, fn social). Czysta logika zawsze; przepływy na PRAWDZIWYM
// SQL (PGlite) z atrapą Graph API Meta:
//   PGLITE_MODULE=/ścieżka/node_modules/@electric-sql/pglite/dist/index.js node --test test/social.test.js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { config } from '../src/config.js';
import { classifyMetaError, parseSignedRequest, appsecretProof, authorizeUrl } from '../src/social/meta.js';
import { signSocialState, verifySocialState, startConnect, handleMetaCallback, decryptToken, publicAccount } from '../src/social/accounts.js';
import {
  socialAccess, savePost, approvePost, rejectPost, listPosts, deletePost, retryPost, saveSlots, runDuePublishing, loadPost,
  reschedulePost, unschedulePost,
} from '../src/social/service.js';
import { socialReturnUrl } from '../src/social/routes.js';
import { REGISTRY, getTableRule, invalidatePermissions } from '../src/dataapi/registry.js';
import { MODULES, FN_CAPABILITY } from '@avenit/shared/src/permissions/catalog.js';
import {
  validateTarget, nextQueueSlot, aggregatePostStatus, instagramFormat, facebookShape, instagramImageCrop, effectiveTarget, countHashtags,
} from '@avenit/shared/src/lib/social.js';
import { warsawParts } from '@avenit/shared/src/lib/chatSchedule.js';

let PGlite = null;
try {
  ({ PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite'));
} catch { PGlite = null; }
const skip = PGlite ? false : 'brak @electric-sql/pglite (ustaw PGLITE_MODULE)';

config.META_APP_ID = 'app123';
config.META_APP_SECRET = 'appsecret';
config.APP_DOMAIN = 'avenit.pl';

// ── Czysta logika ───────────────────────────────────────────────────────────
const IMG = (extra = {}) => ({ path: 'a1/b.jpg', mime: 'image/jpeg', kind: 'image', width: 1080, height: 1080, ...extra });
const VID = (extra = {}) => ({ path: 'a1/v.mp4', mime: 'video/mp4', kind: 'video', ...extra });

test('walidacja Facebook: tekst wystarczy, wideo i zdjęcia naraz — błąd, pusty post — błąd', () => {
  assert.deepEqual(validateTarget('facebook', { content: 'Zapraszamy w niedzielę!' }).errors, []);
  assert.equal(validateTarget('facebook', { content: '' }).errors.length, 1);
  assert.match(validateTarget('facebook', { content: 'x', media: [IMG(), VID()] }).errors[0], /wideo albo zdjęcia/);
  assert.equal(facebookShape([]), 'text');
  assert.equal(facebookShape([IMG()]), 'photo');
  assert.equal(facebookShape([IMG(), IMG()]), 'album');
  assert.equal(facebookShape([VID()]), 'video');
});

test('walidacja Instagram: media wymagane, rolka = jedno wideo, relacja bez podpisu, limity hashtagów, przycięcie', () => {
  assert.match(validateTarget('instagram', { content: 'tekst' }).errors[0], /wymaga zdjęcia/);
  assert.deepEqual(validateTarget('instagram', { content: 'ok', media: [IMG()] }).errors, []);
  assert.equal(instagramFormat([VID()], {}), 'reel');
  assert.equal(instagramFormat([IMG(), IMG()], {}), 'feed');
  assert.match(validateTarget('instagram', { media: [IMG()], options: { format: 'reel' } }).errors[0], /Rolka/);
  const story = validateTarget('instagram', { content: 'podpis', media: [IMG()], options: { format: 'story' } });
  assert.deepEqual(story.errors, []);
  assert.match(story.warnings[0], /Relacja nie ma podpisu/);
  const tags = Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(' ');
  assert.equal(countHashtags(tags), 31);
  assert.match(validateTarget('instagram', { content: tags, media: [IMG()] }).errors[0], /30 hashtagów/);
  assert.equal(instagramImageCrop(1080, 1080), null);
  assert.equal(instagramImageCrop(1080, 1920).target, 4 / 5);
  assert.match(validateTarget('instagram', { content: '', media: [IMG({ width: 1080, height: 1920 })] }).warnings[0], /przycięte/);
  assert.equal(validateTarget('instagram', { content: 'a'.repeat(2201), media: [IMG()] }).errors.length, 1);
});

test('treść kanału: własna wersja ma pierwszeństwo, pusta = wspólna', () => {
  const post = { content: 'wspólna', media: [IMG()] };
  assert.equal(effectiveTarget(post, { content: null }).content, 'wspólna');
  assert.equal(effectiveTarget(post, { content: '' }).content, 'wspólna');
  assert.equal(effectiveTarget(post, { content: 'FB' }).content, 'FB');
  assert.equal(effectiveTarget(post, { media: [VID()] }).media[0].kind, 'video');
});

test('kolejka: najbliższy slot w czasie polskim, pomija zajęte i zbyt bliskie, zima i lato', () => {
  // Pn 2026-10-26 (po zmianie czasu — zima, UTC+1); slot pn 18:00 = 17:00 UTC.
  const slots = [{ weekday: 1, time: '18:00' }, { weekday: 3, time: '09:30' }];
  const now = new Date('2026-10-26T10:00:00Z');
  assert.equal(nextQueueSlot(slots, { now }).toISOString(), '2026-10-26T17:00:00.000Z');
  // Zajęty → środa 9:30 (8:30 UTC).
  assert.equal(nextQueueSlot(slots, { now, taken: ['2026-10-26T17:00:00Z'] }).toISOString(), '2026-10-28T08:30:00.000Z');
  // Za 3 min do slotu (zapas 5 min) → następny.
  assert.equal(nextQueueSlot(slots, { now: new Date('2026-10-26T16:57:00Z') }).toISOString(), '2026-10-28T08:30:00.000Z');
  // Lato (UTC+2): pn 2026-06-01 18:00 = 16:00 UTC.
  assert.equal(nextQueueSlot(slots, { now: new Date('2026-06-01T08:00:00Z') }).toISOString(), '2026-06-01T16:00:00.000Z');
  assert.equal(nextQueueSlot([], { now }), null);
  assert.equal(nextQueueSlot([{ weekday: 9, time: '25:00' }], { now }), null);
});

test('status całości z celów', () => {
  assert.equal(aggregatePostStatus(['published', 'published']), 'published');
  assert.equal(aggregatePostStatus(['published', 'failed']), 'partial');
  assert.equal(aggregatePostStatus(['failed']), 'failed');
  assert.equal(aggregatePostStatus(['published', 'processing']), 'publishing');
  assert.equal(aggregatePostStatus([]), 'failed');
});

test('błędy Graph API: token, limit, uprawnienia, przetwarzanie, chwilowe', () => {
  assert.equal(classifyMetaError({ error: { code: 190 } }).tokenInvalid, true);
  const rate = classifyMetaError({ error: { code: 4 } });
  assert.equal(rate.retryable, true);
  assert.equal(rate.code, 'rate_limited');
  assert.equal(classifyMetaError({ error: { code: 200, message: 'perm' } }).code, 'permission');
  assert.equal(classifyMetaError({ error: { code: 9007 } }).code, 'not_ready');
  assert.equal(classifyMetaError({ error: { code: 2, is_transient: true } }).retryable, true);
  assert.equal(classifyMetaError({}, 502).retryable, true);
  assert.equal(classifyMetaError({ error: { code: 100, message: 'Invalid parameter' } }).retryable, false);
});

test('state i signed_request: podpis, odrzucenie podróbki', () => {
  const s = signSocialState({ tenant: 'schwro', stateId: 'abc', provider: 'meta' });
  assert.deepEqual(verifySocialState(s), { tenant: 'schwro', stateId: 'abc', provider: 'meta' });
  const [, sig] = s.split('.');
  const forged = Buffer.from(JSON.stringify({ t: 'inny', s: 'abc', p: 'meta' })).toString('base64url');
  assert.equal(verifySocialState(`${forged}.${sig}`), null);
  assert.equal(verifySocialState('zepsuty'), null);

  const payload = Buffer.from(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: 'fbu1', issued_at: 1 })).toString('base64url');
  const good = crypto.createHmac('sha256', 'appsecret').update(payload).digest('base64url');
  assert.equal(parseSignedRequest(`${good}.${payload}`).user_id, 'fbu1');
  assert.equal(parseSignedRequest(`${good}.${payload}`, 'inny'), null);
  assert.equal(parseSignedRequest('x.y'), null);
  assert.equal(appsecretProof('tok', 'sec'), crypto.createHmac('sha256', 'sec').update('tok').digest('hex'));
  assert.match(socialReturnUrl('schwro', 'error', { reason: 'denied' }), /^https:\/\/schwro\.avenit\.pl\/social\?tab=channels&sm_result=error&sm_reason=denied$/);
});

test('logowanie Meta: zakresy klasyczne albo konfiguracja Facebook Login for Business', () => {
  const u1 = new URL(authorizeUrl('ST'));
  assert.equal(u1.searchParams.get('redirect_uri'), 'https://app.avenit.pl/api/social/oauth/meta/callback');
  assert.match(u1.searchParams.get('scope'), /pages_manage_posts/);
  assert.match(u1.searchParams.get('scope'), /instagram_content_publish/);
  config.META_CONFIG_ID = 'cfg9';
  const u2 = new URL(authorizeUrl('ST'));
  assert.equal(u2.searchParams.get('config_id'), 'cfg9');
  assert.equal(u2.searchParams.get('scope'), null);
  config.META_CONFIG_ID = undefined;
});

test('rejestr i katalog: posty i kanały tylko do odczytu, token ukryty, stany OAuth poza API', () => {
  assert.equal(getTableRule('social_posts').readOnly, true);
  assert.equal(getTableRule('social_post_targets').readOnly, true);
  assert.equal(getTableRule('social_accounts').readOnly, true);
  assert.ok(getTableRule('social_accounts').hiddenColumns.includes('access_token_enc'));
  assert.equal(getTableRule('social_queue_slots').resource, 'module:social');
  assert.equal(REGISTRY.social_oauth_states, undefined);
  const mod = MODULES.find((m) => m.key === 'social');
  assert.deepEqual(mod.actions.map((a) => a.key), ['publish', 'manage_accounts']);
  assert.equal(FN_CAPABILITY.social, 'module:social');
  assert.equal(publicAccount({ id: 'x', access_token_enc: 'SECRET', fb_user_id: '1' }).access_token_enc, undefined);
});

// ── Prawdziwy SQL (PGlite) + atrapa Graph API ───────────────────────────────
const MIG = new URL('../db/tenant-migrations/121_social_media.sql', import.meta.url);
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DB_NAME = 'test_social';

function poolOf(pg) {
  return {
    async query(sql, params) {
      const r = await pg.query(sql, params);
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    },
  };
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let routes = [];
const calls = [];
const realFetch = globalThis.fetch;
function mockFetch(list) { routes = list; calls.length = 0; }
async function fakeFetch(url, opts = {}) {
  const u = new URL(String(url));
  const body = opts.body instanceof URLSearchParams ? Object.fromEntries(opts.body) : {};
  const q = Object.fromEntries(u.searchParams);
  const call = { path: u.pathname.replace(/^\/v[\d.]+/, ''), host: u.host, method: opts.method || 'GET', body, q };
  calls.push(call);
  for (const [pred, resp] of routes) {
    if (pred(call)) return typeof resp === 'function' ? resp(call) : resp.clone();
  }
  return json({ error: { code: 100, message: `not mocked ${call.method} ${call.path}` } }, 400);
}

let pg, db;
const ADMIN = uid(1), EDITOR = uid(2), PUBLISHER = uid(3), OUTSIDER = uid(4), EDITOR2 = uid(5);
const delivered = [];
const ctxOf = () => ({
  db, tenantSlug: 'schwro', tenantSubdomain: 'schwro', dbName: DB_NAME, log: { error() {}, warn() {} },
  deps: {
    emit() {}, deliver: async (a) => { delivered.push(...a.entries); return { sent: a.entries.length }; },
    now: () => new Date(), sleep: async () => {}, noKick: true,
    convertImage: async (_ctx, m, { suffix }) => `${m.path}.${suffix}.jpg`,
  },
});
const accessOf = (id) => socialAccess(db, { id }, DB_NAME);
let FB, IG;

before(async () => {
  if (skip) return;
  globalThis.fetch = fakeFetch;
  pg = new PGlite();
  db = poolOf(pg);
  await pg.exec(`
    CREATE TABLE app_roles (key text PRIMARY KEY, is_admin boolean DEFAULT false);
    CREATE TABLE app_users (id uuid PRIMARY KEY, email varchar(255) UNIQUE NOT NULL, role varchar(50), is_active boolean DEFAULT true,
      is_super_admin boolean DEFAULT false);
    CREATE TABLE permission_grants (role text, user_id uuid, capability text, allowed boolean);
    CREATE TABLE app_modules (id serial PRIMARY KEY, key text, label text, icon text, path text, resource_key text, display_order int,
      is_system boolean, is_enabled boolean, component_name text);
    CREATE TABLE account_events (id bigserial PRIMARY KEY, email varchar(255), action varchar(40) NOT NULL, actor varchar(255), detail text, created_at timestamptz DEFAULT now());
    INSERT INTO app_roles (key, is_admin) VALUES ('superadmin', true), ('redaktor', false), ('publikujacy', false), ('czlonek', false);
    INSERT INTO permission_grants (role, capability, allowed) VALUES
      ('redaktor', 'module:social', true), ('redaktor', 'res:social_posts:create', true), ('redaktor', 'res:social_posts:read', true),
      ('publikujacy', 'module:social', true), ('publikujacy', 'res:social_posts:create', true), ('publikujacy', 'action:social:publish', true);
  `);
  await pg.exec(fs.readFileSync(MIG, 'utf8'));
  await pg.exec(fs.readFileSync(MIG, 'utf8')); // idempotentna
  await db.query(`INSERT INTO app_users (id, email, role, is_super_admin) VALUES
    ($1, 'admin@k.pl', 'superadmin', true), ($2, 'redaktor@k.pl', 'redaktor', false), ($3, 'pub@k.pl', 'publikujacy', false),
    ($4, 'czlonek@k.pl', 'czlonek', false), ($5, 'redaktor2@k.pl', 'redaktor', false)`, [ADMIN, EDITOR, PUBLISHER, OUTSIDER, EDITOR2]);
  invalidatePermissions(DB_NAME);
});

after(() => { globalThis.fetch = realFetch; });

test('migracja 121: tabele, moduł w menu raz, unikalny kanał', { skip }, async () => {
  const { rows } = await db.query(`SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'social_%' ORDER BY 1`);
  assert.deepEqual(rows.map((r) => r.table_name),
    ['social_accounts', 'social_hashtag_groups', 'social_oauth_states', 'social_post_targets', 'social_posts', 'social_queue_slots']);
  const m = await db.query(`SELECT key, path, resource_key, component_name FROM app_modules WHERE key = 'social'`);
  assert.equal(m.rows.length, 1);
  assert.deepEqual(m.rows[0], { key: 'social', path: '/social', resource_key: 'module:social', component_name: 'SocialModule' });
});

test('prawa: redaktor tworzy bez publikacji, publikujący publikuje, członek bez dostępu', { skip }, async () => {
  const ed = await accessOf(EDITOR);
  assert.deepEqual([ed.view, ed.create, ed.publish, ed.manage], [true, true, false, false]);
  const pub = await accessOf(PUBLISHER);
  assert.deepEqual([pub.view, pub.publish], [true, true]);
  const out = await accessOf(OUTSIDER);
  assert.deepEqual([out.view, out.create, out.publish], [false, false, false]);
  const adm = await accessOf(ADMIN);
  assert.equal(adm.manage, true);
});

test('łączenie Meta: strony z tokenami + konto IG, pominięta strona bez CREATE_CONTENT, zła przeglądarka odrzucona', { skip }, async () => {
  const { url, nonce } = await startConnect(db, { tenant: 'schwro', user: { id: ADMIN, email: 'admin@k.pl' } });
  const state = new URL(url).searchParams.get('state');
  const parsed = verifySocialState(state);
  assert.equal(parsed.tenant, 'schwro');

  mockFetch([
    [(c) => c.path === '/oauth/access_token' && c.q.code === 'CODE1', json({ access_token: 'SHORT' })],
    [(c) => c.path === '/oauth/access_token' && c.q.grant_type === 'fb_exchange_token', json({ access_token: 'LONG', expires_in: 5184000 })],
    [(c) => c.path === '/me', json({ id: 'fbu1', name: 'Admin' })],
    [(c) => c.path === '/me/permissions', json({ data: [
      { permission: 'pages_manage_posts', status: 'granted' }, { permission: 'instagram_content_publish', status: 'granted' },
      { permission: 'pages_show_list', status: 'granted' }] })],
    [(c) => c.path === '/me/accounts', json({ data: [
      { id: 'P1', name: 'Kościół Wrocław', access_token: 'PAGE_TOKEN', tasks: ['CREATE_CONTENT', 'MANAGE'],
        picture: { data: { url: 'https://x/p.jpg' } }, instagram_business_account: { id: 'IG1', username: 'kosciol', profile_picture_url: 'https://x/i.jpg' } },
      { id: 'P2', name: 'Strona tylko do analityki', access_token: 'T2', tasks: ['ANALYZE'] },
    ] })],
  ]);
  // Inna przeglądarka (inny nonce) — odrzucone, stan zużyty.
  const bad = await handleMetaCallback(db, { stateId: parsed.stateId, query: { code: 'CODE1' }, nonceCookie: 'obcy' });
  assert.equal(bad.reason, 'state');

  const again = await startConnect(db, { tenant: 'schwro', user: { id: ADMIN, email: 'admin@k.pl' } });
  const st2 = verifySocialState(new URL(again.url).searchParams.get('state'));
  const ok = await handleMetaCallback(db, { stateId: st2.stateId, query: { code: 'CODE1' }, nonceCookie: again.nonce });
  assert.equal(ok.result, 'connected', ok.message);
  assert.equal(ok.added, 2);
  // appsecret_proof na wywołaniach z tokenem.
  assert.ok(calls.filter((c) => c.q.access_token).every((c) => c.q.appsecret_proof));
  const { rows } = await db.query(`SELECT * FROM social_accounts ORDER BY provider`);
  assert.deepEqual(rows.map((r) => [r.provider, r.external_id, r.page_id]), [['facebook', 'P1', 'P1'], ['instagram', 'IG1', 'P1']]);
  assert.notEqual(rows[0].access_token_enc, 'PAGE_TOKEN');
  assert.equal(await decryptToken(rows[0].access_token_enc), 'PAGE_TOKEN');
  assert.equal(rows[1].username, 'kosciol');
  [FB, IG] = rows;
  const reuse = await handleMetaCallback(db, { stateId: st2.stateId, query: { code: 'CODE1' }, nonceCookie: again.nonce });
  assert.equal(reuse.reason, 'state'); // jednorazowy
  assert.ok(nonce);
});

test('redaktor: publikacja zabroniona, wysyłka do akceptacji powiadamia publikujących', { skip }, async () => {
  const ctx = ctxOf();
  const ed = await accessOf(EDITOR);
  const base = { content: 'Zapraszamy na nabożeństwo!', media: [IMG({ path: 'abc/zdj.jpg' })], targets: [{ account_id: FB.id }, { account_id: IG.id }] };
  await assert.rejects(savePost(ctx, ed, { ...base, intent: 'now' }), (e) => e.code === 'NO_PUBLISH');
  delivered.length = 0;
  const post = await savePost(ctx, ed, { ...base, intent: 'submit' });
  assert.equal(post.status, 'pending_approval');
  assert.equal(post.targets.length, 2);
  assert.deepEqual(delivered.map((d) => d.user_email).sort(), ['admin@k.pl', 'pub@k.pl']);
  assert.equal(delivered[0].link, `/social?post=${post.id}`);
  // Odesłanie do poprawy → szkic z uwagą i powiadomieniem autora.
  const pub = await accessOf(PUBLISHER);
  delivered.length = 0;
  const rej = await rejectPost(ctx, pub, { id: post.id, note: 'Dodaj godzinę' });
  assert.equal(rej.status, 'draft');
  assert.equal(rej.review_note, 'Dodaj godzinę');
  assert.deepEqual(delivered.map((d) => d.user_email), ['redaktor@k.pl']);
});

test('walidacja serwerowa: Instagram bez zdjęcia nie przejdzie, nieprawidłowa ścieżka pliku — błąd', { skip }, async () => {
  const ctx = ctxOf();
  const pub = await accessOf(PUBLISHER);
  await assert.rejects(savePost(ctx, pub, { content: 'Sam tekst', targets: [{ account_id: IG.id }], intent: 'now' }),
    (e) => e.code === 'INVALID' && /wymaga zdjęcia/.test(e.message));
  await assert.rejects(savePost(ctx, pub, { content: 'x', media: [{ path: '../etc/passwd', mime: 'image/jpeg' }], targets: [{ account_id: FB.id }], intent: 'draft' }),
    /Nieprawidłowy plik/);
});

test('szkice prywatne: drugi redaktor nie widzi cudzego szkicu, publikujący widzi; usuwanie cudzego — zabronione', { skip }, async () => {
  const ctx = ctxOf();
  const ed = await accessOf(EDITOR);
  const draft = await savePost(ctx, ed, { content: 'Mój szkic', targets: [{ account_id: FB.id }], intent: 'draft' });
  const ed2 = await accessOf(EDITOR2);
  const seen2 = await listPosts(ctx, ed2, { view: 'drafts' });
  assert.ok(!seen2.some((p) => p.id === draft.id));
  const pubSeen = await listPosts(ctx, await accessOf(PUBLISHER), { view: 'drafts' });
  assert.ok(pubSeen.some((p) => p.id === draft.id));
  await assert.rejects(deletePost(ctx, ed2, { id: draft.id }), (e) => e.code === 'FORBIDDEN');
  const del = await deletePost(ctx, ed, { id: draft.id });
  assert.equal(del.deleted, draft.id);
});

test('kolejka: zapis slotów i „dodaj do kolejki” bierze najbliższy wolny slot', { skip }, async () => {
  const ctx = ctxOf();
  const pub = await accessOf(PUBLISHER);
  const slots = await saveSlots(ctx, pub, { slots: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, time: '18:00' })) });
  assert.equal(slots.length, 7);
  const p1 = await savePost(ctx, pub, { content: 'Kolejka 1', targets: [{ account_id: FB.id }], intent: 'queue' });
  const p2 = await savePost(ctx, pub, { content: 'Kolejka 2', targets: [{ account_id: FB.id }], intent: 'queue' });
  assert.equal(p1.status, 'scheduled');
  assert.ok(new Date(p2.scheduled_at) > new Date(p1.scheduled_at));
  // Kolejny dzień o 18:00 czasu polskiego (różnica 23–25 h przy zmianie czasu).
  const w1 = warsawParts(p1.scheduled_at), w2 = warsawParts(p2.scheduled_at);
  assert.deepEqual([w1.hour, w1.minute, w2.hour, w2.minute], [18, 0, 18, 0]);
  assert.ok(Math.abs(new Date(p2.scheduled_at) - new Date(p1.scheduled_at) - 24 * 3600_000) <= 3600_000);
  // Wstrzymanie (do szkicu) i przesunięcie terminu.
  const un = await unschedulePost(ctx, pub, { id: p2.id });
  assert.equal(un.status, 'draft');
  const future = new Date(Date.now() + 3 * 24 * 3600_000).toISOString();
  const rs = await reschedulePost(ctx, pub, { id: p1.id, scheduled_at: future });
  assert.equal(new Date(rs.scheduled_at).toISOString(), future);
  await db.query(`DELETE FROM social_posts`);
});

test('worker: zatwierdzony post publikuje się na FB (zdjęcie) i IG (post) z pierwszym komentarzem', { skip }, async () => {
  const ctx = ctxOf();
  const ed = await accessOf(EDITOR);
  const pub = await accessOf(PUBLISHER);
  const post = await savePost(ctx, ed, {
    content: 'Niedziela 10:00 #kosciol', media: [IMG({ path: 'abc/zdj.jpg' })], intent: 'submit',
    targets: [{ account_id: FB.id }, { account_id: IG.id, options: { first_comment: '#wroclaw #nabozenstwo' } }],
  });
  const at = new Date(Date.now() + 3600_000).toISOString();
  const ap = await approvePost(ctx, pub, { id: post.id, intent: 'schedule', scheduled_at: at });
  assert.equal(ap.status, 'scheduled');
  assert.equal(ap.approved_by, 'pub@k.pl');

  // Jeszcze nie pora — worker nic nie robi.
  mockFetch([]);
  await runDuePublishing(ctx);
  assert.equal(calls.length, 0);
  assert.equal((await loadPost(db, post.id)).status, 'scheduled');

  await db.query(`UPDATE social_posts SET scheduled_at = now() - interval '1 minute' WHERE id = $1`, [post.id]);
  mockFetch([
    [(c) => c.method === 'POST' && c.path === '/P1/photos', json({ id: 'PH1', post_id: 'P1_99' })],
    [(c) => c.method === 'GET' && c.path === '/P1_99', json({ permalink_url: 'https://www.facebook.com/P1/posts/99' })],
    [(c) => c.method === 'POST' && c.path === '/IG1/media', json({ id: 'C1' })],
    [(c) => c.method === 'GET' && c.path === '/C1', json({ status_code: 'FINISHED' })],
    [(c) => c.method === 'POST' && c.path === '/IG1/media_publish', json({ id: 'M1' })],
    [(c) => c.method === 'GET' && c.path === '/M1', json({ permalink: 'https://www.instagram.com/p/xyz/' })],
    [(c) => c.method === 'POST' && c.path === '/M1/comments', json({ id: 'CM1' })],
  ]);
  delivered.length = 0;
  const stats = await runDuePublishing(ctx);
  assert.equal(stats.published, 2);
  const done = await loadPost(db, post.id);
  assert.equal(done.status, 'published');
  assert.ok(done.published_at);
  const fb = done.targets.find((t) => t.provider === 'facebook');
  const ig = done.targets.find((t) => t.provider === 'instagram');
  assert.deepEqual([fb.status, fb.external_id, fb.permalink], ['published', 'P1_99', 'https://www.facebook.com/P1/posts/99']);
  assert.deepEqual([ig.status, ig.external_id], ['published', 'M1']);
  // Zdjęcie przez publiczny adres storage, podpis i tekst alternatywny po stronie IG.
  const photo = calls.find((c) => c.path === '/P1/photos');
  assert.equal(photo.body.url, 'https://schwro.avenit.pl/storage/social-media/abc/zdj.jpg');
  assert.equal(photo.body.message, 'Niedziela 10:00 #kosciol');
  const igc = calls.find((c) => c.path === '/IG1/media');
  assert.equal(igc.body.caption, 'Niedziela 10:00 #kosciol');
  assert.equal(calls.find((c) => c.path === '/M1/comments').body.message, '#wroclaw #nabozenstwo');
  assert.equal(delivered.length, 0); // sukces bez powiadomień
});

test('worker: limit sieci → ponowienie z przerwą, potem sukces', { skip }, async () => {
  const ctx = ctxOf();
  const pub = await accessOf(PUBLISHER);
  const post = await savePost(ctx, pub, { content: 'Tekst z linkiem https://avenit.pl/wydarzenie', targets: [{ account_id: FB.id }], intent: 'now' });
  mockFetch([[(c) => c.path === '/P1/feed', json({ error: { code: 4, message: 'Application request limit reached' } }, 400)]]);
  await runDuePublishing(ctx);
  let t = (await loadPost(db, post.id)).targets[0];
  assert.equal(t.status, 'pending');
  assert.equal(t.attempts, 1);
  assert.ok(new Date(t.next_attempt_at) > new Date());
  assert.match(t.error, /ogranicza/);
  assert.equal((await loadPost(db, post.id)).status, 'publishing');

  await db.query(`UPDATE social_post_targets SET next_attempt_at = now() - interval '1 second' WHERE post_id = $1`, [post.id]);
  mockFetch([
    [(c) => c.path === '/P1/feed', json({ id: 'P1_100' })],
    [(c) => c.method === 'GET' && c.path === '/P1_100', json({ permalink_url: '/P1/posts/100' })],
  ]);
  await runDuePublishing(ctx);
  const done = await loadPost(db, post.id);
  t = done.targets[0];
  assert.equal(done.status, 'published');
  assert.equal(t.attempts, 2);
  assert.equal(t.permalink, 'https://www.facebook.com/P1/posts/100');
  // Link z tekstu jako podgląd linku.
  assert.equal(calls.find((c) => c.path === '/P1/feed').body.link, 'https://avenit.pl/wydarzenie');
});

test('worker: rolka IG w przetwarzaniu → kolejny przebieg publikuje tym samym kontenerem', { skip }, async () => {
  const ctx = ctxOf();
  const pub = await accessOf(PUBLISHER);
  const post = await savePost(ctx, pub, { content: 'Rolka', media: [VID({ path: 'abc/film.mp4' })], targets: [{ account_id: IG.id }], intent: 'now' });
  mockFetch([
    [(c) => c.method === 'POST' && c.path === '/IG1/media', json({ id: 'R1' })],
    [(c) => c.method === 'GET' && c.path === '/R1', json({ status_code: 'IN_PROGRESS' })],
  ]);
  await runDuePublishing(ctx);
  let t = (await loadPost(db, post.id)).targets[0];
  assert.equal(t.status, 'processing');
  assert.equal(calls.find((c) => c.path === '/IG1/media').body.media_type, 'REELS');
  const { rows } = await db.query(`SELECT progress FROM social_post_targets WHERE id = $1`, [t.id]);
  assert.equal(rows[0].progress.container, 'R1');

  await db.query(`UPDATE social_post_targets SET next_attempt_at = now() - interval '1 second' WHERE id = $1`, [t.id]);
  mockFetch([
    [(c) => c.method === 'GET' && c.path === '/R1', json({ status_code: 'FINISHED' })],
    [(c) => c.method === 'POST' && c.path === '/IG1/media_publish', json({ id: 'M2' })],
    [(c) => c.method === 'GET' && c.path === '/M2', json({ permalink: 'https://www.instagram.com/reel/abc/' })],
  ]);
  await runDuePublishing(ctx);
  assert.ok(!calls.some((c) => c.method === 'POST' && c.path === '/IG1/media')); // bez nowego kontenera
  const done = await loadPost(db, post.id);
  t = done.targets[0];
  assert.equal(done.status, 'published');
  assert.equal(t.attempts, 1);
});

test('worker: cofnięty token → błąd, kanał do ponownego połączenia, autor powiadomiony; ponowienie po połączeniu', { skip }, async () => {
  const ctx = ctxOf();
  const ed = await accessOf(EDITOR);
  const pub = await accessOf(PUBLISHER);
  const draft = await savePost(ctx, ed, { content: 'Ogłoszenie', targets: [{ account_id: FB.id }], intent: 'submit' });
  await approvePost(ctx, pub, { id: draft.id, intent: 'now' });
  mockFetch([[(c) => c.path === '/P1/feed', json({ error: { code: 190, message: 'Error validating access token' } }, 400)]]);
  delivered.length = 0;
  await runDuePublishing(ctx);
  const failed = await loadPost(db, draft.id);
  assert.equal(failed.status, 'failed');
  assert.match(failed.targets[0].error, /połącz kanał ponownie/);
  const acc = await db.query(`SELECT status FROM social_accounts WHERE id = $1`, [FB.id]);
  assert.equal(acc.rows[0].status, 'revoked');
  assert.deepEqual(delivered.map((d) => d.user_email).sort(), ['pub@k.pl', 'redaktor@k.pl']);
  // Zaplanowanie na odłączony kanał — odmowa przy zapisie.
  await assert.rejects(savePost(ctx, pub, { content: 'x', targets: [{ account_id: FB.id }], intent: 'now' }), (e) => e.code === 'INVALID');

  // Ponowne połączenie (aktywny) + ponów → opublikowany.
  await db.query(`UPDATE social_accounts SET status = 'active', last_error = NULL WHERE id = $1`, [FB.id]);
  await assert.rejects(retryPost(ctx, ed, { id: draft.id }), (e) => e.code === 'NO_PUBLISH');
  const rt = await retryPost(ctx, pub, { id: draft.id });
  assert.equal(rt.status, 'publishing');
  mockFetch([
    [(c) => c.path === '/P1/feed', json({ id: 'P1_101' })],
    [(c) => c.method === 'GET' && c.path === '/P1_101', json({})],
  ]);
  await runDuePublishing(ctx);
  assert.equal((await loadPost(db, draft.id)).status, 'published');
});

test('worker: porzucona publikacja (dzierżawa minęła) nie jest ponawiana automatycznie', { skip }, async () => {
  const ctx = ctxOf();
  const pub = await accessOf(PUBLISHER);
  const post = await savePost(ctx, pub, { content: 'Porzucony', targets: [{ account_id: FB.id }], intent: 'now' });
  await db.query(`UPDATE social_posts SET status = 'publishing' WHERE id = $1`, [post.id]);
  await db.query(`UPDATE social_post_targets SET status = 'publishing', lease_until = now() - interval '1 minute' WHERE post_id = $1`, [post.id]);
  mockFetch([]);
  await runDuePublishing(ctx);
  const p = await loadPost(db, post.id);
  assert.equal(p.status, 'failed');
  assert.match(p.targets[0].error, /przerwana/);
  assert.equal(calls.length, 0);
});

test('worker: tenant bez migracji — fn nie wywraca workera', { skip }, async () => {
  const { runForTenant } = await import('../src/fn/social.js');
  const empty = poolOf(new PGlite());
  const out = await runForTenant(empty, { tenantSlug: 'x' });
  assert.deepEqual(out, { published: 0, failed: 0, processing: 0, retry: 0 });
});
