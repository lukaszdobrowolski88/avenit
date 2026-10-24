// Test dymny modułu Social Media: zakładki z atrapą fn social, kolejka z kartą posta, kompozytor
// (walidacja Instagrama na żywo, zapis szkicu), redaktor bez publikacji widzi „Wyślij do akceptacji”.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ calls: [], access: {}, posts: [], activity: [] }));
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
        if (body.action === 'activity') return { data: { activity: h.activity }, error: null };
        if (body.action === 'comment') { h.activity = [...h.activity, { id: 'c1', kind: 'comment', actor: 'ja@k.pl', note: body.body, created_at: new Date().toISOString() }]; return { data: { activity: h.activity }, error: null }; }
        if (body.action === 'save') return { data: { post: { id: 'new', status: body.intent === 'draft' ? 'draft' : 'scheduled', scheduled_at: new Date().toISOString(), targets: [] } }, error: null };
        return { data: {}, error: null };
      }),
    },
    storage: { from: () => ({ getPublicUrl: (p) => ({ data: { publicUrl: `https://x/storage/social-media/${p}` } }) }) },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
  },
}));
vi.mock('../../lib/dialog', () => ({ confirmDialog: vi.fn(async () => h.confirm ?? true), promptDialog: vi.fn(async () => null) }));
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
  beforeEach(() => { h.calls.length = 0; h.posts = [scheduled]; h.activity = []; h.confirm = true; h.access = { view: true, create: true, publish: true, manage: true }; try { localStorage.clear(); } catch { /* */ } });

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

  it('filtr „Tylko moje” ukrywa cudze posty w kolejce', async () => {
    h.posts = [scheduled, { ...scheduled, id: 'p2', content: 'Cudzy post o młodzieży', created_by: 'inny@k.pl' }];
    renderModule();
    tab('queue');
    expect(await screen.findByText(/Cudzy post o młodzieży/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Tylko moje/ }));
    await waitFor(() => expect(screen.queryByText(/Cudzy post o młodzieży/)).toBeNull());
    expect(screen.getAllByText(/Zapraszamy na nabożeństwo/).length).toBeGreaterThan(0);
  });

  it('edycja posta: komentarz zespołu, a zamknięcie ze zmianami pyta o potwierdzenie', async () => {
    renderModule();
    tab('queue');
    fireEvent.click((await screen.findAllByText(/Zapraszamy na nabożeństwo/))[0]);
    const input = await screen.findByLabelText('Komentarz');
    fireEvent.change(input, { target: { value: 'Dodaj adres sali' } });
    fireEvent.click(screen.getByRole('button', { name: 'Wyślij' }));
    expect(await screen.findByText('Dodaj adres sali')).toBeTruthy();
    expect(h.calls.find((c) => c.action === 'comment')?.body).toBe('Dodaj adres sali');
    const { confirmDialog } = await import('../../lib/dialog');
    fireEvent.change(screen.getByLabelText('Treść posta'), { target: { value: 'Zmieniona treść' } });
    h.confirm = false;
    fireEvent.click(screen.getByRole('button', { name: 'Anuluj' }));
    await waitFor(() => expect(confirmDialog).toHaveBeenCalled());
    expect(screen.getByLabelText('Treść posta')).toBeTruthy(); // okno zostaje
  });
});
