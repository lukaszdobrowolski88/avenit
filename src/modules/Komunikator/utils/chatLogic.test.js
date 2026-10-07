import { describe, it, expect } from 'vitest';
import {
  sameEmail, emailPattern, sortConversations, buildParticipantRows, findDirectConversation,
  appendMessage, mergeOlderMessages, applyMessageUpdate, unreadIdsToMark, canPostIn, leaveBlocker,
} from './chatLogic';

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

  it('znajduje istniejącą rozmowę prywatną', () => {
    const list = [
      { id: 'g', type: 'group', participants: [{ user_email: 'ola@x.pl' }] },
      { id: 'd', type: 'direct', participants: [{ user_email: 'ja@x.pl' }, { user_email: 'OLA@x.pl' }] },
    ];
    expect(findDirectConversation(list, 'ja@x.pl', 'ola@x.pl')?.id).toBe('d');
    expect(findDirectConversation(list, 'ja@x.pl', 'ewa@x.pl')).toBeNull();
  });

  it('sortuje: przypięte, ulubione, nieprzeczytane, potem ostatnia wiadomość', () => {
    const list = [
      { id: 'old', updated_at: '2026-01-01', lastMessage: { created_at: '2026-01-02' } },
      { id: 'new', updated_at: '2026-01-01', lastMessage: { created_at: '2026-03-01' } },
      { id: 'unread', updated_at: '2025-01-01', unreadCount: 1 },
      { id: 'star', updated_at: '2025-01-01', starred: true },
      { id: 'pin', updated_at: '2025-01-01', pinned: true },
    ];
    expect([...list].sort(sortConversations).map(c => c.id)).toEqual(['pin', 'star', 'unread', 'new', 'old']);
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
