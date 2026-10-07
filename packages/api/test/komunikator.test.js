// Komunikator: zakres uczestnika rozmowy, nadawca = ja, kanał ogłoszeń dla administratorów.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conversationScope, enforceConversationWrite, conversationAudience } from '../src/dataapi/komunikator.js';

// Fałszywa baza: odpowiada wg fragmentu zapytania.
function fakeDb(handlers) {
  return { query: async (sql, params) => {
    for (const [frag, fn] of handlers) if (sql.includes(frag)) return { rows: fn(params) };
    return { rows: [] };
  } };
}
const req = (db) => ({ user: { email: 'Jan@Kosciol.pl' }, db });
const denied = (p) => assert.rejects(p, (e) => e.status === 403);

test('zakres SQL: wiadomości tylko z rozmów, w których jestem', () => {
  const params = [];
  const sql = conversationScope('messages', { email: 'Jan@Kosciol.pl' }).select('t', (v) => { params.push(v); return params.length; });
  assert.match(sql, /conversation_participants/);
  assert.match(sql, /t\."conversation_id"/);
  assert.deepEqual(params, ['jan@kosciol.pl']);
});

test('reakcje: rozmowa przez wiadomość', () => {
  const sql = conversationScope('message_reactions', { email: 'a@b.pl' }).select('t', () => 1);
  assert.match(sql, /FROM messages m_ WHERE m_\."id" = t\."message_id"/);
});

test('wiadomość: tylko w mojej rozmowie, nadawca nadpisany na mnie', async () => {
  const db = fakeDb([
    ['FROM conversations c', () => [{ id: 'c1', type: 'direct', posting_policy: 'everyone', n: 2 }]],
    ['FROM conversation_participants WHERE conversation_id', () => [{ role: 'member' }]],
  ]);
  const q = { table: 'messages', op: 'insert', values: { conversation_id: 'c1', content: 'hej' } };
  await enforceConversationWrite(q, req(db));
  assert.equal(q.values.sender_email, 'Jan@Kosciol.pl');
  await denied(enforceConversationWrite({ table: 'messages', op: 'insert', values: { conversation_id: 'c1', sender_email: 'pastor@kosciol.pl' } }, req(db)));
});

test('wiadomość w cudzej rozmowie — odmowa', async () => {
  const db = fakeDb([['FROM conversations c', () => [{ id: 'c1', type: 'direct', n: 2 }]]]);
  await denied(enforceConversationWrite({ table: 'messages', op: 'insert', values: { conversation_id: 'c1', content: 'x' } }, req(db)));
});

test('kanał ogłoszeń: piszą tylko administratorzy', async () => {
  const conv = ['FROM conversations c', () => [{ id: 'c2', type: 'announcement', posting_policy: 'admins', n: 5 }]];
  await denied(enforceConversationWrite({ table: 'messages', op: 'insert', values: { conversation_id: 'c2' } }, req(fakeDb([conv, ['FROM conversation_participants WHERE conversation_id', () => [{ role: 'member' }]]]))));
  await enforceConversationWrite({ table: 'messages', op: 'insert', values: { conversation_id: 'c2' } }, req(fakeDb([conv, ['FROM conversation_participants WHERE conversation_id', () => [{ role: 'admin' }]]])));
});

test('uczestnicy: nowa rozmowa (0 osób) — pierwszy skład wolno; istniejąca — tylko administrator', async () => {
  const fresh = fakeDb([['FROM conversations c', () => [{ id: 'c3', type: 'direct', n: 0, created_by: 'jan@kosciol.pl' }]]]);
  const q = { table: 'conversation_participants', op: 'insert', values: [{ conversation_id: 'c3', user_email: 'jan@kosciol.pl' }, { conversation_id: 'c3', user_email: 'ola@x.pl' }] };
  await enforceConversationWrite(q, req(fresh));
  assert.equal(q.op, 'upsert'); // duplikaty pomijane
  const existing = fakeDb([['FROM conversations c', () => [{ id: 'c4', type: 'group', n: 3, created_by: 'inny@x.pl' }]]]);
  await denied(enforceConversationWrite({ table: 'conversation_participants', op: 'insert', values: { conversation_id: 'c4', user_email: 'jan@kosciol.pl' } }, req(existing)));
});

