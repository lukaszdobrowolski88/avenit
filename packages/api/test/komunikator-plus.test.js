// Komunikator+ — logika serwera: polityka 1:1 i niepełnoletni (K9), blokady i zgłoszenia (K10),
// @wszyscy (K5), ankiety (K7), wyciszenie i ciche godziny (K4), SSRF podglądu linków (K2),
// podpis załączników (K1), skład kanałów (K8), tłumaczenie (K3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dmDecision, isMinorBirthDate, resolveMinor, resolveHouseholds, parseChatSettings, pollOf, pollClosed,
  redactVotes, assertVoteFilters, mentionsAll, normalizeBlockWrite, enforceReportWrite, reportScope,
} from '../src/dataapi/komunikatorPlus.js';
import { enforceConversationWrite } from '../src/dataapi/komunikator.js';
import { pushKind, isQuietNow, localMinutes } from '../src/realtime/push-hooks.js';
import {
  isBlockedAddress, normalizePreviewUrl, resolvePublicAddress, fetchLimited, parsePreview, decodeEntities,
} from '../src/fn/link-preview.js';
import { cleanRelPath, normalizeSignPath, conversationIdFromPath, isPublicMessengerPath, safeJoin } from '../src/storage/routes.js';
import {
  buildRoster, diffRoster, isLeaderRow, isInactiveRow, homeGroupEntries, hgLeaderEntries, customKeyFromTable,
} from '../src/fn/chat-channels-sync.js';
import { directScope } from '../src/fn/chat-policy.js';
import { parseTranslation } from '../src/fn/translate-message.js';

// Fałszywa baza: pierwszy pasujący fragment SQL odpowiada; zapisuje wszystkie zapytania.
function fakeDb(handlers) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      for (const [frag, fn] of handlers) if (sql.includes(frag)) return { rows: fn(params) };
      return { rows: [] };
    },
  };
}
const req = (db, email = 'jan@kosciol.pl') => ({ user: { email }, db, tenant: { slug: 't', db_name: 't' } });
const rejectsWith = (p, status, code) => assert.rejects(p, (e) => e.status === status && (!code || e.code === code));
const NOW = new Date('2026-10-07T12:00:00Z');

// ── K9: polityka rozmów prywatnych ──────────────────────────────────────────
test('K9: ustawienia — domyślnie wszyscy, ochrona niepełnoletnich włączona, pliki publiczne', () => {
  assert.deepEqual(parseChatSettings({}), { dm: 'all', protectMinors: true, privateFiles: false });
  assert.deepEqual(parseChatSettings({ chat_dm_policy: '"leaders"', chat_protect_minors: 'off', chat_private_files: 'on' }),
    { dm: 'leaders', protectMinors: false, privateFiles: true });
  assert.equal(parseChatSettings({ chat_dm_policy: 'bzdura' }).dm, 'all');
});

test('K9: decyzja o rozmowie 1:1 (all / leaders / off / niepełnoletni / rodzina)', () => {
  const adult = { isLeader: false, isMinor: false, households: ['1'] };
  const leader = { isLeader: true, isMinor: false, households: [] };
  const minor = { isLeader: false, isMinor: true, households: ['7'] };
  const parent = { isLeader: false, isMinor: false, households: ['7'] };
  assert.deepEqual(dmDecision({ dm: 'all', protectMinors: true }, adult, adult), { ok: true });
  assert.deepEqual(dmDecision({ dm: 'off', protectMinors: false }, leader, leader), { ok: false, reason: 'off' });
  assert.deepEqual(dmDecision({ dm: 'leaders', protectMinors: false }, adult, adult), { ok: false, reason: 'leaders' });
  assert.deepEqual(dmDecision({ dm: 'leaders', protectMinors: false }, adult, leader), { ok: true });
  assert.deepEqual(dmDecision({ dm: 'all', protectMinors: true }, adult, minor), { ok: false, reason: 'minors' });
  assert.deepEqual(dmDecision({ dm: 'all', protectMinors: true }, leader, minor), { ok: false, reason: 'minors' }); // lider też nie
  assert.deepEqual(dmDecision({ dm: 'all', protectMinors: true }, minor, { ...minor, households: [] }), { ok: true }); // dwoje nieletnich
  assert.deepEqual(dmDecision({ dm: 'all', protectMinors: true }, parent, minor), { ok: true }); // wspólne gospodarstwo
  assert.deepEqual(dmDecision({ dm: 'all', protectMinors: false }, adult, minor), { ok: true });
});

