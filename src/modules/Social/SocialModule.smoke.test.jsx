// Test dymny modułu Social Media: zakładki z atrapą fn social, kolejka z kartą posta, kompozytor
// (walidacja Instagrama na żywo, zapis szkicu), redaktor bez publikacji widzi „Wyślij do akceptacji”.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ calls: [], access: {}, posts: [] }));
const FB = { id: '11111111-1111-4111-8111-111111111111', provider: 'facebook', name: 'Kościół Wrocław', status: 'active', avatar_url: null };
const IG = { id: '22222222-2222-4222-8222-222222222222', provider: 'instagram', name: 'Kościół', username: 'kosciol', status: 'active', avatar_url: null };

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ order: async () => ({ data: [{ id: 'h1', name: 'Nabożeństwo', hashtags: '#kosciol #wroclaw' }], error: null }) }) }),
    functions: {
      invoke: vi.fn(async (name, { body }) => {
        h.calls.push(body);
        if (body.action === 'status') return { data: { accounts: [FB, IG], access: h.access, counts: { queue: h.posts.length, approval: 0, drafts: 0, failed: 0 }, meta: { configured: true }, me: { email: 'ja@k.pl' } }, error: null };
        if (body.action === 'list') return { data: { posts: h.posts }, error: null };
        if (body.action === 'queue_preview') return { data: { next_slot: new Date(Date.now() + 86400_000).toISOString() }, error: null };
        if (body.action === 'save') return { data: { post: { id: 'new', status: body.intent === 'draft' ? 'draft' : 'scheduled', scheduled_at: new Date().toISOString(), targets: [] } }, error: null };
        return { data: {}, error: null };
      }),
    },
    storage: { from: () => ({ getPublicUrl: (p) => ({ data: { publicUrl: `https://x/storage/social-media/${p}` } }) }) },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
  },
}));
vi.mock('../../contexts/PermissionsContext', () => ({ usePermissions: () => ({ can: () => true, canModule: () => true }) }));
vi.mock('../../components/PageHeader', () => ({ default: ({ title, actions }) => <div><h1>{title}</h1>{actions}</div> }));
vi.mock('../../components/ResponsiveTabs', () => ({
  default: ({ tabs, onChange }) => <div>{tabs.map((t) => <button key={t.id} data-tab={t.id} onClick={() => onChange(t.id)}>{t.label}</button>)}</div>,
}));

import SocialModule from './SocialModule';

const scheduled = {
  id: 'p1', status: 'scheduled', content: 'Zapraszamy na nabożeństwo w niedzielę o 10:00', media: [], created_by: 'ja@k.pl',
  scheduled_at: new Date(Date.now() + 3600_000).toISOString(),
  targets: [{ id: 't1', account_id: FB.id, provider: 'facebook', account_name: FB.name, status: 'pending' }],
};

const renderModule = () => render(<MemoryRouter><SocialModule /></MemoryRouter>);
const tab = (id) => fireEvent.click(document.querySelector(`[data-tab="${id}"]`));

describe('SocialModule (dymny)', () => {
  beforeEach(() => { h.calls.length = 0; h.posts = [scheduled]; h.access = { view: true, create: true, publish: true, manage: true }; });

  it('kalendarz i kolejka renderują zaplanowany post z kanałem i statusem', async () => {
    renderModule();
    await waitFor(() => expect(screen.getAllByText(/Zapraszamy na nabożeństwo/).length).toBeGreaterThan(0));
    expect(h.calls.find((c) => c.action === 'list')?.view).toBe('calendar');
    tab('queue');
    await waitFor(() => expect(h.calls.filter((c) => c.action === 'list').some((c) => c.view === 'queue')).toBe(true));
    expect(await screen.findByText('Zaplanowany')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/NaN|undefined/);
  });

  it('kompozytor: Instagram bez zdjęcia blokuje publikację, szkic zapisuje się z kanałami', async () => {
    renderModule();
    fireEvent.click(await screen.findByRole('button', { name: /Utwórz post/ }));
    fireEvent.click(await screen.findByRole('button', { name: /@kosciol/ }));
    fireEvent.change(screen.getByLabelText('Treść posta'), { target: { value: 'Niedziela 10:00 #kosciol' } });
    expect(await screen.findByText(/Instagram wymaga zdjęcia albo wideo\./)).toBeTruthy();
    const publish = screen.getByRole('button', { name: 'Dodaj do kolejki' });
    expect(publish.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz szkic' }));
    await waitFor(() => expect(h.calls.some((c) => c.action === 'save')).toBe(true));
    const save = h.calls.find((c) => c.action === 'save');
    expect(save.intent).toBe('draft');
    expect(save.content).toBe('Niedziela 10:00 #kosciol');
    expect(save.targets.map((t) => t.account_id)).toEqual([IG.id]);
  });

  it('redaktor bez prawa publikacji wysyła do akceptacji (bez „Opublikuj teraz”)', async () => {
    h.access = { view: true, create: true, publish: false, manage: false };
    renderModule();
    fireEvent.click(await screen.findByRole('button', { name: /Utwórz post/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Kościół Wrocław/ }));
    fireEvent.change(screen.getByLabelText('Treść posta'), { target: { value: 'Ogłoszenie' } });
    expect(screen.queryByRole('radio', { name: /Teraz/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Wyślij do akceptacji' }));
    await waitFor(() => expect(h.calls.find((c) => c.action === 'save')?.intent).toBe('submit'));
  });
});
