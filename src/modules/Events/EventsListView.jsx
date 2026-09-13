// Hub „Wydarzenia" — jeden widok z przełącznikiem Kafelki / Lista / Kalendarz.
// Kafelki i Lista pytają wprost tabelę events (widoczność egzekwowana serwerowo z PR A).
// Kalendarz = osadzony CalendarModule (agreguje też programy/nabożeństwa i pokazuje przeszłe).
// Archiwum jest filtrem (Aktualne / Archiwum / Wszystkie), nie osobną zakładką.
import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, MapPin, Ticket, CreditCard, Archive, RotateCcw, Search, Clock, List, LayoutGrid } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useCampusQuery } from '../../hooks/useCampusQuery';
import { useModules } from '../../hooks/useModules';
import CustomSelect from '../../components/CustomSelect';
import Spinner from '../../components/Spinner';
import EmptyState from '../../components/EmptyState';
import { toast } from '../../lib/toast';

const CalendarModule = lazy(() => import('../CalendarModule'));

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fmtDate = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('.') : '—');
const fmtTime = (t) => (t ? String(t).slice(0, 5) : '');
const WEEKDAYS = ['niedz.', 'pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.'];
const MONTHS_SHORT = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];

const ARCHIVE_OPTIONS = [
  { value: 'current', label: 'Aktualne' },
  { value: 'archive', label: 'Archiwum' },
  { value: 'all', label: 'Wszystkie' },
];

