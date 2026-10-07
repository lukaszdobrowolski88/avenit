import { describe, it, expect } from 'vitest';
import * as web from './chatLogic';
import * as mobile from '../../../../packages/mobile/src/features/messenger/logic';

const {
  sameEmail, emailPattern, sortConversations, buildParticipantRows, findDirectConversation,
  appendMessage, mergeOlderMessages, applyMessageUpdate, unreadIdsToMark, canPostIn, leaveBlocker,
  applyIncomingMessage,
} = web;

describe('Komunikator — czysta logika', () => {
  it('porównuje e-maile bez względu na wielkość liter', () => {
    expect(sameEmail('Jan@Kosciol.pl', 'jan@kosciol.pl')).toBe(true);
    expect(sameEmail('', '')).toBe(false);
    expect(sameEmail('a@b.pl', 'c@b.pl')).toBe(false);
    // wzorzec ILIKE: znaki specjalne dosłownie
    expect(emailPattern('jan_kowalski%1@x.pl')).toBe('jan\\_kowalski\\%1@x.pl');
  });

  it('skład nowej rozmowy: twórca = admin, bez duplikatów i bez twórcy na liście', () => {
    const rows = buildParticipantRows('c1', 'ja@x.pl', ['Ola@x.pl', 'ola@x.pl', 'JA@x.pl', 'ewa@x.pl']);
    expect(rows).toEqual([
      { conversation_id: 'c1', user_email: 'ja@x.pl', role: 'admin' },
      { conversation_id: 'c1', user_email: 'Ola@x.pl', role: 'member' },
      { conversation_id: 'c1', user_email: 'ewa@x.pl', role: 'member' },
    ]);
    const direct = buildParticipantRows('c2', 'ja@x.pl', ['ola@x.pl'], { allAdmins: true });
    expect(direct.map(r => r.role)).toEqual(['admin', 'admin']);
  });

  it('znajduje istniejącą rozmowę prywatną (także zarchiwizowaną), przy duplikatach — najświeższą', () => {
    const list = [
      { id: 'g', type: 'group', participants: [{ user_email: 'ola@x.pl' }] },
      { id: 'd', type: 'direct', archived: true, participants: [{ user_email: 'ja@x.pl' }, { user_email: 'OLA@x.pl' }] },
    ];
    expect(findDirectConversation(list, 'ja@x.pl', 'ola@x.pl')?.id).toBe('d');
    expect(findDirectConversation(list, 'ja@x.pl', 'ewa@x.pl')).toBeNull();
    expect(findDirectConversation(list, 'ja@x.pl', 'JA@x.pl')).toBeNull();
    const dupes = [
      { id: 'empty', type: 'direct', created_at: '2026-01-01', participants: [{ user_email: 'ola@x.pl' }] },
      { id: 'live', type: 'direct', created_at: '2026-02-01', lastMessage: { created_at: '2026-10-01' }, participants: [{ user_email: 'ola@x.pl' }] },
      { id: 'old', type: 'direct', created_at: '2025-01-01', lastMessage: { created_at: '2026-03-01' }, participants: [{ user_email: 'ola@x.pl' }] },
    ];
    expect(findDirectConversation(dupes, 'ja@x.pl', 'ola@x.pl')?.id).toBe('live');
  });

  it('sortuje: przypięte na górze, potem od najświeższej wiadomości (nowa pusta rozmowa po dacie utworzenia)', () => {
    const list = [
      { id: 'old', updated_at: '2026-09-01', lastMessage: { created_at: '2026-01-02' } },
      { id: 'new', updated_at: '2026-01-01', lastMessage: { created_at: '2026-03-01' } },
      { id: 'star', updated_at: '2025-01-01', starred: true, unreadCount: 3, lastMessage: { created_at: '2025-06-01' } },
      { id: 'pin', updated_at: '2025-01-01', pinned: true },
      { id: 'fresh', created_at: '2026-04-01' },
    ];
    expect([...list].sort(sortConversations).map(c => c.id)).toEqual(['pin', 'fresh', 'new', 'old', 'star']);
  });

  it('nowa wiadomość z realtime: rozmowa na górę, podgląd, licznik, wyjście z archiwum', () => {
    const list = [
      { id: 'a', lastMessage: { id: 'm1', created_at: '2026-10-01T10:00:00Z' }, unreadCount: 0 },
      { id: 'b', archived: true, lastMessage: { id: 'm0', created_at: '2026-09-01T10:00:00Z' }, unreadCount: 0 },
    ];
    const msg = { id: 'm2', conversation_id: 'b', sender_email: 'ola@x.pl', created_at: '2026-10-02T10:00:00Z' };
    const next = applyIncomingMessage(list, msg, 'ja@x.pl');
    expect(next.map(c => c.id)).toEqual(['b', 'a']);
    expect(next[0]).toMatchObject({ archived: false, unreadCount: 1, lastMessage: { id: 'm2' } });
    // ten sam komunikat drugi raz (wysłany + realtime) — bez podwójnego licznika
    expect(applyIncomingMessage(next, msg, 'ja@x.pl')[0].unreadCount).toBe(1);
    // moja wiadomość albo otwarta rozmowa — licznik bez zmian
    const mine = applyIncomingMessage(list, { ...msg, id: 'm3', sender_email: 'JA@x.pl' }, 'ja@x.pl');
    expect(mine[0].unreadCount).toBe(0);
    const open = applyIncomingMessage(list, { ...msg, id: 'm4' }, 'ja@x.pl', { openId: 'b' });
    expect(open[0].unreadCount).toBe(0);
    // obca rozmowa (jeszcze nie na liście) — lista bez zmian, odświeży ją pobranie
    expect(applyIncomingMessage(list, { ...msg, conversation_id: 'zz' }, 'ja@x.pl')).toBe(list);
  });

  it('dopisanie wiadomości bez duplikatu (wysłana + realtime)', () => {
    const a = [{ id: 1 }];
    expect(appendMessage(a, { id: 1 })).toBe(a);
    expect(appendMessage(a, { id: 2 }).map(m => m.id)).toEqual([1, 2]);
  });

  it('starsze wiadomości: bez duplikatów i w kolejności', () => {
    const list = [{ id: 'c', created_at: '2026-01-03' }, { id: 'd', created_at: '2026-01-04' }];
    const older = [{ id: 'a', created_at: '2026-01-01' }, { id: 'b', created_at: '2026-01-02' }, { id: 'c', created_at: '2026-01-03' }];
    expect(mergeOlderMessages(list, older).map(m => m.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(mergeOlderMessages(list, [{ id: 'c', created_at: '2026-01-03' }])).toBe(list);
  });

  it('realtime: edycja nadpisuje treść (z zachowaniem nadawcy), soft delete usuwa', () => {
    const list = [{ id: 1, content: 'a', sender: { full_name: 'Ola' } }, { id: 2, content: 'b' }];
    const edited = applyMessageUpdate(list, { id: 1, content: 'A', edited_at: 'x' });
    expect(edited[0]).toMatchObject({ content: 'A', sender: { full_name: 'Ola' } });
    expect(applyMessageUpdate(list, { id: 2, deleted_at: 'x' }).map(m => m.id)).toEqual([1]);
    expect(applyMessageUpdate(list, { id: 9, content: 'z' })).toBe(list);
  });

  it('potwierdzenia: tylko cudze, jeszcze nieoznaczone i nieprzeczytane', () => {
    const msgs = [
      { id: 1, sender_email: 'ja@x.pl' },
      { id: 2, sender_email: 'ola@x.pl' },
      { id: 3, sender_email: 'ola@x.pl' },
      { id: 4, sender_email: 'ola@x.pl' },
    ];
    const receipts = { 3: [{ user_email: 'JA@x.pl', read_at: 't' }] };
    expect(unreadIdsToMark(msgs, 'ja@x.pl', new Set([4]), receipts)).toEqual([2]);
  });

  it('kanał ogłoszeń: pisze tylko administrator rozmowy', () => {
    expect(canPostIn({ posting_policy: 'admins', myRole: 'member' })).toBe(false);
    expect(canPostIn({ posting_policy: 'admins', myRole: 'admin' })).toBe(true);
    expect(canPostIn({ posting_policy: 'admins', my_role: 'admin' })).toBe(true);
    expect(canPostIn({ type: 'group' })).toBe(true);
    expect(canPostIn(null)).toBe(false);
  });

  it('wyjście z rozmowy: nie z kanału służby i nie jako jedyny administrator', () => {
    const ps = (roles) => roles.map(([e, r]) => ({ user_email: e, role: r }));
    expect(leaveBlocker({ type: 'ministry', participants: [] }, 'ja@x.pl')).toBe('ministry');
    expect(leaveBlocker({ type: 'group', myRole: 'admin', participants: ps([['ja@x.pl', 'admin'], ['ola@x.pl', 'member']]) }, 'ja@x.pl')).toBe('lastAdmin');
    expect(leaveBlocker({ type: 'group', myRole: 'admin', participants: ps([['ja@x.pl', 'admin'], ['ola@x.pl', 'admin']]) }, 'ja@x.pl')).toBeNull();
    expect(leaveBlocker({ type: 'group', myRole: 'member', participants: ps([['ja@x.pl', 'member'], ['ola@x.pl', 'admin']]) }, 'ja@x.pl')).toBeNull();
    expect(leaveBlocker({ type: 'group', myRole: 'admin', participants: ps([['ja@x.pl', 'admin']]) }, 'ja@x.pl')).toBeNull();
  });
});

// Te same przypadki na wersji webowej i mobilnej — lista, liczniki i podglądy mają się zgadzać.
describe.each([['web', web], ['mobilka', mobile]])('Komunikator — wspólne zasady (%s)', (_name, L) => {
  it('liczy nieprzeczytane od „przeczytane” (bez swoich i systemowych), bez niego — od dołączenia', () => {
    const rows = [
      { conversation_id: 'a', sender_email: 'ola@x.pl', created_at: '2026-10-01T10:00:00Z' },
      { conversation_id: 'a', sender_email: 'ola@x.pl', created_at: '2026-10-01T12:00:00Z', content: 'ostatnia' },
      { conversation_id: 'a', sender_email: 'JA@x.pl', created_at: '2026-10-01T11:00:00Z' },
      { conversation_id: 'a', sender_email: 'x@x.pl', message_type: 'system', created_at: '2026-10-01T11:30:00Z' },
      { conversation_id: 'b', sender_email: 'ola@x.pl', created_at: '2026-10-01T09:00:00Z' },
    ];
    const since = { a: L.readSince({ last_read_at: '2026-10-01T10:30:00Z' }), b: L.readSince({ joined_at: '2026-10-01T09:30:00Z' }) };
    const { last, unread } = L.summarizeMessages(rows, 'ja@x.pl', since);
    expect(last.a.content).toBe('ostatnia');
    expect(unread).toEqual({ a: 1 });
    expect(L.summarizeMessages(rows, 'ja@x.pl', new Map(Object.entries(since))).unread).toEqual({ a: 1 });
    expect(L.countUnread(rows.filter(r => r.conversation_id === 'a'), 'ja@x.pl', null)).toBe(2);
  });

  it('„przeczytane” nie wcześniej niż ostatnia wiadomość (spóźniony zegar urządzenia)', () => {
    const now = Date.parse('2026-10-01T10:00:00Z');
    expect(L.readMarkTimestamp('2026-10-01T10:00:05.123Z', now)).toBe('2026-10-01T10:00:05.123Z');
    expect(L.readMarkTimestamp('2026-10-01T09:00:00Z', now)).toBe('2026-10-01T10:00:00.000Z');
    expect(L.readMarkTimestamp(null, now)).toBe('2026-10-01T10:00:00.000Z');
  });

  it('pełna paczka najnowszych wiadomości — wskazuje rozmowy do dociągnięcia', () => {
    const rows = [{ conversation_id: 'a' }, { conversation_id: 'a' }];
    expect(L.conversationsMissingLast(rows, ['a', 'b'], 2)).toEqual(['b']);
    expect(L.conversationsMissingLast(rows, ['a', 'b'], 5)).toEqual([]);
  });

  it('podgląd ostatniej wiadomości: „Ty:”, imię w grupie, opisy załączników zamiast pustego', () => {
    const P = (m, o) => L.lastMessagePreview(m, { myEmail: 'ja@x.pl', ...o });
    expect(P({ sender_email: 'JA@x.pl', content: 'hej\n  tam' }, { convType: 'direct' })).toBe('Ty: hej tam');
    expect(P({ sender_email: 'ola@x.pl', content: 'cześć' }, { convType: 'direct', senderName: 'Ola Nowak' })).toBe('cześć');
    expect(P({ sender_email: 'ola@x.pl', content: 'cześć' }, { convType: 'group', senderName: 'Ola Nowak' })).toBe('Ola: cześć');
    expect(P({ sender_email: 'ola@x.pl', content: '', attachments: [{ type: 'image/jpeg' }] }, { convType: 'direct' })).toBe('📷 Zdjęcie');
    expect(P({ sender_email: 'ola@x.pl', attachments: [{ type: 'image/png' }, { type: 'image/png' }] }, { convType: 'direct' })).toBe('📷 Zdjęcia: 2');
    expect(P({ sender_email: 'ola@x.pl', attachments: [{ type: 'audio/webm', isVoiceMessage: true }] }, { convType: 'direct' })).toBe('🎤 Wiadomość głosowa');
    expect(P({ sender_email: 'ola@x.pl', attachments: [{ name: 'voice-1-3s.m4a', type: 'audio/m4a' }] }, { convType: 'direct' })).toBe('🎤 Wiadomość głosowa');
    expect(P({ sender_email: 'ola@x.pl', attachments: [{ name: 'plan.pdf', type: 'application/pdf' }] }, { convType: 'direct' })).toBe('📎 plan.pdf');
    expect(P({ sender_email: 'ola@x.pl', attachments: {} }, { convType: 'direct' })).toBe('');
    expect(P({ sender_email: 'ola@x.pl', message_type: 'poll', content: 'Kiedy próba?' }, { convType: 'group', senderName: 'Ola' })).toBe('Ola: 📊 Kiedy próba?');
    expect(P({ sender_email: 'ola@x.pl', message_type: 'prayer', content: '' }, { convType: 'direct' })).toBe('🙏 Prośba o modlitwę');
    // tłumacz (web: tr)
    expect(L.previewText({ attachments: [{ type: 'image/png' }, { type: 'image/png' }] }, (s, v) => `[${s}]${v ? v.n : ''}`)).toBe('📷 [Zdjęcia: {n}]2');
  });

  it('długość głosówki: duration (s), starsze nagrania z telefonu — size w ms, nigdy rozmiar pliku', () => {
    expect(L.voiceDurationMs({ duration: 12, size: 40000, isVoiceMessage: true })).toBe(12000);
    expect(L.voiceDurationMs({ name: 'voice-1-abc-4s.m4a', size: 4200 })).toBe(4200);
    expect(L.voiceDurationMs({ name: 'Wiadomość głosowa', type: 'audio/webm', size: 40000, isVoiceMessage: true })).toBeUndefined();
  });

  it('filtry i sekcje: te same nazwy i kolejność', () => {
    const list = [
      { id: 'd1', type: 'direct', unread_count: 2, unreadCount: 2, last_message: { created_at: '2026-10-02' }, lastMessage: { created_at: '2026-10-02' } },
      { id: 'g1', type: 'group', starred: true },
      { id: 'm1', type: 'ministry' },
      { id: 'a1', type: 'announcement' },
      { id: 'p1', type: 'group', pinned: true },
      { id: 'x1', type: 'direct', archived: true, starred: true },
    ];
    const ids = (f) => list.filter(c => L.matchesFilter(c, f)).map(c => c.id);
    expect(L.CONVERSATION_FILTERS).toEqual(['all', 'unread', 'starred', 'archived']);
    expect(ids('all')).toEqual(['d1', 'g1', 'm1', 'a1', 'p1']);
    expect(ids('unread')).toEqual(['d1']);
    expect(ids('starred')).toEqual(['g1']);
    expect(ids('archived')).toEqual(['x1']);
    // pusta rozmowa 1:1 założona przez kogoś innego — ukryta do pierwszej wiadomości; moja pusta — widoczna
    const foreignEmpty = { id: 'e1', type: 'direct', created_by: 'Ola@x.pl' };
    const mineEmpty = { id: 'e2', type: 'direct', created_by: 'JA@x.pl' };
    const foreignWithMsg = { ...foreignEmpty, last_message: { created_at: 'x' }, lastMessage: { created_at: 'x' } };
    expect(L.matchesFilter(foreignEmpty, 'all', 'ja@x.pl')).toBe(false);
    expect(L.matchesFilter(mineEmpty, 'all', 'ja@x.pl')).toBe(true);
    expect(L.matchesFilter(foreignWithMsg, 'all', 'ja@x.pl')).toBe(true);
    expect(L.matchesFilter({ id: 'g', type: 'group', created_by: 'ola@x.pl' }, 'all', 'ja@x.pl')).toBe(true);
    const sections = L.groupIntoSections(list.filter(c => L.matchesFilter(c, 'all')));
    expect(sections.map(s => s.key)).toEqual(['pinned', 'announcement', 'direct', 'group', 'ministry']);
    expect(sections.slice(0, 4).map(s => s.title)).toEqual(['Przypięte', 'Ogłoszenia', 'Prywatne', 'Grupy']);
  });

  it('wybór rozmowy 1:1 spośród duplikatów i @wzmianki bez względu na wielkość liter', () => {
    const picked = L.pickDirectConversation([
      { id: 'e', created_at: '2026-01-01' },
      { id: 'm', created_at: '2026-02-01', last_message: { created_at: '2026-10-01' }, lastMessage: { created_at: '2026-10-01' } },
    ]);
    expect(picked.id).toBe('m');
    expect(L.pickDirectConversation([])).toBeNull();
    expect(L.mentionsUser({ mentions: ['Jan@X.pl'] }, 'jan@x.pl')).toBe(true);
    expect(L.mentionsUser({ mentions: null }, 'jan@x.pl')).toBe(false);
  });
});

describe('Komunikator — aplikacja: nowa wiadomość na liście (kształt last_message/unread_count)', () => {
  it('podnosi rozmowę, liczy nieprzeczytane i wyjmuje z archiwum', () => {
    const list = [
      { id: 'a', last_message: { id: 'm1', created_at: '2026-10-01T10:00:00Z' }, unread_count: 0 },
      { id: 'b', archived: true, last_message: { id: 'm0', created_at: '2026-09-01T10:00:00Z' }, unread_count: 4 },
    ];
    const msg = { id: 'm2', conversation_id: 'b', sender_email: 'ola@x.pl', created_at: '2026-10-02T10:00:00Z' };
    const next = mobile.applyIncomingMessage(list, msg, 'ja@x.pl');
    expect(next.map(c => c.id)).toEqual(['b', 'a']);
    expect(next[0]).toMatchObject({ archived: false, unread_count: 5, last_message: { id: 'm2' } });
    expect(mobile.applyIncomingMessage(undefined, msg, 'ja@x.pl')).toBeUndefined();
  });

  it('czas na liście jak w webie', () => {
    const now = new Date(2026, 9, 7, 15, 0);
    expect(mobile.formatListTime(new Date(2026, 9, 7, 9, 5).toISOString(), now)).toBe('09:05');
    expect(mobile.formatListTime(new Date(2026, 9, 6, 23, 0).toISOString(), now)).toBe('Wczoraj');
    expect(mobile.formatListTime(new Date(2026, 9, 3, 12, 0).toISOString(), now)).toBe('sobota');
    expect(mobile.formatListTime(new Date(2026, 8, 20, 12, 0).toISOString(), now)).toBe('20 wrz');
  });
});

describe('Komunikator+ — czysta logika (web)', () => {
  const L = web;

  it('sekcja kanałów nazywa się „Kanały” (służby i grupy domowe)', () => {
    expect(L.SECTION_TITLES.ministry).toBe('Kanały');
  });

  it('K8: kanał grupy domowej i nazwa z bazy przed zapasową etykietą', () => {
    const hg = { type: 'ministry', ministry_key: 'home_group:42', name: 'Grupa Krzyki' };
    expect(L.isHomeGroupChannel(hg)).toBe(true);
    expect(L.homeGroupIdOf(hg)).toBe('42');
    expect(L.isHomeGroupChannel({ type: 'ministry', ministry_key: 'worship_team' })).toBe(false);
    expect(L.isHomeGroupChannel({ type: 'group', ministry_key: 'home_group:1' })).toBe(false);
    const fallback = (k) => (k === 'kids_ministry' ? 'Etykieta zapasowa' : '');
    expect(L.channelName({ name: 'Dzieci', ministry_key: 'kids_ministry' }, fallback)).toBe('Dzieci');
    expect(L.channelName({ name: '  ', ministry_key: 'kids_ministry' }, fallback)).toBe('Etykieta zapasowa');
    expect(L.channelName({ ministry_key: 'custom_x' }, fallback)).toBe('custom_x');
  });

  it('K4: wyciszenie — zawsze, do czasu, wygasłe', () => {
    const now = Date.parse('2026-10-07T12:00:00Z');
    expect(L.muteState({ muted: true }, now)).toEqual({ muted: true, until: null });
    expect(L.muteState({ mutedUntil: '2026-10-07T13:00:00Z' }, now).muted).toBe(true);
    expect(L.muteState({ muted_until: '2026-10-07T13:00:00Z' }, now).until.toISOString()).toBe('2026-10-07T13:00:00.000Z');
    expect(L.isMutedNow({ mutedUntil: '2026-10-07T11:59:00Z' }, now)).toBe(false);
    expect(L.isMutedNow({}, now)).toBe(false);
  });

  it('K4: zapis wyciszenia dla opcji menu', () => {
    const now = new Date(2026, 9, 7, 22, 30).getTime();
    expect(L.mutePatch('always', now)).toEqual({ muted: true, muted_until: null });
    expect(L.mutePatch('off', now)).toEqual({ muted: false, muted_until: null });
    expect(L.mutePatch('1h', now)).toEqual({ muted: false, muted_until: new Date(now + 3600000).toISOString() });
    expect(L.mutePatch('8h', now).muted_until).toBe(new Date(now + 8 * 3600000).toISOString());
    expect(L.mutePatch('tomorrow', now)).toEqual({ muted: false, muted_until: new Date(2026, 9, 8, 8, 0).toISOString() });
    // „do kiedy”: dziś / jutro / później
    expect(L.muteUntilKind(new Date(2026, 9, 7, 23, 0), now).kind).toBe('today');
    expect(L.muteUntilKind(new Date(2026, 9, 8, 8, 0), now).kind).toBe('tomorrow');
    expect(L.muteUntilKind(new Date(2026, 9, 10, 8, 0), now).kind).toBe('date');
    expect(L.muteUntilKind(null, now)).toBeNull();
  });

  it('K5: @wszyscy — "*" w mentions, dotyczy mnie (nie moich), wolno administratorowi', () => {
    const m = { sender_email: 'ola@x.pl', mentions: ['*'] };
    expect(L.mentionsAll(m)).toBe(true);
    expect(L.mentionsMe(m, 'ja@x.pl')).toBe(true);
    expect(L.mentionsMe({ ...m, sender_email: 'JA@x.pl' }, 'ja@x.pl')).toBe(false);
    expect(L.mentionsMe({ sender_email: 'ola@x.pl', mentions: ['Ja@X.pl'] }, 'ja@x.pl')).toBe(true);
    expect(L.mentionsMe({ sender_email: 'ola@x.pl', mentions: ['ewa@x.pl'] }, 'ja@x.pl')).toBe(false);
    expect(L.canMentionAll({ type: 'group', myRole: 'admin' })).toBe(true);
    expect(L.canMentionAll({ type: 'ministry', myRole: 'member' })).toBe(false);
    expect(L.canMentionAll({ type: 'ministry', myRole: 'member' }, true)).toBe(true);
    expect(L.canMentionAll({ type: 'direct', myRole: 'admin' }, true)).toBe(false);
    expect(L.canMentionAll(null, true)).toBe(false);
  });

  it('K6: ✓✓ w kolorze dopiero, gdy przeczytali WSZYSCY pozostali', () => {
    const ps = ['ja@x.pl', 'ola@x.pl', 'ewa@x.pl'];
    const r = (e, read, delivered) => ({ user_email: e, read_at: read ? 't' : null, delivered_at: delivered ? 't' : null });
    expect(L.receiptStatus([], 'ja@x.pl', ps)).toBe('sent');
    expect(L.receiptStatus([r('ola@x.pl', true, true)], 'ja@x.pl', ps)).toBe('sent');
    expect(L.receiptStatus([r('ola@x.pl', true, true), r('ewa@x.pl', false, true)], 'ja@x.pl', ps)).toBe('delivered');
    expect(L.receiptStatus([r('OLA@x.pl', true, true), r('ewa@x.pl', true, false)], 'JA@x.pl', ps)).toBe('read');
    // 1:1 — druga osoba
    expect(L.receiptStatus([r('ola@x.pl', true, true)], 'ja@x.pl', ['ja@x.pl', 'ola@x.pl'])).toBe('read');
    // własny wiersz nadawcy się nie liczy; bez składu — jak dawniej (ktokolwiek)
    expect(L.receiptStatus([r('ja@x.pl', true, true)], 'ja@x.pl', ['ja@x.pl', 'ola@x.pl'])).toBe('sent');
    expect(L.receiptStatus([r('ola@x.pl', true, true)], 'ja@x.pl', [])).toBe('read');
  });

  it('K6: „Widziane przez” — bez nadawcy, bez duplikatów, od najwcześniejszych', () => {
    const list = L.seenBy([
      { user_email: 'ewa@x.pl', read_at: '2026-10-07T12:05:00Z' },
      { user_email: 'ja@x.pl', read_at: '2026-10-07T12:00:00Z' },
      { user_email: 'ola@x.pl', read_at: '2026-10-07T12:01:00Z' },
      { user_email: 'OLA@x.pl', read_at: '2026-10-07T12:09:00Z' },
      { user_email: 'adam@x.pl', read_at: null, delivered_at: 't' },
    ], 'ja@x.pl');
    expect(list.map(r => r.user_email)).toEqual(['ola@x.pl', 'ewa@x.pl']);
  });

  it('K7: ankieta — metadata.poll (kontrakt) i starszy format, zamknięcie', () => {
    const meta = L.buildPollMetadata({ question: ' Kiedy? ', options: [{ id: 'o1', text: ' pt ' }, { id: 'o2', text: '' }, { id: 'o3', text: 'sb' }], multiple: true, anonymous: true, closes_at: '2026-10-08T18:00:00.000Z' });
    expect(meta.poll).toEqual({ question: 'Kiedy?', options: [{ id: 'o1', text: 'pt' }, { id: 'o3', text: 'sb' }], multiple: true, anonymous: true, closes_at: '2026-10-08T18:00:00.000Z' });
    expect(meta.question).toBe('Kiedy?'); // pola na wierzchu dla starszych wersji aplikacji
    const p = L.pollOf({ metadata: meta });
    expect(p).toMatchObject({ multiple: true, anonymous: true, closes_at: '2026-10-08T18:00:00.000Z' });
    const legacy = L.pollOf({ content: 'Pytanie', metadata: { options: [{ id: 'a', text: 'A' }, 'B'], multiple: false } });
    expect(legacy).toMatchObject({ question: 'Pytanie', anonymous: false, closes_at: null });
    expect(legacy.options).toEqual([{ id: 'a', text: 'A' }, { id: 'o2', text: 'B' }]);
    expect(L.isPollClosed({ closes_at: '2026-10-07T11:00:00Z' }, Date.parse('2026-10-07T12:00:00Z'))).toBe(true);
    expect(L.isPollClosed({ closes_at: '2026-10-07T13:00:00Z' }, Date.parse('2026-10-07T12:00:00Z'))).toBe(false);
    expect(L.isPollClosed({ closes_at: null })).toBe(false);
  });

  it('K11: nieprzeczytane na pulpicie — jedna paczka, bez usuniętych, swoich i systemowych', () => {
    const rows = [
      { id: 1, conversation_id: 'a', sender_email: 'ola@x.pl', created_at: '2026-10-07T10:00:00Z' },
      { id: 2, conversation_id: 'a', sender_email: 'ola@x.pl', created_at: '2026-10-07T11:00:00Z' },
      { id: 3, conversation_id: 'a', sender_email: 'ola@x.pl', created_at: '2026-10-07T12:00:00Z', deleted_at: 'x' },
      { id: 4, conversation_id: 'a', sender_email: 'JA@x.pl', created_at: '2026-10-07T12:30:00Z' },
      { id: 5, conversation_id: 'b', sender_email: 'ewa@x.pl', created_at: '2026-10-07T09:00:00Z', message_type: 'system' },
      { id: 6, conversation_id: 'b', sender_email: 'ewa@x.pl', created_at: '2026-10-07T08:00:00Z' },
    ];
    const out = L.unreadSummary(rows, 'ja@x.pl', { a: '2026-10-07T09:30:00Z', b: '2026-10-07T08:30:00Z' });
    expect(out.a.count).toBe(2);
    expect(out.a.last.id).toBe(2);
    expect(out.b).toBeUndefined();
  });

  it('K10: wiadomość od zablokowanej osoby (nie moja, nie systemowa)', () => {
    const blocked = new Set(['ola@x.pl']);
    expect(L.isFromBlocked({ sender_email: 'Ola@X.pl' }, blocked, 'ja@x.pl')).toBe(true);
    expect(L.isFromBlocked({ sender_email: 'ola@x.pl', message_type: 'system' }, blocked, 'ja@x.pl')).toBe(false);
    expect(L.isFromBlocked({ sender_email: 'ewa@x.pl' }, blocked, 'ja@x.pl')).toBe(false);
    expect(L.isFromBlocked({ sender_email: 'ola@x.pl' }, null, 'ja@x.pl')).toBe(false);
  });
});
