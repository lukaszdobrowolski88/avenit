import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import PageHeader from '../../components/PageHeader';
import { ClipboardList } from 'lucide-react';
import { useCampusQuery } from '../../hooks/useCampusQuery';
import { useCampus } from '../../contexts/CampusContext';
import { useT } from '../../i18n';

import * as LucideIcons from 'lucide-react';
import { tr, appLocale } from '../../i18n';
import { confirmDialog } from '../../lib/dialog';
import { toast } from '../../lib/toast';
import Modal from '../../components/Modal';
import Button from '../../components/Button';
import EmptyState from '../../components/EmptyState';

const {
  Plus, Search, History, ArrowUpDown, Copy, Trash2,
  ChevronUp, ChevronDown, ChevronRight, Calendar, Edit3, GripVertical,
  Settings, ToggleLeft, ToggleRight, Palette, MapPin
} = LucideIcons;

// Dynamiczna ikona z lucide-react
function DynamicIcon({ name, size = 20, className = '' }) {
  const Icon = LucideIcons[name] || Calendar;
  return <Icon size={size} className={className} />;
}

const pad2 = (n) => String(n).padStart(2, '0');
// Dzień LOKALNY (toISOString dawał dzień UTC — między 00:00 a 02:00 „wczoraj”).
const localYmd = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
// 'YYYY-MM-DD' (także z doklejonym czasem) → Date lokalnie, bez przesunięcia UTC.
const localDate = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
// Polska odmiana liczebnika: 1 element, 2–4 elementy (poza 12–14), 5+ elementów.
const plural = (n, one, few, many) => {
  if (n === 1) return one;
  const d = n % 10;
  const t = n % 100;
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many;
};

// Domyślne sekcje zespołów
const ALL_SECTIONS = [
  { key: 'zespol', label: tr('Zespół uwielbienia') },
  { key: 'produkcja', label: tr('Produkcja / Media') },
  { key: 'atmosfera_team', label: tr('Atmosfera') },
  { key: 'scena', label: tr('Scena / Nauczanie') },
  { key: 'szkolka', label: tr('Szkółka / Dzieci') },
];

