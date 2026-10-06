// Testy wymazywania danych osobowych (zaproszenia RSVP, zapisy na wydarzenia).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enforcePiiWrite, redactPii } from '../src/dataapi/pii.js';

const ME = { email: 'anna@example.com', memberId: 7 };

test('zapisy: cudze e-maile i imiona wymazane, mój zapis i liczba wierszy zostają', () => {
  const rows = [
    { event_id: 1, user_email: 'Anna@Example.com', full_name: 'Anna', status: 'going' },
    { event_id: 1, user_email: 'jan@example.com', full_name: 'Jan', note: 'alergia', status: 'going' },
  ];
  const out = redactPii('event_registrations', rows, ME);
  assert.equal(out.length, 2);
  assert.equal(out[0].user_email, 'Anna@Example.com');
  assert.equal(out[1].user_email, null);
  assert.equal(out[1].full_name, null);
  assert.equal(out[1].note, null);
  assert.equal(out[1].status, 'going');
});

test('RSVP: cudzy token, e-mail i telefon wymazane; moje (po member_id) zostaje', () => {
  const rows = [
    { campaign_id: 'c', member_id: 7, name: 'Anna', email: null, token: 'mój', status: 'pending' },
    { campaign_id: 'c', member_id: 9, name: 'Jan', email: 'jan@example.com', phone: '600', token: 'cudzy', status: 'yes' },
  ];
  const out = redactPii('rsvp_invitations', rows, ME);
  assert.equal(out[0].token, 'mój');
  assert.deepEqual([out[1].name, out[1].email, out[1].phone, out[1].token, out[1].member_id], [null, null, null, null, null]);
  assert.equal(out[1].status, 'yes');
});

test('RSVP: zapis bez obsługi → 403', () => {
  assert.throws(() => enforcePiiWrite({ table: 'rsvp_invitations', op: 'update', values: { status: 'yes' } }, ME), (e) => e.status === 403);
  assert.throws(() => enforcePiiWrite({ table: 'rsvp_invitations', op: 'insert', values: { campaign_id: 'c' } }, ME), (e) => e.status === 403);
});

test('zapisy: mogę zapisać tylko siebie; wypisać/zmienić tylko swój zapis', () => {
  const ins = { table: 'event_registrations', op: 'insert', values: [{ event_id: 1, status: 'going' }] };
  enforcePiiWrite(ins, ME);
  assert.equal(ins.values[0].user_email, ME.email);
  assert.throws(() => enforcePiiWrite({ table: 'event_registrations', op: 'insert', values: { event_id: 1, user_email: 'jan@example.com' } }, ME), (e) => e.status === 403);
  const del = { table: 'event_registrations', op: 'delete', filters: [] };
  enforcePiiWrite(del, ME);
  const params = [];
  const clause = del.__ownerScope.delete('t', (v) => { params.push(v); return params.length; });
  assert.equal(clause, 'lower(t."user_email") = $1');
  assert.deepEqual(params, [ME.email]);
});

test('odczyt pojedynczego wiersza (single) też wymazany', () => {
  const out = redactPii('event_registrations', { user_email: 'jan@example.com', full_name: 'Jan' }, ME);
  assert.equal(out.user_email, null);
});
