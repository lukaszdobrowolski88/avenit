// Grafik (audyt 2026-10, FUNC-04/FUNC-12): klient wysyła tylko RÓŻNICĘ (diffAssignmentOps),
// serwer nakłada ją na AKTUALNY stan (applyOps) — równoległa praca innej służby nie znika.
// Plus: treść maila z zaproszeniem jest escapowana (nazwy/tytuły wpisują użytkownicy).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOps, validateOps } from '../src/fn/event-assignments-patch.js';
import { diffAssignmentOps } from '../../../src/lib/scheduleBridge.js';
import { escapeHtml, emailHtml } from '../src/fn/send-assignment-invites.js';

test('różnica z UI nałożona na świeższy stan serwera nie kasuje cudzych przypisań', () => {
  // Lider Uwielbienia otworzył stronę o 18:00 (stan „seen”).
  const seen = { worship: { lider: 'Ania', notatki: '' } };
  // O 18:05 lider Mediów przypisał ludzi (stan na serwerze).
  const server = { worship: { lider: 'Ania', notatki: '' }, media: { kamera: 'Bartek' } };
  // O 18:10 lider Uwielbienia zmienia notatki — wysyła tylko różnicę względem tego, co widział.
  const ops = diffAssignmentOps(seen, { worship: { lider: 'Ania', notatki: 'próba 17:00' } });
  assert.deepEqual(ops, [{ team: 'worship', key: 'notatki', value: 'próba 17:00' }]);
  assert.equal(validateOps(ops), null);
  const after = applyOps(server, ops);
  assert.deepEqual(after.media, { kamera: 'Bartek' });
  assert.equal(after.worship.notatki, 'próba 17:00');
});

test('usunięcie własnej sekcji wysyła op sekcji (key null), który serwer akceptuje', () => {
  const ops = diffAssignmentOps({ sec_1_2: { r_1_2: 'X' }, media: { foto: 'Ola' } }, { media: { foto: 'Ola' } });
  assert.equal(validateOps(ops), null);
  assert.deepEqual(applyOps({ sec_1_2: { r_1_2: 'X' }, media: { foto: 'Ola' }, kids: { osoba: 'Ala' } }, ops),
    { media: { foto: 'Ola' }, kids: { osoba: 'Ala' } });
});

test('mail z zaproszeniem escapuje dane wpisane przez użytkowników', () => {
  assert.equal(escapeHtml('<img src=x onerror=1>"'), '&lt;img src=x onerror=1&gt;&quot;');
  const html = emailHtml({
    assignedByName: '<script>alert(1)</script>', roles: ['<b>Wokal</b>'], programDate: 'niedziela',
    programTitle: 'Nabożeństwo & <i>uwielbienie</i>', acceptUrl: 'https://a.pl/assignment-response?token=1&action=accept',
    rejectUrl: 'https://a.pl/assignment-response?token=1&action=reject', contextLabel: 'Wydarzenie',
  });
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<b>Wokal</b>'));
  assert.ok(html.includes('&lt;b&gt;Wokal&lt;/b&gt;'));
  assert.ok(html.includes('Nabożeństwo &amp; &lt;i&gt;'));
  assert.ok(html.includes('token=1&amp;action=accept'));
});

// ── Odpowiedź na zaproszenie (mail i aplikacja): jedna semantyka, atomowo ──
import { rejectOps, respondToAssignments } from '../src/public/routes.js';

// Atrapa puli pg: zapamiętuje zapytania i odpowiada wg treści SQL.
function fakeDb({ updatedRows = [], event = null }) {
  const log = [];
  const client = {
    async query(sql, params) {
      log.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      if (/^UPDATE schedule_assignments/.test(sql.trim())) return { rows: updatedRows };
      if (/FROM events WHERE id::text = \$1 FOR UPDATE/.test(sql)) return { rows: event ? [event] : [] };
      if (/^UPDATE events/.test(sql.trim())) return { rows: [{ id: params[0], assignments: JSON.parse(params[1]) }] };
      return { rows: [] };
    },
    release() { log.push({ sql: 'RELEASE' }); },
  };
  return { log, db: { connect: async () => client } };
}

test('rejectOps zdejmuje osobę tylko z jej pól', () => {
  const asg = { worship: { lider: 'Ania, Jan', piano: 'Ola' }, media: { foto: 'Jan' } };
  assert.deepEqual(rejectOps(asg, [
    { team_type: 'worship', role_key: 'lider', assigned_name: 'Jan' },
    { team_type: 'worship', role_key: 'piano', assigned_name: 'Jan' }, // tu go nie ma
  ]), [{ team: 'worship', key: 'lider', value: 'Ania' }]);
});

test('odrzucenie: status z pending + zdjęcie z grafiku w jednej transakcji, cudze służby zostają', async () => {
  const { db, log } = fakeDb({
    updatedRows: [{ id: 'a1', event_id: 7, program_id: null, team_type: 'worship', role_key: 'lider', assigned_name: 'Jan' }],
    event: { id: 7, assignments: { worship: { lider: 'Ania, Jan' }, media: { foto: 'Bartek' } } },
  });
  const res = await respondToAssignments(db, { action: 'reject', whereSql: 'token = $2', params: ['t'] });
  assert.equal(res.status, 'rejected');
  assert.equal(res.updated, 1);
  assert.deepEqual(res.events[0].assignments, { worship: { lider: 'Ania' }, media: { foto: 'Bartek' } });
  const sqls = log.map((l) => l.sql);
  assert.equal(sqls[0], 'BEGIN');
  assert.ok(sqls[1].includes("status = 'pending'") && sqls[1].includes('RETURNING'));
  assert.ok(sqls.some((s) => s.includes('FOR UPDATE')));
  assert.equal(sqls.at(-2), 'COMMIT');
});

test('już odpowiedziano (0 zmienionych wierszy) → grafik nietknięty', async () => {
  const { db, log } = fakeDb({ updatedRows: [], event: { id: 7, assignments: { worship: { lider: 'Jan' } } } });
  const res = await respondToAssignments(db, { action: 'reject', whereSql: 'token = $2', params: ['t'] });
  assert.equal(res.updated, 0);
  assert.ok(!log.some((l) => /events/.test(l.sql)));
  assert.ok(log.some((l) => l.sql === 'ROLLBACK'));
});

test('akceptacja nie rusza grafiku', async () => {
  const { db, log } = fakeDb({
    updatedRows: [{ id: 'a1', event_id: 7, team_type: 'worship', role_key: 'lider', assigned_name: 'Jan' }],
    event: { id: 7, assignments: { worship: { lider: 'Jan' } } },
  });
  const res = await respondToAssignments(db, { action: 'accept', whereSql: 'token = $2', params: ['t'] });
  assert.equal(res.status, 'accepted');
  assert.ok(!log.some((l) => /events/.test(l.sql)));
});
