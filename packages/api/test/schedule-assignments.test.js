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
