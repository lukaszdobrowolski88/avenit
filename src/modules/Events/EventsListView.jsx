// Hub „Wydarzenia" — jeden widok z przełącznikiem Kafelki / Lista / Kalendarz.
// Kafelki i Lista pytają wprost tabelę events (widoczność egzekwowana serwerowo z PR A).
// Kalendarz = osadzony CalendarModule (pokazuje też zadania i programy bez wydarzenia).
// Archiwum jest filtrem (Aktualne / Archiwum / Wszystkie), nie osobną zakładką.
import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Calendar, MapPin, Ticket, CreditCard, Archive, RotateCcw, Search, List, LayoutGrid, Tag, Plus, FilterX } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useCampusQuery } from '../../hooks/useCampusQuery';
import { useModules } from '../../hooks/useModules';
import { useModuleCalendars } from '../../hooks/useModuleLabel';
import CustomSelect from '../../components/CustomSelect';
import Spinner from '../../components/Spinner';
import EmptyState from '../../components/EmptyState';
import Button from '../../components/Button';
import { toast } from '../../lib/toast';
import { DataTable, THead, TH, TR, TD, StatusPill, STATUS_COLORS } from '../../components/ui/DataTable';
import { tr, appLocale } from '../../i18n';
import { EventFormatBadge, isOnlineFormat, hasPlace } from './eventFormat';

const CalendarModule = lazy(() => import('../CalendarModule'));

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fmtDate = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('.') : '');
const fmtTime = (t) => (t ? String(t).slice(0, 5) : '');
const localDate = (d) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

// Polska odmiana liczebnika: 1 wydarzenie, 2–4 wydarzenia (poza 12–14), 5+ wydarzeń.
export const plural = (n, one, few, many) => {
  if (n === 1) return one;
  const d = n % 10;
  const t = n % 100;
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many;
};

