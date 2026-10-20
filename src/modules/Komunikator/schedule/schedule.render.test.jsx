import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// Zaplanowane wiadomości i „Przypomnij mi” — bez sieci (fn podmienione).
const invoke = vi.fn(async () => ({ data: {}, error: null }));
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
      storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: 'https://h/x' } }) }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; }, unsubscribe() {} }),
      removeChannel: () => {},
    },
  };
});

const { whenLabel, presetLabel } = await import('./scheduleUi');
const { default: TimePresetPicker } = await import('./TimePresetPicker');
const { default: RemindMeDialog } = await import('./RemindMeDialog');
const { default: ScheduledMessagesPanel } = await import('./ScheduledMessagesPanel');
const { default: MyRemindersPanel } = await import('./MyRemindersPanel');
const { default: MessageInput } = await import('../components/MessageInput');
const { default: MessageBubble } = await import('../components/MessageBubble');

beforeEach(() => { invoke.mockReset(); invoke.mockImplementation(async () => ({ data: {}, error: null })); });
afterEach(() => { vi.useRealTimers(); });

describe('terminy — etykiety w czasie polskim', () => {
  it('dziś / jutro / data z dniem tygodnia', () => {
    const now = new Date('2026-10-20T08:00:00Z');
    expect(whenLabel('2026-10-20T16:00:00Z', now)).toBe('Dziś, 18:00');
    expect(whenLabel('2026-10-21T06:00:00Z', now)).toBe('Jutro, 8:00');
    expect(whenLabel('2026-10-26T08:00:00Z', now)).toBe('pon. 26.10, 9:00');
    expect(presetLabel('monday9')).toBe('W poniedziałek 9:00');
  });
});

describe('wybór terminu', () => {
  it('gotowy termin i własny (data + godzina)', () => {
    const onPick = vi.fn();
    const at = new Date('2030-01-01T17:00:00Z');
    render(<TimePresetPicker presets={[{ key: 'today18', at }]} onPick={onPick} confirmLabel="Zaplanuj" />);
    fireEvent.click(screen.getByText('Dziś 18:00'));
    expect(onPick).toHaveBeenCalledWith(at.toISOString());
    fireEvent.click(screen.getByText('Wybierz datę i godzinę'));
    const confirm = screen.getByRole('button', { name: /Zaplanuj/ });
    expect(confirm.disabled).toBe(false); // domyślnie: za godzinę
    fireEvent.click(confirm);
    expect(onPick).toHaveBeenCalledTimes(2);
    const iso = onPick.mock.calls[1][0];
    expect(Date.parse(iso)).toBeGreaterThan(Date.now() + 50 * 60_000);
  });
});

describe('kompozytor — „Zaplanuj wysyłkę”', () => {
  it('prawy klik na Wyślij otwiera menu; wybór terminu woła onSchedule z treścią i czyści pole', async () => {
    const onSend = vi.fn();
    const onSchedule = vi.fn(async () => {});
    render(<MessageInput onSend={onSend} onSchedule={onSchedule} conversationId="c1" currentUserEmail="ja@x.pl" />);
    const box = screen.getByLabelText('Treść wiadomości');
    fireEvent.change(box, { target: { value: 'Próba o 19' } });
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Wyślij' }));
    expect(screen.getByRole('dialog', { name: 'Zaplanuj wysyłkę' })).toBeTruthy();
    fireEvent.click(screen.getByText('Jutro 8:00'));
    await waitFor(() => expect(onSchedule).toHaveBeenCalled());
    const [content, atts, replyTo, extra, at] = onSchedule.mock.calls[0];
    expect([content, atts, replyTo, extra.mentions]).toEqual(['Próba o 19', [], null, []]);
    expect(typeof at).toBe('string');
    expect(onSend).not.toHaveBeenCalled();
    await waitFor(() => expect(box.value).toBe(''));
  });

  it('długie przytrzymanie Wyślij nie wysyła, tylko otwiera planowanie', () => {
    vi.useFakeTimers();
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} onSchedule={vi.fn()} conversationId="c2" currentUserEmail="ja@x.pl" />);
    fireEvent.change(screen.getByLabelText('Treść wiadomości'), { target: { value: 'Hej' } });
    const send = screen.getByRole('button', { name: 'Wyślij' });
    fireEvent.pointerDown(send);
    act(() => { vi.advanceTimersByTime(600); });
    fireEvent.pointerUp(send);
    fireEvent.click(send);
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Zaplanuj wysyłkę' })).toBeTruthy();
  });

  it('bez onSchedule — brak planowania (zwykła wysyłka)', () => {
    render(<MessageInput onSend={vi.fn()} conversationId="c3" currentUserEmail="ja@x.pl" />);
    fireEvent.change(screen.getByLabelText('Treść wiadomości'), { target: { value: 'Hej' } });
    expect(screen.queryByLabelText('Zaplanuj wysyłkę')).toBeNull();
  });
});

