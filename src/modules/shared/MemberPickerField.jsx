import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Search, UserPlus, Users, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { tr } from '../../i18n';
import { toast } from '../../lib/toast';
import Avatar from '../../components/Avatar';
import {
  ACCESS_GRANTED, ACCESS_NOTE, afterRosterInsert, filterPeople, loadMinistryPeople, prefillFromPerson, rosterLinkFields,
} from './memberPicker';

// „Dodaj członka” w służbie: wybór osoby z listy (konta w aplikacji + Członkowie bez konta)
// zamiast przepisywania imienia, e-maila i telefonu. Wspólne dla Uwielbienia, Mediów, Gościnności,
// Tłumaczeń, Dzieci (Nauczyciele), Młodzieżówki i modułów z kreatora.
//
//   const picker = useMemberPicker({ ministryKey: 'media', table: 'media_team' });
//   // otwarcie formularza nowej osoby: picker.open()
//   <MemberPickerField picker={picker} onPick={(fields) => setForm((f) => ({ ...f, ...fields }))} />
//   // zapis: insert({ ...pola, ...picker.linkFields() }), potem await picker.finishInsert()

export function useMemberPicker({ ministryKey, table }) {
  const [picked, setPicked] = useState(null);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [manual, setManual] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    const data = await loadMinistryPeople(supabase, { ministryKey, table }).catch(() => null);
    if (my !== seq.current) return;
    setMeta(data);
    setLoading(false);
  }, [ministryKey, table]);

  // Nowa osoba: czysty wybór i świeża lista (oznaczenia „już w zespole”).
  const open = useCallback(() => { setPicked(null); setManual(false); load(); }, [load]);
  const linkFields = useCallback(() => rosterLinkFields(picked, meta), [picked, meta]);
  const finishInsert = useCallback(async () => {
    const outcome = await afterRosterInsert(supabase, { ministryKey, table, person: picked, meta }).catch(() => 'denied');
    if (outcome === 'granted') toast.success(tr(ACCESS_GRANTED));
    else if (outcome === 'denied') toast.info(tr(ACCESS_NOTE));
    return outcome;
  }, [ministryKey, table, picked, meta]);

  return { ministryKey, table, picked, setPicked, meta, loading, manual, setManual, open, linkFields, finishInsert };
}

export default function MemberPickerField({ picker, onPick }) {
  const [q, setQ] = useState('');
  const { picked, setPicked, meta, loading, manual, setManual } = picker;
  const people = meta?.people || [];
  const list = useMemo(() => filterPeople(people, q, { limit: 40 }), [people, q]);

  const choose = (p) => {
    if (p.in_team) return;
    setPicked(p);
    setQ('');
    const { full_name, email, phone } = prefillFromPerson(p);
    onPick?.({ full_name, email, phone }, p);
  };

  const tabBtn = (on) => `px-3 py-1.5 rounded-full text-xs font-semibold transition ${on
    ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`;

  // Uwaga o dostępie do modułu dla wybranej osoby.
  let note = null;
  if (picked) {
    if (!picked.user_id) note = { tone: 'muted', text: tr('Ta osoba nie ma konta w aplikacji — trafi tylko na listę zespołu.') };
    else if (picked.has_access) note = { tone: 'muted', text: tr('Ma już dostęp do modułu tej służby.') };
    else if (meta?.grants_access && meta?.can_grant_access) note = { tone: 'ok', text: tr('Po zapisaniu dostanie też dostęp do modułu tej służby (jako członek).') };
    else if (meta?.grants_access) note = { tone: 'warn', text: tr(ACCESS_NOTE) };
  }
  const noteCls = {
    muted: 'text-gray-500 dark:text-gray-400',
    ok: 'text-emerald-700 dark:text-emerald-400',
    warn: 'text-amber-700 dark:text-amber-400',
  };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-800/60 p-3">
      <div role="radiogroup" aria-label={tr('Sposób dodania osoby')} className="flex flex-wrap gap-2 mb-3">
        <button type="button" role="radio" aria-checked={!manual} onClick={() => setManual(false)} className={tabBtn(!manual)}>
          <Users size={13} className="inline -mt-0.5 mr-1" aria-hidden="true" />{tr('Wybierz z listy osób')}
        </button>
        <button type="button" role="radio" aria-checked={manual} onClick={() => { setManual(true); setPicked(null); }} className={tabBtn(manual)}>
          <UserPlus size={13} className="inline -mt-0.5 mr-1" aria-hidden="true" />{tr('Dodaj ręcznie')}
        </button>
      </div>

      {manual ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">{tr('Wpisz dane osoby poniżej — np. kogoś, kto nie ma konta w aplikacji.')}</p>
      ) : picked ? (
        <div>
          <div className="flex items-center gap-3 rounded-lg bg-white dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 px-3 py-2">
            <Avatar name={picked.name} email={picked.email} url={picked.avatar_url} size={34} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{picked.name}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {picked.email || tr('bez e-maila')}{picked.source === 'member' ? ` · ${tr('Członek kościoła')}` : ''}
              </div>
            </div>
            <button type="button" onClick={() => setPicked(null)} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200" aria-label={tr('Zmień osobę')} title={tr('Zmień osobę')}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          {note && <p className={`mt-2 text-xs ${noteCls[note.tone]}`}>{note.text}</p>}
        </div>
      ) : (
        <div>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tr('Szukaj po imieniu, nazwisku lub e-mailu…')}
              aria-label={tr('Szukaj osoby')}
              className="w-full pl-9 pr-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-white placeholder-gray-400"
            />
          </div>
          <div className="mt-2 max-h-56 overflow-y-auto rounded-lg" role="listbox" aria-label={tr('Osoby')}>
            {loading && <div className="px-2 py-3 text-xs text-gray-400">{tr('Wczytywanie…')}</div>}
            {!loading && meta?.failed && <div className="px-2 py-3 text-xs text-gray-500">{tr('Nie udało się wczytać listy osób — dodaj ręcznie.')}</div>}
            {!loading && !meta?.failed && list.length === 0 && (
              <div className="px-2 py-3 text-xs text-gray-500">{q ? tr('Nikogo nie znaleziono — dodaj ręcznie.') : tr('Brak osób do wyboru.')}</div>
            )}
            {!loading && list.map((p) => (
              <button
                key={p.key}
                type="button"
                role="option"
                aria-selected={false}
                aria-disabled={p.in_team}
                disabled={p.in_team}
                onClick={() => choose(p)}
                className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left transition ${p.in_team ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white dark:hover:bg-gray-700/60'}`}
              >
                <Avatar name={p.name} email={p.email} url={p.avatar_url} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{p.name}</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">{p.email || tr('bez e-maila')}</span>
                </span>
                {p.in_team
                  ? <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 shrink-0">{tr('już w zespole')}</span>
                  : p.source === 'member'
                    ? <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 shrink-0">{tr('bez konta')}</span>
                    : null}
              </button>
            ))}
          </div>
          {meta && !meta.failed && !meta.members_included && (
            <p className="mt-2 text-[11px] text-gray-400">{tr('Lista obejmuje konta w aplikacji.')}</p>
          )}
        </div>
      )}
    </div>
  );
}