test('K9: niepełnoletni — 18. urodziny, kartoteka konta ma pierwszeństwo, wspólny e-mail rodziny', () => {
  assert.equal(isMinorBirthDate('2008-10-08', new Date(2026, 9, 7)), true); // jutro 18 lat
  assert.equal(isMinorBirthDate('2008-10-07', new Date(2026, 9, 7)), false); // dziś 18 lat
  assert.equal(isMinorBirthDate(new Date(2015, 0, 1), NOW), true);
  assert.equal(isMinorBirthDate(null, NOW), false);
  assert.equal(isMinorBirthDate('nie-data', NOW), false);
  const kid = { birth_date: '2015-01-01', household_id: 7 };
  const mom = { birth_date: '1980-01-01', household_id: 7 };
  assert.equal(resolveMinor([kid, mom], NOW), false); // wspólny adres — dorosły nie traci pisania
  assert.equal(resolveMinor([kid], NOW), true);
  assert.equal(resolveMinor([{ ...kid, linked: true }, mom], NOW), true); // konto powiązane z kartoteką dziecka
  assert.equal(resolveMinor([{ birth_date: null }], NOW), false);
  assert.deepEqual(resolveHouseholds([{ ...kid, linked: true }, { household_id: 9 }]), ['7']);
});

const directDb = ({ minors = [], blocked = false, settings = [], existingDirect = false } = {}) => fakeDb([
  ['FROM conversations c', (p) => [{ id: p[0], type: 'direct', n: 0, created_by: 'jan@kosciol.pl' }]],
  ['FROM conversations d', () => (existingDirect ? [{ id: 'old' }] : [])],
  ['FROM user_blocks', () => (blocked ? [{ '?column?': 1 }] : [])],
  ['FROM app_settings', () => settings],
  ['FROM app_users u JOIN members', () => []],
  ['FROM members WHERE', (p) => p[0].filter((e) => minors.includes(e)).map((e) => ({ e, birth_date: '2014-05-05', household_id: null, linked: false }))],
]);
const directInsert = (convId, other) => ({ table: 'conversation_participants', op: 'insert', values: [
  { conversation_id: convId, user_email: 'jan@kosciol.pl', role: 'admin' },
  { conversation_id: convId, user_email: other, role: 'admin' },
] });

test('K9: nowa rozmowa 1:1 dorosły ↔ niepełnoletni — 403 DM_NOT_ALLOWED, pusta rozmowa sprzątnięta', async () => {
  const db = directDb({ minors: ['kid@kosciol.pl'] });
  await rejectsWith(enforceConversationWrite(directInsert('n1', 'kid@kosciol.pl'), req(db)), 403, 'DM_NOT_ALLOWED');
  assert.ok(db.calls.some((c) => c.sql.includes('DELETE FROM conversations e') && c.params[0] === 'n1'));
  // dorosły ↔ dorosły — przechodzi
  const ok = directDb();
  const q = directInsert('n2', 'ola@kosciol.pl');
  await enforceConversationWrite(q, req(ok));
  assert.equal(q.op, 'upsert');
});

test('K9: polityka „off” blokuje nowe 1:1, a „leaders” wymaga lidera po jednej stronie', async () => {
  await rejectsWith(enforceConversationWrite(directInsert('n3', 'ola@kosciol.pl'), req(directDb({ settings: [{ key: 'chat_dm_policy', value: 'off' }] }))), 403, 'DM_NOT_ALLOWED');
  await rejectsWith(enforceConversationWrite(directInsert('n4', 'ola@kosciol.pl'), req(directDb({ settings: [{ key: 'chat_dm_policy', value: 'leaders' }] }))), 403, 'DM_NOT_ALLOWED');
});

test('K9: rozmowa prywatna ma najwyżej dwie osoby', async () => {
  const db = fakeDb([
    ['FROM conversations c', () => [{ id: 'd1', type: 'direct', n: 2, created_by: 'jan@kosciol.pl' }]],
    ['SELECT role FROM conversation_participants', () => [{ role: 'admin' }]],
    ['SELECT DISTINCT lower(user_email) AS e FROM conversation_participants', () => [{ e: 'jan@kosciol.pl' }, { e: 'ola@kosciol.pl' }]],
  ]);
  await rejectsWith(enforceConversationWrite({ table: 'conversation_participants', op: 'insert', values: { conversation_id: 'd1', user_email: 'trzeci@kosciol.pl' } }, req(db)), 403);
});

