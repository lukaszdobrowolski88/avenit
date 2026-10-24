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
import { listActivity, addComment, deleteComment } from '../src/social/service.js';
import { checkAccounts, cleanupMedia, ORPHAN_DAYS } from '../src/social/maintenance.js';
import os from 'node:os';
import Fastify from 'fastify';
import { renderTemplate, withUtm, findUrls, youtubeId, youtubeThumb, eventVars, DEFAULT_TEMPLATES, plainText } from '@avenit/shared/src/lib/socialShare.js';
import { sharePrefill, saveLinkPage, saveSettings, loadSettings } from '../src/social/links.js';
import socialPublicRoutes, { eventIcs } from '../src/social/pages.js';
import { saveRule, runRules } from '../src/social/rules.js';
import path from 'node:path';
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
const MIG122 = new URL('../db/tenant-migrations/122_social_activity.sql', import.meta.url);
const MIG123 = new URL('../db/tenant-migrations/123_social_share.sql', import.meta.url);
const MIG124 = new URL('../db/tenant-migrations/124_social_ideas_library.sql', import.meta.url);
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
  await pg.exec(fs.readFileSync(MIG122, 'utf8'));
  await pg.exec(fs.readFileSync(MIG122, 'utf8'));
  await pg.exec(fs.readFileSync(MIG123, 'utf8'));
  await pg.exec(fs.readFileSync(MIG123, 'utf8'));
  await pg.exec(fs.readFileSync(MIG124, 'utf8'));
  await pg.exec(fs.readFileSync(MIG124, 'utf8'));
  await pg.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (key text PRIMARY KEY, value text, updated_at timestamptz);
    CREATE TABLE events (id serial PRIMARY KEY, title text, date date, time text, end_time text, location text, details_html text,
      description text, format text, module_key text, is_archived boolean DEFAULT false, event_type text);
    CREATE TABLE sermons (id serial PRIMARY KEY, title text, speaker text, series text, sermon_date date, scripture_ref text, description text,
      audio_url text, video_url text, notes text, slug text, is_published boolean DEFAULT false, created_at timestamptz DEFAULT now());
  `);
  await pg.exec(`CREATE TABLE storage_objects (bucket text, path text, uploaded_by text, updated_at timestamptz, PRIMARY KEY (bucket, path))`);
  await db.query(`INSERT INTO app_users (id, email, role, is_super_admin) VALUES
    ($1, 'admin@k.pl', 'superadmin', true), ($2, 'redaktor@k.pl', 'redaktor', false), ($3, 'pub@k.pl', 'publikujacy', false),
    ($4, 'czlonek@k.pl', 'czlonek', false), ($5, 'redaktor2@k.pl', 'redaktor', false)`, [ADMIN, EDITOR, PUBLISHER, OUTSIDER, EDITOR2]);
  invalidatePermissions(DB_NAME);
});

after(() => { globalThis.fetch = realFetch; });

test('migracja 121: tabele, moduł w menu raz, unikalny kanał', { skip }, async () => {
  const { rows } = await db.query(`SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'social_%' ORDER BY 1`);
  assert.deepEqual(rows.map((r) => r.table_name),
    ['social_accounts', 'social_hashtag_groups', 'social_ideas', 'social_links', 'social_media_items', 'social_oauth_states', 'social_post_activity',
      'social_post_targets', 'social_posts', 'social_queue_slots', 'social_rule_runs', 'social_rules']);
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
  // Link z tekstu jako podgląd linku — skrócony (krótki link z UTM, migracja 123).
  assert.match(calls.find((c) => c.path === '/P1/feed').body.link, /^https:\/\/schwro\.avenit\.pl\/l\/[A-Za-z0-9]{7}$/);
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

test('walidacja rolki Facebooka: jedno wideo, 3–90 s, ostrzeżenie dla poziomego', () => {
  assert.match(validateTarget('facebook', { media: [IMG()], options: { format: 'reel' } }).errors[0], /Rolka/);
  assert.match(validateTarget('facebook', { media: [VID({ duration: 120 })], options: { format: 'reel' } }).errors[0], /90 s/);
  const ok = validateTarget('facebook', { media: [VID({ duration: 30, width: 1920, height: 1080 })], options: { format: 'reel' } });
  assert.deepEqual(ok.errors, []);
  assert.match(ok.warnings[0], /9:16/);
  assert.equal(facebookShape([VID()], { format: 'reel' }), 'reel');
});

test('historia i komentarze: zdarzenia z akcji, komentarz powiadamia autora, usuwa tylko autor komentarza', { skip }, async () => {
  const ctx = ctxOf();
  const ed = await accessOf(EDITOR);
  const pub = await accessOf(PUBLISHER);
  const post = await savePost(ctx, ed, { content: 'Historia', targets: [{ account_id: FB.id }], intent: 'submit' });
  await rejectPost(ctx, pub, { id: post.id, note: 'Krócej' });
  delivered.length = 0;
  const list = await addComment(ctx, pub, { id: post.id, body: 'Skróć do dwóch zdań' });
  assert.deepEqual(list.map((a) => a.kind), ['created', 'submitted', 'rejected', 'comment']);
  assert.equal(list[2].note, 'Krócej');
  assert.deepEqual(delivered.map((d) => d.user_email), ['redaktor@k.pl']);
  // Szkic redaktora — drugi redaktor nie widzi historii.
  await assert.rejects(listActivity(ctx, await accessOf(EDITOR2), { id: post.id }), (e) => e.code === 'FORBIDDEN');
  await assert.rejects(deleteComment(ctx, ed, { comment_id: list[3].id }), (e) => e.code === 'FORBIDDEN');
  const after = await deleteComment(ctx, pub, { comment_id: list[3].id });
  assert.ok(!after.some((a) => a.kind === 'comment'));
  await assert.rejects(addComment(ctx, pub, { id: post.id, body: '   ' }), /pusty/);
  await db.query(`DELETE FROM social_posts`);
});

test('kolejka: kanał z własnymi godzinami używa tylko ich, pozostałe — wspólnych', { skip }, async () => {
  const ctx = ctxOf();
  const pub = await accessOf(PUBLISHER);
  await saveSlots(ctx, pub, { slots: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, time: '18:00' })) });
  await saveSlots(ctx, pub, { account_id: IG.id, slots: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, time: '07:15' })) });
  const ig = await savePost(ctx, pub, { content: 'IG', media: [IMG()], targets: [{ account_id: IG.id }], intent: 'queue' });
  const fb = await savePost(ctx, pub, { content: 'FB', targets: [{ account_id: FB.id }], intent: 'queue' });
  const wi = warsawParts(ig.scheduled_at), wf = warsawParts(fb.scheduled_at);
  assert.deepEqual([wi.hour, wi.minute], [7, 15]);
  assert.deepEqual([wf.hour, wf.minute], [18, 0]);
  await saveSlots(ctx, pub, { account_id: IG.id, slots: [] });
  await db.query(`DELETE FROM social_posts`);
});

test('worker: rolka na Facebooku — start, wgranie z adresu, finish, przetwarzanie, publikacja', { skip }, async () => {
  const ctx = ctxOf();
  const pub = await accessOf(PUBLISHER);
  const post = await savePost(ctx, pub, {
    content: 'Rolka FB', media: [VID({ path: 'abc/r.mp4', duration: 20, width: 1080, height: 1920 })],
    targets: [{ account_id: FB.id, options: { format: 'reel' } }], intent: 'now',
  });
  mockFetch([
    [(c) => c.method === 'POST' && c.path === '/P1/video_reels' && c.body.upload_phase === 'start', json({ video_id: 'V9', upload_url: 'https://rupload.facebook.com/video-upload/v26.0/V9' })],
    [(c) => c.host === 'rupload.facebook.com', json({ success: true })],
    [(c) => c.method === 'POST' && c.path === '/P1/video_reels' && c.body.upload_phase === 'finish', json({ success: true })],
    [(c) => c.method === 'GET' && c.path === '/V9' && c.q.fields === 'status', json({ status: { video_status: 'processing', publishing_phase: { status: 'in_progress' } } })],
  ]);
  await runDuePublishing(ctx);
  let t = (await loadPost(db, post.id)).targets[0];
  assert.equal(t.status, 'processing');
  assert.equal(calls.find((c) => c.path === '/P1/video_reels' && c.body.upload_phase === 'finish').body.description, 'Rolka FB');
  await db.query(`UPDATE social_post_targets SET next_attempt_at = now() - interval '1 second' WHERE id = $1`, [t.id]);
  mockFetch([
    [(c) => c.method === 'GET' && c.path === '/V9' && c.q.fields === 'status', json({ status: { video_status: 'ready', publishing_phase: { status: 'complete' } } })],
    [(c) => c.method === 'GET' && c.path === '/V9' && c.q.fields === 'permalink_url', json({ permalink_url: '/reel/V9' })],
  ]);
  await runDuePublishing(ctx);
  assert.ok(!calls.some((c) => c.body?.upload_phase === 'start')); // bez ponownego wgrywania
  const done = await loadPost(db, post.id);
  t = done.targets[0];
  assert.equal(done.status, 'published');
  assert.equal(t.permalink, 'https://www.facebook.com/reel/V9');
  const hist = await listActivity(ctx, pub, { id: post.id });
  assert.ok(hist.some((a) => a.kind === 'published'));
  await db.query(`DELETE FROM social_posts`);
});

test('utrzymanie: odświeżenie zdjęć, nieważny token → do połączenia + powiadomienie autora zaplanowanego posta', { skip }, async () => {
  const ctx = ctxOf();
  const pub = await accessOf(PUBLISHER);
  await db.query(`UPDATE social_accounts SET status = 'active', last_error = NULL`);
  const post = await savePost(ctx, pub, { content: 'Za tydzień', media: [IMG()], targets: [{ account_id: IG.id }], intent: 'schedule',
    scheduled_at: new Date(Date.now() + 7 * 86400_000).toISOString() });
  mockFetch([
    [(c) => c.path === '/P1', json({ id: 'P1', name: 'Kościół Wrocław Południe', picture: { data: { url: 'https://cdn/nowe.jpg' } } })],
    [(c) => c.path === '/IG1', json({ error: { code: 190, message: 'Session has expired' } }, 400)],
  ]);
  delivered.length = 0;
  const stats = await checkAccounts(ctx);
  assert.deepEqual([stats.ok, stats.revoked], [1, 1]);
  const { rows } = await db.query(`SELECT provider, name, avatar_url, status FROM social_accounts ORDER BY provider`);
  assert.deepEqual(rows[0], { provider: 'facebook', name: 'Kościół Wrocław Południe', avatar_url: 'https://cdn/nowe.jpg', status: 'active' });
  assert.equal(rows[1].status, 'revoked');
  assert.ok(delivered.some((d) => d.user_email === 'pub@k.pl' && /ponownego połączenia/.test(d.title)));
  // Drugi przebieg — już odłączony, bez ponownego powiadomienia.
  delivered.length = 0;
  await checkAccounts(ctx);
  assert.equal(delivered.length, 0);
  await db.query(`UPDATE social_accounts SET status = 'active', last_error = NULL`);
  await db.query(`DELETE FROM social_posts WHERE id = $1`, [post.id]);
});

test('utrzymanie: usuwa stare nieużywane katalogi plików, zostawia używane i świeże', { skip }, async () => {
  const ctx = ctxOf();
  const pub = await accessOf(PUBLISHER);
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'social-'));
  const root = path.join(base, 'schwro', 'social-media');
  for (const d of ['uzywany', 'stary', 'swiezy']) {
    fs.mkdirSync(path.join(root, d), { recursive: true });
    fs.writeFileSync(path.join(root, d, 'plik.jpg'), 'x');
  }
  fs.mkdirSync(path.join(base, 'schwro', '.thumbs', 'social-media', 'stary'), { recursive: true });
  const old = new Date(Date.now() - (ORPHAN_DAYS + 1) * 86400_000);
  fs.utimesSync(path.join(root, 'stary'), old, old);
  fs.utimesSync(path.join(root, 'uzywany'), old, old);
  await savePost(ctx, pub, { content: 'x', media: [IMG({ path: 'uzywany/plik.jpg' })], targets: [{ account_id: FB.id }], intent: 'draft' });
  const out = await cleanupMedia(ctx, { baseDir: base });
  assert.equal(out.removed, 1);
  assert.deepEqual(fs.readdirSync(root).sort(), ['swiezy', 'uzywany']);
  assert.ok(!fs.existsSync(path.join(base, 'schwro', '.thumbs', 'social-media', 'stary')));
  fs.rmSync(base, { recursive: true, force: true });
  await db.query(`DELETE FROM social_posts`);
});

test('szablony: zmienne, fragmenty warunkowe, UTM, adresy, YouTube', () => {
  const ev = { title: 'Koncert uwielbienia', date: '2026-11-08', time: '18:00', location: 'Sala główna', details_html: '<p>Zapraszamy&nbsp;całe rodziny!</p><p>Wstęp wolny.</p>' };
  const out = renderTemplate(DEFAULT_TEMPLATES.event, eventVars(ev, 'https://k.avenit.pl/l/abc1234'));
  assert.equal(out, '📅 Koncert uwielbienia\nniedziela, 8 listopada · godz. 18:00 · Sala główna\n\nZapraszamy całe rodziny!\nWstęp wolny.\n\nWięcej: https://k.avenit.pl/l/abc1234');
  const bare = renderTemplate(DEFAULT_TEMPLATES.event, eventVars({ title: 'X', date: '2026-11-08' }, 'L'));
  assert.equal(bare, '📅 X\nniedziela, 8 listopada\n\nWięcej: L');
  assert.equal(withUtm('https://ex.pl/a?x=1', { source: 'facebook', campaign: 'avenit-1' }), 'https://ex.pl/a?x=1&utm_source=facebook&utm_medium=social&utm_campaign=avenit-1');
  assert.equal(withUtm('https://ex.pl/?utm_source=own', { source: 'facebook' }), 'https://ex.pl/?utm_source=own&utm_medium=social');
  assert.deepEqual(findUrls('Zapisy: https://ex.pl/zapisy. Info (https://ex.pl/a) i https://ex.pl/zapisy'), ['https://ex.pl/zapisy', 'https://ex.pl/a']);
  assert.equal(youtubeId('https://youtu.be/dQw4w9WgXcQ?t=10'), 'dQw4w9WgXcQ');
  assert.equal(youtubeThumb('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=x'), 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
  assert.equal(plainText('<b>a</b>&amp;b'), 'a&b');
  const ics = eventIcs({ title: 'A, B', date: '2026-11-08', time: '18:00', location: 'Sala' }, { host: 'k.avenit.pl', code: 'abc1234' });
  assert.match(ics, /DTSTART;TZID=Europe\/Warsaw:20261108T180000/);
  assert.match(ics, /DTEND;TZID=Europe\/Warsaw:20261108T190000/);
  assert.match(ics, /SUMMARY:A\\, B/);
});

test('udostępnianie: szkic z wydarzenia (link do karty) i z kazania (miniatura), ponownie ten sam link', { skip }, async () => {
  const ctx = { ...ctxOf(), deps: { ...ctxOf().deps, fetchThumb: async (_c, url) => (url ? { path: 'thumb/plik.jpg', mime: 'image/jpeg', kind: 'image', width: 480, height: 360 } : null) } };
  const pub = await accessOf(PUBLISHER);
  const { rows: [ev] } = await db.query(`INSERT INTO events (title, date, time, location, details_html) VALUES ('Śniadanie', '2026-11-14', '09:00', 'Kawiarnia', '<p>Dla kobiet</p>') RETURNING id`);
  const a = await sharePrefill(ctx, pub, { kind: 'event', id: ev.id });
  assert.match(a.link, /^https:\/\/schwro\.avenit\.pl\/l\/[A-Za-z0-9]{7}$/);
  assert.match(a.content, /Śniadanie/);
  assert.equal(a.source_type, 'event');
  const b = await sharePrefill(ctx, pub, { kind: 'event', id: ev.id });
  assert.equal(b.link, a.link);
  const { rows: [sm] } = await db.query(`INSERT INTO sermons (title, speaker, slug, is_published, video_url) VALUES ('Łaska', 'Jan', 'laska', true, 'https://youtu.be/dQw4w9WgXcQ') RETURNING id`);
  const c = await sharePrefill(ctx, pub, { kind: 'sermon', id: sm.id });
  assert.equal(c.media[0].path, 'thumb/plik.jpg');
  assert.match(c.content, /Nowe kazanie: „Łaska” — Jan/);
  const { rows: [l] } = await db.query(`SELECT * FROM social_links WHERE kind = 'sermon'`);
  assert.equal(l.target_url, 'https://schwro.avenit.pl/sermon/laska');
  assert.equal(l.image_url, 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
  const { rows: [draft] } = await db.query(`INSERT INTO sermons (title, slug, is_published) VALUES ('Szkic', 'szkic', false) RETURNING id`);
  await assert.rejects(sharePrefill(ctx, pub, { kind: 'sermon', id: draft.id }), (e) => e.code === 'NOT_PUBLISHED');
});

test('publikacja FB: adresy → krótkie linki z UTM (raz, także przy ponowieniu); wyłączone w ustawieniach — bez zmian', { skip }, async () => {
  const ctx = ctxOf();
  const pub = await accessOf(PUBLISHER);
  await db.query(`UPDATE social_accounts SET status = 'active'`);
  const post = await savePost(ctx, pub, { content: 'Zapisy: https://ex.pl/zapisy i FB https://facebook.com/x', targets: [{ account_id: FB.id }], intent: 'now' });
  mockFetch([[(c) => c.path === '/P1/feed', json({ error: { code: 2, message: 'tmp' } }, 500)]]);
  await runDuePublishing(ctx);
  const { rows: links1 } = await db.query(`SELECT * FROM social_links WHERE post_id = $1`, [post.id]);
  assert.equal(links1.length, 1);
  assert.equal(links1[0].target_url, `https://ex.pl/zapisy?utm_source=facebook&utm_medium=social&utm_campaign=avenit-${post.id.slice(0, 8)}`);
  await db.query(`UPDATE social_post_targets SET next_attempt_at = now() - interval '1 second' WHERE post_id = $1`, [post.id]);
  mockFetch([
    [(c) => c.path === '/P1/feed', json({ id: 'P1_200' })],
    [(c) => c.method === 'GET' && c.path === '/P1_200', json({})],
  ]);
  await runDuePublishing(ctx);
  const feed = calls.find((c) => c.path === '/P1/feed');
  assert.equal(feed.body.message, `Zapisy: https://schwro.avenit.pl/l/${links1[0].code} i FB https://facebook.com/x`);
  assert.equal(feed.body.link, `https://schwro.avenit.pl/l/${links1[0].code}`);
  const { rows: links2 } = await db.query(`SELECT * FROM social_links WHERE post_id = $1`, [post.id]);
  assert.equal(links2.length, 1); // ponowienie nie tworzy nowych linków
  // Wyłączone skracanie.
  await saveSettings(db, { shorten_links: false });
  assert.equal((await loadSettings(db)).shorten_links, false);
  const p2 = await savePost(ctx, pub, { content: 'Bez skracania https://ex.pl/b', targets: [{ account_id: FB.id }], intent: 'now' });
  mockFetch([[(c) => c.path === '/P1/feed', json({ id: 'P1_201' })], [(c) => c.method === 'GET' && c.path === '/P1_201', json({})]]);
  await runDuePublishing(ctx);
  assert.equal(calls.find((c) => c.path === '/P1/feed').body.message, 'Bez skracania https://ex.pl/b');
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM social_links WHERE post_id = $1`, [p2.id])).rows[0].n, 0);
  await saveSettings(db, { shorten_links: true });
  await db.query(`DELETE FROM social_posts`);
});

test('strony publiczne: /l przekierowuje i liczy (człowiek), karta wydarzenia + .ics, podgląd OG kazania dla robota, /linki, kazanie JSON', { skip }, async () => {
  const app = Fastify();
  app.decorate('requireTenant', async (req) => { req.db = db; req.tenant = { name: 'Kościół Testowy', slug: 'schwro', subdomain: 'schwro' }; });
  await app.register(socialPublicRoutes);
  const human = { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' };
  const bot = { 'user-agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)' };
  await db.query(`INSERT INTO social_links (code, kind, target_url) VALUES ('urlAAAA', 'url', 'https://ex.pl/?utm_source=facebook'), ('badBBBB', 'url', 'javascript:alert(1)')`);
  let r = await app.inject({ url: '/l/urlAAAA', headers: human });
  assert.equal(r.statusCode, 302);
  assert.equal(r.headers.location, 'https://ex.pl/?utm_source=facebook');
  await new Promise((res) => setTimeout(res, 20));
  assert.equal((await db.query(`SELECT clicks FROM social_links WHERE code = 'urlAAAA'`)).rows[0].clicks, 1);
  r = await app.inject({ url: '/l/urlAAAA', headers: bot });
  assert.equal(r.statusCode, 302);
  await new Promise((res) => setTimeout(res, 20));
  assert.equal((await db.query(`SELECT clicks FROM social_links WHERE code = 'urlAAAA'`)).rows[0].clicks, 1); // robot się nie liczy
  assert.equal((await app.inject({ url: '/l/badBBBB', headers: human })).statusCode, 404);
  assert.equal((await app.inject({ url: '/l/nieMa12', headers: human })).statusCode, 404);
  assert.equal((await app.inject({ url: '/l/<script>', headers: human })).statusCode, 404);

  const { rows: [ev] } = await db.query(`SELECT id FROM events WHERE title = 'Śniadanie'`);
  const { rows: [el] } = await db.query(`SELECT code FROM social_links WHERE kind = 'event' AND ref_id = $1`, [String(ev.id)]);
  r = await app.inject({ url: `/l/${el.code}`, headers: bot });
  assert.equal(r.statusCode, 200);
  assert.match(r.body, /<meta property="og:title" content="Śniadanie">/);
  assert.match(r.body, /sobota, 14 listopada · godz. 09:00/);
  assert.match(r.body, /Dla kobiet/);
  r = await app.inject({ url: `/l/${el.code}/kalendarz.ics`, headers: human });
  assert.match(r.headers['content-type'], /text\/calendar/);
  assert.match(r.body, /SUMMARY:Śniadanie/);

  const { rows: [sl] } = await db.query(`SELECT code FROM social_links WHERE kind = 'sermon'`);
  r = await app.inject({ url: `/l/${sl.code}`, headers: bot });
  assert.equal(r.statusCode, 200);
  assert.match(r.body, /og:image" content="https:\/\/img\.youtube\.com/);
  assert.match(r.body, /http-equiv="refresh" content="0;url=https:\/\/schwro\.avenit\.pl\/sermon\/laska"/);
  r = await app.inject({ url: `/l/${sl.code}`, headers: human });
  assert.equal(r.statusCode, 302);

  assert.equal((await app.inject({ url: '/linki', headers: human })).statusCode, 404); // wyłączona
  const page = await saveLinkPage(ctxOf(), { enabled: true, title: 'Nasz kościół', bio: 'Niedziele 10:00', links: [{ label: 'Strona', url: 'kosciol.pl' }, { label: '', url: 'x' }] });
  assert.equal(page.links.length, 1);
  assert.equal(page.links[0].url, 'https://kosciol.pl');
  const again = await saveLinkPage(ctxOf(), { ...page, links: page.links });
  assert.equal(again.links[0].code, page.links[0].code); // ten sam adres — ten sam kod
  r = await app.inject({ url: '/linki', headers: human });
  assert.equal(r.statusCode, 200);
  assert.match(r.body, /Nasz kościół/);
  assert.match(r.body, new RegExp(`href="/l/${page.links[0].code}"`));
  assert.match(r.body, /Śniadanie/); // udostępnione nadchodzące wydarzenie
  assert.match(r.body, /href="\/sermon\/laska"/);

  r = await app.inject({ url: '/api/public/sermon/laska' });
  assert.equal(JSON.parse(r.body).sermon.youtube_id, 'dQw4w9WgXcQ');
  assert.equal((await app.inject({ url: '/api/public/sermon/szkic' })).statusCode, 404); // nieopublikowane
  await app.close();
});

test('reguły: nowe kazanie → szkic (IG bez zdjęcia nie przejdzie do kolejki), przypomnienie o wydarzeniu, bez duplikatów', { skip }, async () => {
  const ctx = { ...ctxOf(), deps: { ...ctxOf().deps, fetchThumb: async () => null } };
  const pub = await accessOf(PUBLISHER);
  const ed = await accessOf(EDITOR);
  await assert.rejects(saveRule(ctx, ed, { trigger: 'sermon_published', action: 'queue', account_ids: [FB.id] }), (e) => e.code === 'NO_PUBLISH');
  await saveSlots(ctx, pub, { slots: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, time: '12:00' })) });
  const rules = await saveRule(ctx, pub, { trigger: 'sermon_published', action: 'queue', account_ids: [FB.id, IG.id] });
  await db.query(`INSERT INTO sermons (title, speaker, slug, is_published) VALUES ('Nadzieja', 'Ola', 'nadzieja', true)`);
  delivered.length = 0;
  let st = await runRules(ctx);
  assert.equal(st.created, 1);
  const { rows: posts } = await db.query(`SELECT * FROM social_posts WHERE source_type = 'sermon'`);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].status, 'draft'); // IG bez zdjęcia → szkic do uzupełnienia
  assert.ok(delivered.some((d) => d.user_email === 'pub@k.pl' && /przygotowała szkic/.test(d.title)));
  st = await runRules(ctx);
  assert.equal(st.created, 0); // bez duplikatu
  // Przypomnienie: wydarzenie za 2 dni (czas polski), tylko ogólne.
  const p = warsawParts(new Date(Date.now() + 2 * 86400_000));
  const ymd = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  await db.query(`INSERT INTO events (title, date, time) VALUES ('Modlitwa', $1, '19:00'), ('Próba zespołu', $1, '18:00')`, [ymd]);
  await db.query(`UPDATE events SET module_key = 'worship' WHERE title = 'Próba zespołu'`);
  await saveRule(ctx, pub, { trigger: 'event_reminder', action: 'queue', account_ids: [FB.id], config: { days_before: 2 } });
  st = await runRules(ctx);
  assert.equal(st.created, 1);
  const { rows: evPosts } = await db.query(`SELECT * FROM social_posts WHERE source_type = 'event'`);
  assert.equal(evPosts.length, 1);
  assert.equal(evPosts[0].status, 'scheduled');
  assert.match(evPosts[0].content, /Modlitwa/);
  assert.ok(rules.length >= 1);
  await db.query(`DELETE FROM social_posts`);
  await db.query(`DELETE FROM social_rules`);
});

test('pomysły i biblioteka: post z pomysłu wiąże pomysł, media trafiają do biblioteki raz, sprzątanie je omija', { skip }, async () => {
  const ctx = ctxOf();
  const pub = await accessOf(PUBLISHER);
  const { rows: [idea] } = await db.query(`INSERT INTO social_ideas (title, content, media) VALUES ('Świadectwo', 'Historia Ani', '[{"path":"idea01/plik.jpg","mime":"image/jpeg","kind":"image"}]') RETURNING id`);
  const post = await savePost(ctx, pub, {
    content: 'Historia Ani', media: [IMG({ path: 'lib01/plik.jpg' })], intent: 'draft', source_type: 'idea', source_id: idea.id,
    targets: [{ account_id: FB.id, media: [IMG({ path: 'lib02/plik.jpg' })] }],
  });
  assert.equal((await db.query(`SELECT post_id FROM social_ideas WHERE id = $1`, [idea.id])).rows[0].post_id, post.id);
  await savePost(ctx, pub, { id: post.id, content: 'Historia Ani!', media: [IMG({ path: 'lib01/plik.jpg' })], intent: 'draft', targets: [{ account_id: FB.id }] });
  const { rows: lib } = await db.query(`SELECT path, source, created_by FROM social_media_items WHERE path LIKE 'lib%' ORDER BY path`);
  assert.deepEqual(lib.map((r) => r.path), ['lib01/plik.jpg', 'lib02/plik.jpg']);
  assert.equal(lib[0].source, 'post');
  // Plik tylko w bibliotece (post usunięty) i plik pomysłu — sprzątanie ich nie rusza.
  await db.query(`DELETE FROM social_posts`);
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'social-lib-'));
  const root = path.join(base, 'schwro', 'social-media');
  const old = new Date(Date.now() - (ORPHAN_DAYS + 1) * 86400_000);
  for (const d of ['lib01', 'idea01', 'sierota']) {
    fs.mkdirSync(path.join(root, d), { recursive: true });
    fs.writeFileSync(path.join(root, d, 'plik.jpg'), 'x');
    fs.utimesSync(path.join(root, d), old, old);
  }
  const out = await cleanupMedia(ctx, { baseDir: base });
  assert.equal(out.removed, 1);
  assert.deepEqual(fs.readdirSync(root).sort(), ['idea01', 'lib01']);
  fs.rmSync(base, { recursive: true, force: true });
  assert.equal(getTableRule('social_ideas').resource, 'module:social');
  assert.equal(getTableRule('social_media_items').resource, 'module:social');
});

test('worker: tenant bez migracji — fn nie wywraca workera', { skip }, async () => {
  const { runForTenant } = await import('../src/fn/social.js');
  const empty = poolOf(new PGlite());
  const out = await runForTenant(empty, { tenantSlug: 'x' });
  assert.deepEqual(out, { published: 0, failed: 0, processing: 0, retry: 0 });
});
