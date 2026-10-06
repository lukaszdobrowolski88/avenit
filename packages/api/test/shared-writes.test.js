// Zapisy do tabel wspólnych (sharedWrites.js): uprawnienie z modułu, z którego pochodzą dane.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enforceSharedWrite } from '../src/dataapi/sharedWrites.js';

const resolverWith = (...caps) => ({ can: (c) => caps.includes(c) });
const req = (rowsByQuery = []) => {
  const queue = [...rowsByQuery];
  return { user: { email: 'jan@kosciol.pl' }, db: { query: async () => ({ rows: queue.shift() || [] }) } };
};
const denied = (p) => assert.rejects(p, (e) => e.status === 403);

test('admin/legacy (resolver null) — bez ograniczeń', async () => {
  await enforceSharedWrite({ table: 'app_dictionaries', op: 'insert', values: { key: 'x' } }, req(), null);
});

test('słowniki: zapis tylko z manage_modules', async () => {
  await denied(enforceSharedWrite({ table: 'app_dictionaries', op: 'update', values: { label: 'x' }, filters: [{ type: 'eq', column: 'id', value: 1 }] }, req(), resolverWith('module:members')));
  await enforceSharedWrite({ table: 'app_dictionaries', op: 'update', values: { label: 'x' }, filters: [{ type: 'eq', column: 'id', value: 1 }] }, req(), resolverWith('action:settings:manage_modules'));
});

test('kampanie RSVP: wymagają module:rsvp; odczyt nie jest sprawdzany', async () => {
  await denied(enforceSharedWrite({ table: 'rsvp_campaigns', op: 'insert', values: { title: 't' } }, req(), resolverWith()));
  await enforceSharedWrite({ table: 'rsvp_campaigns', op: 'select' }, req(), resolverWith());
  await enforceSharedWrite({ table: 'rsvp_campaigns', op: 'insert', values: { title: 't' } }, req(), resolverWith('module:rsvp'));
});

test('służby zespołu: dostęp do modułu tego zespołu', async () => {
  const ins = { table: 'team_roles', op: 'insert', values: { team_type: 'worship', name: 'Bas' } };
  await denied(enforceSharedWrite(ins, req(), resolverWith('module:media')));
  await enforceSharedWrite(ins, req(), resolverWith('module:worship'));
  // przypisanie osoby do roli: zespół z roli (role_id → team_type)
  const asg = { table: 'team_member_roles', op: 'insert', values: { role_id: 5, member_id: 9 } };
  await denied(enforceSharedWrite(asg, req([[{ team_type: 'worship' }]]), resolverWith('module:media')));
  await enforceSharedWrite(asg, req([[{ team_type: 'worship' }]]), resolverWith('module:worship'));
});

test('masowa zmiana bez filtrów jest odrzucana', async () => {
  await assert.rejects(enforceSharedWrite({ table: 'team_roles', op: 'delete', filters: [] }, req(), resolverWith('module:worship')), (e) => e.status === 400);
});

test('udostępnienia materiałów: tylko własny folder/plik; twórca = ja', async () => {
  const share = { table: 'materials_shares', op: 'insert', values: { folder_id: 3, target_type: 'user', target_id: 'x@y.pl' } };
  await denied(enforceSharedWrite(share, req([[]]), resolverWith()));
  const own = { ...share, values: { ...share.values } };
  await enforceSharedWrite(own, req([[{ 1: 1 }]]), resolverWith());
  assert.equal(own.values.created_by, 'jan@kosciol.pl');
  // usunięcie cudzego udostępnienia
  await denied(enforceSharedWrite({ table: 'materials_shares', op: 'delete', filters: [{ type: 'eq', column: 'id', value: 1 }] }, req([[{ n: 1, mine: 0 }]]), resolverWith()));
});

test('tablica: wpis pod własnym kontem, polubienia dla wszystkich, cudzy wpis tylko z modułem', async () => {
  await denied(enforceSharedWrite({ table: 'wall_posts', op: 'insert', values: { content: 'x', author_email: 'inny@x.pl' } }, req(), resolverWith()));
  await enforceSharedWrite({ table: 'wall_posts', op: 'update', values: { likes: ['a'] }, filters: [{ type: 'eq', column: 'id', value: 1 }] }, req(), resolverWith());
  const del = { table: 'wall_posts', op: 'delete', filters: [{ type: 'eq', column: 'id', value: 1 }] };
  await denied(enforceSharedWrite(del, req([[{ author_email: 'inny@x.pl', ministry: 'Grupa Uwielbienia' }]]), resolverWith()));
  await enforceSharedWrite(del, req([[{ author_email: 'inny@x.pl', ministry: 'Grupa Uwielbienia' }]]), resolverWith('module:worship'));
  await enforceSharedWrite(del, req([[{ author_email: 'JAN@kosciol.pl', ministry: 'Nauczanie' }]]), resolverWith());
});

import { enforceExpenseApproval } from '../src/dataapi/sharedWrites.js';
test('wydatki: zatwierdzenie/opłacenie tylko z action:finance:approve', () => {
  const lider = resolverWith('res:expense_transactions:update');
  assert.throws(() => enforceExpenseApproval({ table: 'expense_transactions', op: 'update', values: { status: 'approved' } }, lider), (e) => e.status === 403);
  assert.throws(() => enforceExpenseApproval({ table: 'expense_transactions', op: 'update', values: { is_paid: true } }, lider), (e) => e.status === 403);
  enforceExpenseApproval({ table: 'expense_transactions', op: 'insert', values: { status: 'submitted', amount: 10 } }, lider);
  enforceExpenseApproval({ table: 'expense_transactions', op: 'update', values: { status: 'approved' } }, resolverWith('action:finance:approve'));
});
