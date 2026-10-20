// Tekst powiadomień o wiadomościach: w grupie / kanale / spotkaniu zawsze widać, gdzie napisano.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messagePushText, conversationPlace } from '../src/realtime/push-hooks.js';

test('prywatna rozmowa: tytuł = nadawca, treść = wiadomość', () => {
  assert.deepEqual(messagePushText({ conv: { type: 'direct', name: null }, senderName: 'Jan', preview: 'Cześć' }), { title: 'Jan', body: 'Cześć' });
  assert.deepEqual(messagePushText({ conv: null, senderName: 'Jan', preview: 'Cześć' }), { title: 'Jan', body: 'Cześć' });
});

test('grupa / kanał służby / spotkanie: tytuł = nazwa, treść = „Nadawca: wiadomość”', () => {
  assert.deepEqual(messagePushText({ conv: { type: 'group', name: 'Zespół uwielbienia' }, senderName: 'Jan', preview: 'Próba o 17' }),
    { title: 'Zespół uwielbienia', body: 'Jan: Próba o 17' });
  assert.deepEqual(messagePushText({ conv: { type: 'ministry', name: 'MediaTeam' }, senderName: 'Ola', preview: 'Kamera 2?' }),
    { title: 'MediaTeam', body: 'Ola: Kamera 2?' });
});

test('brak nazwy: etykieta typu rozmowy', () => {
  assert.equal(conversationPlace({ type: 'group', name: '  ' }), 'Rozmowa grupowa');
  assert.equal(conversationPlace({ type: 'ministry', name: '' }), 'Kanał służby');
  assert.equal(conversationPlace({ type: 'meeting', name: null }), 'Spotkanie');
  assert.equal(conversationPlace({ type: 'direct', name: 'x' }), null);
});

test('wzmianki: z nazwą miejsca w grupie, bez — prywatnie', () => {
  assert.deepEqual(messagePushText({ conv: { type: 'group', name: 'Liderzy' }, senderName: 'Jan', preview: '@Ola zobacz', mention: 'me' }),
    { title: 'Jan wspomniał(a) Cię — Liderzy', body: '@Ola zobacz' });
  assert.deepEqual(messagePushText({ conv: { type: 'group', name: 'Liderzy' }, senderName: 'Jan', preview: '@wszyscy', mention: 'all' }),
    { title: 'Jan wspomniał(a) wszystkich — Liderzy', body: '@wszyscy' });
  assert.deepEqual(messagePushText({ conv: { type: 'direct' }, senderName: 'Jan', preview: 'hej', mention: 'me' }),
    { title: 'Jan wspomniał(a) Cię', body: 'hej' });
});

test('odpowiedź w wątku: „Nadawca w wątku: …”, wzmianka „… w wątku”, link otwiera wątek', async () => {
  const { messageLink } = await import('../src/realtime/push-hooks.js');
  assert.deepEqual(messagePushText({ conv: { type: 'group', name: 'Liderzy' }, senderName: 'Jan', preview: 'Ja mogę', thread: true }),
    { title: 'Liderzy', body: 'Jan w wątku: Ja mogę' });
  assert.deepEqual(messagePushText({ conv: { type: 'direct' }, senderName: 'Jan', preview: 'ok', thread: true }),
    { title: 'Jan', body: 'W wątku: ok' });
  assert.deepEqual(messagePushText({ conv: { type: 'group', name: 'Liderzy' }, senderName: 'Jan', preview: '@Ola?', mention: 'me', thread: true }),
    { title: 'Jan wspomniał(a) Cię w wątku — Liderzy', body: '@Ola?' });
  // Bez wątku — bez zmian.
  assert.deepEqual(messagePushText({ conv: { type: 'group', name: 'Liderzy' }, senderName: 'Jan', preview: 'x', thread: false }),
    { title: 'Liderzy', body: 'Jan: x' });
  assert.equal(messageLink('c1'), '/komunikator?conversation=c1');
  assert.equal(messageLink('c1', 'r 1'), '/komunikator?conversation=c1&thread=r%201');
});
