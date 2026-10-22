// Pliki z Dysku Google i OneDrive / SharePoint bez kopiowania — Faza 3 (migracja 120,
// src/integrations/cloudFiles.js, fn cloud-files, /api/db: dataapi/cloudLinks.js).
// Czysta logika zawsze; przepływy na PRAWDZIWYM SQL (PGlite) z atrapą fetch (Google / Microsoft):
//   PGLITE_MODULE=/ścieżka/node_modules/@electric-sql/pglite/dist/index.js node --test test/cloud-files.test.js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  normalizeCloudAttachment, safeCloudUrl, isAllowedCloudUrl, cloudProviderFromUrl, googleAppIdFromClientId, isCloudAttachment,
  cloudMessageAttachment, cloudMaterialRow, cloudFromMaterialRow, cloudOpenUrl, CLOUD_LINK_TYPE,
} from '@avenit/shared/src/lib/cloudFiles.js';
import {
  pickerResourceScope, safeAttachmentUrl, enforceCloudLinks, saveFilesSettings, disconnectFiles,
} from '../src/integrations/cloudFiles.js';
import { enforceCloudLinkWrite } from '../src/dataapi/cloudLinks.js';
import { ApiError } from '../src/dataapi/querybuilder.js';
import { saveUserConnection, loadConnection, resetResourceTokenCache, decryptToken } from '../src/integrations/tokens.js';
import { startConnect, handleCallback } from '../src/integrations/oauth.js';
import { GOOGLE_SCOPES, integrationSecret } from '../src/integrations/providers.js';
import { settingsReturnUrl } from '../src/integrations/routes.js';
import { materialsViewer, materialsPredicate } from '../src/dataapi/materialsScope.js';
import { encryptPassword } from '../src/lib/mailcrypto.js';
import { cloudFilesAction } from '../src/fn/cloud-files.js';
import { calendarAction } from '../src/fn/calendar-sync.js';
import { workspaceAction } from '../src/fn/workspace-integration.js';
import { integrationCaller } from '../src/integrations/access.js';
import { invalidatePermissions } from '../src/dataapi/registry.js';