export default function ProgramsList() {
  const t = useT();
  const navigate = useNavigate();
  const { withCampusFilter, selectedCampusId, campusIdForInsert } = useCampusQuery();
  const { campuses } = useCampus();
  const campusById = useMemo(() => {
    const map = {};
    for (const c of campuses) map[c.id] = c;
    return map;
  }, [campuses]);
  const showCampus = !selectedCampusId && campuses.length > 0;
  const [programs, setPrograms] = useState([]);
  const [programTypes, setProgramTypes] = useState([]);
  const [filter, setFilter] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [sortOrder, setSortOrder] = useState('asc');

  // Type management modal
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [typeForm, setTypeForm] = useState({ id: null, name: '', icon: 'Calendar', color: '#6366f1', visible_sections: ALL_SECTIONS.map(s => s.key), is_active: true });

  useEffect(() => {
    fetchPrograms();
    fetchProgramTypes();
  }, [selectedCampusId]);

  const fetchPrograms = async () => {
    const { data, error } = await withCampusFilter(supabase.from('programs').select('*')).order('date', { ascending: false });
    if (error) toast.error(error, { fallback: tr('Nie udało się wczytać programów. Odśwież stronę.') });
    setPrograms(data || []);
  };

  const fetchProgramTypes = async () => {
    const { data, error } = await supabase.from('program_types').select('*').order('sort_order');
    if (!error && data) {
      setProgramTypes(data);
    } else if (error?.code === '42P01') {
      // Tabela kategorii jeszcze nie istnieje — jedna domyślna kategoria tylko do wyświetlenia.
      setProgramTypes([{ id: null, name: tr('Nabożeństwo niedzielne'), icon: 'Church', color: '#6366f1', visible_sections: ALL_SECTIONS.map(s => s.key), is_default: true, sort_order: 0, is_active: true }]);
    } else {
      // Inny błąd (np. sieć) — nie podstawiamy fikcyjnej kategorii, mówimy co się stało.
      toast.error(error, { fallback: tr('Nie udało się wczytać kategorii programów.') });
      setProgramTypes([]);
    }
  };

  // Usunięcie programu: potwierdzenie z nazwą i skutkiem → najpierw sam rekord (ze sprawdzeniem
  // błędu — przy 403 nic nie ruszamy), dopiero potem sprzątanie: odpięcie od wydarzeń
  // (events.program_id nie ma klucza obcego, więc samo by nie zniknęło).
  const handleDelete = async (program, e) => {
    e.stopPropagation();
    const name = programName(program);
    const { data: linked } = await supabase.from('events').select('id, title').eq('program_id', program.id);
    const linkedCount = (linked || []).length;
    const ok = await confirmDialog({
      title: tr('Usunąć program?'),
      message: linkedCount
        ? tr('Program „{name}” zostanie usunięty i odpięty od wydarzeń ({n}). Wydarzenia i ich grafik służb zostają. Tej operacji nie można cofnąć.', { name, n: linkedCount })
        : tr('Program „{name}” zostanie usunięty. Tej operacji nie można cofnąć.', { name }),
      isDelete: true,
    });
    if (!ok) return;
    const { error } = await supabase.from('programs').delete().eq('id', program.id);
    if (error) {
      toast.error(error, { fallback: tr('Nie udało się usunąć programu.') });
      fetchPrograms();
      return;
    }
    if (linkedCount) {
      const { error: unlinkErr } = await supabase.from('events').update({ program_id: null }).eq('program_id', program.id);
      if (unlinkErr) toast.info(tr('Usunięto program, ale wydarzenie może jeszcze pokazywać pusty plan — odepnij go na stronie wydarzenia.'));
    }
    toast.success(tr('Usunięto program „{name}”', { name }));
    fetchPrograms();
  };

  // Duplikat: ta sama godzina tygodnia, 7 dni później (a nie „dziś”), bez przypisań do osób.
  const handleDuplicate = async (program, e) => {
    e.stopPropagation();
    const { id, created_at, updated_at, ...rest } = program;
    const src = localDate(program.date);
    const next = src ? new Date(src.getFullYear(), src.getMonth(), src.getDate() + 7) : new Date();
    const newProgram = {
      ...rest,
      date: localYmd(next),
      campus_id: campusIdForInsert ?? program.campus_id ?? null,
    };
    const { data, error } = await supabase.from('programs').insert([newProgram]).select();
    if (error || !data?.[0]) {
      toast.error(error || tr('Nie udało się zduplikować programu.'), { fallback: tr('Nie udało się zduplikować programu.') });
      return;
    }
    toast.success(tr('Utworzono kopię programu na {date}', { date: next.toLocaleDateString(appLocale()) }));
    navigate(`/programs/${data[0].id}`);
  };

  const handleNewProgram = async (typeId) => {
    navigate(`/programs/new${typeId ? `?type=${typeId}` : ''}`);
  };

  // --- Type CRUD ---
  const openNewType = () => {
    setTypeForm({ id: null, name: '', icon: 'Calendar', color: '#6366f1', visible_sections: ALL_SECTIONS.map(s => s.key), is_active: true });
    setTypeNameError('');
    setShowTypeModal(true);
  };

  const openEditType = (type, e) => {
    e?.stopPropagation();
    setTypeForm({ ...type, visible_sections: type.visible_sections || ALL_SECTIONS.map(s => s.key) });
    setTypeNameError('');
    setShowTypeModal(true);
  };

  const [typeNameError, setTypeNameError] = useState('');
  const saveType = async () => {
    if (!typeForm.name.trim()) { setTypeNameError(tr('Podaj nazwę kategorii.')); return; }
    setTypeNameError('');

    const row = {
      name: typeForm.name.trim(), icon: typeForm.icon, color: typeForm.color,
      visible_sections: typeForm.visible_sections, is_active: typeForm.is_active
    };
    let error;
    if (typeForm.id) {
      ({ error } = await supabase.from('program_types').update(row).eq('id', typeForm.id));
    } else {
      const maxSort = programTypes.length > 0 ? Math.max(...programTypes.map(t => t.sort_order || 0)) + 1 : 0;
      ({ error } = await supabase.from('program_types').insert({ ...row, sort_order: maxSort }));
    }
    if (error) {
      toast.error(error, { fallback: tr('Nie udało się zapisać kategorii.') });
      return;
    }
    toast.success(typeForm.id ? tr('Zapisano kategorię') : tr('Dodano kategorię'));
    setShowTypeModal(false);
    fetchProgramTypes();
  };

  const deleteType = async (type, e) => {
    e?.stopPropagation();
    const ok = await confirmDialog({
      title: tr('Usunąć kategorię?'),
      message: tr('Kategoria „{name}” zostanie usunięta. Programy z tej kategorii zachowają dane, ale trafią do „Bez kategorii”.', { name: type?.name || '' }),
      isDelete: true,
    });
    if (!ok) return false;
    const { error } = await supabase.from('program_types').delete().eq('id', type.id);
    if (error) {
      toast.error(error, { fallback: tr('Nie udało się usunąć kategorii.') });
      return false;
    }
    toast.success(tr('Usunięto kategorię'));
    fetchProgramTypes();
    return true;
  };

  const toggleSectionVisibility = (sectionKey) => {
    setTypeForm(prev => {
      const sections = prev.visible_sections || [];
      return {
        ...prev,
        visible_sections: sections.includes(sectionKey)
          ? sections.filter(s => s !== sectionKey)
          : [...sections, sectionKey]
      };
    });
  };

  // --- Filtering & Sorting ---
  const filteredPrograms = programs.filter(p => {
    const search = filter.toLowerCase();
    return (p.date || '').toLowerCase().includes(search) || (p.title || '').toLowerCase().includes(search);
  });

  const today = localYmd();
  // Wiele kampusów = pigułka kampusu ma sens; przy jednym kampusie to szum.
  const multiCampus = campuses.length > 1;
  // Tytuł zawsze w tym samym miejscu, data zawsze w podtytule (dawniej raz data była tytułem, raz podtytułem).
  const programName = (p) => p?.title || tr('Program');

  const sortPrograms = (list) => [...list].sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
  });

  // Group programs by type
  const activeTypes = programTypes.filter(t => t.is_active);

  const getProgramsByType = (typeId) => {
    return filteredPrograms.filter(p => {
      if (typeId === null) return !p.type_id; // Unassigned
      return p.type_id === typeId;
    });
  };

  // Dni do programu: „dziś” / „jutro” / „za N dni” (do dwóch tygodni; dalej sama data wystarcza).
  const daysUntil = (dateString) => {
    const d = localDate(dateString);
    const t0 = localDate(today);
    return d && t0 ? Math.round((d - t0) / 86400000) : null;
  };
  const relativeDay = (n) => {
    if (n === 0) return tr('dziś');
    if (n === 1) return tr('jutro');
    if (n > 1 && n <= 14) return tr('za {n} dni', { n });
    return '';
  };

  // --- Components ---
  // Wiersz programu: kafelek daty (data to główna informacja — wcześniej ginęła w drugiej linii),
  // tytuł, dzień tygodnia + „za N dni”, stan planu. Najbliższy program ma kafelek w kolorze marki.
  const ProgramRow = ({ p, next = false, type = null }) => {
    const campus = showCampus && multiCampus ? campusById[p.campus_id] : null;
    const n = p.schedule?.length || 0;
    const d = localDate(p.date);
    const rel = p.date >= today ? relativeDay(daysUntil(p.date)) : '';
    const thisYear = d && d.getFullYear() === new Date().getFullYear();
    const weekday = d ? d.toLocaleDateString(appLocale(), thisYear ? { weekday: 'long' } : { weekday: 'long', year: 'numeric' }) : tr('Bez daty');
    const open = () => navigate(`/programs/${p.id}`);
    return (
      <div onClick={open} className="group flex items-center gap-4 px-3 py-2.5 rounded-xl cursor-pointer transition-colors hover:bg-[rgba(42,35,18,0.04)] dark:hover:bg-white/5">
        <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center flex-shrink-0 ${next ? 'bg-[rgb(var(--accent-primary-light))] text-[rgb(var(--accent-primary-darkest))]' : 'bg-[rgba(42,35,18,0.05)] text-gray-800 dark:bg-white/[0.07] dark:text-gray-100'}`} aria-hidden="true">
          <span className="text-[17px] font-extrabold leading-none tabular-nums">{d ? d.getDate() : '–'}</span>
          {d && <span className="text-[10px] font-bold uppercase tracking-wide mt-1 leading-none opacity-75">{d.toLocaleDateString(appLocale(), { month: 'short' }).replace('.', '')}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <button type="button" onClick={(e) => { e.stopPropagation(); open(); }}
            className="block max-w-full text-left font-semibold text-[15px] text-gray-900 dark:text-white truncate focus-visible:outline-none focus-visible:underline">
            {programName(p)}
          </button>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 min-w-0">
            <span className="first-letter:uppercase whitespace-nowrap">{weekday}</span>
            {rel && <><span aria-hidden="true">·</span><span className={`whitespace-nowrap ${next ? 'font-semibold text-accent-primary dark:text-accent-primary-light' : ''}`}>{rel}</span></>}
            {type && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1.5 truncate">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: type.color || '#8A6606' }} aria-hidden="true" />
                  {type.name}
                </span>
              </>
            )}
          </div>
        </div>
        {campus && (
          <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full bg-gray-100 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300 flex-shrink-0"
            style={campus.color ? { background: `${campus.color}1a`, color: campus.color } : undefined}
            title={`${t('Kampus')}: ${campus.name}`}>
            <MapPin size={11} aria-hidden="true" />{campus.name}
          </span>
        )}
        {n === 0 ? (
          <span className="flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold bg-accent-primary-lighter text-accent-primary dark:bg-accent-primary-light/15 dark:text-accent-primary-light">{t('Plan pusty')}</span>
        ) : (
          <span className="flex-shrink-0 text-xs text-gray-500 dark:text-gray-400 tabular-nums whitespace-nowrap">
            {plural(n, tr('{n} element', { n }), tr('{n} elementy', { n }), tr('{n} elementów', { n }))}
          </span>
        )}
        <div className="flex items-center gap-0.5 flex-shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity">
          <button type="button" onClick={(e) => handleDuplicate(p, e)}
            className="inline-grid place-items-center w-8 h-8 rounded-full text-gray-500 hover:text-gray-900 hover:bg-[rgba(42,35,18,0.07)] dark:text-gray-400 dark:hover:text-white dark:hover:bg-white/10 transition-colors"
            title={t('Duplikuj (za tydzień)')} aria-label={tr('Duplikuj program „{name}”', { name: programName(p) })}><Copy size={15} aria-hidden="true" /></button>
          <button type="button" onClick={(e) => handleDelete(p, e)}
            className="inline-grid place-items-center w-8 h-8 rounded-full text-gray-500 hover:text-red-600 hover:bg-red-50 dark:text-gray-400 dark:hover:text-red-400 dark:hover:bg-red-500/10 transition-colors"
            title={t('Usuń')} aria-label={tr('Usuń program „{name}”', { name: programName(p) })}><Trash2 size={15} aria-hidden="true" /></button>
        </div>
        <ChevronRight size={16} className="flex-shrink-0 text-gray-300 dark:text-gray-600" aria-hidden="true" />
      </div>
    );
  };

  // Karta kategorii: neutralna ikona, kolor kategorii tylko kropką (bez fioletowego tła nagłówka).
  const SectionCard = ({ icon, title, color, count, actions, children }) => (
    <section className="mb-5 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 pt-4 pb-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl grid place-items-center flex-shrink-0 bg-[rgba(42,35,18,0.06)] text-gray-800 dark:bg-white/[0.08] dark:text-gray-100" aria-hidden="true">
            <DynamicIcon name={icon} size={17} />
          </div>
          <h2 className="font-bold text-gray-900 dark:text-white text-base truncate">{title}</h2>
          {color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} aria-hidden="true" />}
          {count ? <span className="text-xs text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap">{count}</span> : null}
        </div>
        {actions && <div className="flex items-center gap-1.5 flex-shrink-0">{actions}</div>}
      </div>
      <div className="px-2 sm:px-3 pb-3">{children}</div>
    </section>
  );

  const TypeSection = ({ type }) => {
    const typePrograms = getProgramsByType(type.id);
    const upcoming = sortPrograms(typePrograms.filter(p => p.date >= today));
    // Najbliższy = najwcześniejszy nadchodzący, niezależnie od kierunku sortowania.
    const nextId = [...upcoming].sort((a, b) => String(a.date).localeCompare(String(b.date)))[0]?.id;

    return (
      <SectionCard
        icon={type.icon}
        title={type.name}
        color={type.color}
        count={upcoming.length > 0 ? plural(upcoming.length, tr('{n} nadchodzący', { n: upcoming.length }), tr('{n} nadchodzące', { n: upcoming.length }), tr('{n} nadchodzących', { n: upcoming.length })) : ''}
        actions={(
          <>
            <button type="button" onClick={(e) => openEditType(type, e)}
              className="inline-grid place-items-center w-8 h-8 rounded-full text-gray-500 hover:text-gray-900 hover:bg-[rgba(42,35,18,0.07)] dark:text-gray-400 dark:hover:text-white dark:hover:bg-white/10 transition-colors"
              title={t('Edytuj kategorię')} aria-label={t('Edytuj kategorię')}>
              <Edit3 size={15} aria-hidden="true" />
            </button>
            <button type="button" data-tour="prog-new" onClick={() => handleNewProgram(type.id)}
              className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[13px] font-semibold bg-[rgb(var(--accent-primary-light))] text-[rgb(var(--accent-primary-darkest))] hover:brightness-95 transition">
              <Plus size={15} aria-hidden="true" />{t('Nowy')}
            </button>
          </>
        )}
      >
        {upcoming.length === 0 ? (
          <EmptyState
            compact
            icon={Calendar}
            title={t('Brak nadchodzących programów')}
            action={
              <Button variant="outline" size="sm" icon={Plus} onClick={() => handleNewProgram(type.id)}>
                {t('Utwórz pierwszy')}
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-0.5">
            {upcoming.map(p => <ProgramRow key={p.id} p={p} next={p.id === nextId} />)}
          </div>
        )}
      </SectionCard>
    );
  };

  // Collect unassigned programs (no type_id)
  const unassignedPrograms = filteredPrograms.filter(p => !p.type_id);
  const allPastPrograms = sortPrograms(filteredPrograms.filter(p => p.date < today));

  // Icon options for type modal
  const iconOptions = ['Calendar', 'Church', 'Heart', 'BookOpen', 'Music', 'Users', 'Star', 'Flame', 'Cross', 'Sun', 'Moon', 'Coffee', 'MessageCircle', 'Globe', 'Zap', 'Award'];
  const colorOptions = ['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#1e40af', '#7c3aed'];

  return (
    <div>
      <div>
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <PageHeader
            moduleKey="programs"
            icon={ClipboardList}
            title={t('Programy')}
            subtitle={t('Plany przebiegu nabożeństw i wydarzeń — podpinasz je na stronie wydarzenia')}
            actions={
              <button
                onClick={openNewType}
                className="flex items-center gap-2 px-4 py-2.5 bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 hover:shadow-sm transition text-sm font-medium"
              >
                <Plus size={16} />
                {t('Nowa kategoria programu')}
              </button>
            }
          />
        </div>

        {/* Search & Sort */}
        <div className="flex gap-3 mb-6">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              placeholder={t('Szukaj programów...')}
              className="w-full pl-11 pr-4 py-3 bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl text-sm focus:ring-2 focus:ring-accent-primary-light/20 outline-none text-gray-700 dark:text-gray-200 placeholder-gray-400"
              value={filter}
              onChange={e => setFilter(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            title={sortOrder === 'asc' ? t('Najbliższe najpierw') : t('Najdalsze najpierw')}
            aria-label={sortOrder === 'asc' ? t('Najbliższe najpierw') : t('Najdalsze najpierw')}
            className="px-4 py-3 bg-white/60 dark:bg-gray-800/60 border border-gray-200/50 dark:border-gray-700/50 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 transition"
          >
            <ArrowUpDown size={18} />
          </button>
        </div>

        {/* Type Sections */}
        {activeTypes.map(type => (
          <TypeSection key={type.id || 'default'} type={type} />
        ))}

        {/* Unassigned programs (legacy, no type_id) */}
        {/* Ukryta, gdy nie ma w niej nadchodzących programów (pusta sekcja „(0)” była szumem). */}
        {unassignedPrograms.some(p => p.date >= today) && activeTypes.some(t => t.id !== null) && (
          <SectionCard icon="Calendar" title={t('Bez kategorii')}
            count={String(unassignedPrograms.filter(p => p.date >= today).length)}>
            <div className="flex flex-col gap-0.5">
              {sortPrograms(unassignedPrograms.filter(p => p.date >= today)).map(p => <ProgramRow key={p.id} p={p} />)}
            </div>
          </SectionCard>
        )}

        {/* History */}
        {allPastPrograms.length > 0 && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              aria-expanded={showHistory}
              className="flex items-center gap-2 h-9 px-3 -ml-1 rounded-full text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-[rgba(42,35,18,0.05)] dark:hover:bg-white/5 transition-colors"
            >
              <History size={15} aria-hidden="true" />
              {t('Historia')}
              <span className="px-1.5 min-w-[20px] h-5 inline-grid place-items-center rounded-full text-[11px] font-bold bg-[rgba(42,35,18,0.07)] dark:bg-white/10 tabular-nums">{allPastPrograms.length}</span>
              {showHistory ? <ChevronUp size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
            </button>
            {showHistory && (
              <div className="mt-2 px-2 sm:px-3 py-2 rounded-2xl border border-gray-200 dark:border-gray-700 flex flex-col gap-0.5">
                {allPastPrograms.map(p => (
                  <ProgramRow key={p.id} p={p} type={programTypes.find(pt => pt.id === p.type_id) || null} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Type Management Modal */}
      <Modal
        isOpen={showTypeModal}
        onClose={() => setShowTypeModal(false)}
        closeOnBackdrop={false}
        size="sm"
        title={typeForm.id ? t('Edytuj kategorię programu') : t('Nowa kategoria programu')}
        footer={<>
          {typeForm.id && !typeForm.is_default && (
            <Button variant="danger" className="mr-auto" onClick={async (e) => { if (await deleteType(typeForm, e)) setShowTypeModal(false); }}>
              {t('Usuń')}
            </Button>
          )}
          <Button variant="secondary" onClick={() => setShowTypeModal(false)}>
            {t('Anuluj')}
          </Button>
          <Button onClick={saveType}>
            {typeForm.id ? t('Zapisz zmiany') : t('Utwórz kategorię')}
          </Button>
        </>}
      >
            <div className="p-6 space-y-5">
              {/* Name */}
              <div>
                <label htmlFor="program-type-name" className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase ml-1">{t('Nazwa *')}</label>
                <input
                  id="program-type-name"
                  aria-invalid={!!typeNameError || undefined}
                  className={`w-full p-3 rounded-xl border bg-white dark:bg-gray-700 text-gray-800 dark:text-white mt-1 ${typeNameError ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-gray-600'}`}
                  placeholder={t('np. Spotkanie modlitewne')}
                  value={typeForm.name}
                  onChange={e => { setTypeForm({ ...typeForm, name: e.target.value }); if (typeNameError) setTypeNameError(''); }}
                />
                {typeNameError && <p className="text-xs text-red-600 dark:text-red-400 mt-1 ml-1" role="alert">{typeNameError}</p>}
              </div>

              {/* Icon */}
              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase ml-1">{t('Ikona')}</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {iconOptions.map(icon => (
                    <button
                      key={icon}
                      onClick={() => setTypeForm({ ...typeForm, icon })}
                      className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${
                        typeForm.icon === icon
                          ? 'bg-accent-primary text-white shadow-md'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      <DynamicIcon name={icon} size={18} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Color */}
              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase ml-1">{t('Kolor')}</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {colorOptions.map(color => (
                    <button
                      key={color}
                      onClick={() => setTypeForm({ ...typeForm, color })}
                      className={`w-8 h-8 rounded-full transition ${typeForm.color === color ? 'ring-2 ring-offset-2 ring-accent-primary dark:ring-offset-gray-900' : 'hover:scale-110'}`}
                      style={{ background: color }}
                    />
                  ))}
                </div>
              </div>

              {/* Visible Sections */}
              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase ml-1">{t('Widoczne sekcje zespołów')}</label>
                <div className="space-y-1.5 mt-2">
                  {ALL_SECTIONS.map(section => {
                    const isActive = (typeForm.visible_sections || []).includes(section.key);
                    return (
                      <button
                        key={section.key}
                        onClick={() => toggleSectionVisibility(section.key)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition ${
                          isActive
                            ? 'bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light'
                            : 'bg-gray-50 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                        }`}
                      >
                        <span>{t(section.label)}</span>
                        {isActive ? <ToggleRight size={18} className="text-green-500" /> : <ToggleLeft size={18} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
      </Modal>
    </div>
  );
}