// ── K10: blokady ────────────────────────────────────────────────────────────
test('K10: wiadomość 1:1 od zablokowanej osoby — 403 BLOCKED; nowa rozmowa z blokującym też', async () => {
  const msgDb = (blocked) => fakeDb([
    ['FROM conversations c', () => [{ id: 'd1', type: 'direct', posting_policy: 'everyone', n: 2 }]],
    ['SELECT role FROM conversation_participants', () => [{ role: 'admin' }]],
    ['SELECT DISTINCT lower(user_email) AS e FROM conversation_participants', () => [{ e: 'jan@kosciol.pl' }, { e: 'ola@kosciol.pl' }]],
    ['FROM user_blocks', (p) => (blocked && p[0] === 'ola@kosciol.pl' && p[1] === 'jan@kosciol.pl' ? [{ x: 1 }] : [])],
  ]);
  await rejectsWith(enforceConversationWrite({ table: 'messages', op: 'insert', values: { conversation_id: 'd1', content: 'hej' } }, req(msgDb(true))), 403, 'BLOCKED');
  const q = { table: 'messages', op: 'insert', values: { conversation_id: 'd1', content: 'hej' } };
  await enforceConversationWrite(q, req(msgDb(false)));
  assert.equal(q.values.sender_email, 'jan@kosciol.pl');
  await rejectsWith(enforceConversationWrite(directInsert('n5', 'ola@kosciol.pl'), req(directDb({ blocked: true }))), 403, 'BLOCKED');
});

test('K10: blokada — małe litery, nie siebie, ponowna blokada bez błędu (upsert)', () => {
  const q = { table: 'user_blocks', op: 'insert', values: { blocked_email: ' Ola@Kosciol.PL ', blocker_email: 'JAN@kosciol.pl', extra: 1 } };
  normalizeBlockWrite(q, { email: 'Jan@Kosciol.pl' });
  assert.equal(q.op, 'upsert');
  assert.equal(q.onConflict, 'blocker_email,blocked_email');
  assert.equal(q.values.blocker_email, 'jan@kosciol.pl');
  assert.equal(q.values.blocked_email, 'ola@kosciol.pl');
  assert.ok(!('extra' in q.values));
  assert.throws(() => normalizeBlockWrite({ table: 'user_blocks', op: 'insert', values: { blocked_email: 'jan@kosciol.pl' } }, { email: 'Jan@Kosciol.pl' }), (e) => e.status === 400);
  assert.throws(() => normalizeBlockWrite({ table: 'user_blocks', op: 'insert', values: { blocked_email: 'a@b.pl', blocker_email: 'inny@x.pl' } }, { email: 'jan@kosciol.pl' }), (e) => e.status === 403);
});

// ── K10: zgłoszenia ─────────────────────────────────────────────────────────
test('K10: zgłoszenie — uczestnik rozmowy, serwer uzupełnia rozmowę i treść, status zawsze „open”', async () => {
  const db = fakeDb([
    ['FROM messages m WHERE', () => [{ id: 'm1', conversation_id: 'c1', sender_email: 'ola@kosciol.pl', content: 'treść', member: true }]],
    ['FROM message_reports', () => []],
  ]);
  const q = { table: 'message_reports', op: 'insert', values: { message_id: 'm1', reason: '  spam  ', status: 'resolved', resolved_by: 'x' } };
  await enforceReportWrite(q, req(db), false);
  assert.deepEqual(q.values, {
    message_id: 'm1', reason: 'spam', reporter_email: 'jan@kosciol.pl', conversation_id: 'c1', status: 'open',
    message_sender_email: 'ola@kosciol.pl', message_content: 'treść',
  });
});

test('K10: zgłoszenie spoza rozmowy, własnej wiadomości i podwójne — odrzucone', async () => {
  const msg = (over) => ['FROM messages m WHERE', () => [{ id: 'm1', conversation_id: 'c1', sender_email: 'ola@kosciol.pl', content: 'x', member: true, ...over }]];
  await rejectsWith(enforceReportWrite({ table: 'message_reports', op: 'insert', values: { message_id: 'm1' } }, req(fakeDb([msg({ member: false })])), false), 403);
  await rejectsWith(enforceReportWrite({ table: 'message_reports', op: 'insert', values: { message_id: 'm1' } }, req(fakeDb([msg({ sender_email: 'jan@kosciol.pl' })])), false), 400);
  await rejectsWith(enforceReportWrite({ table: 'message_reports', op: 'insert', values: { message_id: 'm1' } }, req(fakeDb([msg({}), ['FROM message_reports', () => [{ x: 1 }]]])), false), 409, 'ALREADY_REPORTED');
});

