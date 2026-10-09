// „Wyślij do czatu”: wiadomość z nazwą zadania i pełnym linkiem (taskItemLink) do rozmowy,
// w której mogę pisać (kanał ogłoszeń tylko dla administratora).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ writes: [] }));

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: (table) => ({
      insert: (payload) => {
        h.writes.push({ table, payload });
        const res = { data: { id: 'm1', ...payload }, error: null };
        return { select: () => ({ single: async () => res }) };
      },
    }),
  },
}));
vi.mock('../../../lib/toast', () => ({ toast: { success: () => {}, error: () => {}, info: () => {} } }));
vi.mock('../../../hooks/useAppModules', () => ({ useAppModules: () => ({ modules: [{ key: 'media', path: '/media' }] }) }));
vi.mock('../hooks/useConversations', () => ({
  default: () => ({
    loading: false,
    conversations: [
      { id: 'c1', type: 'group', name: 'Media — ekipa', myRole: 'member' },
      { id: 'c2', type: 'announcement', name: 'Ogłoszenia', posting_policy: 'admins', myRole: 'member' },
      { id: 'c3', type: 'group', name: 'Archiwum', archived: true },
    ],
  }),
}));

import ShareToChatModal, { absoluteTaskUrl, shareMessageText } from './ShareToChatModal';

beforeEach(() => { h.writes = []; });

describe('ShareToChatModal', () => {
  it('pełny link z jednej reguły i treść wiadomości', () => {
    expect(absoluteTaskUrl({ id: 'b', source_kind: 'media_tasks', module_key: 'media' }, 'i1', [{ key: 'media', path: '/media' }], 'https://a.pl'))
      .toBe('https://a.pl/media?item=i1');
    expect(absoluteTaskUrl({ id: 'b9' }, 'i2', [], 'https://a.pl')).toBe('https://a.pl/projekty?board=b9&item=i2');
    expect(shareMessageText({ name: 'Kable', url: 'https://a.pl/x', note: ' Zerknij ' })).toBe('Zerknij\nZadanie: Kable\nhttps://a.pl/x');
  });

  it('lista tylko rozmów, w których mogę pisać; wysyłka wiadomości z linkiem', async () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <ShareToChatModal board={{ id: 'b', source_kind: 'media_tasks', module_key: 'media' }} item={{ id: 'i1', name: 'Kable' }} userEmail="ja@test.pl" onClose={onClose} />
      </MemoryRouter>,
    );
    expect(screen.queryByText('Ogłoszenia')).toBeNull();
    expect(screen.queryByText('Archiwum')).toBeNull();
    fireEvent.click(screen.getByText('Media — ekipa'));
    fireEvent.click(screen.getByRole('button', { name: /Wyślij/ }));
    await waitFor(() => expect(h.writes).toHaveLength(1));
    expect(h.writes[0]).toMatchObject({ table: 'messages', payload: { conversation_id: 'c1', sender_email: 'ja@test.pl' } });
    expect(h.writes[0].payload.content).toContain(`${window.location.origin}/media?item=i1`);
    expect(h.writes[0].payload.content).toContain('Kable');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
