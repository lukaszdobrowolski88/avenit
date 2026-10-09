import React, { useMemo } from 'react';
import { MessageSquare, Calendar, CornerDownRight, Paperclip, Star, GripVertical } from 'lucide-react';
import { Avatar } from './cells/PeopleCell';
import { StatusPill, STATUS_COLORS } from '../../../components/ui/DataTable';
import { findLabel, resolveOptions, isOverdue } from '../lib/columnTypes';
import { boardColor } from '../lib/palette';
import { tr, appLocale } from '../../../i18n';

// Data ISO (yyyy-mm-dd) → „12 paź” w języku aplikacji (rok tylko, gdy inny niż bieżący).
function fmtD(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ''));
  if (!m) return '';
  const date = new Date(+m[1], +m[2] - 1, +m[3]);
  const opts = { day: 'numeric', month: 'short', ...(date.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) };
  try { return date.toLocaleDateString(appLocale(), opts); } catch { return `${m[3]}.${m[2]}.${m[1]}`; }
}

// Karta zadania (Kanban) — kluczowe informacje bez otwierania okna. Cała karta klikalna przez
// „rozciągnięty” <button> z nazwą (Tab + Enter/Spacja działają), uchwyt przeciągania leży nad nim.
export default function ItemCard({ item, columns, onOpen, updatesCount = 0, subCount = 0, dragHandleProps, people: directory }) {
  const statusCols = columns.filter(c => c.type === 'status');
  const priorityCols = columns.filter(c => c.type === 'priority');
  const peopleCol = columns.find(c => c.type === 'people');
  const dateCol = columns.find(c => c.type === 'date');
  const timelineCol = columns.find(c => c.type === 'timeline');
  const dropdownCol = columns.find(c => c.type === 'dropdown');
  const numberCols = columns.filter(c => c.type === 'number');
  const ratingCol = columns.find(c => c.type === 'rating');
  const progressCol = columns.find(c => c.type === 'progress');
  const filesCol = columns.find(c => c.type === 'files');

  // Zdjęcia z katalogu osób (aktualne), a nie z chwili przypisania zapisanej w komórce.
  const byEmail = useMemo(() => new Map((directory || []).map(p => [String(p.email || '').toLowerCase(), p])), [directory]);
  const people = (peopleCol ? (item.cells?.[peopleCol.id] || []) : [])
    .map(p => ({ ...p, avatar_url: byEmail.get(String(p.email || '').toLowerCase())?.avatar_url || p.avatar_url }));
  const dateVal = dateCol ? item.cells?.[dateCol.id] : null;
  const tl = timelineCol ? item.cells?.[timelineCol.id] : null;
  const tags = dropdownCol ? resolveOptions(dropdownCol, item.cells?.[dropdownCol.id]) : [];
  const rating = ratingCol ? Number(item.cells?.[ratingCol.id] || 0) : 0;
  const progress = progressCol ? Math.max(0, Math.min(100, Number(item.cells?.[progressCol.id]) || 0)) : null;
  const filesCount = filesCol ? (item.cells?.[filesCol.id] || []).length : 0;
  const numberChips = numberCols
    .map(c => ({ c, v: item.cells?.[c.id] }))
    .filter(x => x.v != null && x.v !== '')
    .slice(0, 2);

  const dateLabel = (dateVal && fmtD(dateVal)) || (tl?.start ? `${fmtD(tl.start)}${tl.end ? '–' + fmtD(tl.end) : ''}` : null);
  // Po terminie (przed dziś, niezakończone) — termin na czerwono, jak w tabeli.
  const overdue = dateVal ? isOverdue(dateVal, item, columns) : (tl ? isOverdue(tl, item, columns) : false);
  const pills = [
    ...priorityCols.map(c => findLabel(c, item.cells?.[c.id])).filter(Boolean),
    ...statusCols.map(c => findLabel(c, item.cells?.[c.id])).filter(Boolean),
  ];
  const hasFooter = dateLabel || updatesCount > 0 || subCount > 0 || filesCount > 0 || people.length > 0;
  const name = item.name || tr('Bez nazwy');

  return (
    <div className="relative bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition focus-within:ring-2 focus-within:ring-accent-primary/40">
      <div className="flex items-start gap-1.5">
        {dragHandleProps && (
          <span {...dragHandleProps} aria-label={tr('Przenieś: {name}', { name })}
            className="relative z-10 -ml-1 mt-0.5 p-0.5 rounded cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 touch-none outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50">
            <GripVertical size={14} aria-hidden="true" />
          </span>
        )}
        {onOpen ? (
          <button type="button" onClick={() => onOpen(item)}
            className={`flex-1 min-w-0 text-left text-sm font-semibold line-clamp-2 leading-snug outline-none after:absolute after:inset-0 after:rounded-xl after:content-[''] ${item.name ? 'text-gray-800 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>
            {name}
          </button>
        ) : (
          <p className={`flex-1 min-w-0 text-sm font-semibold line-clamp-2 leading-snug ${item.name ? 'text-gray-800 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>{name}</p>
        )}
      </div>

      {item.description && (
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-snug">{item.description}</p>
      )}

      {(pills.length > 0 || tags.length > 0) && (
        <div className="flex flex-wrap gap-1 mt-2">
          {pills.map((l, i) => <StatusPill key={`${l.id || i}`} color={boardColor(l.color)} className="max-w-full truncate">{l.title}</StatusPill>)}
          {tags.map(o => <StatusPill key={o.id} color={boardColor(o.color)} className="max-w-full truncate">{o.title}</StatusPill>)}
        </div>
      )}

      {(numberChips.length > 0 || rating > 0) && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-2 text-[11px] text-gray-500 dark:text-gray-400">
          {numberChips.map(({ c, v }) => (
            <span key={c.id} className="inline-flex items-center gap-1">
              <span className="text-gray-500 dark:text-gray-400">{c.name}:</span>
              <span className="font-medium text-gray-700 dark:text-gray-200">{v}{c.settings?.unit ? ` ${c.settings.unit}` : ''}</span>
            </span>
          ))}
          {rating > 0 && (
            <span className="inline-flex items-center gap-0.5 text-gray-600 dark:text-gray-300" aria-label={tr('Ocena: {n}', { n: rating })}>
              <Star size={12} className="fill-accent-primary-light text-accent-primary-light" aria-hidden="true" /> {rating}
            </span>
          )}
        </div>
      )}

      {progress != null && progress > 0 && (
        <div className="flex items-center gap-1.5 mt-2">
          <div className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-600 overflow-hidden" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: progress >= 100 ? STATUS_COLORS.success : STATUS_COLORS.accent }} />
          </div>
          <span className="text-[11px] text-gray-500 dark:text-gray-400 w-8 text-right tabular-nums">{progress}%</span>
        </div>
      )}

      {hasFooter && (
        <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-gray-100 dark:border-gray-700/60">
          <div className="flex items-center gap-2.5 text-[11px] text-gray-500 dark:text-gray-400 min-w-0">
            {dateLabel && (
              <span className={`inline-flex items-center gap-1 truncate ${overdue ? 'text-red-600 dark:text-red-400 font-semibold' : ''}`} title={overdue ? tr('Po terminie') : undefined}>
                <Calendar size={12} aria-hidden="true" /> {dateLabel}{overdue && <span className="sr-only"> · {tr('Po terminie')}</span>}
              </span>
            )}
            {subCount > 0 && <span className="inline-flex items-center gap-0.5" title={tr('Podzadania')}><CornerDownRight size={12} aria-hidden="true" /> {subCount}</span>}
            {updatesCount > 0 && <span className="inline-flex items-center gap-0.5" title={tr('Komentarze')}><MessageSquare size={12} aria-hidden="true" /> {updatesCount}</span>}
            {filesCount > 0 && <span className="inline-flex items-center gap-0.5" title={tr('Pliki')}><Paperclip size={12} aria-hidden="true" /> {filesCount}</span>}
          </div>
          {people.length > 0 && (
            <div className="flex -space-x-2 shrink-0">
              {people.slice(0, 3).map(p => <Avatar key={p.email} person={p} size={22} />)}
              {people.length > 3 && <div className="w-[22px] h-[22px] rounded-full bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-200 text-[9px] font-semibold flex items-center justify-center ring-2 ring-white dark:ring-gray-800">+{people.length - 3}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
