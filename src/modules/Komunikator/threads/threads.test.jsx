import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  replyCountOf, hasThread, canStartThread, replyCountLabel, repliersByRoot, addReply, applyReplyUpdate, isFollowing, threadParam,
} from './threadLogic';
import { applyIncomingMessage } from '../utils/chatLogic';

// Baza bez sieci: maybeSingle() zwraca wiadomość główną z globalThis.__threadRoot, reszta — pusto.
vi.mock('../../../lib/supabase', () => {
  const builder = () => {
    let single = false;
    const b = new Proxy({}, {
      get: (_t, prop) => {
        if (prop === 'then') return (res) => Promise.resolve({ data: single ? (globalThis.__threadRoot ?? null) : [], error: null, count: 0 }).then(res);
        if (prop === 'maybeSingle') return () => { single = true; return b; };
        return () => b;
      },
    });
    return b;
  };
  return {
    supabase: {
      from: () => builder(),
      functions: { invoke: async () => ({ data: null, error: null }) },
      storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: null }) }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; }, unsubscribe() {} }),
      removeChannel: () => {},
    },
  };
});

const { default: ThreadChip } = await import('./ThreadChip');
const { default: MessageBubble } = await import('../components/MessageBubble');
const { default: ThreadPanel } = await import('./ThreadPanel');

describe('wątki — logika', () => {
  it('liczniki, kto może zacząć wątek, odmiana „odpowiedź/odpowiedzi”', () => {
    expect(replyCountOf({ thread_reply_count: '3' })).toBe(3);
    expect(replyCountOf({})).toBe(0);
    expect(hasThread({ thread_reply_count: 1 })).toBe(true);
    expect(canStartThread({ id: 'm1', message_type: 'text' })).toBe(true);
    expect(canStartThread({ id: 'm1', thread_root_id: 'r' })).toBe(false); // odpowiedź nie zaczyna wątku
    expect(canStartThread({ id: 'm1', message_type: 'system' })).toBe(false);
    expect(canStartThread({ id: 'm1', deleted_at: 'x' })).toBe(false);
    expect(replyCountLabel(1)).toBe('1 odpowiedź');
    expect(replyCountLabel(3)).toBe('3 odpowiedzi');
    expect(replyCountLabel(12)).toBe('12 odpowiedzi');
  });

  it('ostatni odpowiadający: najnowsi pierwsi, bez powtórzeń, najwyżej 3', () => {
    const rows = [
      { thread_root_id: 'r1', sender_email: 'a@x.pl', created_at: '2026-10-01T10:00:00Z' },
      { thread_root_id: 'r1', sender_email: 'B@x.pl', created_at: '2026-10-01T12:00:00Z' },
      { thread_root_id: 'r1', sender_email: 'b@x.pl', created_at: '2026-10-01T11:00:00Z' },
      { thread_root_id: 'r1', sender_email: 'c@x.pl', created_at: '2026-10-01T09:00:00Z' },
      { thread_root_id: 'r1', sender_email: 'd@x.pl', created_at: '2026-10-01T08:00:00Z' },
      { thread_root_id: 'r2', sender_email: 'a@x.pl', created_at: '2026-10-01T08:00:00Z' },
    ];
    expect(repliersByRoot(rows)).toEqual({ r1: ['B@x.pl', 'a@x.pl', 'c@x.pl'], r2: ['a@x.pl'] });
  });

  it('lista odpowiedzi: dopisanie bez duplikatów i po czasie, edycja, usunięcie', () => {
    const a = { id: 'a', created_at: '2026-10-01T10:00:00Z', content: 'A' };
    const b = { id: 'b', created_at: '2026-10-01T09:00:00Z', content: 'B' };
    let list = addReply([], a);
    list = addReply(list, b);
    list = addReply(list, a);
    expect(list.map((m) => m.id)).toEqual(['b', 'a']);
    expect(addReply(list, { id: 'c', deleted_at: 'x' })).toBe(list);
    expect(applyReplyUpdate(list, { id: 'a', content: 'A2' })[1].content).toBe('A2');
    expect(applyReplyUpdate(list, { id: 'a', deleted_at: 'x' }).map((m) => m.id)).toEqual(['b']);
    expect(applyReplyUpdate(list, { id: 'zzz', content: 'x' })).toBe(list);
  });

  it('obserwowanie i parametr ?thread=', () => {
    expect(isFollowing([{ user_email: 'jan@x.pl', following: true }], 'Jan@X.pl')).toBe(true);
    expect(isFollowing([{ user_email: 'jan@x.pl', following: false }], 'jan@x.pl')).toBe(false);
    expect(isFollowing([], 'jan@x.pl')).toBe(false);
    expect(threadParam('11111111-2222-3333-4444-555555555555')).toBe('11111111-2222-3333-4444-555555555555');
    expect(threadParam('<script>')).toBe(null);
    expect(threadParam(null)).toBe(null);
  });

  it('lista rozmów: odpowiedź w wątku nie zmienia podglądu ani licznika', () => {
    const list = [{ id: 'c1', lastMessage: { id: 'm0', created_at: '2026-10-01T09:00:00Z' }, unreadCount: 0 }];
    const reply = { id: 'm1', conversation_id: 'c1', thread_root_id: 'm0', sender_email: 'ola@x.pl', created_at: '2026-10-01T10:00:00Z' };
    expect(applyIncomingMessage(list, reply, 'jan@x.pl')).toBe(list);
    const next = applyIncomingMessage(list, { ...reply, thread_root_id: null }, 'jan@x.pl');
    expect(next[0].unreadCount).toBe(1);
  });
});