test('K10: rozstrzyga tylko moderator; resolved_by/at ustawia serwer; zakres odczytu', async () => {
  await rejectsWith(enforceReportWrite({ table: 'message_reports', op: 'update', values: { status: 'resolved' } }, req(fakeDb([])), false), 403);
  await rejectsWith(enforceReportWrite({ table: 'message_reports', op: 'delete' }, req(fakeDb([])), false), 403);
  const q = { table: 'message_reports', op: 'update', values: { status: 'resolved', resolved_by: 'ktos@x.pl' } };
  await enforceReportWrite(q, req(fakeDb([]), 'Mod@Kosciol.pl'), true);
  assert.equal(q.values.resolved_by, 'Mod@Kosciol.pl');
  assert.ok(Date.parse(q.values.resolved_at));
  const reopen = { table: 'message_reports', op: 'update', values: { status: 'open' } };
  await enforceReportWrite(reopen, req(fakeDb([])), true);
  assert.equal(reopen.values.resolved_at, null);
  await rejectsWith(enforceReportWrite({ table: 'message_reports', op: 'update', values: { reason: 'zmiana' } }, req(fakeDb([])), true), 403);
  assert.equal(reportScope({ email: 'm@x.pl' }, true), null);
  const params = [];
  assert.match(reportScope({ email: 'Jan@X.pl' }, false).select('t', (v) => { params.push(v); return params.length; }), /reporter_email/);
  assert.deepEqual(params, ['jan@x.pl']);
});

// ── K5: @wszyscy ────────────────────────────────────────────────────────────
const groupDb = (role, type = 'group', admin = false) => fakeDb([
  ['FROM conversations c', () => [{ id: 'g1', type, posting_policy: 'everyone', n: 5 }]],
  ['SELECT role FROM conversation_participants', () => [{ role }]],
  ['FROM app_users u WHERE', () => (admin ? [{ e: 'jan@kosciol.pl', is_super_admin: true, role: 'superadmin' }] : [])],
]);
test('K5: @wszyscy — tylko administrator rozmowy; w kanale służby także admin aplikacji', async () => {
  assert.equal(mentionsAll(['*']), true);
  assert.equal(mentionsAll('["a@b.pl"]'), false);
  const msg = () => ({ table: 'messages', op: 'insert', values: { conversation_id: 'g1', content: 'x', mentions: ['*'] } });
  await rejectsWith(enforceConversationWrite(msg(), req(groupDb('member'))), 403, 'MENTION_ALL_FORBIDDEN');
  await enforceConversationWrite(msg(), req(groupDb('admin')));
  await rejectsWith(enforceConversationWrite(msg(), req(groupDb('member', 'group', true))), 403, 'MENTION_ALL_FORBIDDEN'); // grupa: admin aplikacji nie wystarcza
  await enforceConversationWrite(msg(), req(groupDb('member', 'ministry', true))); // kanał służby: admin aplikacji tak
  // zwykła wzmianka osobista — każdy
  await enforceConversationWrite({ table: 'messages', op: 'insert', values: { conversation_id: 'g1', content: 'x', mentions: ['ola@x.pl'] } }, req(groupDb('member')));
});

test('K5: dopisanie @wszyscy przy edycji — te same zasady', async () => {
  const db = fakeDb([
    ['SELECT conversation_id FROM messages', () => [{ conversation_id: 'g1' }]],
    ['FROM conversations c', () => [{ id: 'g1', type: 'group', n: 3 }]],
    ['SELECT role FROM conversation_participants', () => [{ role: 'member' }]],
  ]);
  await rejectsWith(enforceConversationWrite({ table: 'messages', op: 'update', values: { content: 'x', mentions: ['*'] }, filters: [{ type: 'eq', column: 'id', value: 'm1' }] }, req(db)), 403, 'MENTION_ALL_FORBIDDEN');
});

// ── K7: ankiety ─────────────────────────────────────────────────────────────
test('K7: kształt ankiety — metadata.poll (kontrakt) i płaski (starsze ankiety); zamknięcie', () => {
  assert.deepEqual(pollOf({ poll: { question: 'Q', options: [{ id: 'a' }], multiple: true, anonymous: true, closes_at: '2026-10-01T10:00:00Z' } }),
    { multiple: true, anonymous: true, closesAt: '2026-10-01T10:00:00Z', options: [{ id: 'a' }] });
  assert.deepEqual(pollOf('{"question":"Q","options":[],"multiple":false}'), { multiple: false, anonymous: false, closesAt: null, options: [] });
  assert.equal(pollClosed({ closesAt: '2026-10-07T11:59:00Z' }, NOW.getTime()), true);
  assert.equal(pollClosed({ closesAt: '2026-10-07T12:01:00Z' }, NOW.getTime()), false);
  assert.equal(pollClosed({ closesAt: null }, NOW.getTime()), false);
});

