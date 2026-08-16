import React, { useState, useMemo } from 'react';
import { Check, Search, X } from 'lucide-react';
import Popover from '../Popover';

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');
}
const AV_COLORS = ['#6366f1', '#00c875', '#e2445c', '#fdab3d', '#a25ddc', '#0086c0', '#ff5ac4'];
function colorFor(email = '') {
  let h = 0; for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0;
  return AV_COLORS[h % AV_COLORS.length];
}

export function Avatar({ person, size = 26 }) {
  return person.avatar_url ? (
    <img src={person.avatar_url} alt={person.name} title={person.name}
      className="rounded-full object-cover ring-2 ring-white dark:ring-gray-800"
      style={{ width: size, height: size }} />
  ) : (
    <div className="rounded-full flex items-center justify-center text-white font-semibold ring-2 ring-white dark:ring-gray-800"
      title={person.name} style={{ width: size, height: size, backgroundColor: colorFor(person.email), fontSize: size * 0.42 }}>
      {initials(person.name || person.email)}
    </div>
  );
}

// Komórka Osoby — multi-select z wyszukiwaniem po liście app_users.
export default function PeopleCell({ value = [], people = [], onChange, readOnly }) {
  const [q, setQ] = useState('');
  const selected = value || [];
  const isSelected = (email) => selected.some(p => p.email === email);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return people.filter(p => !s || (p.name || '').toLowerCase().includes(s) || (p.email || '').toLowerCase().includes(s));
  }, [q, people]);

  const toggle = (person) => {
    if (isSelected(person.email)) onChange(selected.filter(p => p.email !== person.email));
    else onChange([...selected, { email: person.email, name: person.name, avatar_url: person.avatar_url }]);
  };

  const AvatarStack = (
    <div className="w-full h-full flex items-center px-2 gap-0">
      {selected.length === 0 ? (
        <span className="text-gray-300 dark:text-gray-600 text-xs">+</span>
      ) : (
        <div className="flex -space-x-2">
          {selected.slice(0, 4).map(p => <Avatar key={p.email} person={p} />)}
          {selected.length > 4 && (
            <div className="rounded-full w-[26px] h-[26px] bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-[10px] flex items-center justify-center ring-2 ring-white dark:ring-gray-800">
              +{selected.length - 4}
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (readOnly) return AvatarStack;

  return (
    <Popover width={260} trigger={AvatarStack}>
      {() => (
        <div className="p-2">
          <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-100 dark:bg-gray-700/50 rounded-lg mb-2">
            <Search size={14} className="text-gray-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Szukaj osoby..."
              className="bg-transparent text-sm outline-none w-full text-gray-700 dark:text-gray-200" />
          </div>
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {selected.map(p => (
                <span key={p.email} className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-full pl-1 pr-2 py-0.5 text-xs">
                  <Avatar person={p} size={18} /> {p.name}
                  <button onClick={() => toggle(p)}><X size={12} className="text-gray-400 hover:text-red-500" /></button>
                </span>
              ))}
            </div>
          )}
          <div className="max-h-56 overflow-y-auto custom-scrollbar">
            {filtered.map(p => (
              <button key={p.email} onClick={() => toggle(p)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 text-left">
                <Avatar person={p} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-700 dark:text-gray-200 truncate">{p.name}</div>
                  <div className="text-[11px] text-gray-400 truncate">{p.email}</div>
                </div>
                {isSelected(p.email) && <Check size={16} className="text-accent-primary" />}
              </button>
            ))}
            {filtered.length === 0 && <div className="text-xs text-gray-400 text-center py-3">Brak wyników</div>}
          </div>
        </div>
      )}
    </Popover>
  );
}
