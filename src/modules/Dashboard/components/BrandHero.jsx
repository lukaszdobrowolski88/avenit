import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, MapPin, CalendarDays, Video } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { tr, appLocale } from '../../../i18n';
import { hasPlace, isOnlineFormat, joinWindowOpen, formatLabel } from '../../Events/eventFormat';

// Pulpit w motywie „Avenit” — to samo co karta „Najbliższe” i liczniki w aplikacji mobilnej
// (NextUpCard / Greeting): karta-bohater w jasnej kurkumie z najbliższym wydarzeniem i ciemna
// karta w słodzie z tym, co dziś czeka. Tylko w motywie marki; inne motywy jej nie mają.

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Polska odmiana: 1 zadanie, 2–4 zadania (poza 12–14), 5+ zadań.
export const plural = (n, one, few, many) => {
  if (n === 1) return one;
  const d = n % 10;
  const t = n % 100;
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many;
};

function dayLabel(dateStr) {
  // API zwraca datę jako „2026-10-11T00:00:00.000Z” — liczy się tylko YYYY-MM-DD.
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((date - today) / 86400000);
  if (diff === 0) return tr('Dziś');
  if (diff === 1) return tr('Jutro');
  const label = diff < 7
    ? date.toLocaleDateString(appLocale(), { weekday: 'long' })
    : date.toLocaleDateString(appLocale(), { day: 'numeric', month: 'long' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default function BrandHero({ upcomingMinistry = [], stats = {} }) {
  const navigate = useNavigate();
  const [next, setNext] = useState(undefined); // undefined = ładowanie, null = brak

  useEffect(() => {
    let active = true;
    supabase
      .from('events')
      .select('id, title, date, time, end_time, end_date, location, format')
      .gte('date', ymd(new Date()))
      .order('date', { ascending: true })
      .order('time', { ascending: true })
      .limit(1)
      .then(({ data }) => { if (active) setNext(data?.[0] || null); })
      .catch(() => { if (active) setNext(null); });
    return () => { active = false; };
  }, []);

  const mine = next ? upcomingMinistry.find((s) => String(s.id) === String(next.id)) : null;
  const myRole = mine?.roles?.[0]?.role || null;
  const when = next ? [dayLabel(next.date), next.time ? String(next.time).slice(0, 5) : null].filter(Boolean).join(' · ') : '';

  const tasks = stats.tasksCount || 0;
  const services = stats.upcomingServicesCount || 0;
  const prayers = stats.prayersCount || 0;
  const counters = [
    { n: tasks, label: plural(tasks, tr('zadanie do zrobienia'), tr('zadania do zrobienia'), tr('zadań do zrobienia')) },
    { n: services, label: plural(services, tr('służba przed Tobą'), tr('służby przed Tobą'), tr('służb przed Tobą')) },
    { n: prayers, label: plural(prayers, tr('Twoja intencja'), tr('Twoje intencje'), tr('Twoich intencji')) },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
      {/* Najbliższe — jasna kurkuma */}
      <button
        type="button"
        onClick={() => navigate(next ? `/wydarzenie/${next.id}` : '/wydarzenia')}
        className="brand-hero lg:col-span-2 text-left rounded-[28px] p-6 min-h-[188px] flex flex-col justify-between gap-6 transition hover:brightness-[0.98]"
      >
        <div className="flex items-center gap-3">
          <span className="brand-hero-chip px-3 py-1.5 rounded-full text-xs font-semibold">{tr('Najbliższe')}</span>
          <span className="flex-1 text-sm font-semibold brand-hero-muted truncate">{next === undefined ? '' : when}</span>
          <span className="brand-hero-arrow w-11 h-11 rounded-full flex items-center justify-center shrink-0">
            <ArrowUpRight size={19} strokeWidth={2.2} />
          </span>
        </div>
        <div className="min-w-0">
          {next === undefined ? (
            <div className="h-9 w-2/3 rounded-xl brand-hero-skeleton" />
          ) : next ? (
            <>
              <p className="text-[28px] md:text-[32px] leading-[1.1] font-extrabold tracking-[-0.03em] line-clamp-2">{next.title}</p>
              <div className="flex flex-wrap items-center gap-3 mt-2.5">
                {next.location && hasPlace(next.format) && (
                  <span className="flex items-center gap-1.5 text-sm font-medium brand-hero-muted"><MapPin size={14} />{next.location}</span>
                )}
                {isOnlineFormat(next.format) && (
                  <span className="brand-hero-pill inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold">
                    <Video size={13} aria-hidden="true" /> {joinWindowOpen(next) ? tr('Online · dołącz') : formatLabel(next.format)}
                  </span>
                )}
                {myRole && (
                  <span className="brand-hero-pill px-3 py-1 rounded-full text-xs font-semibold">{tr('Służysz')} · {myRole}</span>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="text-[28px] leading-[1.1] font-extrabold tracking-[-0.03em]">{tr('Nic w kalendarzu')}</p>
              <span className="flex items-center gap-1.5 text-sm font-medium brand-hero-muted mt-2.5"><CalendarDays size={14} />{tr('Dodaj wydarzenie w module Wydarzenia')}</span>
            </>
          )}
        </div>
      </button>

      {/* Na dziś — słód z kurkumą */}
      <div className="brand-today rounded-[28px] p-6 flex flex-col justify-between gap-4">
        <p className="text-[12px] font-bold uppercase tracking-[0.14em] brand-today-label">{tr('Przed Tobą')}</p>
        <div className="space-y-3">
          {counters.map((c) => (
            <div key={c.label} className="flex items-baseline gap-3">
              <span className="brand-today-num text-[30px] leading-none font-extrabold tabular-nums tracking-[-0.03em] min-w-[2ch]">{c.n}</span>
              <span className="text-sm font-medium brand-today-text">{c.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
