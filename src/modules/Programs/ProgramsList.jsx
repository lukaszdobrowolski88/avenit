import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { useCampusQuery } from '../../hooks/useCampusQuery';
import { useCampus } from '../../contexts/CampusContext';
import { useT } from '../../i18n';

import * as LucideIcons from 'lucide-react';
import { tr } from '../../i18n';

const {
  Plus, Search, History, ArrowUpDown, Copy, Trash2,
  ChevronUp, ChevronDown, Calendar, X, Edit3, GripVertical,
  Settings, ToggleLeft, ToggleRight, Palette, MapPin
} = LucideIcons;

// Dynamiczna ikona z lucide-react
function DynamicIcon({ name, size = 20, className = '' }) {
  const Icon = LucideIcons[name] || Calendar;
  return <Icon size={size} className={className} />;
}

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
    const { data } = await withCampusFilter(supabase.from('programs').select('*')).order('date', { ascending: false });
    setPrograms(data || []);
  };

  const fetchProgramTypes = async () => {
    const { data, error } = await supabase.from('program_types').select('*').order('sort_order');
    if (!error && data) {
      setProgramTypes(data);
    } else {
      // Table may not exist yet - use default
      setProgramTypes([{ id: null, name: 'Nabożeństwo niedzielne', icon: 'Church', color: '#6366f1', visible_sections: ALL_SECTIONS.map(s => s.key), is_default: true, sort_order: 0, is_active: true }]);
    }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (window.confirm(t('Czy na pewno chcesz usunąć ten program?'))) {
      await supabase.from('programs').delete().eq('id', id);
      fetchPrograms();
    }
  };

  const handleDuplicate = async (program, e) => {
    e.stopPropagation();
    const { id, created_at, updated_at, ...rest } = program;
    const newProgram = {
      ...rest,
      date: new Date().toISOString().split('T')[0],
      campus_id: campusIdForInsert,
    };
    const { data } = await supabase.from('programs').insert([newProgram]).select();
    if (data?.[0]) navigate(`/programs/${data[0].id}`);
  };

  const handleNewProgram = async (typeId) => {
    navigate(`/programs/new${typeId ? `?type=${typeId}` : ''}`);
  };

  // --- Type CRUD ---
  const openNewType = () => {
    setTypeForm({ id: null, name: '', icon: 'Calendar', color: '#6366f1', visible_sections: ALL_SECTIONS.map(s => s.key), is_active: true });
    setShowTypeModal(true);
  };

  const openEditType = (type, e) => {
    e?.stopPropagation();
    setTypeForm({ ...type, visible_sections: type.visible_sections || ALL_SECTIONS.map(s => s.key) });
    setShowTypeModal(true);
  };

  const saveType = async () => {
    if (!typeForm.name.trim()) return;

    if (typeForm.id) {
      await supabase.from('program_types').update({
        name: typeForm.name, icon: typeForm.icon, color: typeForm.color,
        visible_sections: typeForm.visible_sections, is_active: typeForm.is_active
      }).eq('id', typeForm.id);
    } else {
      const maxSort = programTypes.length > 0 ? Math.max(...programTypes.map(t => t.sort_order || 0)) + 1 : 0;
      await supabase.from('program_types').insert({
        name: typeForm.name, icon: typeForm.icon, color: typeForm.color,
        visible_sections: typeForm.visible_sections, is_active: typeForm.is_active, sort_order: maxSort
      });
    }
    setShowTypeModal(false);
    fetchProgramTypes();
  };

  const deleteType = async (typeId, e) => {
    e?.stopPropagation();
    if (!window.confirm(t('Usunąć ten typ? Programy tego typu zachowają dane ale stracą przypisanie do typu.'))) return;
    await supabase.from('program_types').delete().eq('id', typeId);
    fetchProgramTypes();
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

  const today = new Date().toISOString().split('T')[0];

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
    const date = new Date(dateString);
    const formatted = date.toLocaleDateString('pl-PL', options);
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  };

  // --- Components ---
  const ProgramCard = ({ p, typeColor }) => {
    const campus = showCampus ? campusById[p.campus_id] : null;
    return (
      <div
        onClick={() => navigate(`/programs/${p.id}`)}
        className="px-4 py-3 rounded-xl cursor-pointer transition group bg-white/70 dark:bg-gray-800/50 hover:bg-white dark:hover:bg-gray-700/50 hover:shadow-sm border border-transparent hover:border-gray-200 dark:hover:border-gray-600"
      >
        <div className="flex justify-between items-center gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ background: typeColor || '#ec4899' }} />
            <div className="min-w-0">
              <div className="font-semibold text-sm text-gray-800 dark:text-white truncate">
                {p.title || formatDateFull(p.date)}
              </div>
              <div className="text-xs text-gray-400 dark:text-gray-500 truncate">
                {p.title ? formatDateFull(p.date) + ' · ' : ''}{p.schedule?.length || 0} {t('elementów')}
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
            {!campus && showCampus && p.campus_id == null && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full bg-gray-100 dark:bg-gray-700/60 text-gray-400 dark:text-gray-500" title={t('Brak przypisanego kampusu')}>
                <MapPin size={11} />
                {t('Bez kampusu')}
              </span>
            )}
            <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition">
              <button onClick={(e) => handleDuplicate(p, e)} className="p-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition" title={t('Duplikuj')}><Copy size={14} /></button>
              <button onClick={(e) => handleDelete(p.id, e)} className="p-1.5 bg-red-50 dark:bg-red-900/30 text-red-500 rounded-lg hover:bg-red-100 transition" title={t('Usuń')}><Trash2 size={14} /></button>
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
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-sm" style={{ background: type.color || '#6366f1' }}>
              <DynamicIcon name={type.icon} size={16} />
            </div>
            <h2 className="font-bold text-gray-800 dark:text-white text-base">{type.name}</h2>
            <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">
              {upcoming.length > 0 ? t('{n} nadchodzących', { n: upcoming.length }) : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => openEditType(type, e)}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white/60 dark:hover:bg-gray-700 rounded-lg transition"
              title={t('Edytuj typ')}
            >
              <Edit3 size={14} />
            </button>
            <button
              onClick={() => handleNewProgram(type.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition text-white shadow-sm hover:shadow-md"
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
            <div className="text-center py-8">
              <p className="text-gray-400 dark:text-gray-500 text-sm">{t('Brak nadchodzących programów')}</p>
              <button
                onClick={() => handleNewProgram(type.id)}
                className="mt-2 text-sm font-medium hover:underline"
                style={{ color: type.color || '#6366f1' }}
              >
                {t('Utwórz pierwszy')}
              </button>
            </div>
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 -m-4 lg:-m-6 p-4 md:p-6 lg:p-8">
      <div>
        {/* Header */}
        <div className="flex items-start justify-between mb-6 sm:mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-accent-primary to-accent-secondary dark:from-accent-primary-light dark:to-accent-secondary-light bg-clip-text text-transparent mb-1">
              {t('Programy')}
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              {t('Zarządzaj programami wydarzeń')}
            </p>
          </div>
          <button
            onClick={openNewType}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 hover:shadow-sm transition text-sm font-medium"
          >
            <Plus size={16} />
            {t('Nowy typ')}
          </button>
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
        {unassignedPrograms.length > 0 && activeTypes.some(t => t.id !== null) && (
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
      {showTypeModal && document.body && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6 border border-white/20 dark:border-gray-700 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-xl text-gray-800 dark:text-white">
                {typeForm.id ? t('Edytuj typ wydarzenia') : t('Nowy typ wydarzenia')}
              </h3>
              <button onClick={() => setShowTypeModal(false)} className="text-gray-500 hover:text-gray-700 dark:hover:text-white"><X size={20} /></button>
            </div>

            <div className="space-y-5">
              {/* Name */}
              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase ml-1">{t('Nazwa *')}</label>
                <input
                  className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white mt-1"
                  placeholder={t('np. Spotkanie modlitewne')}
                  value={typeForm.name}
                  onChange={e => setTypeForm({ ...typeForm, name: e.target.value })}
                />
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
                          ? 'text-white shadow-md'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                      style={typeForm.icon === icon ? { background: typeForm.color } : {}}
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
                      className={`w-8 h-8 rounded-full transition ${typeForm.color === color ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-offset-gray-800' : 'hover:scale-110'}`}
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

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                {typeForm.id && !typeForm.is_default && (
                  <button
                    onClick={(e) => { deleteType(typeForm.id, e); setShowTypeModal(false); }}
                    className="px-4 py-3 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-xl font-medium hover:bg-red-100 transition text-sm"
                  >
                    {t('Usuń')}
                  </button>
                )}
                <button
                  onClick={saveType}
                  className="flex-1 py-3 text-white rounded-xl font-bold transition hover:shadow-lg text-sm"
                  style={{ background: typeForm.color || '#6366f1' }}
                >
                  {typeForm.id ? t('Zapisz zmiany') : t('Utwórz typ')}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
