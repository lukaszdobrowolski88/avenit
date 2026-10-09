import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { endOfWeek, format } from 'date-fns';
import { Inbox, AlertCircle, CalendarClock, CalendarDays, CalendarRange, Circle, CheckCircle2 } from 'lucide-react';
import { useMyWork } from './hooks/useMyWork';
import { bucketize } from './lib/myWork';
import { tr, appLocale } from '../../i18n';
import Spinner from '../../components/Spinner';
import EmptyState from '../../components/EmptyState';
import { StatusPill } from '../../components/ui/DataTable';

const BUCKETS = [
  { key: 'overdue', label: 'Zaległe', icon: AlertCircle, tone: 'text-red-600 dark:text-red-400' },
  { key: 'today', label: 'Dziś', icon: CalendarClock },
  { key: 'week', label: 'Ten tydzień', icon: CalendarDays },
  { key: 'later', label: 'Później', icon: CalendarRange },
  { key: 'none', label: 'Bez terminu', icon: Circle },
  { key: 'done', label: 'Ukończone', icon: CheckCircle2 },
];

const fmtDue = (d) => {
  if (!d) return '';
  const dt = new Date(`${d}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString(appLocale(), { day: 'numeric', month: 'short' });
};

// Elementy z tablic Projektów otwieramy w miejscu (bez przeładowania modułu), zadania służb i
// Kalendarza — linkiem do ich modułu (taskItemLink), bo tam żyją.
const isProjectsLink = (link) => String(link || '').startsWith('/projekty?');

export default function MyWork({ userEmail, userName, onOpenBoard }) {
  const { rows, loading, partial } = useMyWork(userEmail);

  const grouped = useMemo(() => {
    const now = new Date();
    return bucketize(rows, format(now, 'yyyy-MM-dd'), format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  }, [rows]);

  return (
    <div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {tr('Elementy przypisane do Ciebie ({who}) ze wszystkich tablic.', { who: userName || userEmail })}
        {partial && <> {tr('Pokazujemy tylko elementy z terminem.')}</>}
      </p>

      {loading ? (
        <Spinner center />
      ) : rows.length === 0 ? (
        <EmptyState icon={Inbox} title={tr('Nie masz jeszcze przypisanych elementów.')} subtitle={tr('Dodaj się do kolumny „Osoby" w dowolnej tablicy.')} />
      ) : (
        <div className="space-y-6">
          {BUCKETS.map((bucket) => {
            const list = grouped[bucket.key];
            if (!list.length) return null;
            const headingId = `mywork-${bucket.key}`;
            return (
              <section key={bucket.key} aria-labelledby={headingId}>
                <h3 id={headingId} className={`flex items-center gap-2 mb-2 font-semibold text-sm ${bucket.tone || 'text-gray-700 dark:text-gray-200'}`}>
                  <bucket.icon size={16} aria-hidden="true" /> {tr(bucket.label)}
                  <span className="text-gray-400 font-normal tabular-nums">{list.length}</span>
                </h3>
                <ul className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-700/60">
                  {list.map((r) => (
                    <li key={r.id}>
                      <Link to={r.link}
                        onClick={(e) => {
                          if (!isProjectsLink(r.link) || !onOpenBoard || e.metaKey || e.ctrlKey || e.shiftKey) return;
                          e.preventDefault();
                          onOpenBoard(r.boardId, r.id);
                        }}
                        className="flex items-center gap-3 px-4 py-3 min-h-[48px] hover:bg-gray-50 dark:hover:bg-gray-700/30 focus-visible:outline-none focus-visible:bg-gray-50 dark:focus-visible:bg-gray-700/40">
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm truncate ${r.done ? 'text-gray-400 line-through' : 'text-gray-800 dark:text-gray-100'}`}>{r.name || tr('Bez nazwy')}</span>
                          <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 truncate">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: r.boardColor }} aria-hidden="true" />
                            <span className="truncate">{r.boardName}</span>
                          </span>
                        </span>
                        {r.status && <StatusPill color={r.status.color} className="shrink-0 hidden sm:inline-flex">{r.status.title}</StatusPill>}
                        {r.due && <time dateTime={r.due} className="text-xs text-gray-500 dark:text-gray-400 tabular-nums shrink-0">{fmtDue(r.due)}</time>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
