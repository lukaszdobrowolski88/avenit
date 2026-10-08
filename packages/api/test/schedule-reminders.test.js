// Grafik: przypomnienia dla potwierdzonych + ponaglenia osób bez odpowiedzi (fn/schedule-reminders.js)
// oraz warianty maila (send-assignment-invites.js: invite / nudge / reminder).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  reminderConfig, groupReminders, groupNudges, teamLabelOf, pushPayload, runForTenant, REMINDER_DEFAULTS,
} from '../src/fn/schedule-reminders.js';
import { emailHtml, emailText, reminderIntro } from '../src/fn/send-assignment-invites.js';

test('config: domyślne przy braku/błędzie, JSON z tekstu, przycięcie zakresów', () => {
  assert.deepEqual(reminderConfig(null), { ...REMINDER_DEFAULTS });
  assert.deepEqual(reminderConfig('{zepsuty'), { ...REMINDER_DEFAULTS });
  assert.deepEqual(reminderConfig([1, 2]), { ...REMINDER_DEFAULTS });
  assert.deepEqual(reminderConfig('{"enabled":false,"days_before":"3","nudge_enabled":false,"nudge_after_days":5}'),
    { enabled: false, days_before: 3, nudge_enabled: false, nudge_after_days: 5 });
  assert.equal(reminderConfig({ days_before: 0 }).days_before, 1);
  assert.equal(reminderConfig({ days_before: 30 }).days_before, 7);
  assert.equal(reminderConfig({ nudge_after_days: 0 }).nudge_after_days, 1);
  assert.equal(reminderConfig({ nudge_after_days: 99 }).nudge_after_days, 14);
  assert.equal(reminderConfig({ days_before: 'abc' }).days_before, 2);
  assert.equal(reminderConfig({ enabled: 'false' }).enabled, false);
  assert.equal(reminderConfig({ enabled: 'cokolwiek' }).enabled, true);
});

const row = (o) => ({
  id: 'a1', event_id: 7, team_type: 'worship', role_key: 'wokale', role_label: null,
  assigned_name: 'Jan Kowalski', assigned_email: 'Jan@x.pl', event_title: 'Nabożeństwo',
  event_date: '2026-10-18', event_time: '10:00:00', event_location: 'Sala A', campus_id: null, days_left: 2, ...o,
});

test('przypomnienia: jedna wiadomość na (wydarzenie, osoba) — role ze wszystkich zespołów', () => {
  const groups = groupReminders([
    row({ id: 'a1' }),
    row({ id: 'a2', team_type: 'media', role_key: 'foto', role_label: 'Fotograf', assigned_email: 'jan@X.pl' }),
    row({ id: 'a3', role_key: 'lider' }),                       // mapa nazw ról (worship)
    row({ id: 'a4', event_id: 8, event_title: 'Próba' }),        // inne wydarzenie
    row({ id: 'a5', assigned_email: 'ala@x.pl', assigned_name: 'Ala' }),
    row({ id: 'a6', assigned_email: '  ' }),                     // bez e-maila — pomijamy
    row({ id: 'a7', event_id: null }),                           // bez wydarzenia — pomijamy
  ]);
  assert.equal(groups.length, 3);
  const jan = groups.find((g) => g.eventId === 7 && g.email.toLowerCase() === 'jan@x.pl');
  assert.deepEqual(jan.ids, ['a1', 'a2', 'a3']);
  assert.deepEqual(jan.roles, ['Wokal', 'Fotograf', 'Lider Uwielbienia']);
  assert.deepEqual(jan.teamTypes, ['worship', 'media']);
  assert.equal(jan.event.time, '10:00');
  assert.equal(jan.daysLeft, 2);
});

test('ponaglenia: osobno per token (różne zaproszenia), zapraszający z assigned_by_name', () => {
  const groups = groupNudges([
    row({ id: 'n1', token: 't1', assigned_by_name: 'Ania' }),
    row({ id: 'n2', token: 't1', role_key: 'piano' }),
    row({ id: 'n3', token: 't2', team_type: 'media', role_label: 'Kamera' }),
    row({ id: 'n4', token: null }),                              // bez tokenu — nie ma czym odpowiedzieć
  ]);
  assert.equal(groups.length, 2);
  const g1 = groups.find((g) => g.token === 't1');
  assert.deepEqual(g1.ids, ['n1', 'n2']);
  assert.equal(g1.by, 'Ania');
  assert.deepEqual(g1.roles, ['Wokal', 'Piano']);
});

