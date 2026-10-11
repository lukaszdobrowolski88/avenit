// Audyt uprawnień 2026-10-11, runda 4: prośby „tylko dla liderów” i anonimowe, sekrety app_settings,
// telefony z kont, kontakty grup domowych, realtime z tymi samymi ograniczeniami co /api/db.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { prayerViewer, prayerScope, enforcePrayerWrite, redactPrayerRows } from '../src/dataapi/prayerScope.js';
import { isSecretSetting, settingsSecretScope } from '../src/dataapi/settingsScope.js';
import { redactAccounts } from '../src/dataapi/accountFields.js';
import { seesAllHomeGroupContacts, redactHomeGroupMembers } from '../src/dataapi/homeGroupContacts.js';
import { realtimeRedactor } from '../src/realtime/redact.js';
import { buildQuery } from '../src/dataapi/querybuilder.js';
import { REGISTRY } from '../src/dataapi/registry.js';

const resolverOf = (caps = []) => ({
  can: (c) => caps.includes(c),
  fieldReadable: () => true,
});

const member = prayerViewer({ isAdmin: false, resolver: resolverOf([]), email: 'Ja@K.pl' });
const leader = prayerViewer({ isAdmin: false, resolver: resolverOf(['tab:prayer:leaders_requests']), email: 'lider@k.pl' });
const admin = prayerViewer({ isAdmin: true, resolver: null, email: 'a@k.pl' });

