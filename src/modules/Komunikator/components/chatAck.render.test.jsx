import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// „Ważne — potwierdź przeczytanie” i „Media, pliki i linki” — renderowanie bez sieci.
const invoke = vi.fn();
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

const { default: AckBar } = await import('./AckBar');
const { default: AckStatusModal } = await import('./AckStatusModal');
const { default: MediaGalleryModal } = await import('./MediaGalleryModal');
const { isImportantMessage } = await import('../hooks/useMessageAcks');

beforeEach(() => { invoke.mockReset(); });

describe('Ważne — potwierdź przeczytanie', () => {
  it('odbiorca: plakietka „Ważne” i „Rozumiem”; po potwierdzeniu — „Potwierdzono”', () => {
    const onAck = vi.fn();
    const { rerender } = render(<AckBar isOwn={false} mine={false} onAck={onAck} />);
    expect(screen.getByText('Ważne')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Rozumiem/ }));
    expect(onAck).toHaveBeenCalledTimes(1);
    rerender(<AckBar isOwn={false} mine onAck={onAck} />);
    expect(screen.queryByRole('button', { name: /Rozumiem/ })).toBeNull();
    expect(screen.getByText('Potwierdzono')).toBeTruthy();
  });

  it('nadawca: „Potwierdziło X z Y” otwiera listę, bez przycisku „Rozumiem”', () => {
    const onOpenStatus = vi.fn();
    render(<AckBar isOwn canManage count={12} total={30} onOpenStatus={onOpenStatus} />);
    expect(screen.queryByRole('button', { name: /Rozumiem/ })).toBeNull();
    fireEvent.click(screen.getByText('Potwierdziło 12 z 30'));
    expect(onOpenStatus).toHaveBeenCalled();
  });

  it('ważna wiadomość: requires_ack, nieusunięta, nie systemowa', () => {
    expect(isImportantMessage({ requires_ack: true })).toBe(true);
    expect(isImportantMessage({ requires_ack: true, deleted_at: '2026-10-20' })).toBe(false);
    expect(isImportantMessage({ requires_ack: false })).toBe(false);
    expect(isImportantMessage({ requires_ack: true, message_type: 'system' })).toBe(false);
  });

  it('lista potwierdzeń: kto tak / kto nie i przypomnienie niepotwierdzonym', async () => {
    invoke.mockImplementation(async (name, { body }) => {
      if (body.action === 'status') {
        return { data: { total: 2, acked_count: 1, acked: [{ email: 'ola@x.pl', name: 'Ola Kos', acked_at: '2026-10-20T10:00:00Z' }], pending: [{ email: 'ewa@x.pl', name: 'Ewa Lis' }], last_reminded_at: null, next_remind_at: null }, error: null };
      }
      if (body.action === 'remind') return { data: { ok: true, sent: 1, pending: 1, skipped_quiet: 0 }, error: null };
      return { data: null, error: { status: 400 } };
    });
    render(<AckStatusModal isOpen onClose={() => {}} messageId="m1" participants={[]} />);
    await waitFor(() => expect(screen.getByText('Ola Kos')).toBeTruthy());
    expect(screen.getByText('Ewa Lis')).toBeTruthy();
    expect(screen.getByText('Potwierdziło 1 z 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Przypomnij niepotwierdzonym/ }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('chat-ack', expect.objectContaining({ body: { action: 'remind', message_id: 'm1' } })));
  });

  it('przypomnienie zablokowane do terminu (raz na 6 h)', async () => {
    const later = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
    invoke.mockResolvedValue({ data: { total: 1, acked_count: 0, acked: [], pending: [{ email: 'ewa@x.pl', name: 'Ewa Lis' }], last_reminded_at: new Date().toISOString(), next_remind_at: later }, error: null });
    render(<AckStatusModal isOpen onClose={() => {}} messageId="m1" participants={[]} />);
    const btn = await screen.findByRole('button', { name: /Przypomnij niepotwierdzonym/ });
    expect(btn.disabled).toBe(true);
    expect(screen.getByText(/Kolejne przypomnienie możliwe od/)).toBeTruthy();
  });
});

describe('Media, pliki i linki rozmowy', () => {
  const page = (kind) => {
    if (kind === 'media') return [{ key: 'a-1', message_id: 'a', sender_name: 'Ola', created_at: '2026-10-20T10:00:00Z', attachment: { url: '/storage/v1/object/public/messenger-attachments/c1/a.png', type: 'image/png', name: 'a.png' } }];
    if (kind === 'files') return [{ key: 'b-1', message_id: 'b', sender_name: 'Jan Nowak', created_at: '2026-10-20T10:00:00Z', attachment: { url: '/storage/v1/object/public/messenger-attachments/c1/plan.pdf', type: 'application/pdf', name: 'plan.pdf', size: 2048 } }];
    if (kind === 'links') return [{ key: 'c-0', message_id: 'c', sender_name: 'Ola', created_at: '2026-10-20T10:00:00Z', url: 'https://avenit.pl/cennik', domain: 'avenit.pl', title: 'Cennik Avenit', site_name: 'Avenit' }];
    return [];
  };

  it('zakładki Media / Pliki / Linki / Głosowe z danymi z serwera i „Pokaż w rozmowie”', async () => {
    invoke.mockImplementation(async (name, { body }) => {
      if (name === 'chat-media') return { data: { kind: body.kind, items: page(body.kind), next: null }, error: null };
      return { data: { signedPath: '/s' }, error: null };
    });
    const onJump = vi.fn();
    const onClose = vi.fn();
    render(<MediaGalleryModal isOpen onClose={onClose} conversationId="c1" onJump={onJump} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Powiększ zdjęcie a.png/ })).toBeTruthy());
    expect(invoke).toHaveBeenCalledWith('chat-media', expect.objectContaining({ body: expect.objectContaining({ conversation_id: 'c1', kind: 'media' }) }));

    fireEvent.click(screen.getByRole('tab', { name: /Pliki/ }));
    await waitFor(() => expect(screen.getByText('plan.pdf')).toBeTruthy());
    expect(screen.getByText(/Jan Nowak/)).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /Linki/ }));
    const link = await screen.findByRole('link', { name: /Cennik Avenit/ });
    expect(link.getAttribute('href')).toBe('https://avenit.pl/cennik');
    fireEvent.click(screen.getByRole('button', { name: 'Pokaż w rozmowie' }));
    expect(onJump).toHaveBeenCalledWith('c', '2026-10-20T10:00:00Z', null); // bez wątku (thread_root_id)
    expect(onClose).toHaveBeenCalled();
  });

  it('pusta zakładka głosówek', async () => {
    invoke.mockImplementation(async (name, { body }) => ({ data: { kind: body.kind, items: [], next: null }, error: null }));
    render(<MediaGalleryModal isOpen onClose={() => {}} conversationId="c1" />);
    fireEvent.click(screen.getByRole('tab', { name: /Głosowe/ }));
    await waitFor(() => expect(screen.getByText('Brak wiadomości głosowych')).toBeTruthy());
  });
});