test('push: przypomnienie i ponaglenie (kategoria z przyciskami tylko przy jednej roli)', () => {
  const labels = new Map([['worship', 'Grupa Uwielbienia'], ['media', 'Media']]);
  const [rem] = groupReminders([row({ id: 'a1' }), row({ id: 'a2', role_key: 'piano' })]);
  assert.equal(teamLabelOf(['worship', 'media', 'kids'], labels), 'Grupa Uwielbienia · Media');
  assert.equal(teamLabelOf(['kids'], labels), '');
  const p = pushPayload('reminder', rem, 'Grupa Uwielbienia');
  assert.equal(p.title, 'Grupa Uwielbienia: przypomnienie o służbie');
  assert.equal(p.body, 'Wokal, Piano · niedz., 18.10, 10:00 · Nabożeństwo');
  assert.equal(p.link, '/wydarzenie/7');
  assert.equal(p.category_id, undefined);
  assert.equal(pushPayload('reminder', { ...rem, event: { ...rem.event, time: '' } }, '').title, 'przypomnienie o służbie');

  const [single] = groupNudges([row({ id: 'n1', token: 't1' })]);
  const n = pushPayload('nudge', single, 'Grupa Uwielbienia');
  assert.equal(n.title, 'Grupa Uwielbienia: czekamy na odpowiedź');
  assert.equal(n.body, 'Wokal · niedz., 18.10 · Nabożeństwo. Potwierdzisz?');
  assert.equal(n.category_id, 'assignment_invite');
  assert.equal(n.data.assignmentId, 'n1');
  const [multi] = groupNudges([row({ id: 'n1', token: 't1' }), row({ id: 'n2', token: 't1', role_key: 'bas' })]);
  const m = pushPayload('nudge', multi, '');
  assert.equal(m.title, 'czekamy na odpowiedź');
  assert.equal(m.category_id, undefined);
  assert.equal(m.data.assignmentId, null);
});

// ── Maile: warianty jednego szablonu ─────────────────────────────────────────
const base = {
  assignedByName: '<script>x</script>', roles: ['<b>Wokal</b>'], programDate: 'niedziela, 18 października 2026',
  programTitle: 'Nabożeństwo & <i>uwielbienie</i>', contextLabel: 'Wydarzenie', teamLabel: '<Uwielbienie>',
  timeLabel: '10:00', place: 'Sala "A"',
  acceptUrl: 'https://a.pl/assignment-response?token=1&action=accept',
  rejectUrl: 'https://a.pl/assignment-response?token=1&action=reject',
};
const noRaw = (html) => {
  for (const raw of ['<script>', '<b>Wokal</b>', '<i>uwielbienie</i>', '<Uwielbienie>', 'Sala "A"']) assert.ok(!html.includes(raw), raw);
  assert.ok(!/linear-gradient|radial-gradient|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(html), 'bez gradientów i emoji');
};

test('mail „ponaglenie”: nagłówek, wstęp, oba przyciski z tym samym tokenem, escapowanie', () => {
  const html = emailHtml({ ...base, variant: 'nudge' });
  noRaw(html);
  assert.ok(html.includes('Czekamy na <span style="font-weight:300;">Twoją odpowiedź</span><span style="color:#FFBE0B;">.</span>'));
  assert.ok(html.includes('&lt;script&gt;x&lt;/script&gt;</strong> zaprosił(a) Cię do służby — daj znać, czy możesz.'));
  assert.ok(html.includes('href="https://a.pl/assignment-response?token=1&amp;action=accept"'));
  assert.ok(html.includes('href="https://a.pl/assignment-response?token=1&amp;action=reject"'));
  assert.ok(html.includes('>Potwierdzam</a>') && html.includes('>Nie mogę</a>'));
  assert.ok(html.includes('<title>Czekamy na Twoją odpowiedź</title>'));
  const text = emailText({ ...base, variant: 'nudge', assignedByName: 'Ania' });
  assert.ok(text.startsWith('Czekamy na Twoją odpowiedź — <Uwielbienie>'));
  assert.ok(text.includes('Ania zaprosił(a) Cię do służby — daj znać, czy możesz.'));
  assert.ok(text.includes('Potwierdzam: https://a.pl/assignment-response?token=1&action=accept'));
  assert.ok(text.includes('Nie mogę: https://a.pl/assignment-response?token=1&action=reject'));
});