const pollDb = (meta) => fakeDb([
  ['SELECT conversation_id FROM messages', () => [{ conversation_id: 'c1' }]],
  ['SELECT role FROM conversation_participants', () => [{ role: 'member' }]],
  ['SELECT id, message_type, metadata FROM messages', () => [{ id: 'p1', message_type: 'poll', metadata: meta }]],
  ['DELETE FROM poll_votes', () => [{ id: 'v-old', message_id: 'p1', option_id: 'a', user_email: 'jan@kosciol.pl' }]],
]);
test('K7: głos po zamknięciu — 403; jednokrotny wybór — serwer usuwa poprzedni głos; wielokrotny — nie', async () => {
  const vote = (opt = 'b') => ({ table: 'poll_votes', op: 'insert', values: { message_id: 'p1', option_id: opt } });
  await rejectsWith(enforceConversationWrite(vote(), req(pollDb({ poll: { options: [{ id: 'a' }, { id: 'b' }], closes_at: '2020-01-01T00:00:00Z' } }))), 403, 'POLL_CLOSED');
  const single = pollDb({ poll: { options: [{ id: 'a' }, { id: 'b' }], multiple: false } });
  const q = vote();
  await enforceConversationWrite(q, req(single));
  assert.equal(q.values.user_email, 'jan@kosciol.pl');
  const del = single.calls.find((c) => c.sql.includes('DELETE FROM poll_votes'));
  assert.deepEqual(del.params, ['p1', 'jan@kosciol.pl', 'b']);
  const multi = pollDb({ options: [{ id: 'a' }, { id: 'b' }], multiple: true }); // płaski kształt
  await enforceConversationWrite(vote(), req(multi));
  assert.ok(!multi.calls.some((c) => c.sql.includes('DELETE FROM poll_votes')));
  await rejectsWith(enforceConversationWrite(vote('zz'), req(pollDb({ poll: { options: [{ id: 'a' }] } }))), 400);
});

test('K7: ankieta anonimowa — e-mail tylko we własnych głosach; filtr po cudzym e-mailu odrzucony', () => {
  const rows = [
    { id: 1, message_id: 'p1', option_id: 'a', user_email: 'Jan@kosciol.pl' },
    { id: 2, message_id: 'p1', option_id: 'b', user_email: 'ola@kosciol.pl' },
    { id: 3, message_id: 'p2', option_id: 'a', user_email: 'ola@kosciol.pl' },
    { id: 4, option_id: 'a', user_email: 'ola@kosciol.pl' }, // bez message_id — bezpiecznie wymazany
    { id: 5, message_id: 'p1' }, // bez kolumny e-mail — bez zmian
  ];
  const out = redactVotes(rows, new Set(['p1']), 'jan@kosciol.pl');
  assert.deepEqual(out.map((r) => r.user_email), ['Jan@kosciol.pl', null, 'ola@kosciol.pl', null, undefined]);
  assert.doesNotThrow(() => assertVoteFilters([{ type: 'in', column: 'message_id', value: ['p1'] }, { type: 'ilike', column: 'user_email', value: 'JAN@kosciol.pl' }], 'jan@kosciol.pl'));
  assert.doesNotThrow(() => assertVoteFilters([{ type: 'ilike', column: 'user_email', value: 'jan\\_kowal@kosciol.pl' }], 'jan_kowal@kosciol.pl'));
  assert.throws(() => assertVoteFilters([{ type: 'eq', column: 'user_email', value: 'ola@kosciol.pl' }], 'jan@kosciol.pl'), (e) => e.status === 403);
  assert.throws(() => assertVoteFilters([{ type: 'neq', column: 'user_email', value: 'jan@kosciol.pl' }], 'jan@kosciol.pl'), (e) => e.status === 403);
  assert.throws(() => assertVoteFilters([{ type: 'or', value: 'user_email.eq.ola@kosciol.pl' }], 'jan@kosciol.pl'), (e) => e.status === 403);
});

// ── K4: wyciszenie i ciche godziny ──────────────────────────────────────────
test('K4: rodzaj powiadomienia — wyciszenie, wyciszenie na czas, cisza, @wzmianka osobista, @wszyscy', () => {
  const base = { muted: false, mutedUntil: null, quiet: false, personalMention: false, allMention: false, now: NOW };
  assert.equal(pushKind(base), 'message');
  assert.equal(pushKind({ ...base, muted: true }), null);
  assert.equal(pushKind({ ...base, mutedUntil: '2026-10-07T13:00:00Z' }), null);
  assert.equal(pushKind({ ...base, mutedUntil: new Date('2026-10-07T11:00:00Z') }), 'message'); // wyciszenie minęło
  assert.equal(pushKind({ ...base, quiet: true }), null);
  assert.equal(pushKind({ ...base, muted: true, quiet: true, personalMention: true }), 'mention');
  assert.equal(pushKind({ ...base, muted: true, allMention: true }), 'mention'); // @wszyscy mimo wyciszenia
  assert.equal(pushKind({ ...base, quiet: true, allMention: true }), null); // ale nie w ciszy
});

