import React, { useMemo } from 'react';
import { endOfWeek, format } from 'date-fns';
import { Loader2, AlertCircle, CalendarClock, CalendarDays, CalendarRange, Circle, CheckCircle2 } from 'lucide-react';
import { useMyWork } from './hooks/useMyWork';

const BUCKETS = [
  { key: 'overdue', label: 'Zaległe', icon: AlertCircle, tone: 'text-red-500' },
  { key: 'today', label: 'Dziś', icon: CalendarClock, tone: 'text-amber-500' },
  { key: 'week', label: 'Ten tydzień', icon: CalendarDays, tone: 'text-accent-primary' },
  { key: 'later', label: 'Później', icon: CalendarRange, tone: 'text-gray-500' },
  { key: 'none', label: 'Bez terminu', icon: Circle, tone: 'text-gray-400' },
  { key: 'done', label: 'Ukończone', icon: CheckCircle2, tone: 'text-green-500' },
];

export default function MyWork({ userEmail, userName, onOpenBoard }) {
  const { rows, loading } = useMyWork(userEmail);

  const grouped = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const eow = format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const g = { overdue: [], today: [], week: [], later: [], none: [], done: [] };
    for (const r of rows) {
      if (r.done) { g.done.push(r); continue; }
      if (!r.due) { g.none.push(r); continue; }
      if (r.due < todayStr) g.overdue.push(r);
      else if (r.due === todayStr) g.today.push(r);
      else if (r.due <= eow) g.week.push(r);
      else g.later.push(r);
    }
    Object.values(g).forEach(list => list.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999')));
    return g;
  }, [rows]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-accent-primary to-accent-secondary dark:from-accent-primary-light dark:to-accent-secondary-light bg-clip-text text-transparent">Moja praca</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Elementy przypisane do Ciebie ({userName || userEmail}) ze wszystkich tablic.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-400"><Loader2 className="animate-spin" size={26} /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
          Nie masz jeszcze przypisanych elementów. Dodaj się do kolumny „Osoby" w dowolnej tablicy.
        </div>
      ) : (
        <div className="space-y-6">
          {BUCKETS.map(bucket => {
            const list = grouped[bucket.key];
            if (!list.length) return null;
            return (
              <div key={bucket.key}>
                <div className={`flex items-center gap-2 mb-2 font-semibold text-sm ${bucket.tone}`}>
                  <bucket.icon size={16} /> {bucket.label} <span className="text-gray-400 font-normal">{list.length}</span>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/60">
                  {list.map(r => (
                    <button key={r.item.id} onClick={() => onOpenBoard(r.boardId, r.item.id)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/30 text-left">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.boardColor }} />
                      <span className={`flex-1 text-sm truncate ${r.done ? 'text-gray-400 line-through' : 'text-gray-800 dark:text-gray-100'}`}>{r.item.name || 'Bez nazwy'}</span>
                      {r.status && <span className="text-[11px] px-2 py-0.5 rounded-full text-white shrink-0" style={{ backgroundColor: r.status.color }}>{r.status.title}</span>}
                      <span className="text-xs text-gray-400 w-24 truncate text-right shrink-0">{r.boardName}</span>
                      <span className="text-xs text-gray-500 w-20 text-right shrink-0">{r.due || ''}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