describe('„Przypomnij mi”', () => {
  it('menu wiadomości ma „Przypomnij mi”', () => {
    const onRemind = vi.fn();
    render(<MessageBubble message={{ id: 'm1', sender_email: 'ola@x.pl', content: 'Klucze', created_at: '2026-10-20T08:00:00Z' }}
      isOwn={false} currentUserEmail="ja@x.pl" onRemind={onRemind} />);
    fireEvent.click(screen.getByLabelText('Więcej działań'));
    fireEvent.click(screen.getByText('Przypomnij mi'));
    expect(onRemind).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }));
  });

  it('wybór terminu zapisuje przypomnienie przez fn chat-reminders', async () => {
    invoke.mockImplementation(async () => ({ data: { reminder: { id: 'r1' } }, error: null }));
    const onClose = vi.fn();
    render(<RemindMeDialog message={{ id: 'm1', content: 'Przynieś klucze' }} onClose={onClose} />);
    fireEvent.click(screen.getByText('Za 1 godzinę'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [name, { body }] = invoke.mock.calls[0];
    expect(name).toBe('chat-reminders');
    expect(body.action).toBe('create');
    expect(body.message_id).toBe('m1');
    expect(Math.abs(Date.parse(body.remind_at) - (Date.now() + 3_600_000))).toBeLessThan(5000);
  });

  it('„Moje przypomnienia”: lista, otwarcie wiadomości i usunięcie', async () => {
    invoke.mockImplementation(async (name, { body }) => {
      if (body.action === 'list') {
        return { data: { reminders: [{ id: 'r1', message_id: 'm1', conversation_id: 'c1', remind_at: '2030-01-01T08:00:00Z', available: true, conversation_title: 'Zespół', sender_name: 'Ola', preview: 'Klucze' }] }, error: null };
      }
      return { data: { reminder: { id: 'r1', status: 'cancelled' } }, error: null };
    });
    const onOpen = vi.fn();
    render(<MyRemindersPanel isOpen onClose={() => {}} onOpen={onOpen} />);
    await screen.findByText('Klucze');
    fireEvent.click(screen.getByText('Klucze'));
    expect(onOpen).toHaveBeenCalledWith('c1', 'm1', null);
    fireEvent.click(screen.getByLabelText('Usuń przypomnienie'));
    await waitFor(() => expect(screen.queryByText('Klucze')).toBeNull());
    expect(invoke.mock.calls.some(([n, o]) => n === 'chat-reminders' && o.body.action === 'cancel' && o.body.id === 'r1')).toBe(true);
  });
});

describe('panel „Zaplanowane”', () => {
  it('nieudana z powodem, „Wyślij teraz” i edycja', async () => {
    const hook = {
      items: [
        { id: 's1', status: 'pending', content: 'Na jutro', send_at: '2030-01-01T07:00:00Z', attachments: [] },
        { id: 's2', status: 'failed', content: 'Nie wyszła', error: 'Wiadomość można wysłać tylko w swojej rozmowie', send_at: '2026-01-01T07:00:00Z', attachments: [{ url: 'x' }] },
      ],
      sendNow: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
      cancel: vi.fn(async () => ({})),
    };
    render(<ScheduledMessagesPanel isOpen onClose={() => {}} hook={hook} />);
    expect(screen.getByText('Nie wysłano')).toBeTruthy();
    expect(screen.getByText('Wiadomość można wysłać tylko w swojej rozmowie')).toBeTruthy();
    expect(screen.getByText('Załączniki: 1')).toBeTruthy();
    fireEvent.click(screen.getAllByText('Wyślij teraz')[0]);
    await waitFor(() => expect(hook.sendNow).toHaveBeenCalledWith('s1'));
    fireEvent.click(screen.getByText('Edytuj'));
    fireEvent.change(screen.getByLabelText('Treść wiadomości'), { target: { value: 'Zmieniona' } });
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }));
    await waitFor(() => expect(hook.update).toHaveBeenCalled());
    expect(hook.update.mock.calls[0][1].content).toBe('Zmieniona');
  });
});
