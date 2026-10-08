// Kanał iCal: „Moje służby” z grafiku (fn/ical.js) — dopasowanie osoby do konta i VEVENT-y.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerServiceRows, serviceEvents, vevent } from '../src/fn/ical.js';

const row = (o) => ({
  id: 'a1', event_id: 7, team_type: 'worship', role_key: 'wokale', role_label: null, status: 'accepted',
  assigned_name: 'Jan Kowalski', assigned_email: 'jan@schwro.pl', event_title: 'Nabożeństwo',
  event_date: '2026-10-18', event_time: '10:00:00', event_end_time: null, event_end_date: null, event_location: 'Sala A', ...o,
});

// Atrapa bazy dla lib/assigneeIdentity: konto „lukasz@dobro88.pl” powiązane z wpisem zespołu
// o e-mailu lukasz@schwro.pl (user_id w tabeli zespołu). Liczy zapytania.
function fakeDb(linked = { 'lukasz@schwro.pl': ['lukasz@dobro88.pl'] }) {
  const db = {
    calls: 0,
    async query(sql, params) {
      db.calls++;
      if (sql.includes('t.user_id')) return { rows: (linked[params[0]] || []).map((email) => ({ email })) };
      return { rows: [] };
    },
  };
  return db;
}

test('moje służby: własny e-mail bez pytania bazy; konto powiązane przez assigneeIdentity; cache per osoba', async () => {
  const db = fakeDb();
  const rows = [
    row({ id: 'a1', assigned_email: 'Lukasz@Dobro88.pl' }),                     // ten sam e-mail co konto
    row({ id: 'a2', assigned_email: 'lukasz@schwro.pl', role_key: 'piano' }),   // inny adres, konto powiązane
    row({ id: 'a3', assigned_email: 'lukasz@schwro.pl', event_id: 8 }),         // ta sama osoba — z cache
    row({ id: 'a4', assigned_email: 'ktos@inny.pl' }),                          // obca osoba
  ];
  const mine = await ownerServiceRows(db, rows, 'LUKASZ@dobro88.pl');
  assert.deepEqual(mine.map((r) => r.id), ['a1', 'a2', 'a3']);
  const before = db.calls;
  await ownerServiceRows(db, [row({ assigned_email: 'lukasz@dobro88.pl' })], 'lukasz@dobro88.pl');
  assert.equal(db.calls, before, 'własny e-mail nie odpytuje bazy');
  // a2 i a3 to ta sama osoba (e-mail, imię, zespół) → jedno sprawdzenie, nie dwa
  const db2 = fakeDb();
  await ownerServiceRows(db2, [rows[1], rows[2]], 'lukasz@dobro88.pl');
  const db3 = fakeDb();
  await ownerServiceRows(db3, [rows[1]], 'lukasz@dobro88.pl');
  assert.equal(db2.calls, db3.calls);
  assert.deepEqual(await ownerServiceRows(db, rows, ''), []);
});

test('moje służby: adres dopasowany w jednym zespole pasuje też w innym (ta sama osoba)', async () => {
  // Powiązanie user_id jest tylko w worship_team; wiersz media z tym samym adresem też jest mój.
  const db = { async query(sql, params) {
    if (sql.includes('t.user_id') && sql.includes('"worship_team"')) return { rows: params[0] === 'lukasz@schwro.pl' ? [{ email: 'lukasz@dobro88.pl' }] : [] };
    return { rows: [] };
  } };
  const rows = [
    row({ id: 'm1', team_type: 'media', assigned_email: 'LUKASZ@schwro.pl', role_label: 'Foto' }), // przed dopasowaniem
    row({ id: 'w1', team_type: 'worship', assigned_email: 'lukasz@schwro.pl' }),
    row({ id: 'x1', team_type: 'media', assigned_email: 'ktos@inny.pl' }),
  ];
  assert.deepEqual((await ownerServiceRows(db, rows, 'lukasz@dobro88.pl')).map((r) => r.id), ['m1', 'w1']);
});

test('VEVENT służby: jeden na wydarzenie, role razem, zespoły z app_modules, status', () => {
  const labels = new Map([['worship', 'Grupa Uwielbienia']]);
  const evs = serviceEvents([
    row({ id: 'a1' }),
    row({ id: 'a2', team_type: 'media', role_key: 'foto', role_label: 'Fotograf', status: 'pending' }),
    row({ id: 'a3', event_id: 8, event_title: 'Próba', event_time: null, role_key: 'lider' }),
    row({ id: 'a4', event_id: 9, status: 'rejected' }),                         // odrzucone — pomijamy
  ], { ownerEmail: 'jan@schwro.pl', dtstamp: '20261008T000000Z', labels });
  assert.equal(evs.length, 2);
  const [sun, rehearsal] = evs;
  assert.equal(sun.summary, 'Służba: Wokal, Fotograf — Nabożeństwo');
  assert.equal(sun.description, 'Grupa Uwielbienia, Media · czeka na odpowiedź');
  assert.equal(sun.status, 'TENTATIVE');
  assert.equal(sun.location, 'Sala A');
  assert.equal(sun.dtstart, '20261018T100000');
  assert.equal(sun.dtend, '20261018T110000');              // bez end_time: +1 h (jak zwykłe wydarzenia)
  assert.deepEqual(sun.categories, ['Służba']);
  assert.match(sun.uid, /^service-7-[0-9a-f]{10}@avenit\.app$/);
  // całodniowe (bez godziny)
  assert.equal(rehearsal.allDay, true);
  assert.equal(rehearsal.dtstart, '20261018');
  assert.equal(rehearsal.dtend, '20261019');
  assert.equal(rehearsal.summary, 'Służba: Lider Uwielbienia — Próba');
  assert.equal(rehearsal.description, 'Grupa Uwielbienia · potwierdzone');
  assert.equal(rehearsal.status, 'CONFIRMED');
});

test('VEVENT służby: godzina końca, stały UID per właściciel, render ICS', () => {
  const r = row({ event_end_time: '12:30:00', event_title: 'Koncert, wieczór; uwielbienia' });
  const [a] = serviceEvents([r], { ownerEmail: 'jan@schwro.pl', dtstamp: 'X' });
  const [again] = serviceEvents([r], { ownerEmail: 'JAN@schwro.pl ', dtstamp: 'Y' });
  const [other] = serviceEvents([r], { ownerEmail: 'ala@schwro.pl', dtstamp: 'X' });
  assert.equal(a.dtend, '20261018T123000');
  assert.equal(a.uid, again.uid, 'UID stabilny między pobraniami');
  assert.notEqual(a.uid, other.uid, 'inny właściciel — inny UID');
  const ics = vevent(a);
  assert.ok(ics.includes('SUMMARY:Służba: Wokal — Koncert\\, wieczór\\; uwielbienia'));
  assert.ok(ics.includes('CATEGORIES:Służba'));
  assert.ok(ics.includes('DESCRIPTION:Uwielbienie · potwierdzone'), 'bez app_modules — nazwa z MODULE_LABEL');
  assert.ok(ics.includes('LOCATION:Sala A'));
  assert.ok(ics.startsWith('BEGIN:VEVENT') && ics.endsWith('END:VEVENT'));
});