test('prośby: członek nie widzi cudzych „tylko dla liderów” (SQL), lider i admin — tak', () => {
  const q = { table: 'prayer_requests', op: 'select', select: '*', filters: [], __ownerScope: prayerScope('prayer_requests', member) };
  const { sql, params } = buildQuery(q);
  assert.match(sql, /"visibility" IS DISTINCT FROM 'leaders_only' OR lower\(t\."user_email"\) = \$1/);
  assert.deepEqual(params, ['ja@k.pl']);
  const view = buildQuery({ table: 'prayer_requests_with_counts', op: 'select', select: '*', filters: [], __ownerScope: prayerScope('prayer_requests_with_counts', member) });
  assert.match(view.sql, /EXISTS \(SELECT 1 FROM prayer_requests pr_own WHERE pr_own\.id = t\."id"/);
  assert.equal(prayerScope('prayer_requests', leader).select, null, 'lider widzi leaders_only');
  assert.equal(typeof prayerScope('prayer_requests', leader).update, 'function', 'ale zmienia tylko swoje');
  assert.equal(prayerScope('prayer_requests', admin), null);
});

test('prośby: anonimowa bez danych autora (poza autorem i adminem); realtime gubi cudze leaders_only', () => {
  const rows = [
    { id: 1, is_anonymous: true, user_name: 'Anna', user_email: 'anna@k.pl', user_id: 'u-a', requester_name: 'A', visibility: 'public' },
    { id: 2, is_anonymous: true, user_name: 'Ja', user_email: 'ja@k.pl', visibility: 'public' },
    { id: 3, is_anonymous: false, user_name: 'Piotr', user_email: 'p@k.pl', visibility: 'leaders_only' },
  ];
  const out = redactPrayerRows(rows, member);
  assert.deepEqual([out[0].user_name, out[0].user_email, out[0].user_id, out[0].requester_name], [null, null, null, null]);
  assert.equal(out[1].user_name, 'Ja', 'własna anonimowa — pełna');
  assert.equal(rows[0].user_name, 'Anna', 'oryginał bez mutacji');
  assert.equal(out.length, 3, '/api/db: leaders_only odfiltrowuje SQL, nie redakcja');
  assert.deepEqual(redactPrayerRows(rows, member, { dropHidden: true }).map((r) => r.id), [1, 2]);
  assert.deepEqual(redactPrayerRows(rows, leader, { dropHidden: true }).map((r) => r.id), [1, 2, 3]);
  assert.equal(redactPrayerRows(rows, admin)[0].user_name, 'Anna');
});

test('prośby: nowa zawsze pod moim kontem, edycja nie przepisuje autora', () => {
  const ins = { table: 'prayer_requests', op: 'insert', values: { content: 'x', user_email: 'ktos@k.pl', user_id: 'obcy' } };
  enforcePrayerWrite(ins, member, 'u-ja');
  assert.deepEqual([ins.values.user_email, ins.values.user_id], ['ja@k.pl', 'u-ja']);
  const upd = { table: 'prayer_requests', op: 'update', values: { content: 'y', user_email: 'ktos@k.pl' } };
  enforcePrayerWrite(upd, leader, 'u-l');
  assert.equal('user_email' in upd.values, false);
  const adm = { table: 'prayer_requests', op: 'insert', values: { user_email: 'ktos@k.pl' } };
  enforcePrayerWrite(adm, admin, 'u-a');
  assert.equal(adm.values.user_email, 'ktos@k.pl');
});

test('app_settings: sekrety nigdy przez /api/db', () => {
  for (const k of ['sso_google_client_secret_enc', 'smtp_password', 'smsapi_token', 'ai_api_key']) assert.equal(isSecretSetting(k), true, k);
  for (const k of ['registration_mode', 'sso_google_client_id', 'module_tabs', 'ui_font']) assert.equal(isSecretSetting(k), false, k);
  const { sql } = buildQuery({ table: 'app_settings', op: 'select', select: '*', filters: [], __ownerScope: settingsSecretScope() });
  assert.match(sql, /t\."key" !~ '\(_secret\|_secret_enc\|_password\|_password_enc\|_token\|_api_key\)\$'/);
});

test('app_users: kolumny kodów i tokenów ukryte; cudzy telefon tylko dla obsługi', () => {
  for (const c of ['password_hash', 'totp_secret', 'totp_backup_codes', 'backup_codes', 'verify_token_hash']) {
    assert.ok(REGISTRY.app_users.hiddenColumns.includes(c), c);
  }
  const rows = () => [
    { id: 'u1', email: 'ja@k.pl', phone: '111', last_login_at: 'x' },
    { id: 'u2', email: 'inny@k.pl', phone: '222', last_login_at: 'y', locked_until: null },
    { email: 'JA@k.pl', phone: '111' },
  ];
  const plain = redactAccounts(rows(), resolverOf([]), { id: 'u1', email: 'ja@k.pl' });
  assert.equal(plain[0].phone, '111');
  assert.equal('phone' in plain[1], false);
  assert.equal('last_login_at' in plain[1], false);
  assert.equal(plain[2].phone, '111', 'własny wiersz rozpoznany po e-mailu');
  assert.equal(redactAccounts(rows(), resolverOf(['module:sms_campaigns']), { id: 'u1' })[1].phone, '222');
  assert.equal(redactAccounts(rows(), null, { id: 'u1' })[1].phone, '222', 'admin');
});

test('grupy domowe: kontakty tylko z moich grup, obsługa grup widzi wszystkie', () => {
  const rows = [
    { id: 1, group_id: 7, full_name: 'A', email: 'a@k.pl', phone: '1' },
    { id: 2, group_id: 8, full_name: 'B', email: 'b@k.pl', phone: '2', user_id: 'u-b' },
    { id: 3, group_id: null, full_name: 'Ja', email: 'JA@k.pl', phone: '3' },
  ];
  redactHomeGroupMembers(rows, { groupIds: new Set(['7']), email: 'ja@k.pl' });
  assert.deepEqual(rows.map((r) => r.phone), ['1', null, '3']);
  assert.equal(rows[1].email, null);
  assert.equal(rows[1].full_name, 'B', 'imię zostaje');
  assert.equal(seesAllHomeGroupContacts(resolverOf([])), false);
  assert.equal(seesAllHomeGroupContacts(resolverOf(['res:home_group_members:update'])), true);
  assert.equal(seesAllHomeGroupContacts(resolverOf(['module:members'])), true);
  assert.equal(seesAllHomeGroupContacts(null), true);
});

test('realtime: te same ograniczenia co /api/db (pola, modlitwy, konta, sekrety, grupy)', () => {
  const user = { id: 'u1', email: 'ja@k.pl' };
  assert.equal(realtimeRedactor({ table: 'prayer_requests', isAdmin: true, resolver: null, user }), null);
  const pr = realtimeRedactor({ table: 'prayer_requests', isAdmin: false, resolver: resolverOf([]), user });
  assert.deepEqual(pr([{ id: 1, visibility: 'leaders_only', user_email: 'x@k.pl' }, { id: 2, visibility: 'public' }]).map((r) => r.id), [2]);
  const st = realtimeRedactor({ table: 'app_settings', isAdmin: false, resolver: resolverOf([]), user });
  assert.deepEqual(st([{ key: 'sso_google_client_secret_enc' }, { key: 'ui_font' }]).map((r) => r.key), ['ui_font']);
  const acc = realtimeRedactor({ table: 'app_users', isAdmin: false, resolver: resolverOf([]), user });
  const input = [{ id: 'u2', email: 'b@k.pl', phone: '2' }];
  assert.equal('phone' in acc(input)[0], false);
  assert.equal(input[0].phone, '2', 'bez mutacji wspólnego wiersza (inni odbiorcy)');
  const hg = realtimeRedactor({ table: 'home_group_members', isAdmin: false, resolver: resolverOf([]), user });
  assert.equal(hg([{ id: 1, email: 'b@k.pl', phone: '2' }])[0].phone, null);
  const fields = realtimeRedactor({
    table: 'members', isAdmin: false, user,
    resolver: { can: () => true, fieldReadable: (_t, c) => c !== 'phone' },
  });
  assert.equal('phone' in fields([{ id: 1, phone: '5', first_name: 'X' }])[0], false);
  assert.equal(realtimeRedactor({ table: 'events', isAdmin: false, resolver: resolverOf([]), user }), null);
});