// Domyślne typy (gdy admin nie skonfigurował kalendarza) — do ładnej etykiety zamiast surowej wartości.
const DEFAULT_TYPE_LABELS = {
  spotkanie: 'Spotkanie', wydarzenie: 'Wydarzenie', szkolenie: 'Szkolenie', inne: 'Inne', 'nabożeństwo': 'Nabożeństwo',
};
export function eventTypeLabel(value, configuredTypes) {
  if (!value) return '';
  const hit = (configuredTypes || []).find((x) => x?.value === value);
  if (hit?.label) return hit.label;
  const def = DEFAULT_TYPE_LABELS[String(value).toLowerCase()];
  if (def) return tr(def);
  const s = String(value);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Sortowanie: wydarzenia bez daty zawsze na końcu (nie wiszą na górze „Aktualnych”).
export function sortEvents(list, archiveF) {
  return [...list].sort((a, b) => {
    const da = String(a.date || '').slice(0, 10);
    const db = String(b.date || '').slice(0, 10);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    const byDate = archiveF === 'archive' ? db.localeCompare(da) : da.localeCompare(db);
    return byDate || String(a.time || '').localeCompare(String(b.time || ''));
  });
}

const ARCHIVE_OPTIONS = [
  { value: 'current', label: 'Aktualne' },
  { value: 'archive', label: 'Archiwum' },
  { value: 'all', label: 'Wszystkie' },
];

export default function EventsListView({ onCreate } = {}) {
  const navigate = useNavigate();
  const { withCampusFilter, selectedCampusId } = useCampusQuery();
  const { modules } = useModules();
  const calMap = useModuleCalendars();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeF, setTypeF] = useState('');
  const [moduleF, setModuleF] = useState('');
  const [paidOnly, setPaidOnly] = useState(false);
  const [regOnly, setRegOnly] = useState(false);
  const [archiveF, setArchiveF] = useState('current'); // current | archive | all
  // ?item=<id> (link do zadania Kalendarza) → widok Kalendarz, który otwiera to zadanie.
  // Bez zapisu w localStorage — to jednorazowe wejście, nie zmiana ulubionego widoku.
  const { search: locationSearch } = useLocation();
  const itemLink = new URLSearchParams(locationSearch).has('item');
  const [viewMode, setViewMode] = useState(() => {
    if (itemLink) return 'calendar';
    try { return localStorage.getItem('events_view_mode') || 'cards'; } catch { return 'cards'; }
  });
  useEffect(() => { if (itemLink) setViewMode('calendar'); }, [itemLink]);
  const setView = (m) => { setViewMode(m); try { localStorage.setItem('events_view_mode', m); } catch { /* ignore */ } };

  // Brak modułu = zawsze „Ogólne” (jak w formularzu), nigdy „—”.
  const moduleLabel = useCallback((k) => (k ? (modules.find((m) => m.key === k)?.label || k) : tr('Ogólne')), [modules]);
  const typeLabel = useCallback((e) => eventTypeLabel(e.event_type, calMap?.[e.module_key || 'general']?.types), [calMap]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase.from('events').select(
        'id, title, module_key, event_type, date, time, end_time, location, is_paid, registration_required, registration_deadline, is_archived, format'
      );
      q = withCampusFilter(q);
      const { data, error } = await q;
      if (error) throw error;
      setRows(data || []);
    } catch (e) {
      toast.error(e, { fallback: tr('Nie udało się wczytać wydarzeń. Odśwież stronę.') });
      setRows([]);
    }
    finally { setLoading(false); }
  }, [withCampusFilter]);

  useEffect(() => { load(); }, [load, selectedCampusId]);

  const setArchived = async (e, val) => {
    const { error } = await supabase.from('events').update({ is_archived: val }).eq('id', e.id);
    if (error) return toast.error(error, { fallback: tr('Nie udało się zmienić wydarzenia.') });
    setRows((rs) => rs.map((r) => (r.id === e.id ? { ...r, is_archived: val } : r)));
    if (val) {
      // Bez okna potwierdzenia, ale z „Cofnij” — przypadkowe tapnięcie łatwo odkręcić.
      toast.success({
        message: tr('Przeniesiono „{title}” do archiwum.', { title: e.title || tr('wydarzenie') }),
        action: { label: tr('Cofnij'), onClick: () => setArchived(e, false) },
      });
    } else {
      toast.success(tr('Przywrócono „{title}”.', { title: e.title || tr('wydarzenie') }));
    }
  };

  // Filtr archiwum: aktualne = data >= dziś (lub bez daty) i nie zarchiwizowane; archiwum = zarchiwizowane lub przeszłe.
  const today = todayStr();
  const isArch = useCallback((e) => e.is_archived || (String(e.date || '').slice(0, 10) < today && !!e.date), [today]);
  const scoped = useMemo(() => {
    const byArch = rows.filter((e) => {
      if (archiveF === 'archive') return isArch(e);
      if (archiveF === 'current') return !isArch(e);
      return true;
    });
    return sortEvents(byArch, archiveF);
  }, [rows, archiveF, isArch]);

  const typeOptions = useMemo(() => {
    const s = new Map();
    scoped.forEach((e) => { if (e.event_type && !s.has(e.event_type)) s.set(e.event_type, typeLabel(e)); });
    return [{ value: '', label: tr('Wszystkie typy') }, ...[...s].map(([v, l]) => ({ value: v, label: l }))];
  }, [scoped, typeLabel]);
  const moduleOptions = useMemo(() => {
    const s = new Set(scoped.map((e) => e.module_key || '__general'));
    return [{ value: '', label: tr('Wszystkie moduły') }, ...[...s].map((v) => ({ value: v, label: v === '__general' ? tr('Ogólne') : moduleLabel(v) }))];
  }, [scoped, moduleLabel]);

  const filtered = useMemo(() => {
    const qq = search.trim().toLowerCase();
    return scoped.filter((e) => {
      if (typeF && e.event_type !== typeF) return false;
      if (moduleF && (e.module_key || '__general') !== moduleF) return false;
      if (paidOnly && !e.is_paid) return false;
      if (regOnly && !e.registration_required) return false;
      if (qq && !(`${e.title || ''} ${e.location || ''}`.toLowerCase().includes(qq))) return false;
      return true;
    });
  }, [scoped, search, typeF, moduleF, paidOnly, regOnly]);

  const hasFilters = !!(search.trim() || typeF || moduleF || paidOnly || regOnly);
  const clearFilters = () => { setSearch(''); setTypeF(''); setModuleF(''); setPaidOnly(false); setRegOnly(false); };
  const open = (e) => navigate(`/wydarzenie/${e.id}`);
  const onCardKey = (ev, e) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(e); } };

  const ViewSwitch = (
    <div className="flex items-center gap-0.5 p-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg shrink-0" role="group" aria-label={tr('Widok')}>
      {[['cards', LayoutGrid, tr('Kafelki')], ['list', List, tr('Lista')], ['calendar', Calendar, tr('Kalendarz')]].map(([id, Icon, title]) => (
        <button key={id} onClick={() => setView(id)} title={title} aria-label={title} aria-pressed={viewMode === id}
          className={`p-1.5 rounded-md transition ${viewMode === id ? 'bg-white dark:bg-gray-900 text-accent-primary shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
          <Icon size={16} aria-hidden="true" />
        </button>
      ))}
    </div>
  );

  // Widok Kalendarz — osadzony CalendarModule (własny toolbar). Pokazujemy tylko przełącznik widoku.
  if (viewMode === 'calendar') {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex justify-end">{ViewSwitch}</div>
        <div className="min-h-[78vh]">
          <Suspense fallback={<Spinner center size={28} />}><CalendarModule embedded /></Suspense>
        </div>
      </div>
    );
  }

  // Przycisk archiwizacji/przywrócenia: na dotyku zawsze widoczny (brak hovera), z klawiatury przy fokusie.
  const reveal = 'opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-hover/row:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100';
  const ArchiveButton = ({ e, compact }) => {
    const archived = isArch(e);
    if (archived && !e.is_archived) return null; // przeszłe (nie zarchiwizowane ręcznie) — nic do zrobienia
    const label = e.is_archived ? tr('Przywróć') : tr('Archiwizuj');
    const Icon = e.is_archived ? RotateCcw : Archive;
    return (
      <button
        onClick={(ev) => { ev.stopPropagation(); setArchived(e, !e.is_archived); }}
        onKeyDown={(ev) => ev.stopPropagation()}
        title={label}
        aria-label={`${label}: ${e.title || ''}`}
        className={compact
          ? `p-1.5 rounded-lg text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition ${reveal}`
          : `text-xs font-medium px-2.5 py-1 rounded-lg text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-1.5 transition ${reveal}`}
      >
        <Icon size={compact ? 16 : 14} aria-hidden="true" />{!compact && label}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {/* Pasek filtrów */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr('Szukaj wydarzeń…')} aria-label={tr('Szukaj wydarzeń')}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" />
        </div>
        <div className="w-40"><CustomSelect value={archiveF} onChange={setArchiveF} options={ARCHIVE_OPTIONS.map((o) => ({ ...o, label: tr(o.label) }))} /></div>
        <div className="w-44"><CustomSelect value={typeF} onChange={setTypeF} options={typeOptions} /></div>
        <div className="w-48"><CustomSelect value={moduleF} onChange={setModuleF} options={moduleOptions} /></div>
        <button onClick={() => setPaidOnly((v) => !v)} aria-pressed={paidOnly}
          className={`px-3 py-2 rounded-xl text-sm font-medium border transition flex items-center gap-1.5 ${paidOnly ? 'bg-accent-primary text-white border-accent-primary' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'}`}>
          <CreditCard size={14} aria-hidden="true" /> {tr('Płatne')}
        </button>
        <button onClick={() => setRegOnly((v) => !v)} aria-pressed={regOnly}
          className={`px-3 py-2 rounded-xl text-sm font-medium border transition flex items-center gap-1.5 ${regOnly ? 'bg-accent-primary text-white border-accent-primary' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'}`}>
          <Ticket size={14} aria-hidden="true" /> {tr('Z rejestracją')}
        </button>
        <div className="ml-auto flex items-center gap-3">
          {ViewSwitch}
          <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
            {plural(filtered.length, tr('{n} wydarzenie', { n: filtered.length }), tr('{n} wydarzenia', { n: filtered.length }), tr('{n} wydarzeń', { n: filtered.length }))}
          </span>
        </div>
      </div>

      {loading ? <Spinner center size={28} />
        : filtered.length === 0 ? (
          hasFilters ? (
            // Wydarzenia są, tylko nie pasują do filtrów — nie zachęcamy do tworzenia duplikatu.
            <EmptyState icon={FilterX}
              title={tr('Brak wyników dla tych filtrów')}
              subtitle={tr('Zmień wyszukiwanie albo wyczyść filtry.')}
              action={<Button variant="outline" size="sm" icon={FilterX} onClick={clearFilters}>{tr('Wyczyść filtry')}</Button>} />
          ) : archiveF === 'archive' ? (
            <EmptyState icon={Archive} title={tr('Archiwum jest puste')} subtitle={tr('Wydarzenia przeszłe i zarchiwizowane pojawią się tutaj.')} />
          ) : (
            <EmptyState icon={Calendar} title={tr('Brak nadchodzących wydarzeń')}
              subtitle={rows.length ? tr('Przeszłe wydarzenia znajdziesz w archiwum.') : tr('Dodaj pierwsze wydarzenie.')}
              action={onCreate ? <Button size="sm" icon={Plus} onClick={onCreate}>{tr('Nowe wydarzenie')}</Button> : null} />
          )
        ) : viewMode === 'list' ? (
          <DataTable>
            <THead>
              <tr>
                <TH>{tr('Data')}</TH>
                <TH>{tr('Wydarzenie')}</TH>
                <TH className="hidden sm:table-cell">{tr('Typ')}</TH>
                <TH className="hidden md:table-cell">{tr('Moduł')}</TH>
                <TH className="hidden lg:table-cell">{tr('Miejsce')}</TH>
                <TH align="right"><span className="sr-only">{tr('Akcje')}</span></TH>
              </tr>
            </THead>
            <tbody>
              {filtered.map((e) => (
                <TR key={e.id} onClick={() => open(e)} tabIndex={0} onKeyDown={(ev) => onCardKey(ev, e)}>
                  <TD muted numeric className="whitespace-nowrap">
                    {e.date ? <>{fmtDate(e.date)}{e.time && <span className="text-gray-500"> {fmtTime(e.time)}</span>}</> : <span className="text-amber-700 dark:text-amber-400">{tr('Bez terminu')}</span>}
                  </TD>
                  <TD>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-gray-900 dark:text-gray-100 truncate">{e.title || tr('Bez tytułu')}</span>
                      {e.is_paid && <StatusPill color={STATUS_COLORS.warning} className="shrink-0">{tr('płatne')}</StatusPill>}
                      {e.registration_required && <StatusPill color={STATUS_COLORS.info} className="shrink-0">{tr('rejestracja')}</StatusPill>}
                      {e.is_archived && <StatusPill color={STATUS_COLORS.accent} className="shrink-0">{tr('archiwum')}</StatusPill>}
                      {isOnlineFormat(e.format) && <EventFormatBadge format={e.format} className="shrink-0" />}
                    </div>
                  </TD>
                  <TD muted className="hidden sm:table-cell">{typeLabel(e)}</TD>
                  <TD muted className="hidden md:table-cell">{moduleLabel(e.module_key)}</TD>
                  <TD muted className="hidden lg:table-cell">
                    {e.location && hasPlace(e.format) ? <span className="inline-flex items-center gap-1"><MapPin size={12} className="text-gray-400" aria-hidden="true" />{e.location}</span> : null}
                  </TD>
                  <TD align="right" className="whitespace-nowrap">
                    <ArchiveButton e={e} compact />
                  </TD>
                </TR>
              ))}
            </tbody>
          </DataTable>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((e) => {
              const d = localDate(e.date);
              return (
                <div key={e.id} role="link" tabIndex={0} onClick={() => open(e)} onKeyDown={(ev) => onCardKey(ev, e)}
                  aria-label={`${e.title || tr('Bez tytułu')}${d ? `, ${d.toLocaleDateString(appLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}` : ''}`}
                  className="group relative bg-white dark:bg-gray-800/70 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-lg hover:border-accent-primary-lighter dark:hover:border-accent-primary-dark transition cursor-pointer flex flex-col focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40">
                  {/* Nagłówek: data + typ */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    {d ? (
                      <div className="bg-gradient-to-br from-accent-primary to-accent-secondary text-white rounded-xl px-3 py-1.5 text-center min-w-[52px]">
                        <div className="text-xl font-bold leading-none">{d.getDate()}</div>
                        <div className="text-[11px] uppercase opacity-90 mt-0.5">{d.toLocaleDateString(appLocale(), { month: 'short' })} {d.getFullYear()}</div>
                      </div>
                    ) : (
                      <div className="rounded-xl px-3 py-1.5 text-center text-xs font-medium bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">{tr('Bez terminu')}</div>
                    )}
                    {e.event_type && <span className="px-2 py-1 text-[11px] rounded-full font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 shrink-0">{typeLabel(e)}</span>}
                  </div>

                  {/* Tytuł + pełna data + oznaczenia */}
                  <h4 className="font-bold text-gray-800 dark:text-gray-100 truncate">{e.title || tr('Bez tytułu')}</h4>
                  {d && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{d.toLocaleDateString(appLocale(), { weekday: 'short' })} {fmtDate(e.date)}{e.time ? `, ${fmtTime(e.time)}${e.end_time ? ` - ${fmtTime(e.end_time)}` : ''}` : ''}</p>}
                  {(e.is_paid || e.registration_required || e.is_archived || isOnlineFormat(e.format)) && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {isOnlineFormat(e.format) && <EventFormatBadge format={e.format} />}
                      {e.is_paid && <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">{tr('płatne')}</span>}
                      {e.registration_required && <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300">{tr('rejestracja')}</span>}
                      {e.is_archived && <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200">{tr('archiwum')}</span>}
                    </div>
                  )}

                  {/* Meta */}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-xs text-gray-500 dark:text-gray-400">
                    {e.location && hasPlace(e.format) && <span className="flex items-center gap-1"><MapPin size={13} aria-hidden="true" /> {e.location}</span>}
                    <span className="flex items-center gap-1"><Tag size={13} aria-hidden="true" /> {moduleLabel(e.module_key)}</span>
                  </div>

                  {/* Stopka: archiwizacja / przywróć — tylko sam przycisk zatrzymuje kliknięcie (reszta stopki otwiera wydarzenie) */}
                  <div className="flex items-center justify-end mt-auto pt-3 border-t border-gray-100 dark:border-gray-700 min-h-[2.25rem]">
                    <ArchiveButton e={e} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}
