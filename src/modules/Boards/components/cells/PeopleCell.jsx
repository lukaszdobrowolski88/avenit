import React, { useState, useMemo } from 'react';
import { Check } from 'lucide-react';
import Popover from '../Popover';
import AppAvatar from '../../../../components/Avatar';
import '../../../../components/pickList.css';
import { tr } from '../../../../i18n';

// Awatar tablic = kanoniczny awatar aplikacji (zdjęcie albo inicjały w tonach marki), z obwódką
// do nakładania w stos. Wcześniej tablice miały własną tęczę kolorów.
export function Avatar({ person, size = 26 }) {
  return (
    <AppAvatar url={person.avatar_url} name={person.name} email={person.email} size={size}
      className="ring-2 ring-white dark:ring-gray-800" />
  );
}

// Komórka Osoby — ta sama lista wyboru co w grafiku służb (wyszukiwarka, kwadrat zaznaczenia,
// przypisani na górze), osoby z app_users.
export default function PeopleCell({ value = [], people = [], onChange, readOnly }) {
  const [q, setQ] = useState('');
  const selected = value || [];
  const isSelected = (email) => selected.some(p => p.email === email);

  const toggle = (person) => {
    if (isSelected(person.email)) onChange(selected.filter(p => p.email !== person.email));
    else onChange([...selected, { email: person.email, name: person.name, avatar_url: person.avatar_url }]);
  };

  const { chosen, others } = useMemo(() => {
    const s = q.trim().toLowerCase();
    const match = (p) => !s || (p.name || '').toLowerCase().includes(s) || (p.email || '').toLowerCase().includes(s);
    const byEmail = new Map(people.map(p => [p.email, p]));
    return {
      // Przypisani także wtedy, gdy zniknęli z listy kont (np. usunięte konto) — da się ich odpiąć.
      chosen: selected.map(p => byEmail.get(p.email) || p).filter(match),
      others: people.filter(p => !isSelected(p.email) && match(p)),
    };
  }, [q, people, selected]);

  const one = selected.length === 1 ? selected[0] : null;
  const cellContent = (
    <div className="w-full h-full flex items-center px-2 gap-2 min-w-0">
      {selected.length === 0 ? (
        <span className="text-gray-300 dark:text-gray-600 text-base leading-none opacity-0 group-hover/row:opacity-100 transition-opacity">+</span>
      ) : one ? (
        <>
          <Avatar person={one} size={24} />
          <span className="text-sm text-gray-700 dark:text-gray-200 truncate">{one.name || one.email}</span>
        </>
      ) : (
        <div className="flex -space-x-2" title={selected.map(p => p.name || p.email).join(', ')}>
          {selected.slice(0, 4).map(p => <Avatar key={p.email} person={p} size={24} />)}
          {selected.length > 4 && (
            <div className="rounded-full w-6 h-6 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-[10px] font-semibold flex items-center justify-center ring-2 ring-white dark:ring-gray-800">
              +{selected.length - 4}
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (readOnly) return cellContent;

  const option = (p) => {
    const sel = isSelected(p.email);
    return (
      <button key={p.email} type="button" role="option" aria-selected={sel} onClick={() => toggle(p)}
        className="pick-opt text-gray-800 dark:text-gray-100">
        <span className="pick-check" aria-hidden="true">{sel && <Check size={12} strokeWidth={3} />}</span>
        <span className="min-w-0 truncate">{p.name || p.email}</span>
        {p.name && p.email && <span className="pick-opt-hint">{p.email}</span>}
      </button>
    );
  };

  return (
    <Popover width={300} bare className="pick-pop overflow-hidden" trigger={cellContent}>
      {() => (
        <div className="flex flex-col">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Szukaj osoby...')}
            aria-label={tr('Szukaj osoby...')} className="pick-search bg-transparent text-gray-800 dark:text-gray-100" />
          <div role="listbox" aria-multiselectable="true" aria-label={tr('Osoby')} className="max-h-64 overflow-y-auto custom-scrollbar py-1">
            {chosen.length > 0 && <div className="pick-section" role="presentation">{tr('Przypisani')}</div>}
            {chosen.map(option)}
            {chosen.length > 0 && others.length > 0 && <div className="pick-section" role="presentation">{tr('Pozostali')}</div>}
            {others.map(option)}
            {chosen.length + others.length === 0 && <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">{tr('Brak wyników')}</div>}
          </div>
        </div>
      )}
    </Popover>
  );
}