export default function EventsListView() {
  const navigate = useNavigate();
  const { withCampusFilter, selectedCampusId } = useCampusQuery();
  const { modules } = useModules();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeF, setTypeF] = useState('');
  const [moduleF, setModuleF] = useState('');
  const [paidOnly, setPaidOnly] = useState(false);
  const [regOnly, setRegOnly] = useState(false);
  const [archiveF, setArchiveF] = useState('current'); // current | archive | all
  const [viewMode, setViewMode] = useState(() => {
    try { return localStorage.getItem('events_view_mode') || 'cards'; } catch { return 'cards'; }
  });
  const setView = (m) => { setViewMode(m); try { localStorage.setItem('events_view_mode', m); } catch { /* ignore */ } };

  const moduleLabel = useCallback((k) => modules.find((m) => m.key === k)?.label || k || '—', [modules]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase.from('events').select(
        'id, title, module_key, event_type, date, time, end_time, location, is_paid, registration_required, registration_deadline, is_archived'
      );
      q = withCampusFilter(q);
      const { data } = await q;
      setRows(data || []);
    } catch { setRows([]); }
    finally { setLoading(false); }
  }, [withCampusFilter]);

  useEffect(() => { load(); }, [load, selectedCampusId]);

  const setArchived = async (id, val) => {
    const { error } = await supabase.from('events').update({ is_archived: val }).eq('id', id);
    if (error) return toast.error('Nie udało się zmienić: ' + error.message);
    toast.success(val ? 'Przeniesiono do archiwum.' : 'Przywrócono.');
    load();
  };

  // Filtr archiwum: aktualne = data >= dziś i nie zarchiwizowane; archiwum = zarchiwizowane lub przeszłe.
  const today = todayStr();
  const isArch = useCallback((e) => e.is_archived || (String(e.date || '').slice(0, 10) < today && !!e.date), [today]);
  const scoped = useMemo(() => {
    const byArch = rows.filter((e) => {
      if (archiveF === 'archive') return isArch(e);
      if (archiveF === 'current') return !isArch(e);
      return true;
    });
    return byArch.sort((a, b) => {
      const da = String(a.date || ''), db = String(b.date || '');
      return archiveF === 'archive' ? db.localeCompare(da) : da.localeCompare(db);
    });
  }, [rows, archiveF, isArch]);

  const typeOptions = useMemo(() => {
    const s = new Set(scoped.map((e) => e.event_type).filter(Boolean));
    return [{ value: '', label: 'Wszystkie typy' }, ...[...s].map((v) => ({ value: v, label: v }))];
  }, [scoped]);
  const moduleOptions = useMemo(() => {
    const s = new Set(scoped.map((e) => e.module_key).filter(Boolean));
    return [{ value: '', label: 'Wszystkie moduły' }, ...[...s].map((v) => ({ value: v, label: moduleLabel(v) }))];
  }, [scoped, moduleLabel]);

  const filtered = useMemo(() => {
    const qq = search.trim().toLowerCase();
    return scoped.filter((e) => {
      if (typeF && e.event_type !== typeF) return false;
      if (moduleF && e.module_key !== moduleF) return false;
      if (paidOnly && !e.is_paid) return false;
      if (regOnly && !e.registration_required) return false;
      if (qq && !(`${e.title || ''} ${e.location || ''}`.toLowerCase().includes(qq))) return false;
      return true;
    });
  }, [scoped, search, typeF, moduleF, paidOnly, regOnly]);

  const ViewSwitch = (
    <div className="flex items-center gap-0.5 p-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg shrink-0">
      {[['cards', LayoutGrid, 'Kafelki'], ['list', List, 'Lista'], ['calendar', Calendar, 'Kalendarz']].map(([id, Icon, title]) => (
        <button key={id} onClick={() => setView(id)} title={title}
          className={`p-1.5 rounded-md transition ${viewMode === id ? 'bg-white dark:bg-gray-900 text-accent-primary shadow-sm' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}>
          <Icon size={16} />
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

  return (
    <div className="space-y-4">
      {/* Pasek filtrów */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Szukaj wydarzeń…"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" />
        </div>
        <div className="w-40"><CustomSelect value={archiveF} onChange={setArchiveF} options={ARCHIVE_OPTIONS} /></div>
        <div className="w-44"><CustomSelect value={typeF} onChange={setTypeF} options={typeOptions} /></div>
        <div className="w-48"><CustomSelect value={moduleF} onChange={setModuleF} options={moduleOptions} /></div>
        <button onClick={() => setPaidOnly((v) => !v)}
          className={`px-3 py-2 rounded-xl text-sm font-medium border transition flex items-center gap-1.5 ${paidOnly ? 'bg-accent-primary text-white border-accent-primary' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'}`}>
          <CreditCard size={14} /> Płatne
        </button>
        <button onClick={() => setRegOnly((v) => !v)}
          className={`px-3 py-2 rounded-xl text-sm font-medium border transition flex items-center gap-1.5 ${regOnly ? 'bg-accent-primary text-white border-accent-primary' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'}`}>
          <Ticket size={14} /> Z rejestracją
        </button>
        <div className="ml-auto flex items-center gap-3">
          {ViewSwitch}
          <span className="text-xs text-gray-400 whitespace-nowrap">{filtered.length} wydarzeń</span>
        </div>
      </div>

      {loading ? <Spinner center size={28} />
        : filtered.length === 0 ? (
          <EmptyState icon={archiveF === 'archive' ? Archive : Calendar}
            title={archiveF === 'archive' ? 'Archiwum jest puste' : 'Brak wydarzeń'}
            subtitle={archiveF === 'archive' ? 'Wydarzenia przeszłe i zarchiwizowane pojawią się tutaj.' : 'Dodaj wydarzenie przyciskiem „Nowe wydarzenie".'} />
        ) : viewMode === 'list' ? (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100 dark:border-gray-800">
                  <th className="px-4 py-2.5 font-semibold">Data</th>
                  <th className="px-4 py-2.5 font-semibold">Wydarzenie</th>
                  <th className="px-4 py-2.5 font-semibold hidden sm:table-cell">Typ</th>
                  <th className="px-4 py-2.5 font-semibold hidden md:table-cell">Moduł</th>
                  <th className="px-4 py-2.5 font-semibold hidden lg:table-cell">Miejsce</th>
                  <th className="px-4 py-2.5 font-semibold text-right"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id} onClick={() => navigate(`/wydarzenie/${e.id}`)}
                    className="border-b border-gray-50 dark:border-gray-800/50 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/40 cursor-pointer group">
                    <td className="px-4 py-2.5 whitespace-nowrap text-gray-600 dark:text-gray-300">
                      {fmtDate(e.date)}{e.time && <span className="text-gray-400"> {fmtTime(e.time)}</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-gray-900 dark:text-gray-100 truncate">{e.title || '—'}</span>
                        {e.is_paid && <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">płatne</span>}
                        {e.registration_required && <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">rejestracja</span>}
                        {e.is_archived && <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300">archiwum</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 hidden sm:table-cell text-gray-500 dark:text-gray-400">{e.event_type || '—'}</td>
                    <td className="px-4 py-2.5 hidden md:table-cell text-gray-500 dark:text-gray-400">{moduleLabel(e.module_key)}</td>
                    <td className="px-4 py-2.5 hidden lg:table-cell text-gray-500 dark:text-gray-400">
                      {e.location ? <span className="inline-flex items-center gap-1"><MapPin size={12} className="text-gray-400" />{e.location}</span> : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap" onClick={(ev) => ev.stopPropagation()}>
                      {isArch(e) ? (e.is_archived && (
                        <button onClick={() => setArchived(e.id, false)} title="Przywróć"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-gray-100 dark:hover:bg-gray-800 opacity-0 group-hover:opacity-100 transition"><RotateCcw size={16} /></button>
                      )) : (
                        <button onClick={() => setArchived(e.id, true)} title="Archiwizuj"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-purple-600 hover:bg-gray-100 dark:hover:bg-gray-800 opacity-0 group-hover:opacity-100 transition"><Archive size={16} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((e) => {
              const d = e.date ? new Date(String(e.date).slice(0, 10) + 'T00:00:00') : null;
              const archived = isArch(e);
              return (
                <div key={e.id} onClick={() => navigate(`/wydarzenie/${e.id}`)}
                  className="group relative bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 hover:shadow-lg hover:border-accent-primary-lighter dark:hover:border-accent-primary-dark transition cursor-pointer flex flex-col">
                  {/* Nagłówek: data + typ */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="bg-gradient-to-br from-accent-primary to-accent-secondary text-white rounded-xl px-3 py-1.5 text-center min-w-[52px]">
                      {d ? (<>
                        <div className="text-xl font-bold leading-none">{d.getDate()}</div>
                        <div className="text-[10px] uppercase opacity-90 mt-0.5">{MONTHS_SHORT[d.getMonth()]} {d.getFullYear()}</div>
                      </>) : <div className="text-xs py-1">—</div>}
                    </div>
                    {e.event_type && <span className="px-2 py-1 text-[11px] rounded-full font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 shrink-0">{e.event_type}</span>}
                  </div>

                  {/* Tytuł + pełna data + oznaczenia */}
                  <h4 className="font-bold text-gray-800 dark:text-gray-100 truncate">{e.title || '—'}</h4>
                  {d && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{WEEKDAYS[d.getDay()]} {fmtDate(e.date)}{e.time ? `, ${fmtTime(e.time)}${e.end_time ? ` - ${fmtTime(e.end_time)}` : ''}` : ''}</p>}
                  {(e.is_paid || e.registration_required || e.is_archived) && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {e.is_paid && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">płatne</span>}
                      {e.registration_required && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">rejestracja</span>}
                      {e.is_archived && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300">archiwum</span>}
                    </div>
                  )}

                  {/* Meta */}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-xs text-gray-500 dark:text-gray-400">
                    {e.location && <span className="flex items-center gap-1"><MapPin size={13} /> {e.location}</span>}
                    <span className="flex items-center gap-1"><Calendar size={13} /> {moduleLabel(e.module_key)}</span>
                  </div>

                  {/* Stopka: archiwizacja / przywróć */}
                  <div className="flex items-center justify-end mt-auto pt-3 border-t border-gray-100 dark:border-gray-800" onClick={(ev) => ev.stopPropagation()}>
                    {archived ? (e.is_archived && (
                      <button onClick={() => setArchived(e.id, false)}
                        className="text-xs font-medium px-2.5 py-1 rounded-lg text-gray-500 hover:text-green-600 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition">
                        <RotateCcw size={14} /> Przywróć
                      </button>
                    )) : (
                      <button onClick={() => setArchived(e.id, true)}
                        className="text-xs font-medium px-2.5 py-1 rounded-lg text-gray-500 hover:text-purple-600 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition">
                        <Archive size={14} /> Archiwizuj
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}