test('kanał służby: dopisanie członków zespołu, rola wymuszona na member', async () => {
  const db = fakeDb([
    ['FROM conversations c', () => [{ id: 'c5', type: 'ministry', ministry_key: 'worship_team', n: 4 }]],
    ['FROM worship_team', (p) => [{ n: new Set(p[0]).size }]],
  ]);
  const q = { table: 'conversation_participants', op: 'insert', values: [{ conversation_id: 'c5', user_email: 'ola@x.pl', role: 'admin' }] };
  await enforceConversationWrite(q, req(db));
  assert.equal(q.values[0].role, 'member');
});

test('ustawienia rozmowy zmienia administrator; podgląd ostatniej wiadomości — każdy uczestnik', async () => {
  const member = fakeDb([['FROM conversation_participants WHERE conversation_id', () => [{ role: 'member' }]]]);
  await enforceConversationWrite({ table: 'conversations', op: 'update', values: { last_message_preview: 'x' }, filters: [{ type: 'eq', column: 'id', value: 'c1' }] }, req(member));
  await denied(enforceConversationWrite({ table: 'conversations', op: 'update', values: { posting_policy: 'everyone' }, filters: [{ type: 'eq', column: 'id', value: 'c1' }] }, req(member)));
});

test('realtime: odbiorcy = uczestnicy rozmowy', async () => {
  const db = fakeDb([['FROM conversation_participants WHERE conversation_id::text = ANY', () => [{ e: 'jan@kosciol.pl' }, { e: 'ola@x.pl' }]]]);
  const aud = await conversationAudience(db, 'messages', [{ id: 'm1', conversation_id: 'c1' }]);
  assert.deepEqual([...aud].sort(), ['jan@kosciol.pl', 'ola@x.pl']);
  assert.equal(await conversationAudience(db, 'events', [{ id: 1 }]), null);
});

test('nowa rozmowa bez uczestników — skład dodaje tylko jej twórca', async () => {
  const foreign = fakeDb([['FROM conversations c', () => [{ id: 'c6', type: 'group', n: 0, created_by: 'inny@x.pl' }]]]);
  await denied(enforceConversationWrite({ table: 'conversation_participants', op: 'insert', values: { conversation_id: 'c6', user_email: 'jan@kosciol.pl' } }, req(foreign)));
});

test('zmiana roli uczestnika — zakres zawężony do administratora rozmowy', async () => {
  const q = { table: 'conversation_participants', op: 'update', values: { role: 'admin' }, filters: [{ type: 'eq', column: 'id', value: 1 }],
    __ownerScope: conversationScope('conversation_participants', { email: 'jan@kosciol.pl' }) };
  await enforceConversationWrite(q, req(fakeDb([])));
  const sql = q.__ownerScope.update('t', () => 1);
  assert.match(sql, /role" = 'admin'/);
  assert.doesNotMatch(sql, /lower\(t\."user_email"\)/);
  // „przeczytane” na własnym wierszu — zwykły zakres (mój wiersz albo admin)
  const own = { table: 'conversation_participants', op: 'update', values: { last_read_at: 'x' }, filters: [{ type: 'eq', column: 'id', value: 1 }],
    __ownerScope: conversationScope('conversation_participants', { email: 'jan@kosciol.pl' }) };
  await enforceConversationWrite(own, req(fakeDb([])));
  assert.match(own.__ownerScope.update('t', () => 1), /lower\(t\."user_email"\)/);
});

test('rozmowa 1:1: druga z tą samą osobą nie powstaje (409 DIRECT_EXISTS, pusta rozmowa sprzątnięta)', async () => {
  const calls = [];
  const db = { query: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('FROM conversations c')) return { rows: [{ id: 'new', type: 'direct', n: 0, created_by: 'jan@kosciol.pl' }] };
    if (sql.includes('FROM conversations d')) return { rows: [{ id: 'old' }] };
    return { rows: [] };
  } };
  const q = { table: 'conversation_participants', op: 'insert', values: [
    { conversation_id: 'new', user_email: 'Jan@Kosciol.pl', role: 'admin' },
    { conversation_id: 'new', user_email: 'ola@x.pl', role: 'admin' },
  ] };
  await assert.rejects(enforceConversationWrite(q, req(db)), (e) => e.status === 409 && e.code === 'DIRECT_EXISTS');
  const lookup = calls.find((c) => c.sql.includes('FROM conversations d'));
  assert.deepEqual(lookup.params, ['new', ['jan@kosciol.pl', 'ola@x.pl']]);
  assert.ok(calls.some((c) => c.sql.includes('DELETE FROM conversations e') && c.params[0] === 'new'));
});