test('K4: ciche godziny w strefie odbiorcy (przez północ, od == do, błędna strefa)', () => {
  const at = (iso) => new Date(iso);
  assert.equal(localMinutes(at('2026-10-07T21:30:00Z'), 'Europe/Warsaw'), 23 * 60 + 30); // CEST +2
  assert.equal(isQuietNow({ start: '22:00:00', end: '07:00:00', timezone: 'Europe/Warsaw' }, at('2026-10-07T21:30:00Z')), true);
  assert.equal(isQuietNow({ start: '22:00', end: '07:00', timezone: 'Europe/Warsaw' }, at('2026-10-08T04:59:00Z')), true); // 06:59
  assert.equal(isQuietNow({ start: '22:00', end: '07:00', timezone: 'Europe/Warsaw' }, at('2026-10-08T05:00:00Z')), false); // 07:00
  assert.equal(isQuietNow({ start: '13:00', end: '15:00', timezone: 'America/New_York' }, at('2026-10-07T18:00:00Z')), true); // 14:00 NY
  assert.equal(isQuietNow({ start: '22:00', end: '22:00' }, at('2026-10-07T20:30:00Z')), false);
  assert.equal(isQuietNow({ start: null, end: '07:00' }, NOW), false);
  assert.equal(isQuietNow({ start: '22:00', end: '07:00', timezone: 'Nie/Ma' }, at('2026-10-07T21:30:00Z')), true); // fallback Warszawa
});

// ── K2: SSRF w podglądzie linków ────────────────────────────────────────────
test('K2: adresy prywatne/zastrzeżone zablokowane, publiczne przepuszczone', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1',
    '0.0.0.0', '224.0.0.1', '255.255.255.255', '::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', '::ffff:127.0.0.1',
    '::ffff:7f00:1', '64:ff9b::a00:1', '2002:c0a8:101::1', 'ff02::1', 'nie-ip']) {
    assert.equal(isBlockedAddress(ip), true, ip);
  }
  for (const ip of ['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) {
    assert.equal(isBlockedAddress(ip), false, ip);
  }
});

test('K2: normalizacja adresu — tylko http(s), bez localhost, nazw wewnętrznych, portów i loginu', () => {
  assert.equal(normalizePreviewUrl('www.kosciol.pl/a#x'), 'https://www.kosciol.pl/a');
  assert.equal(normalizePreviewUrl('https://kosciol.pl:443/x'), 'https://kosciol.pl/x');
  for (const bad of ['ftp://kosciol.pl', 'javascript:alert(1)', 'file:///etc/passwd', 'http://localhost/', 'http://localhost./',
    'http://api/health', 'http://postgres:5432/', 'https://kosciol.pl:22/', 'https://user:pw@kosciol.pl/', 'http://127.0.0.1/',
    'http://2130706433/', 'http://0x7f.1/', 'http://[::1]/', 'http://[::ffff:169.254.169.254]/', 'http://router.local/', 'http://x.internal/', '']) {
    assert.equal(normalizePreviewUrl(bad), null, bad);
  }
});

