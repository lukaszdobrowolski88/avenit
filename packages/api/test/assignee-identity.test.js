// Osoba z grafiku ↔ konto (push + odpowiedź z aplikacji): lib/assigneeIdentity.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountEmailsForAssignee, isAccountForAssignee, teamTableFor } from '../src/lib/assigneeIdentity.js';

// Atrapa bazy: odpowiedzi wg fragmentu SQL; `throws` symuluje brak kolumny/tabeli w tenancie.
function fakeDb({ teamLink = [], memberLink = [], byName = [], teamNameCount = 1, throws = [] } = {}) {
  return {
    async query(sql) {
      const kind = sql.includes('t.user_id') ? 'team' : sql.includes('JOIN members') ? 'member'
        : sql.includes('HAVING count') ? 'name' : sql.includes('count(*)::int') ? 'teamCount' : 'other';
      if (throws.includes(kind)) throw new Error(`column does not exist (${kind})`);
      if (kind === 'team') return { rows: teamLink.map((email) => ({ email })) };
      if (kind === 'member') return { rows: memberLink.map((email) => ({ email })) };
      if (kind === 'name') return { rows: byName.length === 1 ? [{ email: byName[0] }] : [] };
      if (kind === 'teamCount') return { rows: [{ n: teamNameCount }] };
      return { rows: [] };
    },
  };
}

test('tabela zespołu: wbudowane, custom, odrzuca podejrzane klucze', () => {
  assert.equal(teamTableFor('worship'), 'worship_team');
  assert.equal(teamTableFor('kobiety'), 'custom_kobiety_members');
  assert.equal(teamTableFor('x"; DROP TABLE y; --'), null);
  assert.equal(teamTableFor(''), null);
});

test('ten sam e-mail zawsze; dokłada konta z user_id, kartoteki i jedynego imiennika', async () => {
  const db = fakeDb({ teamLink: ['Konto@Dobro88.pl'], memberLink: ['m@x.pl'], byName: ['lukasz@dobro88.pl'] });
  const emails = await accountEmailsForAssignee(db, { email: 'Lukasz@Schwro.pl', name: 'Łukasz Dobrowolski', teamType: 'worship' });
  assert.deepEqual(emails.sort(), ['konto@dobro88.pl', 'lukasz@dobro88.pl', 'lukasz@schwro.pl', 'm@x.pl']);
});

test('imiennicy: dwa konta o tym imieniu albo dwie takie osoby w zespole → bez zgadywania', async () => {
  const twoAccounts = fakeDb({ byName: ['a@x.pl', 'b@x.pl'] });
  assert.deepEqual(await accountEmailsForAssignee(twoAccounts, { email: 'z@x.pl', name: 'Jan Kowalski', teamType: 'media' }), ['z@x.pl']);
  const twoInTeam = fakeDb({ byName: ['a@x.pl'], teamNameCount: 2 });
  assert.deepEqual(await accountEmailsForAssignee(twoInTeam, { email: 'z@x.pl', name: 'Jan Kowalski', teamType: 'media' }), ['z@x.pl']);
});

test('brak kolumn w tenancie nie wywraca — zostaje e-mail z grafiku', async () => {
  const db = fakeDb({ throws: ['team', 'member', 'name'] });
  assert.deepEqual(await accountEmailsForAssignee(db, { email: 'a@x.pl', name: 'Ala', teamType: 'worship' }), ['a@x.pl']);
});

test('odpowiedź z aplikacji: własny e-mail, powiązane konto tak; obce konto nie', async () => {
  const db = fakeDb({ byName: ['lukasz@dobro88.pl'] });
  const assignee = { email: 'lukasz@schwro.pl', name: 'Łukasz Dobrowolski', teamType: 'worship' };
  assert.equal(await isAccountForAssignee(db, 'LUKASZ@schwro.pl', assignee), true);
  assert.equal(await isAccountForAssignee(db, 'lukasz@dobro88.pl', assignee), true);
  assert.equal(await isAccountForAssignee(db, 'ktos@inny.pl', assignee), false);
  assert.equal(await isAccountForAssignee(db, '', assignee), false);
});

test('osoba bez e-maila w zespole: powiązanie po imieniu (user_id albo jedyne konto)', async () => {
  const db = fakeDb({ teamLink: ['ola@x.pl'] });
  assert.deepEqual(await accountEmailsForAssignee(db, { email: null, name: 'Ola', teamType: 'kids' }), ['ola@x.pl']);
});
