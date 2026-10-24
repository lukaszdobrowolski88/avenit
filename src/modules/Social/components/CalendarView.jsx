import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Film } from 'lucide-react';
import Button from '../../../components/Button';
import Spinner from '../../../components/Spinner';
import { tr, appLocale } from '../../../i18n';
import { toast } from '../../../lib/toast';
import { socialApi } from '../lib/socialApi';
import { monthGrid, weekDays, postsByDay, dayKey, timeLabel, moveToDay, postPermissions, snippet, STATUS_COLOR, postWhen, filterPosts } from '../lib/socialUi';
import { isVideo, POST_STATUS_LABELS } from '@avenit/shared/src/lib/social.js';
import { ProviderIcon } from './ChannelAvatar';

const MAX_IN_CELL = 3;

function Chip({ post, draggable, onOpen, onDragStart }) {
  const providers = [...new Set((post.targets || []).map((t) => t.provider))];
  const hasVideo = (post.media || []).some(isVideo);
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', post.id); e.dataTransfer.effectAllowed = 'move'; onDragStart?.(post); }}
      onClick={(e) => { e.stopPropagation(); onOpen(post); }}
      title={`${tr(POST_STATUS_LABELS[post.status])} · ${snippet(post.content, 120)}`}
      className={`w-full text-left rounded-lg px-1.5 py-1 text-[11px] leading-tight bg-gray-100/80 dark:bg-gray-700/60 hover:bg-gray-200/80 dark:hover:bg-gray-700 flex items-center gap-1 min-w-0 ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLOR[post.status] }} aria-hidden="true" />
      <span className="font-semibold tabular-nums text-gray-700 dark:text-gray-200 shrink-0">{timeLabel(postWhen(post))}</span>
      <span className="flex items-center gap-0.5 text-gray-500 shrink-0">
        {providers.map((p) => <ProviderIcon key={p} provider={p} size={10} />)}
        {hasVideo && <Film size={10} aria-hidden="true" />}
      </span>
      <span className="truncate text-gray-600 dark:text-gray-300">{snippet(post.content, 60) || tr('Post bez tekstu')}</span>
    </button>
  );
}

export default function CalendarView({ version, access, myEmail, filters, onOpen, onCreate, onChanged }) {
  const [mode, setMode] = useState('month');
  const [cursor, setCursor] = useState(() => new Date());
  const [posts, setPosts] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [overKey, setOverKey] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const days = useMemo(() => (mode === 'month' ? monthGrid(cursor.getFullYear(), cursor.getMonth()).flat() : weekDays(cursor)), [mode, cursor]);
  const range = useMemo(() => {
    const from = days[0];
    const last = days[days.length - 1];
    return { from, to: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1) };
  }, [days]);

  useEffect(() => {
    let alive = true;
    setPosts(null);
    socialApi.list({ view: 'calendar', from: range.from.toISOString(), to: range.to.toISOString() })
      .then((list) => { if (alive) setPosts(list); })
      .catch((e) => { if (alive) { setPosts([]); toast.error(e.message); } });
    return () => { alive = false; };
  }, [range, version]);

  const byDay = useMemo(() => postsByDay(filterPosts(posts || [], filters, myEmail)), [posts, filters, myEmail]);
  const today = dayKey(new Date());
  const canCreate = access.create || access.publish;

  const shift = (dir) => {
    const d = new Date(cursor);
    if (mode === 'month') d.setMonth(d.getMonth() + dir, 1);
    else d.setDate(d.getDate() + dir * 7);
    setCursor(d);
  };

  const title = mode === 'month'
    ? cursor.toLocaleDateString(appLocale(), { month: 'long', year: 'numeric' })
    : `${days[0].toLocaleDateString(appLocale(), { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString(appLocale(), { day: 'numeric', month: 'short', year: 'numeric' })}`;

  const drop = async (day) => {
    const post = (posts || []).find((p) => p.id === dragId);
    setDragId(null);
    setOverKey(null);
    if (!post) return;
    const iso = moveToDay(postWhen(post), day);
    if (dayKey(iso) === dayKey(postWhen(post))) return;
    if (new Date(iso) <= new Date()) { toast.error(tr('Nie można zaplanować posta w przeszłości.')); return; }
    setPosts((list) => list.map((p) => (p.id === post.id ? { ...p, scheduled_at: iso } : p)));
    try {
      await socialApi.reschedule(post.id, iso);
      onChanged?.();
    } catch (e) {
      toast.error(e.message);
      onChanged?.();
    }
  };

  const createOn = (day) => {
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 18, 0);
    if (at <= new Date()) at.setTime(Date.now() + 3600_000);
    onCreate({ scheduled_at: at.toISOString() });
  };

  const weekdayNames = weekDays(new Date(2026, 9, 26)).map((d) => d.toLocaleDateString(appLocale(), { weekday: 'short' }));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <button type="button" className="icon-btn" onClick={() => shift(-1)} aria-label={tr('Poprzedni')}><ChevronLeft size={18} /></button>
          <button type="button" className="icon-btn" onClick={() => shift(1)} aria-label={tr('Następny')}><ChevronRight size={18} /></button>
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white capitalize">{title}</h2>
        <Button variant="ghost" size="sm" onClick={() => setCursor(new Date())}>{tr('Dziś')}</Button>
        <div className="ml-auto inline-flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
          {[['month', tr('Miesiąc')], ['week', tr('Tydzień')]].map(([v, l]) => (
            <button key={v} type="button" onClick={() => setMode(v)} aria-pressed={mode === v}
              className={`px-3 py-1 rounded-lg text-xs font-medium ${mode === v ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'}`}>{l}</button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden relative">
        {posts === null && <div className="absolute inset-0 z-10 bg-white/50 dark:bg-gray-900/40 flex items-center justify-center"><Spinner /></div>}
        <div className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-700">
          {weekdayNames.map((n) => (
            <div key={n} className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{n}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            const key = dayKey(day);
            const list = byDay.get(key) || [];
            const outside = mode === 'month' && day.getMonth() !== cursor.getMonth();
            const past = key < today;
            const showAll = expanded === key || mode === 'week';
            const shown = showAll ? list : list.slice(0, MAX_IN_CELL);
            return (
              <div
                key={key}
                onDragOver={(e) => { if (dragId && !past) { e.preventDefault(); setOverKey(key); } }}
                onDragLeave={() => setOverKey((k) => (k === key ? null : k))}
                onDrop={(e) => { e.preventDefault(); if (!past) drop(day); }}
                className={`group relative ${mode === 'month' ? 'min-h-[112px]' : 'min-h-[320px]'} p-1.5 border-gray-100 dark:border-gray-700/70 ${i % 7 !== 6 ? 'border-r' : ''} ${i < days.length - 7 ? 'border-b' : ''} ${outside ? 'bg-gray-50/60 dark:bg-gray-900/30' : ''} ${overKey === key ? 'bg-accent-primary/10' : ''}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs tabular-nums w-6 h-6 flex items-center justify-center rounded-full ${key === today ? 'bg-accent-primary text-white font-bold' : outside ? 'text-gray-300 dark:text-gray-600' : 'text-gray-600 dark:text-gray-300'}`}>
                    {day.getDate()}
                  </span>
                  {canCreate && !past && (
                    <button type="button" onClick={() => createOn(day)} aria-label={tr('Nowy post w tym dniu')}
                      className="w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 opacity-0 group-hover:opacity-100 focus:opacity-100">
                      <Plus size={14} />
                    </button>
                  )}
                </div>
                <div className="space-y-1">
                  {shown.map((p) => (
                    <Chip key={p.id} post={p} onOpen={onOpen} draggable={postPermissions(p, access, myEmail).move} onDragStart={(post) => setDragId(post.id)} />
                  ))}
                  {!showAll && list.length > MAX_IN_CELL && (
                    <button type="button" onClick={() => setExpanded(key)} className="text-[11px] text-gray-500 hover:text-gray-800 px-1.5">
                      {tr('+{n} więcej', { n: list.length - MAX_IN_CELL })}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-gray-400">{tr('Przeciągnij post na inny dzień, aby zmienić termin (godzina zostaje).')}</p>
    </div>
  );
}
