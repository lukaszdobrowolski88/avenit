import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { afterRosterInsert, filterPeople, loadMinistryPeople, prefillFromPerson, rosterLinkFields, ACCESS_NOTE } from './memberPicker';
import MemberPickerField from './MemberPickerField';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));
vi.mock('../../lib/toast', () => ({ toast: { success() {}, info() {}, error() {} } }));

const person = (over = {}) => ({
  key: 'u:1', source: 'account', user_id: 'u1', member_id: null, name: 'Anna Nowak', email: 'anna@x.pl',
  phone: null, avatar_url: null, has_access: false, in_team: false, ...over,
});

// Klient supabase-js w miniaturze: zapamiętuje wstawienia, zwraca zadany błąd.
function fakeClient({ insertError = null, invoke = { data: null, error: null } } = {}) {
  const inserts = [];
  return {
    inserts,
    functions: { invoke: vi.fn(async () => invoke) },
    from: (table) => ({ insert: async (row) => { inserts.push({ table, row }); return { error: insertError }; } }),
  };
}

describe('logika wyboru osoby', () => {
  it('filtrowanie: bez polskich znaków, każde słowo, „już w zespole” na końcu', () => {
    const list = [
      person({ key: 'a', name: 'Łucja Żak', email: 'lucja@x.pl', in_team: true }),
      person({ key: 'b', name: 'Łukasz Nowak', email: 'lukasz@x.pl' }),
      person({ key: 'c', name: 'Ewa', email: 'ewa@kosciol.pl' }),
    ];
    expect(filterPeople(list, 'łu').map((p) => p.key)).toEqual(['b', 'a']);
    expect(filterPeople(list, 'lukasz nowak').map((p) => p.key)).toEqual(['b']);
    expect(filterPeople(list, 'kosciol.pl').map((p) => p.key)).toEqual(['c']);
  });

  it('wypełnienie: telefon tylko gdy serwer go pokazał (ukryty → puste, nie telefon poprzedniej osoby)', () => {
    expect(prefillFromPerson(person({ phone: '+48 600' }), { phone: '' }).phone).toBe('+48 600');
    expect(prefillFromPerson(person({ phone: null }), { phone: '+48 poprzednia' }).phone).toBe('');
    expect(prefillFromPerson(person()).user_id).toBe('u1');
  });

  it('powiązanie z kontem tylko gdy tabela ma user_id i osoba ma konto', () => {
    expect(rosterLinkFields(person(), { link_user: true })).toEqual({ user_id: 'u1' });
    expect(rosterLinkFields(person(), { link_user: false })).toEqual({});
    expect(rosterLinkFields(person({ user_id: null }), { link_user: true })).toEqual({});
    expect(rosterLinkFields(null, { link_user: true })).toEqual({});
  });

  it('lista z serwera; błąd → pusta lista z flagą (zostaje dodanie ręczne)', async () => {
    const ok = fakeClient({ invoke: { data: { people: [person()], link_user: true }, error: null } });
    const meta = await loadMinistryPeople(ok, { ministryKey: 'media', table: 'media_team' });
    expect(ok.functions.invoke).toHaveBeenCalledWith('ministry-people', { body: { ministry_key: 'media', table: 'media_team' } });
    expect(meta.people).toHaveLength(1);
    expect(meta.failed).toBeUndefined();
    const bad = await loadMinistryPeople(fakeClient({ invoke: { data: null, error: { message: '403' } } }), { ministryKey: 'media', table: 'media_team' });
    expect(bad).toMatchObject({ people: [], failed: true, can_grant_access: false });
  });

  it('dostęp do modułu po dodaniu: tylko konto bez dostępu, w tabeli służby, gdy wolno', async () => {
    const meta = { can_grant_access: true };
    const c1 = fakeClient();
    expect(await afterRosterInsert(c1, { ministryKey: 'media', table: 'media_team', person: person(), meta })).toBe('granted');
    expect(c1.inserts).toEqual([{ table: 'ministry_memberships', row: { user_id: 'u1', ministry_key: 'media', role: 'member' } }]);

    const c2 = fakeClient();
    expect(await afterRosterInsert(c2, { ministryKey: 'media', table: 'media_team', person: person(), meta: { can_grant_access: false } })).toBe('denied');
    expect(c2.inserts).toEqual([], 'bez prawa — nawet nie próbujemy');

    for (const p of [person({ user_id: null, source: 'member' }), person({ has_access: true }), null]) {
      expect(await afterRosterInsert(fakeClient(), { ministryKey: 'media', table: 'media_team', person: p, meta })).toBe('none');
    }
    expect(await afterRosterInsert(fakeClient(), { ministryKey: 'mlodziezowka', table: 'mlodziezowka_members', person: person(), meta })).toBe('none');
    expect(await afterRosterInsert(fakeClient({ insertError: { code: '23505', message: 'duplicate key' } }), { ministryKey: 'media', table: 'media_team', person: person(), meta })).toBe('already');
    expect(await afterRosterInsert(fakeClient({ insertError: { status: 403, message: 'Nie możesz przypisać…' } }), { ministryKey: 'media', table: 'media_team', person: person(), meta })).toBe('denied');
  });
});

describe('MemberPickerField', () => {
  const picker = (over = {}) => ({
    picked: null, setPicked: vi.fn(), manual: false, setManual: vi.fn(), loading: false,
    meta: { people: [person(), person({ key: 'u:2', user_id: 'u2', name: 'Jan Kowalski', email: 'jan@x.pl', in_team: true })], grants_access: true, can_grant_access: false, members_included: false },
    ...over,
  });

  it('lista: osoba w zespole wyłączona z dopiskiem; wybór wypełnia formularz', () => {
    const p = picker();
    const onPick = vi.fn();
    render(<MemberPickerField picker={p} onPick={onPick} />);
    const jan = screen.getByRole('option', { name: /Jan Kowalski/ });
    expect(jan.disabled).toBe(true);
    expect(screen.getByText('już w zespole')).toBeTruthy();
    fireEvent.click(screen.getByRole('option', { name: /Anna Nowak/ }));
    expect(p.setPicked).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'u1' }));
    expect(onPick).toHaveBeenCalledWith({ full_name: 'Anna Nowak', email: 'anna@x.pl', phone: '' }, expect.anything());
  });

  it('wybrana osoba z kontem, a dodający nie nada dostępu → jasna uwaga', () => {
    render(<MemberPickerField picker={picker({ picked: person() })} onPick={() => {}} />);
    expect(screen.getByText(ACCESS_NOTE)).toBeTruthy();
  });

  it('gdy może nadać dostęp → zapowiedź dostępu; osoba bez konta → tylko lista', () => {
    const meta = { people: [], grants_access: true, can_grant_access: true };
    const { unmount } = render(<MemberPickerField picker={picker({ picked: person(), meta })} onPick={() => {}} />);
    expect(screen.getByText(/dostanie też dostęp do modułu/)).toBeTruthy();
    unmount();
    render(<MemberPickerField picker={picker({ picked: person({ user_id: null, source: 'member' }), meta })} onPick={() => {}} />);
    expect(screen.getByText(/nie ma konta w aplikacji/)).toBeTruthy();
  });

  it('„Dodaj ręcznie” czyści wybór', () => {
    const p = picker({ picked: person() });
    render(<MemberPickerField picker={p} onPick={() => {}} />);
    fireEvent.click(screen.getByRole('radio', { name: /Dodaj ręcznie/ }));
    expect(p.setManual).toHaveBeenCalledWith(true);
    expect(p.setPicked).toHaveBeenCalledWith(null);
  });
});