test('mail „przypomnienie”: jeden przycisk do wydarzenia, bez „Nie mogę”, notka dla lidera', () => {
  const detailsUrl = 'https://schwro.avenit.pl/wydarzenie/7?x=1&y=2';
  const html = emailHtml({ ...base, variant: 'reminder', detailsUrl, daysBefore: 2 });
  noRaw(html);
  assert.ok(html.includes('Przypomnienie <span style="font-weight:300;">o służbie</span><span style="color:#FFBE0B;">.</span>'));
  assert.ok(html.includes('Dziękujemy, że służysz! Już za 2 dni:'));
  assert.ok(html.includes('href="https://schwro.avenit.pl/wydarzenie/7?x=1&amp;y=2"'));
  assert.ok(html.includes('>Zobacz szczegóły</a>'));
  assert.ok(!html.includes('Nie mogę') && !html.includes('Potwierdzam'));
  assert.ok(!html.includes('assignment-response'), 'bez linków odpowiedzi');
  assert.ok(html.includes('Jeśli coś się zmieniło, daj znać liderowi służby.'));
  assert.ok(html.includes('godz. 10:00') && html.includes('Sala &quot;A&quot;'));
  const text = emailText({ ...base, variant: 'reminder', detailsUrl, daysBefore: 1 });
  assert.ok(text.startsWith('Przypomnienie o służbie — <Uwielbienie>'));
  assert.ok(text.includes('Dziękujemy, że służysz! Już jutro:'));
  assert.ok(text.includes(`Zobacz szczegóły: ${detailsUrl}`));
  assert.ok(!text.includes('Nie mogę'));
});

test('wstęp przypomnienia i nieznany wariant (= zaproszenie)', () => {
  assert.equal(reminderIntro(1), 'Dziękujemy, że służysz! Już jutro:');
  assert.equal(reminderIntro(5), 'Dziękujemy, że służysz! Już za 5 dni:');
  assert.equal(reminderIntro(null), 'Dziękujemy, że służysz! Przypominamy o Twojej służbie:');
  assert.equal(emailHtml({ ...base, variant: 'xyz' }), emailHtml(base));
  assert.ok(emailHtml(base).includes('<title>Zaproszenie do służby</title>'));
});

// ── Przebieg workera na atrapie bazy ─────────────────────────────────────────
function fakePool({ settings = null, reminders = [], nudges = [], throwOn = [] } = {}) {
  const log = [];
  return {
    log,
    async query(sql, params) {
      const s = sql.replace(/\s+/g, ' ').trim();
      log.push({ sql: s, params });
      for (const frag of throwOn) if (s.includes(frag)) throw new Error('column "reminder_sent_at" does not exist');
      if (s.includes("FROM app_settings")) return { rows: settings == null ? [] : [{ value: settings }] };
      if (s.includes('FROM app_modules')) return { rows: [{ key: 'worship', label: 'Grupa Uwielbienia' }] };
      if (s.includes("sa.status = 'accepted'")) return { rows: reminders };
      if (s.includes("sa.status = 'pending'")) return { rows: nudges };
      return { rows: [] }; // UPDATE-y, assigneeIdentity (brak powiązanych kont)
    },
  };
}
const updates = (pool, col) => pool.log.filter((l) => l.sql.startsWith(`UPDATE schedule_assignments SET ${col}`));

test('worker: brak kolumn/tabel w tenancie → zera, bez wyjątku', async () => {
  const pool = fakePool({ throwOn: ['FROM schedule_assignments'] });
  const res = await runForTenant(pool, { tenantSlug: 't', deps: { emailReady: true, sendEmail: async () => {}, sendPush: async () => ({ body: { sent: 0 } }) } });
  assert.deepEqual(res, { reminded: 0, nudged: 0 });
  const broken = { query: async () => { throw new Error('boom'); } };
  assert.deepEqual(await runForTenant(broken, {}), { reminded: 0, nudged: 0 });
});

test('worker: wyłączone w ustawieniach → nic nie wysyła', async () => {
  const pool = fakePool({ settings: '{"enabled":false}', reminders: [row({})] });
  let mails = 0;
  const res = await runForTenant(pool, { deps: { emailReady: true, sendEmail: async () => { mails++; }, sendPush: async () => ({ body: { sent: 1 } }) } });
  assert.deepEqual(res, { reminded: 0, nudged: 0 });
  assert.equal(mails, 0);
  assert.equal(pool.log.length, 1);
});

