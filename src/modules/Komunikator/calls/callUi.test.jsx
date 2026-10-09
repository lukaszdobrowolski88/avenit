import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({}) }),
    functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
  },
}));
vi.mock('../../../hooks/usePresence', () => ({
  usePresence: () => ({ getStatus: () => 'offline' }),
  statusColors: { online: '', away: '', offline: '' },
  statusLabels: { online: 'Online', away: 'Zaraz wracam', offline: 'Offline' },
}));

const { CallsContext } = await import('./callContext');
const { initialCallState } = await import('./callLogic');
const { default: MessageBubble } = await import('../components/MessageBubble');
const { default: ConversationHeader } = await import('../components/ConversationHeader');
const { default: ActiveCallBanner } = await import('./ActiveCallBanner');

function fakeCalls(over = {}) {
  return {
    me: 'ja@x.pl',
    state: initialCallState,
    callsEnabled: true,
    activeCalls: {},
    activeCallFor: () => null,
    isCallLive: () => false,
    startCall: vi.fn(),
    joinCall: vi.fn(),
    callBack: vi.fn(),
    restore: vi.fn(),
    ...over,
  };
}
const withCalls = (ui, value) => <CallsContext.Provider value={value}>{ui}</CallsContext.Provider>;
const callMsg = (meta, sender = 'ola@x.pl') => ({
  id: 'm1', conversation_id: 'c1', sender_email: sender, message_type: 'call', content: 'Połączenie głosowe',
  created_at: '2026-10-09T10:00:00Z', metadata: meta,
});

describe('MessageBubble — wiadomości „połączenie”', () => {
  it('zakończone: ikona, opis i czas trwania; bez przycisków', () => {
    render(withCalls(<MessageBubble message={callMsg({ call_id: 'k1', kind: 'audio', status: 'ended', duration_sec: 720 })} isOwn={false} currentUserEmail="ja@x.pl" />, fakeCalls()));
    expect(screen.getByText('Połączenie głosowe')).toBeTruthy();
    expect(screen.getByText(/12 min/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('nieodebrane: „Oddzwoń” dzwoni z powrotem w tej rozmowie', () => {
    const calls = fakeCalls();
    render(withCalls(<MessageBubble message={callMsg({ call_id: 'k1', kind: 'video', status: 'missed' })} isOwn={false} currentUserEmail="ja@x.pl" />, calls));
    expect(screen.getByText('Nieodebrane połączenie wideo')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Oddzwoń/ }));
    expect(calls.callBack).toHaveBeenCalledWith('c1', 'video');
  });

  it('grupowa trwa: „Dołącz”', () => {
    const calls = fakeCalls({ isCallLive: (id) => id === 'k2' });
    render(withCalls(<MessageBubble message={callMsg({ call_id: 'k2', kind: 'audio', status: 'ringing', is_group: true })} isOwn={false} currentUserEmail="ja@x.pl" isGroupConversation />, calls));
    expect(screen.getByText('Rozmowa grupowa trwa')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Dołącz/ }));
    expect(calls.joinCall).toHaveBeenCalledWith(expect.objectContaining({ id: 'k2', conversation_id: 'c1' }), null, 'audio');
  });

  it('bez dostawcy połączeń (połączenia wyłączone) — tylko opis', () => {
    render(<MessageBubble message={callMsg({ call_id: 'k1', status: 'missed' })} isOwn={false} currentUserEmail="ja@x.pl" />);
    expect(screen.getByText('Nieodebrane połączenie')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('ConversationHeader — przyciski połączeń', () => {
  const direct = { id: 'c1', type: 'direct', displayName: 'Ola', posting_policy: 'everyone', participants: [] };

  it('można dzwonić: „Zadzwoń” i „Połączenie wideo” wołają startCall', () => {
    const calls = fakeCalls();
    render(withCalls(<ConversationHeader conversation={direct} />, calls));
    fireEvent.click(screen.getByRole('button', { name: 'Zadzwoń' }));
    expect(calls.startCall).toHaveBeenCalledWith(direct, 'audio');
    fireEvent.click(screen.getByRole('button', { name: 'Połączenie wideo' }));
    expect(calls.startCall).toHaveBeenCalledWith(direct, 'video');
  });

  it('kanał tylko dla administratorów i zablokowana osoba — przyciski nieaktywne z podpowiedzią', () => {
    const calls = fakeCalls();
    const channel = { id: 'c2', type: 'announcement', name: 'Ogłoszenia', posting_policy: 'admins', myRole: 'member', participants: [] };
    const { unmount } = render(withCalls(<ConversationHeader conversation={channel} />, calls));
    const btn = screen.getByRole('button', { name: /^Zadzwoń: / });
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.getAttribute('title')).toMatch(/administratorzy/);
    fireEvent.click(btn);
    expect(calls.startCall).not.toHaveBeenCalled();
    unmount();

    render(withCalls(<ConversationHeader conversation={direct} peerBlocked />, calls));
    expect(screen.getByRole('button', { name: /^Zadzwoń: Odblokuj/ }).getAttribute('aria-disabled')).toBe('true');
  });

  it('połączenia wyłączone albo brak dostawcy — przycisków nie ma', () => {
    const { unmount } = render(withCalls(<ConversationHeader conversation={direct} />, fakeCalls({ callsEnabled: false })));
    expect(screen.queryByRole('button', { name: /Zadzwoń/ })).toBeNull();
    unmount();
    render(<ConversationHeader conversation={direct} />);
    expect(screen.queryByRole('button', { name: /Zadzwoń/ })).toBeNull();
  });

  it('trwa rozmowa: przycisk dołącza, a baner proponuje „Dołącz”', () => {
    const live = { id: 'k5', conversation_id: 'c3', kind: 'audio', status: 'active' };
    const calls = fakeCalls({ activeCallFor: (id) => (id === 'c3' ? live : null) });
    const group = { id: 'c3', type: 'group', name: 'Zespół', posting_policy: 'everyone', participants: [] };
    render(withCalls(<><ConversationHeader conversation={group} /><ActiveCallBanner conversation={group} /></>, calls));
    expect(screen.getByText('Trwa rozmowa — dołącz')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dołącz do rozmowy' }));
    expect(calls.joinCall).toHaveBeenCalledWith(live, group, 'audio');
    fireEvent.click(screen.getByRole('button', { name: 'Dołącz' }));
    expect(calls.joinCall).toHaveBeenLastCalledWith(live, group, 'audio');
  });
});