let PGlite = null;
try { ({ PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')); } catch { PGlite = null; }
const skip = PGlite ? false : 'brak @electric-sql/pglite (ustaw PGLITE_MODULE)';

// ── Czysta logika ───────────────────────────────────────────────────────────
test('biała lista adresów: tylko https na hostach dostawców (bez javascript:, http:, podróbek hostów)', () => {
  const ok = [
    ['https://drive.google.com/file/d/abc/view', 'google_drive'],
    ['https://docs.google.com/document/d/abc/edit', 'google_drive'],
    ['https://contoso-my.sharepoint.com/personal/jan/Documents/a.docx', 'onedrive'],
    ['https://contoso.sharepoint.com/sites/x/Shared%20Documents/a.pdf', 'sharepoint'],
    ['https://onedrive.live.com/?id=1', 'onedrive'],
    ['https://1drv.ms/w/s!abc', 'onedrive'],
  ];
  for (const [u, p] of ok) assert.ok(isAllowedCloudUrl(u, p), u);
  const bad = [
    'javascript:alert(1)', 'JaVaScRiPt:alert(1)//drive.google.com', 'data:text/html,x', 'http://drive.google.com/file/d/a',
    'https://evil.com/drive.google.com', 'https://drive.google.com.evil.com/x', 'https://sharepoint.com.evil.com/x',
    'https://evil-sharepoint.com/x', 'https://drive.google.com@evil.com/x', 'https://user:pw@drive.google.com/x',
    'https://drive.google.com:8443/x', 'https://drive.google.com/x\ny', 'https://a.b.sharepoint.com/x', '//drive.google.com/x', '', null,
  ];
  for (const u of bad) assert.equal(isAllowedCloudUrl(u), false, String(u));
  // Dostawca musi pasować do hosta.
  assert.equal(isAllowedCloudUrl('https://drive.google.com/x', 'onedrive'), false);
  assert.equal(isAllowedCloudUrl('https://contoso.sharepoint.com/x', 'google_drive'), false);
  assert.equal(cloudProviderFromUrl('https://contoso-my.sharepoint.com/p'), 'onedrive');
  assert.equal(cloudProviderFromUrl('https://contoso.sharepoint.com/p'), 'sharepoint');
  assert.equal(cloudProviderFromUrl('https://evil.com/p'), null);
  assert.equal(googleAppIdFromClientId('123456789012-abcdef.apps.googleusercontent.com'), '123456789012');
  assert.equal(googleAppIdFromClientId('own-client'), null);
});

test('normalizacja odnośnika: whitelist dostawców, autor z serwera, ikonka tylko z CDN dostawcy, kształty wiadomości i wiersza', () => {
  const now = new Date('2026-10-22T10:00:00Z');
  const n = normalizeCloudAttachment({
    provider: 'google_drive', file_id: '1AbC_x-9', name: ' Plan\nnabożeństwa.docx ', mime_type: 'application/vnd.google-apps.document',
    size: '2048', web_url: 'https://docs.google.com/document/d/1AbC/edit', icon_url: 'https://evil.com/i.png', picked_by: 'ktos@inny.pl',
  }, { pickedBy: 'jan@kosciol.pl', now });
  assert.equal(n.ok, true);
  assert.deepEqual(
    [n.value.kind, n.value.name, n.value.size, n.value.picked_by, n.value.picked_at, n.value.icon_url],
    ['cloud', 'Plan nabożeństwa.docx', 2048, 'jan@kosciol.pl', now.toISOString(), null],
  );
  for (const bad of [
    { provider: 'dropbox', file_id: 'a', web_url: 'https://drive.google.com/x' },
    { provider: 'google_drive', file_id: 'a b', web_url: 'https://drive.google.com/x' },
    { provider: 'google_drive', file_id: 'a', web_url: 'javascript:alert(1)' },
    { provider: 'onedrive', file_id: 'a', web_url: 'https://evil.com/x' },
    null,
  ]) assert.equal(normalizeCloudAttachment(bad).ok, false, JSON.stringify(bad));
  const m = cloudMessageAttachment(n.value);
  assert.deepEqual([m.url, m.type, isCloudAttachment(m)], [n.value.web_url, CLOUD_LINK_TYPE, true]);
  const row = cloudMaterialRow(n.value, { folderId: 'f1', teamType: 'worship' });
  assert.deepEqual([row.storage_path, row.external_provider, row.external_url, row.team_type], [null, 'google_drive', n.value.web_url, 'worship']);
  assert.equal(cloudFromMaterialRow({ ...row, external_url: 'javascript:alert(1)' }), null);
  assert.equal(cloudFromMaterialRow({ ...row }).web_url, n.value.web_url);
  assert.equal(cloudOpenUrl({ provider: 'google_drive', url: 'https://evil.com' }), null);
  // Zwykłe załączniki wiadomości.
  for (const u of ['/storage/messenger-attachments/c/a.png', 'https://k.avenit.pl/storage/x', 'http://localhost:3001/storage/x']) assert.ok(safeAttachmentUrl(u), u);
  for (const u of ['javascript:alert(1)', 'data:text/html,x', '//evil.com/x', 'vbscript:x', '']) assert.equal(safeAttachmentUrl(u), false, u);
});

test('File Picker v8: tokeny tylko dla zasobów SharePoint (i Graph do odczytu plików)', () => {
  assert.equal(pickerResourceScope('https://contoso-my.sharepoint.com'), 'https://contoso-my.sharepoint.com/.default');
  assert.equal(pickerResourceScope('https://Contoso.SharePoint.com/sites/x'), 'https://contoso.sharepoint.com/.default');
  assert.equal(pickerResourceScope('https://graph.microsoft.com'), 'https://graph.microsoft.com/Files.Read.All');
  for (const r of ['https://evil.com', 'http://contoso.sharepoint.com', 'https://contoso.sharepoint.com.evil.com', 'https://outlook.office.com', 'https://x@contoso.sharepoint.com', 'nonsense', '']) {
    assert.equal(pickerResourceScope(r), null, r);
  }
  assert.match(settingsReturnUrl('schwro', 'google', 'connected', null, 'files'), /\/profile\?files=google&files_result=connected$/);
});

// ── PGlite + atrapa fetch ───────────────────────────────────────────────────
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DB_NAME = 'test_cloud_files';
const ADMIN = uid(1), JAN = uid(2), OLA = uid(3), NIEAKTYWNY = uid(4), MSU = uid(5);
const GCLIENT = '123456789012-abc.apps.googleusercontent.com';
const API_KEY = 'AIzaTESTKEY0123456789abcdefXYZ';

function poolOf(pg) {
  return { async query(sql, params) { const r = await pg.query(sql, params); return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length }; } };
}
const json = (body, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
let routes = [];
const calls = [];
const realFetch = globalThis.fetch;
function mockFetch(list) { routes = list; calls.length = 0; }
async function fakeFetch(url, opts = {}) {
  const u = String(url);
  let body = opts.body;
  if (body instanceof URLSearchParams) body = Object.fromEntries(body);
  else if (typeof body === 'string') { try { body = JSON.parse(body); } catch { /* */ } }
  const call = { url: u, method: opts.method || 'GET', body, headers: opts.headers || {} };
  calls.push(call);
  for (const [pred, resp] of routes) if (pred(u, call)) return typeof resp === 'function' ? resp(u, call) : resp.clone();
  return json({ error: { message: `not mocked ${call.method} ${u}` } }, 599);
}

let pg, db;
const reqOf = (body, userId) => ({ db, body, tenant: { subdomain: 'schwro', slug: 'schwro', db_name: DB_NAME, name: 'Kościół' }, user: { id: userId, email: emailOf[userId] }, log: { error() {}, warn() {}, info() {} } });
const emailOf = { [ADMIN]: 'admin@kosciol.pl', [JAN]: 'jan@kosciol.pl', [OLA]: 'ola@kosciol.pl', [NIEAKTYWNY]: 'stary@kosciol.pl', [MSU]: 'ms@kosciol.pl' };
const q1 = async (sql, params) => (await db.query(sql, params)).rows;
const jwt = (c) => `h.${Buffer.from(JSON.stringify(c)).toString('base64url')}.s`;

before(async () => {
  if (skip) return;
  globalThis.fetch = fakeFetch;
  pg = new PGlite();
  db = poolOf(pg);
  await pg.exec(`
    CREATE TABLE app_roles (key text PRIMARY KEY, is_admin boolean DEFAULT false);
    CREATE TABLE app_users (id uuid PRIMARY KEY, email text UNIQUE, full_name text, role text, is_super_admin boolean DEFAULT false,
      is_active boolean DEFAULT true, campus_id int, member_id int);
    CREATE TABLE app_settings (key text PRIMARY KEY, value text);
    CREATE TABLE account_events (id bigserial PRIMARY KEY, email varchar(255), action varchar(40) NOT NULL, actor varchar(255), detail text, created_at timestamptz DEFAULT now());
    CREATE TABLE permission_grants (role text, user_id uuid, capability text, allowed boolean);
    CREATE TABLE members (id serial PRIMARY KEY, email text);
    CREATE TABLE events (id serial PRIMARY KEY, title text, external_source text, external_id text);
    CREATE TABLE materials_folders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, parent_id uuid, team_type text, created_by text);
    CREATE TABLE materials_files (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, folder_id uuid, name TEXT NOT NULL, storage_path TEXT NOT NULL,
      team_type TEXT, file_size INTEGER, mime_type TEXT, uploaded_by TEXT, description TEXT, download_count INTEGER DEFAULT 0,
      created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE TABLE materials_shares (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, file_id uuid, folder_id uuid, target_type text, target_id text, target_label text, permission text DEFAULT 'view', created_by text);
    CREATE TABLE event_materials (id serial PRIMARY KEY, event_id int, file_id uuid);
    CREATE TABLE home_group_members (group_id text, email text, role text);
    CREATE TABLE group_members (group_id text, member_id int);
    INSERT INTO app_roles (key, is_admin) VALUES ('superadmin', true), ('czlonek', false);
  `);
  // 118/119 (połączenia, kalendarz) + 120 (dwukrotnie — idempotentna; storage_path NOT NULL → zdjęte).
  for (const f of ['118_workspace_integrations.sql', '119_calendar_sync.sql', '120_cloud_files.sql', '120_cloud_files.sql']) {
    await pg.exec(fs.readFileSync(new URL(`../db/tenant-migrations/${f}`, import.meta.url), 'utf8'));
  }
  await db.query(`INSERT INTO app_users (id, email, full_name, role, is_super_admin, is_active) VALUES
    ($1, 'admin@kosciol.pl', 'Admin', 'superadmin', true, true), ($2, 'jan@kosciol.pl', 'Jan', 'czlonek', false, true),
    ($3, 'ola@kosciol.pl', 'Ola', 'czlonek', false, true), ($4, 'stary@kosciol.pl', 'Stary', 'czlonek', false, false),
    ($5, 'ms@kosciol.pl', 'Mia', 'czlonek', false, true)`, [ADMIN, JAN, OLA, NIEAKTYWNY, MSU]);
  const enc = await encryptPassword('gsecret', integrationSecret());
  const encMs = await encryptPassword('msecret', integrationSecret());
  await db.query(`INSERT INTO workspace_integration_settings (provider, client_id, client_secret_enc, ms_tenant) VALUES ('google', $1, $2, NULL), ('microsoft', 'mid', $3, 'organizations')`, [GCLIENT, enc, encMs]);
  await saveFilesSettings(db, 'google', { picker_api_key: API_KEY }, 'admin@kosciol.pl');
  invalidatePermissions(DB_NAME);
});

after(() => { globalThis.fetch = realFetch; });

test('migracja 120: kolumny external_*, storage_path opcjonalne, CHECK odrzuca adres bez https i nieznanego dostawcę', { skip }, async () => {
  const cols = (await q1(`SELECT column_name FROM information_schema.columns WHERE table_name = 'materials_files' AND column_name LIKE 'external_%' ORDER BY 1`)).map((r) => r.column_name);
  assert.deepEqual(cols, ['external_drive_id', 'external_id', 'external_provider', 'external_url']);
  await db.query(`INSERT INTO materials_files (name, external_provider, external_id, external_url) VALUES ('ok', 'google_drive', 'a', 'https://drive.google.com/x')`);
  await assert.rejects(db.query(`INSERT INTO materials_files (name, external_provider, external_id, external_url) VALUES ('x', 'google_drive', 'a', 'javascript:alert(1)')`));
  await assert.rejects(db.query(`INSERT INTO materials_files (name, external_provider, external_id, external_url) VALUES ('x', 'dropbox', 'a', 'https://x')`));
  const f = (await q1(`SELECT files FROM workspace_integration_settings WHERE provider = 'google'`))[0].files;
  assert.equal(f.picker_api_key, API_KEY);
  await db.query(`DELETE FROM materials_files`);
});

test('łączenie plików: Google drive.file (zgoda przyrostowa), callback zapisuje zakres; bez zakresu — odmowa', { skip }, async () => {
  const c = await cloudFilesAction(reqOf({ action: 'connect', provider: 'google' }, JAN));
  const u = new URL(c.url);
  assert.equal(u.searchParams.get('scope'), `openid email ${GOOGLE_SCOPES.driveFile}`);
  assert.equal(u.searchParams.get('include_granted_scopes'), 'true');
  assert.ok(c.__cookie);
  const CREDS = { clientId: GCLIENT, clientSecret: 'gsecret', msTenant: '' };
  const s = await startConnect(db, { provider: 'google', purpose: 'files', tenant: 'schwro', user: { id: JAN, email: 'jan@kosciol.pl' }, creds: CREDS });
  mockFetch([[(x) => x === 'https://oauth2.googleapis.com/token', json({ access_token: 'GAT-JAN', refresh_token: 'GRT-JAN', expires_in: 3600, scope: `openid ${GOOGLE_SCOPES.driveFile}`, id_token: jwt({ email: 'jan@kosciol.pl', hd: 'kosciol.pl' }) })]]);
  const out = await handleCallback(db, { provider: 'google', stateId: s.stateId, query: { code: 'C' }, nonceCookie: s.nonce, creds: CREDS, tenant: 'schwro' });
  assert.deepEqual([out.result, out.purpose], ['connected', 'files']);
  const conn = await loadConnection(db, 'google', { scopeKind: 'user', userId: JAN });
  assert.ok(conn.scopes.includes(GOOGLE_SCOPES.driveFile));
  assert.equal(conn.external_tenant, 'kosciol.pl');
  // Samo połączenie plików to nie kalendarz (karta kalendarza dalej „Niepołączone”).
  const cal = await calendarAction(reqOf({ action: 'status' }, JAN));
  assert.equal(cal.providers.google.connection, null);
  // Bez zakresu drive.file — odmowa.
  const s2 = await startConnect(db, { provider: 'google', purpose: 'files', tenant: 'schwro', user: { id: OLA, email: 'ola@kosciol.pl' }, creds: CREDS });
  mockFetch([[() => true, json({ access_token: 'AT', refresh_token: 'RT', scope: 'openid email', id_token: jwt({ email: 'ola@gmail.com' }) })]]);
  const bad = await handleCallback(db, { provider: 'google', stateId: s2.stateId, query: { code: 'C' }, nonceCookie: s2.nonce, creds: CREDS, tenant: 'schwro' });
  assert.deepEqual([bad.result, bad.reason], ['error', 'scopes']);
  // Microsoft: delegowane Files.Read.All + offline_access.
  const ms = await cloudFilesAction(reqOf({ action: 'connect', provider: 'microsoft' }, MSU));
  assert.match(new URL(ms.url).searchParams.get('scope'), /offline_access Files\.Read\.All/);
});

test('token dla Google Picker: tylko własne połączenie z drive.file, krótko ważny token + klucze; bez refresh tokenu', { skip }, async () => {
  mockFetch([]);
  const st = await cloudFilesAction(reqOf({ action: 'status' }, JAN));
  assert.deepEqual([st.providers.google.enabled, st.providers.google.available, st.providers.google.connected, st.providers.google.can_share_domain], [true, true, true, true]);
  assert.equal(st.providers.microsoft.connected, false);
  const s = await cloudFilesAction(reqOf({ action: 'picker_session', provider: 'google' }, JAN));
  assert.deepEqual([s.access_token, s.api_key, s.app_id], ['GAT-JAN', API_KEY, '123456789012']);
  const text = JSON.stringify(s) + JSON.stringify(st);
  for (const secret of ['GRT-JAN', 'refresh', 'gsecret', '_enc']) assert.ok(!text.includes(secret), secret);
  // Ola nie ma połączenia — nie dostaje cudzego tokenu.
  await assert.rejects(cloudFilesAction(reqOf({ action: 'picker_session', provider: 'google' }, OLA)), (e) => e.status === 409 && e.code === 'not_connected');
  // Połączenie tylko z kalendarzem (bez drive.file) — też odmowa.
  await saveUserConnection(db, { provider: 'google', userId: OLA, scopes: [GOOGLE_SCOPES.calendarAppCreated], accessToken: 'GAT-OLA', refreshToken: 'GRT-OLA', expiresIn: 3600 });
  await assert.rejects(cloudFilesAction(reqOf({ action: 'picker_session', provider: 'google' }, OLA)), (e) => e.code === 'not_connected');
  // Nieaktywne konto i brak sesji.
  await assert.rejects(cloudFilesAction(reqOf({ action: 'status' }, NIEAKTYWNY)), (e) => e.status === 403);
  await assert.rejects(cloudFilesAction({ ...reqOf({ action: 'status' }, null), user: {} }), (e) => e.status === 403);
  // Google: token wygasł → odświeżenie (refresh token zostaje w bazie, zakresy nie rosną).
  await db.query(`UPDATE integration_connections SET expires_at = now() - interval '1 hour' WHERE user_id = $1`, [JAN]);
  mockFetch([[(x) => x === 'https://oauth2.googleapis.com/token', json({ access_token: 'GAT-JAN-2', expires_in: 3599, scope: `openid ${GOOGLE_SCOPES.driveFile} ${GOOGLE_SCOPES.calendarAppCreated}` })]]);
  const s2 = await cloudFilesAction(reqOf({ action: 'picker_session', provider: 'google' }, JAN));
  assert.equal(s2.access_token, 'GAT-JAN-2');
  assert.ok(!JSON.stringify(s2).includes('GRT-JAN'));
  const conn = await loadConnection(db, 'google', { scopeKind: 'user', userId: JAN });
  assert.equal(await decryptToken(conn.refresh_token_enc), 'GRT-JAN');
  assert.ok(!conn.scopes.includes(GOOGLE_SCOPES.calendarAppCreated), 'odświeżenie nie rozszerza zakresów połączenia');
  // Kościół wyłącza Dysk Google → brak tokenu i brak łączenia.
  await saveFilesSettings(db, 'google', { enabled: false }, 'admin@kosciol.pl');
  await assert.rejects(cloudFilesAction(reqOf({ action: 'picker_session', provider: 'google' }, JAN)), (e) => e.status === 403 && e.code === 'files_disabled');
  await assert.rejects(cloudFilesAction(reqOf({ action: 'connect', provider: 'google' }, JAN)), (e) => e.code === 'files_disabled');
  await saveFilesSettings(db, 'google', { enabled: true }, 'admin@kosciol.pl');
});

test('OneDrive/SharePoint File Picker v8: adres OneDrive, tokeny dla zasobu SharePoint z serwera (rotacja, pamięć), bez refresh tokenu', { skip }, async () => {
  resetResourceTokenCache();
  await saveUserConnection(db, {
    provider: 'microsoft', userId: MSU, externalTenant: '11111111-2222-3333-4444-555555555555', accountEmail: 'mia@contoso.com',
    scopes: ['openid', 'profile', 'email', 'offline_access', 'Files.Read.All'], accessToken: 'MAT-GRAPH', refreshToken: 'MRT-1', expiresIn: 3600,
  });
  const tokenUrl = 'https://login.microsoftonline.com/11111111-2222-3333-4444-555555555555/oauth2/v2.0/token';
  mockFetch([
    [(u) => u.startsWith('https://graph.microsoft.com/v1.0/me/drive'), json({ webUrl: 'https://contoso-my.sharepoint.com/personal/mia_contoso_com/Documents', driveType: 'business' })],
    [(u, c) => u === tokenUrl && c.body.scope === 'https://contoso-my.sharepoint.com/.default offline_access', json({ access_token: 'SP-TOKEN', refresh_token: 'MRT-2', expires_in: 3600 })],
    [(u, c) => u === tokenUrl && c.body.scope === 'https://contoso.sharepoint.com/.default offline_access', json({ access_token: 'SP-ROOT', expires_in: 3600 })],
  ]);
  const s = await cloudFilesAction(reqOf({ action: 'picker_session', provider: 'microsoft' }, MSU));
  assert.deepEqual([s.base_url, s.access_token], ['https://contoso-my.sharepoint.com', 'SP-TOKEN']);
  const tokCall = calls.find((c) => c.url === tokenUrl);
  assert.deepEqual([tokCall.body.grant_type, tokCall.body.refresh_token, tokCall.body.client_id], ['refresh_token', 'MRT-1', 'mid']);
  // Rotacja refresh tokenu — zaszyfrowany w bazie, nie w odpowiedzi.
  const conn = await loadConnection(db, 'microsoft', { scopeKind: 'user', userId: MSU });
  assert.equal(await decryptToken(conn.refresh_token_enc), 'MRT-2');
  assert.ok(!String(conn.refresh_token_enc).includes('MRT-2'));
  for (const secret of ['MRT-1', 'MRT-2', 'refresh', 'msecret', 'MAT-GRAPH']) assert.ok(!JSON.stringify(s).includes(secret), secret);
  // Kolejne „authenticate” z Pickera: inny zasób SharePoint; ten sam — z pamięci (bez Microsoftu).
  const t = await cloudFilesAction(reqOf({ action: 'token', provider: 'microsoft', resource: 'https://contoso.sharepoint.com' }, MSU));
  assert.deepEqual(Object.keys(t).sort(), ['access_token', 'expires_at']);
  assert.equal(t.access_token, 'SP-ROOT');
  calls.length = 0;
  const again = await cloudFilesAction(reqOf({ action: 'token', provider: 'microsoft', resource: 'https://contoso-my.sharepoint.com/personal/x' }, MSU));
  assert.equal(again.access_token, 'SP-TOKEN');
  assert.equal(calls.length, 0);
  // Obcy zasób / Google / cudze konto — odmowa.
  await assert.rejects(cloudFilesAction(reqOf({ action: 'token', provider: 'microsoft', resource: 'https://evil.com' }, MSU)), (e) => e.status === 400 && e.code === 'bad_resource');
  await assert.rejects(cloudFilesAction(reqOf({ action: 'token', provider: 'google', resource: 'https://contoso.sharepoint.com' }, JAN)), (e) => e.status === 400);
  await assert.rejects(cloudFilesAction(reqOf({ action: 'token', provider: 'microsoft', resource: 'https://contoso.sharepoint.com' }, JAN)), (e) => e.code === 'not_connected');
  // Brak zgody organizacji na SharePoint → czytelny błąd, połączenie nie jest unieważniane.
  resetResourceTokenCache();
  mockFetch([[(u) => u === tokenUrl, json({ error: 'invalid_grant', error_description: 'AADSTS65001: The user or administrator has not consented' }, 400)]]);
  await assert.rejects(cloudFilesAction(reqOf({ action: 'token', provider: 'microsoft', resource: 'https://contoso.sharepoint.com' }, MSU)), (e) => e.code === 'consent_required');
  assert.equal((await loadConnection(db, 'microsoft', { scopeKind: 'user', userId: MSU })).status, 'active');
});

test('metadane wybranych plików od dostawcy: Google Drive i Graph; obcy host odrzucony; autor = osoba z sesji', { skip }, async () => {
  await db.query(`UPDATE integration_connections SET expires_at = now() + interval '1 hour' WHERE user_id = $1`, [JAN]);
  mockFetch([
    [(u) => u.startsWith('https://www.googleapis.com/drive/v3/files/G1?'), json({ id: 'G1', name: 'Plan.pdf', mimeType: 'application/pdf', size: '1234', webViewLink: 'https://drive.google.com/file/d/G1/view', iconLink: 'https://drive-thirdparty.googleusercontent.com/16/type/application/pdf' })],
    [(u) => u.startsWith('https://www.googleapis.com/drive/v3/files/G2?'), json({ id: 'G2', name: 'Zły', webViewLink: 'https://evil.com/x' })],
  ]);
  const r = await cloudFilesAction(reqOf({ action: 'resolve', provider: 'google', items: [{ file_id: 'G1' }, { file_id: 'G2' }, { file_id: 'zły id' }] }, JAN));
  assert.equal(r.attachments.length, 1);
  assert.deepEqual(
    [r.attachments[0].provider, r.attachments[0].web_url, r.attachments[0].size, r.attachments[0].picked_by],
    ['google_drive', 'https://drive.google.com/file/d/G1/view', 1234, 'jan@kosciol.pl'],
  );
  assert.equal(r.failed.length, 2);
  assert.match(calls[0].headers.Authorization, /^Bearer GAT-JAN/);
  mockFetch([
    [(u) => u.startsWith('https://graph.microsoft.com/v1.0/drives/D1/items/I1?'), json({ id: 'I1', name: 'Grafik.xlsx', size: 99, webUrl: 'https://contoso.sharepoint.com/sites/zespol/Shared%20Documents/Grafik.xlsx', file: { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }, parentReference: { driveId: 'D1' } })],
    [(u) => u.startsWith('https://graph.microsoft.com/v1.0/drives/D2/items/I2?'), json({ id: 'I2', name: 'Notatki.docx', size: 5, webUrl: 'https://contoso-my.sharepoint.com/personal/mia/Documents/Notatki.docx', file: {}, parentReference: { driveId: 'D2' } })],
  ]);
  const m = await cloudFilesAction(reqOf({ action: 'resolve', provider: 'microsoft', items: [{ file_id: 'I1', drive_id: 'D1' }, { file_id: 'I2', drive_id: 'D2' }, { file_id: 'I3' }] }, MSU));
  assert.deepEqual(m.attachments.map((a) => a.provider), ['sharepoint', 'onedrive']);
  assert.equal(m.attachments[0].drive_id, 'D1');
  assert.equal(m.failed.length, 1);
  await assert.rejects(cloudFilesAction(reqOf({ action: 'resolve', provider: 'google', items: Array.from({ length: 11 }, (_, i) => ({ file_id: `F${i}` })) }, JAN)), (e) => e.status === 400);
});

test('udostępnienie organizacji (opcjonalne): Google — uprawnienie domain/reader dla domeny konta, nigdy „anyone”; Gmail i Microsoft — odmowa', { skip }, async () => {
  mockFetch([[(u, c) => u.startsWith('https://www.googleapis.com/drive/v3/files/G1/permissions') && c.method === 'POST', json({ id: 'p1' })]]);
  const r = await cloudFilesAction(reqOf({ action: 'share', provider: 'google', file_ids: ['G1'] }, JAN));
  assert.deepEqual([r.shared, r.domain], [['G1'], 'kosciol.pl']);
  assert.deepEqual(calls[0].body, { type: 'domain', role: 'reader', domain: 'kosciol.pl', allowFileDiscovery: false });
  assert.ok(calls.every((c) => c.body?.type !== 'anyone'));
  // Odmowa Google (np. brak prawa udostępniania) — w wyniku, bez wyjątku.
  mockFetch([[() => true, json({ error: { message: 'insufficientFilePermissions' } }, 403)]]);
  const f = await cloudFilesAction(reqOf({ action: 'share', provider: 'google', file_ids: ['G9'] }, JAN));
  assert.deepEqual([f.shared.length, f.failed.length], [0, 1]);
  // Konto prywatne (bez domeny Workspace) — bez udostępniania.
  await saveUserConnection(db, { provider: 'google', userId: OLA, scopes: [GOOGLE_SCOPES.driveFile], accessToken: 'GAT-OLA', refreshToken: 'GRT-OLA', expiresIn: 3600 });
  await assert.rejects(cloudFilesAction(reqOf({ action: 'share', provider: 'google', file_ids: ['G1'] }, OLA)), (e) => e.code === 'no_domain');
  await assert.rejects(cloudFilesAction(reqOf({ action: 'share', provider: 'microsoft', file_ids: ['I1'] }, MSU)), (e) => e.code === 'unsupported');
});

test('/api/db: odnośnik w materials_files — whitelist, autor z sesji, bez zmiany adresu, wyłączony dostawca; załączniki wiadomości', { skip }, async () => {
  const req = { db, user: { id: JAN, email: 'jan@kosciol.pl' } };
  const good = { name: 'x', team_type: 'worship', external_provider: 'google_drive', external_id: 'G1', external_url: 'https://drive.google.com/file/d/G1/view', uploaded_by: 'admin@kosciol.pl', mime_type: 'application/pdf', file_size: 10 };
  const q = { table: 'materials_files', op: 'insert', values: { ...good } };
  await enforceCloudLinkWrite(q, req);
  assert.deepEqual([q.values.uploaded_by, q.values.storage_path, q.values.external_url], ['jan@kosciol.pl', null, good.external_url]);
  for (const bad of [
    { ...good, external_url: 'javascript:alert(1)' },
    { ...good, external_url: 'https://evil.com/x' },
    { ...good, external_url: 'http://drive.google.com/x' },
    { ...good, external_provider: 'dropbox' },
    { ...good, external_provider: 'onedrive' }, // host Google przy dostawcy OneDrive
    { ...good, storage_path: 'worship/plik.pdf' },
  ]) {
    await assert.rejects(enforceCloudLinkWrite({ table: 'materials_files', op: 'insert', values: { ...bad } }, req), (e) => e instanceof ApiError && e.status === 400, JSON.stringify(bad));
  }
  await assert.rejects(enforceCloudLinkWrite({ table: 'materials_files', op: 'update', values: { external_url: 'https://drive.google.com/y' } }, req), (e) => e.status === 403);
  // Zwykły plik / zmiana nazwy — bez zmian.
  const plain = { table: 'materials_files', op: 'update', values: { name: 'nowa' } };
  await enforceCloudLinkWrite(plain, req);
  assert.deepEqual(plain.values, { name: 'nowa' });
  await enforceCloudLinks({ table: 'materials_files', op: 'insert', values: { ...good } }, req, { enabled: async () => true });
  await assert.rejects(enforceCloudLinks({ table: 'materials_files', op: 'insert', values: { ...good } }, req, { enabled: async (_db, p) => p !== 'google' }), (e) => e.status === 403 && e.code === 'files_disabled');
  // Wiadomości: odnośnik normalizowany (typ odnośnika dla starszych klientów), zwykły plik bez zmian, javascript: odrzucony.
  const mq = { table: 'messages', op: 'insert', values: { conversation_id: 'c', attachments: [
    { kind: 'cloud', provider: 'sharepoint', file_id: 'I1', drive_id: 'D1', name: 'Grafik.xlsx', web_url: 'https://contoso.sharepoint.com/sites/z/Grafik.xlsx', picked_by: 'ktos@inny.pl' },
    { url: '/storage/messenger-attachments/c/a.png', name: 'a.png', type: 'image/png', size: 5 },
  ] } };
  await enforceCloudLinkWrite(mq, req);
  const [cloudAtt, plainAtt] = mq.values.attachments;
  assert.deepEqual([cloudAtt.type, cloudAtt.url, cloudAtt.picked_by, isCloudAttachment(cloudAtt)], [CLOUD_LINK_TYPE, 'https://contoso.sharepoint.com/sites/z/Grafik.xlsx', 'jan@kosciol.pl', true]);
  assert.ok(cloudAtt.picked_at);
  assert.equal(plainAtt.url, '/storage/messenger-attachments/c/a.png');
  for (const atts of [
    [{ kind: 'cloud', provider: 'google_drive', file_id: 'G', web_url: 'javascript:alert(1)' }],
    [{ type: CLOUD_LINK_TYPE, provider: 'onedrive', file_id: 'G', url: 'https://evil.com' }],
    [{ url: 'javascript:alert(1)', name: 'x', type: 'application/pdf' }],
  ]) {
    await assert.rejects(enforceCloudLinkWrite({ table: 'messages', op: 'insert', values: { attachments: atts } }, req), (e) => e instanceof ApiError && e.status === 400, JSON.stringify(atts));
  }
});

test('zakres Plików działa na odnośnikach: przestrzeń wrażliwa ukryta bez dostępu do modułu, ogólne i własne widoczne', { skip }, async () => {
  const ins = async (row) => (await q1(
    `INSERT INTO materials_files (name, team_type, uploaded_by, external_provider, external_id, external_url) VALUES ($1, $2, $3, 'google_drive', $4, $5) RETURNING id::text AS id`,
    [row.name, row.team_type, row.uploaded_by, row.name, `https://drive.google.com/file/d/${row.name}/view`]))[0].id;
  const ids = {
    finance: await ins({ name: 'budzet', team_type: 'finance', uploaded_by: 'admin@kosciol.pl' }),
    general: await ins({ name: 'ogolny', team_type: null, uploaded_by: 'admin@kosciol.pl' }),
    worship: await ins({ name: 'piesni', team_type: 'worship', uploaded_by: 'admin@kosciol.pl' }),
    ownFinance: await ins({ name: 'moj', team_type: 'finance', uploaded_by: 'jan@kosciol.pl' }),
  };
  const visible = async (caps, email) => {
    const viewer = materialsViewer({ resolver: { can: (c) => caps.includes(c) }, email, moduleKeys: [] });
    const params = [];
    const clause = materialsPredicate('materials_files', viewer)('mf', (v) => { params.push(v); return params.length; });
    return new Set((await q1(`SELECT id::text AS id FROM materials_files mf WHERE ${clause}`, params)).map((r) => r.id));
  };
  const jan = await visible(['module:worship'], 'jan@kosciol.pl');
  assert.ok(jan.has(ids.general) && jan.has(ids.worship) && jan.has(ids.ownFinance));
  assert.ok(!jan.has(ids.finance), 'odnośnik z Finansów ukryty bez module:finance');
  const ola = await visible([], 'ola@kosciol.pl');
  assert.deepEqual([...ola], [ids.general]);
  // Udostępnienie NIE otwiera przestrzeni wrażliwej (jak dla plików z magazynu).
  await db.query(`INSERT INTO materials_shares (file_id, target_type, target_id) VALUES ($1, 'user', 'ola@kosciol.pl'), ($2, 'user', 'ola@kosciol.pl')`, [ids.finance, ids.worship]);
  const ola2 = await visible([], 'ola@kosciol.pl');
  assert.ok(ola2.has(ids.worship) && !ola2.has(ids.finance));
  await pg.exec(`DELETE FROM materials_shares; DELETE FROM materials_files`);
});

test('rozłączenie: pliki odłączone bez ruszania kalendarza; samo połączenie plików usunięte (unieważnienie u Google); admin wyłącza dostawcę', { skip }, async () => {
  // Jan: połączenie z plikami i kalendarzem.
  await saveUserConnection(db, { provider: 'google', userId: JAN, scopes: [GOOGLE_SCOPES.driveFile, GOOGLE_SCOPES.calendarAppCreated], accessToken: 'A', refreshToken: 'R', expiresIn: 3600 });
  mockFetch([[() => true, json(null, 204)]]);
  assert.equal(await disconnectFiles(db, JAN, 'google'), true);
  const kept = await loadConnection(db, 'google', { scopeKind: 'user', userId: JAN });
  assert.ok(kept.scopes.includes(GOOGLE_SCOPES.calendarAppCreated) && !kept.scopes.includes(GOOGLE_SCOPES.driveFile));
  assert.equal(calls.length, 0, 'bez unieważniania tokenu (kalendarz działa dalej)');
  // Ola: tylko pliki → połączenie usunięte, token unieważniony.
  await db.query(`DELETE FROM integration_connections WHERE user_id = $1`, [OLA]);
  await saveUserConnection(db, { provider: 'google', userId: OLA, scopes: [GOOGLE_SCOPES.driveFile], accessToken: 'A', refreshToken: 'R', expiresIn: 3600 });
  const r = await cloudFilesAction(reqOf({ action: 'disconnect', provider: 'google' }, OLA));
  assert.equal(r.removed, true);
  assert.equal(await loadConnection(db, 'google', { scopeKind: 'user', userId: OLA }), null);
  assert.ok(calls.some((c) => c.url.startsWith('https://oauth2.googleapis.com/revoke')));
  // Ustawienia → Integracje: wyłączenie plików Microsoft (manage_integrations), stan w statusie.
  const admin = await integrationCaller(db, ADMIN, DB_NAME);
  const saved = await workspaceAction(reqOf({ action: 'files_save', provider: 'microsoft', settings: { enabled: false } }, ADMIN), admin);
  assert.equal(saved.files.enabled, false);
  const st = await workspaceAction(reqOf({ action: 'status' }, ADMIN), admin);
  assert.equal(st.providers.microsoft.files.enabled, false);
  assert.deepEqual([st.providers.google.files.ready, st.providers.google.files.app_id_effective], [true, '123456789012']);
  await assert.rejects(workspaceAction(reqOf({ action: 'files_save', provider: 'google', settings: { picker_app_id: 'abc' } }, ADMIN), admin), (e) => e.status === 400);
  const jan = await integrationCaller(db, JAN, DB_NAME);
  await assert.rejects(workspaceAction(reqOf({ action: 'files_save', provider: 'google', settings: { enabled: false } }, JAN), jan), (e) => e.status === 403);
  const mine = await cloudFilesAction(reqOf({ action: 'status' }, MSU));
  assert.equal(mine.providers.microsoft.enabled, false);
});