test('rozmowa 1:1: pierwsza z daną osobą i grupy — bez strażnika duplikatów', async () => {
  const seen = [];
  const mk = (type) => ({ query: async (sql) => {
    seen.push(sql);
    if (sql.includes('FROM conversations c')) return { rows: [{ id: 'n1', type, n: 0, created_by: 'jan@kosciol.pl' }] };
    return { rows: [] };
  } });
  await enforceConversationWrite({ table: 'conversation_participants', op: 'insert', values: [
    { conversation_id: 'n1', user_email: 'jan@kosciol.pl' }, { conversation_id: 'n1', user_email: 'ola@x.pl' },
  ] }, req(mk('direct')));
  seen.length = 0;
  await enforceConversationWrite({ table: 'conversation_participants', op: 'insert', values: [
    { conversation_id: 'n1', user_email: 'jan@kosciol.pl' }, { conversation_id: 'n1', user_email: 'ola@x.pl' },
  ] }, req(mk('group')));
  assert.ok(!seen.some((s) => s.includes('FROM conversations d')));
});

test('stara rozmowa (rola uczestnika NULL) — wiadomość przechodzi', async () => {
  const db = fakeDb([
    ['FROM conversations c', () => [{ id: 'c9', type: 'direct', posting_policy: 'everyone', n: 2 }]],
    ['FROM conversation_participants WHERE conversation_id', () => [{ role: null }]],
  ]);
  const q = { table: 'messages', op: 'insert', values: { conversation_id: 'c9', content: 'hej' } };
  await enforceConversationWrite(q, req(db));
  assert.equal(q.values.sender_email, 'Jan@Kosciol.pl');
});

test('powiadomienie o wiadomości: link działa w webie i w aplikacji, podgląd opisuje załączniki', async () => {
  const { messageLink, messagePreview } = await import('../src/realtime/push-hooks.js');
  assert.equal(messageLink('c1-uuid'), '/komunikator?conversation=c1-uuid');
  assert.equal(messagePreview({ content: '  hej\n tam ' }), 'hej tam');
  assert.equal(messagePreview({ content: '', attachments: [{ type: 'image/jpeg' }] }), '📷 Zdjęcie');
  assert.equal(messagePreview({ content: '', attachments: JSON.stringify([{ type: 'audio/webm', isVoiceMessage: true }]) }), '🎤 Wiadomość głosowa');
  assert.equal(messagePreview({ content: '', attachments: [{ name: 'plan.pdf', type: 'application/pdf' }] }), '📎 plan.pdf');
  assert.equal(messagePreview({ content: '', attachments: {} }), 'Nowa wiadomość');
  assert.equal(messagePreview({ message_type: 'prayer', content: 'Za chorych' }), '🙏 Za chorych');
});
