import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Klient bazy bez sieci: zapytania zwracają puste dane, podpis pliku — podpisany adres.
const invoke = vi.fn(async () => ({ data: null, error: { status: 404 } }));
vi.mock('../../../lib/supabase', () => {
  const builder = () => {
    const b = new Proxy({}, {
      get: (_t, prop) => {
        if (prop === 'then') return (res) => Promise.resolve({ data: [], error: null, count: 0 }).then(res);
        return () => b;
      },
    });
    return b;
  };
  return {
    supabase: {
      from: () => builder(),
      functions: { invoke: (...a) => invoke(...a) },
      storage: { from: () => ({ createSignedUrl: async (p) => ({ data: { signedUrl: `https://h/storage/messenger-attachments/${p}?sig=1` }, error: null }) }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; }, unsubscribe() {} }),
      removeChannel: () => {},
    },
  };
});
vi.mock('../../../hooks/usePresence', () => ({
  usePresence: () => ({ getStatus: () => 'offline' }),
  statusColors: { online: '', away: '', offline: '' },
  statusLabels: { online: 'Online', away: 'Zaraz wracam', offline: 'Offline' },
}));

const { default: MessageBubble } = await import('./MessageBubble');
const { default: PollCard } = await import('./PollCard');
const { default: MuteMenu } = await import('./MuteMenu');
const { default: ConversationList } = await import('./ConversationList');
const { default: SeenByModal } = await import('./SeenByModal');

beforeEach(() => { invoke.mockClear(); });

describe('Komunikator+ — renderowanie (bez sieci)', () => {
  it('dymek: klikalny link, @wszyscy, „Widziane przez N” i ptaszki', () => {
    const onShowSeenBy = vi.fn();
    render(
      <MessageBubble
        message={{ id: 'm1', sender_email: 'ja@x.pl', content: 'Patrz www.avenit.pl @wszyscy', created_at: '2026-10-07T10:00:00Z', mentions: ['*'] }}
        isOwn
        currentUserEmail="ja@x.pl"
        deliveryStatus="read"
        seenCount={2}
        onShowSeenBy={onShowSeenBy}
      />
    );
    const link = screen.getByRole('link', { name: 'www.avenit.pl' });
    expect(link.getAttribute('href')).toBe('https://www.avenit.pl');
    expect(screen.getByText('@wszyscy')).toBeTruthy();
    expect(screen.getByLabelText('Przeczytane')).toBeTruthy();
    fireEvent.click(screen.getByText('Widziane przez 2'));
    expect(onShowSeenBy).toHaveBeenCalled();
  });

  it('dymek od zablokowanej osoby jest schowany do kliknięcia „pokaż”', () => {
    render(
      <MessageBubble
        message={{ id: 'm2', sender_email: 'ola@x.pl', content: 'tajne', created_at: '2026-10-07T10:00:00Z' }}
        isOwn={false}
        currentUserEmail="ja@x.pl"
        hiddenAsBlocked
      />
    );
    expect(screen.queryByText('tajne')).toBeNull();
    fireEvent.click(screen.getByText('pokaż'));
    expect(screen.getByText('tajne')).toBeTruthy();
  });

  it('cudza wiadomość: menu ma „Przetłumacz”, „Zgłoś”, „Zablokuj osobę”; brak AI → komunikat, bez wywrotki', async () => {
    const onReport = vi.fn();
    render(
      <MessageBubble
        message={{ id: 'm3', sender_email: 'ola@x.pl', content: 'Hello there', created_at: '2026-10-07T10:00:00Z' }}
        isOwn={false}
        currentUserEmail="ja@x.pl"
        onReport={onReport}
        onBlockSender={() => {}}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Więcej działań' }));
    expect(screen.getByRole('menuitem', { name: 'Zablokuj osobę' })).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Zgłoś' }));
    expect(onReport).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Więcej działań' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Przetłumacz' }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('translate-message', expect.objectContaining({ body: { message_id: 'm3', target: 'pl' } })));
    expect(screen.getByText('Hello there')).toBeTruthy();
  });

  it('ankieta: anonimowa, zamknięta — bez głosowania', () => {
    const onVote = vi.fn();
    const message = { id: 'p1', message_type: 'poll', content: 'Kiedy?', metadata: { poll: { question: 'Kiedy?', options: [{ id: 'o1', text: 'Piątek' }], multiple: false, anonymous: true, closes_at: '2020-01-01T00:00:00Z' } } };
    render(<PollCard message={message} results={null} onVote={onVote} />);
    expect(screen.getByText('Ankieta zamknięta')).toBeTruthy();
    expect(screen.getByText(/Anonimowa/)).toBeTruthy();
    fireEvent.click(screen.getByText('Piątek'));
    expect(onVote).not.toHaveBeenCalled();
  });

  it('menu wyciszenia: opcje i „Włącz powiadomienia”, gdy wyciszona', () => {
    const onSelect = vi.fn();
    render(<MuteMenu open onClose={() => {}} conversation={{ muted: true }} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Na 8 godzin' }));
    expect(onSelect).toHaveBeenCalledWith('8h');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Włącz powiadomienia' }));
    expect(onSelect).toHaveBeenCalledWith('off');
  });

  it('lista: kanał grupy domowej w sekcji „Kanały” z nazwą z bazy, wyciszenie do czasu', () => {
    const until = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    render(
      <ConversationList
        conversations={[
          { id: 'c1', type: 'ministry', ministry_key: 'home_group:7', name: 'Grupa Krzyki', participants: [], mutedUntil: until },
          { id: 'c2', type: 'ministry', ministry_key: 'kids_ministry', name: 'Dzieci', participants: [] },
        ]}
        selectedId={null}
        onSelect={() => {}}
        onNewConversation={() => {}}
        loading={false}
        currentUserEmail="ja@x.pl"
        onOpenReports={() => {}}
        openReportsCount={3}
      />
    );
    expect(screen.getByText('Kanały')).toBeTruthy();
    expect(screen.getByText('Grupa Krzyki')).toBeTruthy();
    expect(screen.getByText('Dzieci')).toBeTruthy();
    expect(screen.getByLabelText('Wyciszona')).toBeTruthy();
    // (bez I18nProvider hook t() nie podstawia zmiennych — sprawdzamy sam przycisk i znaczek)
    expect(screen.getByRole('button', { name: /^Zgłoszenia: .* do rozpatrzenia$/ })).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('„Widziane przez”: kto przeczytał i kto jeszcze nie', () => {
    render(
      <SeenByModal
        isOpen
        onClose={() => {}}
        seen={[{ user_email: 'ola@x.pl', read_at: '2026-10-07T10:00:00Z' }]}
        participants={[{ user_email: 'ja@x.pl', full_name: 'Ja' }, { user_email: 'ola@x.pl', full_name: 'Ola' }, { user_email: 'ewa@x.pl', full_name: 'Ewa' }]}
        senderEmail="ja@x.pl"
      />
    );
    expect(screen.getByText('Ola')).toBeTruthy();
    expect(screen.getByText('Ewa')).toBeTruthy();
    expect(screen.getByText('Przeczytali: 1')).toBeTruthy();
    expect(screen.getByText(/Jeszcze nie przeczytali: 1/)).toBeTruthy();
  });
});