test('worker: przypomnienie — jeden mail na osobę, stempel po dotarciu; okno i dni z configu', async () => {
  const pool = fakePool({
    settings: { days_before: 3, nudge_enabled: false },
    reminders: [row({ id: 'a1' }), row({ id: 'a2', role_key: 'piano' }), row({ id: 'b1', assigned_email: 'ala@x.pl', assigned_name: 'Ala' })],
  });
  const mails = [];
  const pushes = [];
  const res = await runForTenant(pool, {
    tenantSlug: 'schwro',
    deps: {
      emailReady: true,
      sendEmail: async (m) => { if (m.to === 'ala@x.pl') throw new Error('Resend 500'); mails.push(m); },
      sendPush: async (_p, payload) => { pushes.push(payload); return { body: { sent: payload.user_email === 'ala@x.pl' ? 0 : 1 } }; },
    },
  });
  // Jan: mail + push → stempel; Ala: mail padł i push nie dotarł → bez stempla (ponowienie jutro).
  assert.deepEqual(res, { reminded: 1, nudged: 0 });
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to, 'Jan@x.pl');
  assert.match(mails[0].subject, /^Przypomnienie o służbie \(2\) — niedziela, 18 października 2026$/);
  assert.ok(mails[0].html.includes('/wydarzenie/7') && mails[0].html.includes('Zobacz szczegóły'));
  assert.ok(mails[0].html.includes('Grupa Uwielbienia'));
  assert.equal(pushes.find((p) => p.user_email === 'jan@x.pl').title, 'Grupa Uwielbienia: przypomnienie o służbie');
  const sel = pool.log.find((l) => l.sql.includes("sa.status = 'accepted'"));
  assert.ok(sel.sql.includes('sa.reminder_sent_at IS NULL'));
  assert.deepEqual(sel.params, [3]);
  const stamped = updates(pool, 'reminder_sent_at');
  assert.equal(stamped.length, 1);
  assert.deepEqual(stamped[0].params, [['a1', 'a2']]);
  // ponaglenia wyłączone — brak zapytania
  assert.ok(!pool.log.some((l) => l.sql.includes("sa.status = 'pending'")));
});

test('worker: stempel także gdy dotarł tylko push (mail niedostępny) — bez drugiego pusha jutro', async () => {
  const pool = fakePool({ reminders: [row({ id: 'a1' })] });
  const res = await runForTenant(pool, {
    deps: { emailReady: false, sendEmail: async () => { throw new Error('nie powinno'); }, sendPush: async () => ({ body: { sent: 1 } }) },
  });
  assert.equal(res.reminded, 1);
  assert.deepEqual(updates(pool, 'reminder_sent_at')[0].params, [['a1']]);
});

test('worker: ponaglenie — ten sam token w linkach, push z przyciskami przy jednej roli, stempel nudge_sent_at', async () => {
  const pool = fakePool({
    nudges: [row({ id: 'n1', token: 'tok-123', assigned_by_name: 'Ania', days_left: 5 })],
  });
  const mails = [];
  const pushes = [];
  const res = await runForTenant(pool, {
    tenantSlug: 'schwro',
    deps: { emailReady: true, sendEmail: async (m) => { mails.push(m); }, sendPush: async (_p, payload) => { pushes.push(payload); return { body: { sent: 0 } }; } },
  });
  assert.deepEqual(res, { reminded: 0, nudged: 1 });
  assert.ok(mails[0].html.includes('/assignment-response?token=tok-123&amp;action=accept'));
  assert.ok(mails[0].html.includes('/assignment-response?token=tok-123&amp;action=reject'));
  assert.ok(mails[0].text.includes('Ania zaprosił(a) Cię do służby'));
  assert.equal(mails[0].subject, 'Czekamy na odpowiedź: Wokal — niedziela, 18 października 2026');
  assert.equal(pushes[0].category_id, 'assignment_invite');
  assert.equal(pushes[0].data.assignmentId, 'n1');
  const sel = pool.log.find((l) => l.sql.includes("sa.status = 'pending'"));
  assert.deepEqual(sel.params, [3]); // domyślne nudge_after_days
  assert.ok(sel.sql.includes('sa.nudge_sent_at IS NULL') && sel.sql.includes('sa.email_sent_at IS NOT NULL'));
  assert.deepEqual(updates(pool, 'nudge_sent_at')[0].params, [['n1']]);
});
