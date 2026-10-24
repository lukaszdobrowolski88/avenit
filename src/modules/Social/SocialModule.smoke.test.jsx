// Test dymny modułu Social Media: zakładki z atrapą fn social, kolejka z kartą posta, kompozytor
// (walidacja Instagrama na żywo, zapis szkicu), redaktor bez publikacji widzi „Wyślij do akceptacji”.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ calls: [], access: {}, posts: [], activity: [], db: {}, writes: [] }));
const FB = { id: '11111111-1111-4111-8111-111111111111', provider: 'facebook', name: 'Kościół Wrocław', status: 'active', avatar_url: null };
const IG = { id: '22222222-2222-4222-8222-222222222222', provider: 'instagram', name: 'Kościół', username: 'kosciol', status: 'active', avatar_url: null };

vi.mock('../../lib/supabase', () => ({
  supabase: {
    // Atrapa /api/db: łańcuch zapytań zwraca wiersze tabeli z h.db; zapisy trafiają do h.writes.
    from: (table) => {
      const st = { op: 'select', payload: null };
      const proxy = new Proxy(function () {}, {
        get(_t, prop) {
          if (prop === 'then') {
            if (st.op !== 'select') h.writes.push({ table, op: st.op, payload: st.payload });
            const rows = st.op === 'select' ? (h.db[table] || []) : [{ id: `new-${table}`, created_at: new Date().toISOString(), ...st.payload }];
            const data = st.single ? rows[0] : rows;
            return (res, rej) => Promise.resolve({ data, error: null }).then(res, rej);
          }
          return (...args) => {
            if (['insert', 'update', 'delete'].includes(prop)) { st.op = prop; st.payload = args[0]; }
            if (prop === 'single' || prop === 'maybeSingle') st.single = true;
            return proxy;
          };
        },
      });
      return proxy;
    },
    functions: {
      invoke: vi.fn(async (name, { body }) => {
        h.calls.push(body);
        if (body.action === 'status') return { data: { accounts: [FB, IG], access: h.access, counts: { queue: h.posts.length, approval: 0, drafts: 0, failed: 0 }, meta: { configured: true }, me: { email: 'ja@k.pl' } }, error: null };
        if (body.action === 'list') return { data: { posts: h.posts }, error: null };
        if (body.action === 'queue_preview') return { data: { next_slot: new Date(Date.now() + 86400_000).toISOString() }, error: null };
        if (body.action === 'share_prefill') return { data: { prefill: { content: `📅 Koncert ${body.kind}:${body.id}\nWięcej: https://k.avenit.pl/l/Ab3dE7x`, media: [], source_type: body.kind, source_id: body.id } }, error: null };
        if (body.action === 'link_page') return { data: { page: { enabled: true, title: 'Nasz kościół', bio: '', links: [{ label: 'Strona', url: 'https://k.pl', code: 'abc1234', clicks: 7 }], show_events: true, show_sermons: true, show_posts: true }, url: 'https://k.avenit.pl/linki' }, error: null };
        if (body.action === 'rules') return { data: { rules: [{ id: 'r1', name: 'Kazania na FB', trigger: 'sermon_published', action: 'draft', account_ids: [FB.id], enabled: true, config: {} }] }, error: null };
        if (body.action === 'settings') return { data: { settings: { shorten_links: true, utm: true } }, error: null };
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
  beforeEach(() => { h.calls.length = 0; h.writes.length = 0; h.db = { social_hashtag_groups: [{ id: 'h1', name: 'Nabożeństwo', hashtags: '#kosciol #wroclaw' }] }; h.posts = [scheduled]; h.activity = []; h.confirm = true; h.access = { view: true, create: true, publish: true, manage: true }; try { localStorage.clear(); } catch { /* */ } });

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

  it('„Udostępnij w social media”: ?share=event:5 otwiera kompozytor z gotową treścią', async () => {
    render(<MemoryRouter initialEntries={['/social?share=event:5']}><SocialModule /></MemoryRouter>);
    const ta = await screen.findByLabelText('Treść posta');
    await waitFor(() => expect(ta.value).toMatch(/Koncert event:5/));
    expect(h.calls.find((c) => c.action === 'share_prefill')).toMatchObject({ kind: 'event', id: '5' });
  });

  it('zakładki Strona linków (kliknięcia przycisku) i Reguły', async () => {
    renderModule();
    tab('links');
    expect(await screen.findByDisplayValue('Nasz kościół')).toBeTruthy();
    expect(screen.getByText('7 klik.')).toBeTruthy();
    expect(screen.getByText('https://k.avenit.pl/linki')).toBeTruthy();
    tab('rules');
    expect(await screen.findByText('Kazania na FB')).toBeTruthy();
  });

  it('pomysły: kolumny, „Utwórz post” otwiera kompozytor z treścią pomysłu i zapisuje powiązanie', async () => {
    h.db.social_ideas = [
      { id: 'i1', title: 'Świadectwo Ani', content: 'Historia Ani z obozu', media: [], tags: ['młodzież'], column_key: 'idea', position: 0, created_at: '2026-10-20' },
      { id: 'i2', title: 'Rolka z próby', content: '', media: [], tags: [], column_key: 'ready', position: 0, created_at: '2026-10-21', post_id: 'p9' },
    ];
    renderModule();
    tab('ideas');
    expect(await screen.findByText('Świadectwo Ani')).toBeTruthy();
    expect(screen.getByText('Użyty w poście')).toBeTruthy();
    expect(screen.getByText('Gotowe do publikacji')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Akcje pomysłu' })[0]);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Utwórz post' }));
    const ta = await screen.findByLabelText('Treść posta');
    expect(ta.value).toBe('Historia Ani z obozu');
    fireEvent.click(await screen.findByRole('button', { name: /Kościół Wrocław/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz szkic' }));
    await waitFor(() => expect(h.calls.find((c) => c.action === 'save')).toMatchObject({ source_type: 'idea', source_id: 'i1' }));
  });

  it('biblioteka: siatka mediów i dodanie z biblioteki do posta', async () => {
    h.db.social_media_items = [{ id: 'm1', path: 'abc/plik.jpg', mime: 'image/jpeg', kind: 'image', width: 1080, height: 1080, name: 'Chrzest', tags: ['chrzest'], source: 'upload', created_at: '2026-10-20' }];
    renderModule();
    tab('library');
    expect(await screen.findByAltText('')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Utwórz post/ }));
    fireEvent.click((await screen.findAllByRole('button', { name: /Z biblioteki/ }))[0]);
    // Miniatura w oknie biblioteki (ostatnia na stronie — pierwsza jest w zakładce pod spodem).
    await waitFor(() => expect(document.querySelectorAll('button[aria-pressed="false"] img[src*="abc/plik.jpg?w=256"]').length).toBeGreaterThan(0));
    const imgs = document.querySelectorAll('button[aria-pressed="false"] img[src*="abc/plik.jpg?w=256"]');
    fireEvent.click(imgs[imgs.length - 1].closest('button'));
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj (1)' }));
    await waitFor(() => expect(document.querySelector('img[src*="abc/plik.jpg?w=192"]')).toBeTruthy());
  });
});
