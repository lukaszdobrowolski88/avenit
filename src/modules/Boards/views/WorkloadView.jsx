import React, { useMemo, useState } from 'react';
import { Users, Inbox, ChevronDown, UserX } from 'lucide-react';
import EmptyState from '../../../components/EmptyState';
import { StatusPill, STATUS_COLORS } from '../../../components/ui/DataTable';
import { Avatar } from '../components/cells/PeopleCell';
import { applyView } from '../lib/viewData';
import { findLabel } from '../lib/columnTypes';
import { boardColor } from '../lib/palette';
import { tr, appLocale } from '../../../i18n';

// Liczebnik w języku aplikacji: Intl.PluralRules wybiera formę (pl/uk: 1 / 2–4 / 5+, en: 1 / reszta),
// a klucze tłumaczeń to trzy polskie formy.
function plural(n, one, few, many) {
  let cat = 'many';
  try { cat = new Intl.PluralRules(appLocale()).select(n); } catch { /* stary silnik */ }
  return tr(cat === 'one' ? one : cat === 'few' ? few : many, { n });
}
// W zakładce „Zadania” liczymy zadania, w samodzielnych Projektach — elementy.
const countLabel = (n, terms) => (terms?.kind !== 'item'
  ? plural(n, '{n} zadanie', '{n} zadania', '{n} zadań')
  : plural(n, '{n} element', '{n} elementy', '{n} elementów'));

// Widok Obciążenie — ile zadań przypada na osobę (z rozbiciem na statusy). Klik w wiersz
// rozwija listę zadań tej osoby; klik w zadanie otwiera je.
export default function WorkloadView({ data, config, onOpenItem, terms }) {
  const peopleCols = data.columns.filter(c => c.type === 'people');
  const statusCol = data.columns.find(c => c.type === 'status' || c.type === 'priority');
  const items = useMemo(() => applyView(data.items, data.columns, config), [data.items, data.columns, config]);
  const [open, setOpen] = useState(null); // e-mail rozwiniętej osoby albo '__none__'

  const { rows, unassigned, max } = useMemo(() => {
    const byEmail = new Map();
    const none = [];
    const directory = new Map(data.people.map(p => [String(p.email || '').toLowerCase(), p]));
    for (const it of items) {
      const assignees = [];
      for (const c of peopleCols) for (const p of (it.cells?.[c.id] || [])) assignees.push(p);
      if (assignees.length === 0) { none.push(it); continue; }
      const seen = new Set();
      for (const p of assignees) {
        if (!p?.email || seen.has(p.email)) continue; seen.add(p.email);
        if (!byEmail.has(p.email)) {
          const known = directory.get(String(p.email).toLowerCase());
          byEmail.set(p.email, { person: { ...p, name: known?.name || p.name, avatar_url: known?.avatar_url || p.avatar_url }, items: [] });
        }
        byEmail.get(p.email).items.push(it);
      }
    }
    const rows = [...byEmail.values()].sort((a, b) => b.items.length - a.items.length);
    const max = Math.max(1, none.length, ...rows.map(r => r.items.length));
    return { rows, unassigned: none, max };
  }, [items, peopleCols, data.people]);

  if (peopleCols.length === 0) {
    return <EmptyState icon={Users} title={tr('Dodaj kolumnę typu „Osoby", aby zobaczyć obciążenie zespołu.')} />;
  }
  if (rows.length === 0 && unassigned.length === 0) {
    return <EmptyState icon={Inbox} title={tr(terms?.kind !== 'item' ? 'Brak zadań' : 'Brak elementów')} />;
  }

  const labelOf = (it) => (statusCol ? findLabel(statusCol, it.cells?.[statusCol.id]) : null);
  const breakdown = (list) => {
    if (!statusCol) return null;
    const buckets = new Map();
    for (const it of list) {
      const l = labelOf(it);
      const key = l ? l.id : '__none__';
      if (!buckets.has(key)) buckets.set(key, { color: l ? boardColor(l.color) : STATUS_COLORS.neutral, title: l ? l.title : tr('Bez wartości'), n: 0 });
      buckets.get(key).n += 1;
    }
    return [...buckets.values()];
  };

  const renderRow = (key, head, list, muted = false) => {
    const seg = breakdown(list);
    const expanded = open === key;
    const panelId = `wl-${key.replace(/[^a-z0-9_-]/gi, '_')}`;
    return (
      <li key={key} className={`rounded-xl border ${muted ? 'border-dashed' : ''} border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800`}>
        <button type="button" onClick={() => setOpen(expanded ? null : key)} aria-expanded={expanded} aria-controls={panelId}
          className="w-full flex items-center gap-3 p-3 text-left rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/40 outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50">
          {head}
          <div className="flex-1 min-w-0">
            <div className="h-5 rounded-full overflow-hidden flex bg-gray-100 dark:bg-gray-700/50" style={{ width: `${(list.length / max) * 100}%`, minWidth: 24 }} aria-hidden="true">
              {seg ? seg.map((s, i) => (
                <div key={i} style={{ width: `${(s.n / list.length) * 100}%`, backgroundColor: s.color }} title={`${s.title}: ${s.n}`} />
              )) : <div className="w-full" style={{ backgroundColor: muted ? STATUS_COLORS.neutral : STATUS_COLORS.accent }} />}
            </div>
          </div>
          <ChevronDown size={16} className={`shrink-0 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {expanded && (
          <ul id={panelId} className="px-3 pb-3 space-y-1">
            {list.map(it => {
              const l = labelOf(it);
              return (
                <li key={it.id}>
                  <button type="button" onClick={() => onOpenItem(it)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700/40 outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50">
                    <span className={`flex-1 min-w-0 truncate ${it.name ? 'text-gray-700 dark:text-gray-200' : 'text-gray-400 italic'}`}>{it.name || tr('Bez nazwy')}</span>
                    {l && <StatusPill color={boardColor(l.color)} className="shrink-0">{l.title}</StatusPill>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </li>
    );
  };

  return (
    <ul className="space-y-2">
      {rows.map(({ person, items: list }) => renderRow(person.email, (
        <>
          <Avatar person={person} size={32} />
          <div className="w-32 sm:w-40 shrink-0 min-w-0">
            <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{person.name || person.email}</div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400">{countLabel(list.length, terms)}</div>
          </div>
        </>
      ), list))}
      {unassigned.length > 0 && renderRow('__none__', (
        <>
          <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400 shrink-0"><UserX size={15} aria-hidden="true" /></div>
          <div className="w-32 sm:w-40 shrink-0 min-w-0">
            <div className="text-sm font-medium text-gray-600 dark:text-gray-300 truncate">{tr('Nieprzypisane')}</div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400">{countLabel(unassigned.length, terms)}</div>
          </div>
        </>
      ), unassigned, true)}
    </ul>
  );
}