test('K2: DNS — każdy adres musi być publiczny (ochrona przed rebindingiem i wieloma rekordami)', async () => {
  const lookup = (map) => async (host) => map[host] || [];
  assert.deepEqual(await resolvePublicAddress('ok.pl', lookup({ 'ok.pl': [{ address: '93.184.216.34', family: 4 }] })), { address: '93.184.216.34', family: 4 });
  assert.equal(await resolvePublicAddress('mix.pl', lookup({ 'mix.pl': [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.5', family: 4 }] })), null);
  assert.equal(await resolvePublicAddress('meta.pl', lookup({ 'meta.pl': [{ address: '169.254.169.254', family: 4 }] })), null);
  assert.equal(await resolvePublicAddress('brak.pl', lookup({})), null);
  // fetchLimited: host wskazujący na sieć wewnętrzną — brak połączenia (null), bez wyjątku
  assert.equal(await fetchLimited('https://wewnetrzny.pl/', { lookup: lookup({ 'wewnetrzny.pl': [{ address: '127.0.0.1', family: 4 }] }) }), null);
  assert.equal(await fetchLimited('http://127.0.0.1:8080/'), null);
});

test('K2: parsowanie podglądu — og:*, encje, względny obrazek, brak danych = null', () => {
  const html = `<html><head><meta charset="utf-8"><title>Tytuł &amp; strona</title>
    <meta property="og:title" content="Nabożeństwo &#8211; niedziela">
    <meta name="description" content="Zapraszamy &quot;wszystkich&quot;">
    <meta property="og:image" content="/img/a.jpg"><meta property="og:site_name" content="Kościół">
    </head><body></body></html>`;
  assert.deepEqual(parsePreview(html, 'https://kosciol.pl/wydarzenia/1'), {
    url: 'https://kosciol.pl/wydarzenia/1', title: 'Nabożeństwo – niedziela', description: 'Zapraszamy "wszystkich"',
    image: 'https://kosciol.pl/img/a.jpg', siteName: 'Kościół',
  });
  assert.equal(parsePreview('<html><body>nic</body></html>', 'https://a.pl/'), null);
  assert.equal(parsePreview('<meta property="og:image" content="javascript:alert(1)"><title>T</title>', 'https://a.pl/').image, null);
  assert.equal(decodeEntities('&lt;b&gt; &#x1F600; &nieznana;'), '<b> 😀 &nieznana;');
});

// ── K1: ścieżka podpisu załącznika ──────────────────────────────────────────
test('K1: ścieżka podpisu — id rozmowy z 1. segmentu, pełny adres, kodowanie, wyjście w górę odrzucone', () => {
  const conv = '5f0c2f4e-1d2a-4b5c-8d9e-0123456789ab';
  assert.equal(normalizeSignPath(`${conv}/123-abc.jpg`), `${conv}/123-abc.jpg`);
  assert.equal(normalizeSignPath(`https://schwro.avenit.pl/storage/messenger-attachments/${conv}/a%20b.jpg?x=1`), `${conv}/a b.jpg`);
  assert.equal(normalizeSignPath(`/storage/messenger-attachments/attachments/x.pdf`), 'attachments/x.pdf');
  assert.equal(normalizeSignPath(`messenger-attachments/${conv}/x.jpg`), `${conv}/x.jpg`);
  assert.equal(normalizeSignPath(`${conv}/../../membership-declarations/d.pdf`), null);
  assert.equal(normalizeSignPath('..%2f..%2fsecret'), null);
  assert.equal(conversationIdFromPath(`${conv}/x.jpg`), conv);
  assert.equal(conversationIdFromPath('attachments/x.jpg'), null);
  assert.equal(conversationIdFromPath('voice-messages/v.webm'), null);
  assert.equal(isPublicMessengerPath('mailing-images/a.png'), true);
  assert.equal(isPublicMessengerPath(cleanRelPath('mailing-images/../attachments/a.png')), false); // obejście prefiksu
  assert.equal(cleanRelPath('/a//b/./c.jpg'), 'a/b/c.jpg');
});

test('K1: pliki nie wychodzą poza katalog bucketu (..%2f w adresie GET)', () => {
  const base = '/srv/storage';
  assert.equal(safeJoin('schwro', 'public-assets', 'a/b.png', base), '/srv/storage/schwro/public-assets/a/b.png');
  assert.throws(() => safeJoin('schwro', 'public-assets', '../membership-declarations/x.pdf', base), (e) => e.status === 400);
  assert.throws(() => safeJoin('schwro', 'public-assets', '../../inny/public-assets/x.png', base), (e) => e.status === 400);
  assert.equal(safeJoin('schwro', 'materials', '', base), '/srv/storage/schwro/materials');
});

// ── K8: skład kanałów ───────────────────────────────────────────────────────
test('K8: skład — tylko osoby z kontem, lider = admin (wygrywa przy powtórce), e-maile bez wielkości liter', () => {
  const accounts = new Map([
    ['ola@x.pl', { email: 'Ola@x.pl', name: 'Ola' }],
    ['jan@x.pl', { email: 'jan@x.pl', name: 'Jan' }],
  ]);
  const roster = buildRoster([
    { email: 'OLA@x.pl', leader: false }, { email: 'ola@x.pl', leader: true },
    { email: 'jan@x.pl', leader: false }, { email: 'bez-konta@x.pl', leader: true }, { email: '' },
  ], accounts);
  assert.deepEqual([...roster.entries()], [
    ['ola@x.pl', { email: 'Ola@x.pl', role: 'admin', name: 'Ola' }],
    ['jan@x.pl', { email: 'jan@x.pl', role: 'member', name: 'Jan' }],
  ]);
});

test('K8: różnica składu — dopisz nowych, usuń nieobecnych, popraw role (bez zmian = pusto)', () => {
  const desired = new Map([
    ['ola@x.pl', { email: 'Ola@x.pl', role: 'admin', name: 'Ola' }],
    ['jan@x.pl', { email: 'jan@x.pl', role: 'member', name: 'Jan' }],
    ['ewa@x.pl', { email: 'ewa@x.pl', role: 'member', name: 'Ewa' }],
  ]);
  const current = [
    { user_email: 'OLA@x.pl', role: 'member' }, { user_email: 'jan@x.pl', role: null },
    { user_email: 'pastor@x.pl', role: 'admin' },
  ];
  assert.deepEqual(diffRoster(current, desired), {
    add: [{ email: 'ewa@x.pl', role: 'member', name: 'Ewa' }],
    remove: ['pastor@x.pl'],
    setRole: [{ email: 'ola@x.pl', role: 'admin' }],
  });
  const same = [{ user_email: 'ola@x.pl', role: 'admin' }, { user_email: 'jan@x.pl', role: 'member' }, { user_email: 'ewa@x.pl', role: 'member' }];
  assert.deepEqual(diffRoster(same, desired), { add: [], remove: [], setRole: [] });
  assert.deepEqual(diffRoster(same, new Map()).remove, ['ola@x.pl', 'jan@x.pl', 'ewa@x.pl']);
});

test('K8: lider/nieaktywny w tabelach zespołów; klucz modułu własnego', () => {
  assert.equal(isLeaderRow({ is_leader: true }), true);
  assert.equal(isLeaderRow({ role: 'Lider uwielbienia' }), true);
  assert.equal(isLeaderRow({ role: 'coordinator' }), true);
  assert.equal(isLeaderRow({ role: 'gitara' }), false);
  assert.equal(isInactiveRow({ is_active: false }), true);
  assert.equal(isInactiveRow({ status: 'inactive' }), true);
  assert.equal(isInactiveRow({ status: 'active', is_active: true }), false);
  assert.equal(customKeyFromTable('custom_kobiety_members'), 'kobiety');
  assert.equal(customKeyFromTable('custom_mlodzi_2_members'), 'mlodzi_2');
  assert.equal(customKeyFromTable('custom_kobiety_tasks'), null);
  assert.equal(customKeyFromTable('custom_worship_members'), null); // zastrzeżone klucze wbudowane
});

test('K8: grupa domowa — członkowie (2 źródła), liderzy (rola w grupie, katalog, leader_id); kanał liderów', () => {
  const g = { id: 'g1', leader_id: 'L2' };
  const data = {
    hgm: [{ group_id: 'g1', email: 'jan@x.pl', role: 'leader' }, { group_id: 'g1', email: 'ola@x.pl', role: 'member' }, { group_id: 'g2', email: 'obcy@x.pl' }],
    members: [{ home_group_id: 'g1', email: 'ewa@x.pl' }],
    hgl: [{ id: 'L1', group_id: 'g1', email: 'lider@x.pl', user_email: 'Lider@x.pl' }, { id: 'L2', group_id: null, email: 'drugi@x.pl' }, { id: 'L3', group_id: null, email: 'koord@x.pl', role: 'coordinator' }],
  };
  assert.deepEqual(homeGroupEntries(g, data), [
    { email: 'jan@x.pl', leader: true }, { email: 'ola@x.pl', leader: false }, { email: 'ewa@x.pl', leader: false },
    { email: 'lider@x.pl', leader: true }, { email: 'drugi@x.pl', leader: true },
  ]);
  assert.deepEqual(hgLeaderEntries(data), [
    { email: 'lider@x.pl', leader: false }, { email: 'drugi@x.pl', leader: false }, { email: 'koord@x.pl', leader: true },
    { email: 'jan@x.pl', leader: false },
  ]);
});

// ── chat-policy / tłumaczenie ───────────────────────────────────────────────
test('K9: chat-policy — z kim mogę zaczynać rozmowę 1:1', () => {
  assert.equal(directScope({ dm: 'off', protectMinors: true }, { isLeader: true }), null);
  assert.equal(directScope({ dm: 'leaders', protectMinors: true }, { isLeader: false }), 'leaders');
  assert.equal(directScope({ dm: 'leaders', protectMinors: true }, { isLeader: true, isMinor: false }), 'all');
  assert.equal(directScope({ dm: 'all', protectMinors: true }, { isMinor: true }), 'minors');
  assert.equal(directScope({ dm: 'all', protectMinors: false }, { isMinor: true }), 'all');
});

test('K3: odpowiedź tłumacza — JSON (także w otoczce), bez JSON = cały tekst', () => {
  assert.deepEqual(parseTranslation('{"source_lang":"PL","text":"Hello 👋"}'), { text: 'Hello 👋', source_lang: 'pl' });
  assert.deepEqual(parseTranslation('Oto: ```json\n{"source_lang":"uk","text":"Cześć"}\n```'), { text: 'Cześć', source_lang: 'uk' });
  assert.deepEqual(parseTranslation('Hello there'), { text: 'Hello there', source_lang: 'und' });
  assert.equal(parseTranslation('   '), null);
});