describe('wątki — widok', () => {
  it('pigułka „N odpowiedzi · ostatnia …” z awatarami otwiera wątek', () => {
    const onOpen = vi.fn();
    const msg = { id: 'r1', thread_reply_count: 2, thread_last_reply_at: '2026-10-01T10:30:00Z' };
    render(<ThreadChip message={msg} repliers={['ola@x.pl']} userOf={(e) => ({ email: e, full_name: 'Ola Nowak' })} onOpen={onOpen} />);
    const btn = screen.getByRole('button', { name: /Otwórz wątek: 2 odpowiedzi/ });
    expect(screen.getByText('2 odpowiedzi')).toBeTruthy();
    expect(screen.getByText(/^ostatnia /)).toBeTruthy();
    fireEvent.click(btn);
    expect(onOpen).toHaveBeenCalledWith(msg);
  });

  it('bez odpowiedzi — pigułki nie ma', () => {
    const { container } = render(<ThreadChip message={{ id: 'r1', thread_reply_count: 0 }} onOpen={() => {}} />);
    expect(container.innerHTML).toBe('');
  });

  it('menu wiadomości: „Odpowiedz w wątku”, a „Przekaż” tylko z obsługą przekazania', () => {
    const onReplyInThread = vi.fn();
    const message = { id: 'm1', sender_email: 'ola@x.pl', content: 'Kto prowadzi?', created_at: '2026-10-07T10:00:00Z' };
    render(<MessageBubble message={message} isOwn={false} currentUserEmail="ja@x.pl" onReplyInThread={onReplyInThread} />);
    fireEvent.click(screen.getByLabelText('Więcej działań'));
    expect(screen.queryByRole('menuitem', { name: 'Przekaż' })).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Odpowiedz w wątku' }));
    expect(onReplyInThread).toHaveBeenCalledWith(message);
  });

  it('panel wątku: wiadomość główna, brak odpowiedzi, „Obserwuj”, pole odpowiedzi; zamknięcie', async () => {
    globalThis.__threadRoot = { id: 'r1', conversation_id: 'c1', sender_email: 'ola@x.pl', content: 'Kto prowadzi uwielbienie?', created_at: '2026-10-07T10:00:00Z' };
    const onClose = vi.fn();
    render(
      <ThreadPanel conversation={{ id: 'c1', name: 'Liderzy' }} rootId="r1" userEmail="ja@x.pl" canPost
        participants={[{ user_email: 'ola@x.pl', full_name: 'Ola Nowak' }]} onClose={onClose} />
    );
    expect(await screen.findByText('Kto prowadzi uwielbienie?')).toBeTruthy();
    expect(screen.getByText('Jeszcze nikt nie odpowiedział')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Obserwuj/ }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByPlaceholderText('Odpowiedz w wątku…')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Zamknij wątek' }));
    expect(onClose).toHaveBeenCalled();
    delete globalThis.__threadRoot;
  });
});
