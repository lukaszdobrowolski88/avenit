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
  ChevronUp, ChevronDown, Calendar, Edit3, GripVertical,
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

  const formatDateFull = (dateString) => {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const date = localDate(dateString);
    if (!date) return tr('Bez daty');
    const formatted = date.toLocaleDateString(appLocale(), options);
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  };

  // --- Components ---
  const ProgramCard = ({ p, typeColor }) => {
    const campus = showCampus && multiCampus ? campusById[p.campus_id] : null;
    const n = p.schedule?.length || 0;
    return (
      <div
        onClick={() => navigate(`/programs/${p.id}`)}
        className="px-4 py-3 rounded-xl cursor-pointer transition group bg-white/70 dark:bg-gray-800/50 hover:bg-white dark:hover:bg-gray-700/50 hover:shadow-sm border border-transparent hover:border-gray-200 dark:hover:border-gray-600"
      >
        <div className="flex justify-between items-center gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Kolor typu jako kropka, nie pionowa belka (decyzja właściciela: belka = „AI slop”). */}
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: typeColor || '#ec4899' }} />
            <div className="min-w-0">
              <div className="font-semibold text-sm text-gray-800 dark:text-white truncate">
                {programName(p)}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {formatDateFull(p.date)} · {plural(n, tr('{n} element', { n }), tr('{n} elementy', { n }), tr('{n} elementów', { n }))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {campus && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full bg-gray-100 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300"
                style={campus.color ? { background: `${campus.color}1a`, color: campus.color } : undefined}
                title={`${t('Kampus')}: ${campus.name}`}
              >
                <MapPin size={11} />
                {campus.name}
              </span>
            )}
            {!campus && showCampus && multiCampus && p.campus_id == null && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full bg-gray-100 dark:bg-gray-700/60 text-gray-400 dark:text-gray-500" title={t('Brak przypisanego kampusu')}>
                <MapPin size={11} />
                {t('Bez kampusu')}
              </span>
            )}
            <div className="flex gap-1.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition">
              <button onClick={(e) => handleDuplicate(p, e)} className="p-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition" title={t('Duplikuj (za tydzień)')} aria-label={tr('Duplikuj program „{name}”', { name: programName(p) })}><Copy size={14} aria-hidden="true" /></button>
              <button onClick={(e) => handleDelete(p, e)} className="p-1.5 bg-red-50 dark:bg-red-900/30 text-red-600 rounded-lg hover:bg-red-100 transition" title={t('Usuń')} aria-label={tr('Usuń program „{name}”', { name: programName(p) })}><Trash2 size={14} aria-hidden="true" /></button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const TypeSection = ({ type }) => {
    const typePrograms = getProgramsByType(type.id);
    const upcoming = sortPrograms(typePrograms.filter(p => p.date >= today));
    const past = typePrograms.filter(p => p.date < today);

    return (
      <div className="mb-6 bg-white/50 dark:bg-gray-800/40 backdrop-blur-sm rounded-2xl border border-gray-200/60 dark:border-gray-700/50 overflow-hidden">
        {/* Section header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-gray-700/50" style={{ background: `${type.color || '#6366f1'}08` }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-sm from-accent-primary" style={{ background: type.color || '#6366f1' }}>
              <DynamicIcon name={type.icon} size={16} />
            </div>
            <h2 className="font-bold text-gray-800 dark:text-white text-base">{type.name}</h2>
            <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">
              {upcoming.length > 0 ? plural(upcoming.length, tr('{n} nadchodzący', { n: upcoming.length }), tr('{n} nadchodzące', { n: upcoming.length }), tr('{n} nadchodzących', { n: upcoming.length })) : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => openEditType(type, e)}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white/60 dark:hover:bg-gray-700 rounded-lg transition"
              title={t('Edytuj kategorię')}
            >
              <Edit3 size={14} />
            </button>
            <button
              data-tour="prog-new"
              onClick={() => handleNewProgram(type.id)}
              // from-accent-primary: w motywie „Avenit” przycisk akcji (kurkuma); w innych wygrywa kolor typu z inline.
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition text-white shadow-sm hover:shadow-md from-accent-primary"
              style={{ background: type.color || '#6366f1' }}
            >
              <Plus size={14} />
              {t('Nowy')}
            </button>
          </div>
        </div>

        {/* Program cards */}
        <div className="p-3">
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
            <div className="grid gap-2">
              {upcoming.map(p => <ProgramCard key={p.id} p={p} typeColor={type.color} />)}
            </div>
          )}
        </div>
      </div>
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
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
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
          <div className="mb-8">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                <Calendar size={16} />
              </div>
              <h2 className="font-bold text-gray-600 dark:text-gray-400 text-base">{t('Bez kategorii')}</h2>
              <span className="text-xs text-gray-400">({unassignedPrograms.filter(p => p.date >= today).length})</span>
            </div>
            <div className="grid gap-2">
              {sortPrograms(unassignedPrograms.filter(p => p.date >= today)).map(p => <ProgramCard key={p.id} p={p} />)}
            </div>
          </div>
        )}

        {/* History */}
        {allPastPrograms.length > 0 && (
          <div className="mt-4">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-2 text-sm font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3 hover:text-gray-600 dark:hover:text-gray-300 transition"
            >
              <History size={14} />
              {t('Historia')} ({allPastPrograms.length})
              {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showHistory && (
              <div className="grid gap-2">
                {allPastPrograms.map(p => {
                  const type = programTypes.find(t => t.id === p.type_id);
                  return <ProgramCard key={p.id} p={p} typeColor={type?.color} />;
                })}
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
