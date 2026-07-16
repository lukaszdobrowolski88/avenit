import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { useCampusQuery } from '../../hooks/useCampusQuery';
import { useCampus } from '../../contexts/CampusContext';
import {
  X, Calendar, Music, Search, Plus, Trash2, GripVertical,
  ChevronRight, ChevronLeft, Edit3, Check, StickyNote, FolderOpen, MapPin
} from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { tr } from '../../i18n';

const KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const formatDateFull = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const formatted = date.toLocaleDateString('pl-PL', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
};

const fetchActivePrograms = async (withCampusFilter = (q) => q) => {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await withCampusFilter(
    supabase.from('programs').select('*').gte('date', today)
  ).order('date', { ascending: true });
  if (error) {
    console.error('Błąd pobierania programów:', error);
    return [];
  }
  return data || [];
};

// =====================================================================
// Modal 1: AddSongToProgramModal
// Wywoływany z poziomu wiersza pieśni: użytkownik wybiera program, tonację i notatkę
// =====================================================================
export function AddSongToProgramModal({ song, onClose, onSaved }) {
  const { withCampusFilter, selectedCampusId } = useCampusQuery();
  const { campuses } = useCampus();
  const campusById = useMemo(() => {
    const map = {};
    (campuses || []).forEach(c => { map[c.id] = c; });
    return map;
  }, [campuses]);
  const showCampus = !selectedCampusId && (campuses?.length || 0) > 0;
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedProgramId, setSelectedProgramId] = useState(null);
  const [songKey, setSongKey] = useState(song?.key || 'C');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [existingProgramIds, setExistingProgramIds] = useState(new Set());

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [progs, existing] = await Promise.all([
        fetchActivePrograms(withCampusFilter),
        supabase
          .from('program_song_suggestions')
          .select('program_id')
          .eq('song_id', song.id)
          .then(r => new Set((r.data || []).map(x => x.program_id))),
      ]);
      setPrograms(progs);
      setExistingProgramIds(existing);
      setLoading(false);
    })();
  }, [song?.id]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return programs;
    return programs.filter(p =>
      (p.title || '').toLowerCase().includes(q) ||
      (p.date || '').toLowerCase().includes(q) ||
      formatDateFull(p.date).toLowerCase().includes(q)
    );
  }, [programs, search]);

  const handleSave = async () => {
    if (!selectedProgramId) return;
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from('program_song_suggestions')
        .select('sort_order')
        .eq('program_id', selectedProgramId)
        .order('sort_order', { ascending: false })
        .limit(1);
      const nextOrder = existing && existing[0] ? (existing[0].sort_order || 0) + 1 : 0;

      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase.from('program_song_suggestions').insert([{
        program_id: selectedProgramId,
        song_id: song.id,
        song_key: songKey || null,
        note: note.trim() || null,
        sort_order: nextOrder,
        created_by_email: user?.email || null,
      }]);
      if (error) {
        if (error.code === '23505') {
          alert('Ta pieśń jest już przypisana do tego programu.');
        } else {
          alert('Błąd zapisu: ' + error.message);
        }
        setSaving(false);
        return;
      }
      onSaved?.();
      onClose();
    } catch (err) {
      alert('Błąd: ' + err.message);
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[110]">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-lg p-6 border border-white/20 dark:border-gray-700 max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="font-bold text-xl text-gray-800 dark:text-white">Dodaj do programu</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-[400px]">
              <Music size={14} className="inline mr-1 text-accent-primary-light" />
              {song?.title}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition text-gray-500 dark:text-gray-400">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 flex-1 overflow-y-auto">
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">
              Wybierz program (od dzisiaj)
            </label>
            <div className="flex items-center gap-2 px-3 py-2 mb-2 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <Search size={16} className="text-gray-400" />
              <input
                className="flex-1 bg-transparent outline-none text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400"
                placeholder="Szukaj programu..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 max-h-56 overflow-y-auto custom-scrollbar">
              {loading ? (
                <div className="p-6 text-center text-sm text-gray-400">{tr('Ładowanie...')}</div>
              ) : filtered.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-400">{tr('Brak nadchodzących programów')}</div>
              ) : (
                filtered.map(p => {
                  const isSelected = selectedProgramId === p.id;
                  const alreadyAdded = existingProgramIds.has(p.id);
                  const campus = showCampus ? campusById[p.campus_id] : null;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={alreadyAdded}
                      onClick={() => !alreadyAdded && setSelectedProgramId(p.id)}
                      className={`w-full text-left px-4 py-3 border-b border-gray-100 dark:border-gray-700/60 last:border-0 transition flex items-center justify-between gap-3
                        ${isSelected ? 'bg-accent-primary-lightest dark:bg-accent-primary-darkest/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}
                        ${alreadyAdded ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-gray-800 dark:text-white truncate">
                          {p.title || formatDateFull(p.date)}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5 flex-wrap">
                          <span>{p.title ? formatDateFull(p.date) : `${(p.schedule || []).length} elementów`}</span>
                          {campus && (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700/60 text-[10px] font-medium"
                              style={campus.color ? { background: `${campus.color}1a`, color: campus.color } : undefined}
                              title={`Kampus: ${campus.name}`}
                            >
                              <MapPin size={10} />
                              {campus.name}
                            </span>
                          )}
                        </div>
                      </div>
                      {alreadyAdded ? (
                        <span className="text-[10px] font-bold uppercase text-gray-400 dark:text-gray-500 shrink-0">{tr('Już dodana')}</span>
                      ) : isSelected ? (
                        <Check size={18} className="text-accent-primary shrink-0" />
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 ml-1">
              Tonacja wykonania {song?.key ? <span className="text-gray-400 normal-case font-normal">(pieśń: {song.key})</span> : null}
            </label>
            <div className="grid grid-cols-6 gap-1.5">
              {KEYS.map(k => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSongKey(k)}
                  className={`py-2 text-xs font-bold rounded-lg transition-all
                    ${songKey === k
                      ? 'bg-gradient-to-b from-accent-primary-light to-accent-primary text-white shadow-lg shadow-accent-primary-light/25'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">
              Notatka
            </label>
            <textarea
              className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-sm min-h-[70px] resize-y focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light outline-none transition"
              placeholder={tr('Opcjonalna notatka, np. fragment, zwrotka, kiedy zaśpiewać...')}
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-gray-100 dark:border-gray-800">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
          >
            Anuluj
          </button>
          <button
            onClick={handleSave}
            disabled={!selectedProgramId || saving}
            className="px-5 py-2.5 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-xl hover:shadow-lg hover:shadow-accent-primary-light/50 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? 'Zapisywanie...' : (<><Plus size={16} />Dodaj do programu</>)}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// =====================================================================
// Modal 2: ProgramsSongsManagerModal
// Lista aktywnych programów + zarządzanie sugestiami pieśni dla wybranego
// =====================================================================
export function ProgramsSongsManagerModal({ songs, onClose }) {
  const { withCampusFilter, selectedCampusId } = useCampusQuery();
  const { campuses } = useCampus();
  const campusById = useMemo(() => {
    const map = {};
    (campuses || []).forEach(c => { map[c.id] = c; });
    return map;
  }, [campuses]);
  const showCampus = !selectedCampusId && (campuses?.length || 0) > 0;
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [counts, setCounts] = useState({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      const progs = await fetchActivePrograms(withCampusFilter);
      setPrograms(progs);
      if (progs.length > 0) {
        const ids = progs.map(p => p.id);
        const { data } = await supabase
          .from('program_song_suggestions')
          .select('program_id')
          .in('program_id', ids);
        const c = {};
        (data || []).forEach(r => { c[r.program_id] = (c[r.program_id] || 0) + 1; });
        setCounts(c);
      }
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return programs;
    return programs.filter(p =>
      (p.title || '').toLowerCase().includes(q) ||
      (p.date || '').toLowerCase().includes(q) ||
      formatDateFull(p.date).toLowerCase().includes(q)
    );
  }, [programs, search]);

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[110]">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-3xl border border-white/20 dark:border-gray-700 max-h-[90vh] flex flex-col">
        {!selectedProgram ? (
          <>
            <div className="flex justify-between items-center px-6 pt-6 pb-3">
              <div>
                <h3 className="font-bold text-xl text-gray-800 dark:text-white flex items-center gap-2">
                  <FolderOpen size={20} className="text-accent-primary-light" />
                  Programy
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  Aktywne programy (od dzisiaj). Wybierz, by zarządzać przypisanymi pieśniami.
                </p>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition text-gray-500 dark:text-gray-400">
                <X size={20} />
              </button>
            </div>
            <div className="px-6 pb-3">
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                <Search size={16} className="text-gray-400" />
                <input
                  className="flex-1 bg-transparent outline-none text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400"
                  placeholder="Szukaj programu..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="px-6 pb-6 overflow-y-auto custom-scrollbar flex-1">
              {loading ? (
                <div className="p-10 text-center text-sm text-gray-400">{tr('Ładowanie...')}</div>
              ) : filtered.length === 0 ? (
                <div className="p-10 text-center text-sm text-gray-400">{tr('Brak nadchodzących programów')}</div>
              ) : (
                <div className="grid gap-2">
                  {filtered.map(p => {
                    const campus = showCampus ? campusById[p.campus_id] : null;
                    return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedProgram(p)}
                      className="w-full text-left px-4 py-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-accent-primary-light dark:hover:border-accent-primary hover:bg-accent-primary-lightest/50 dark:hover:bg-accent-primary-darkest/10 transition flex items-center justify-between gap-3 group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-gradient-to-br from-accent-primary-light to-accent-secondary-light text-white shadow-sm flex-shrink-0">
                          <Calendar size={16} />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-gray-800 dark:text-white truncate flex items-center gap-2 flex-wrap">
                            <span className="truncate">{p.title || formatDateFull(p.date)}</span>
                            {campus && (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700/60 text-[10px] font-medium"
                                style={campus.color ? { background: `${campus.color}1a`, color: campus.color } : undefined}
                                title={`Kampus: ${campus.name}`}
                              >
                                <MapPin size={10} />
                                {campus.name}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {p.title ? formatDateFull(p.date) + ' · ' : ''}
                            {(counts[p.id] || 0)} {counts[p.id] === 1 ? 'pieśń' : 'pieśni'} sugerowanych
                          </div>
                        </div>
                      </div>
                      <ChevronRight size={18} className="text-gray-300 group-hover:text-accent-primary-light transition shrink-0" />
                    </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <ProgramSongsEditor
            program={selectedProgram}
            songs={songs}
            onBack={() => {
              setSelectedProgram(null);
              // refresh counts after potential changes
              (async () => {
                const ids = programs.map(p => p.id);
                if (ids.length === 0) return;
                const { data } = await supabase
                  .from('program_song_suggestions')
                  .select('program_id')
                  .in('program_id', ids);
                const c = {};
                (data || []).forEach(r => { c[r.program_id] = (c[r.program_id] || 0) + 1; });
                setCounts(c);
              })();
            }}
            onClose={onClose}
          />
        )}
      </div>
    </div>,
    document.body
  );
}

// =====================================================================
// Editor: lista przypisanych pieśni do wybranego programu
// =====================================================================
function ProgramSongsEditor({ program, songs, onBack, onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [showAddPicker, setShowAddPicker] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const songsById = useMemo(() => {
    const map = {};
    (songs || []).forEach(s => { map[s.id] = s; });
    return map;
  }, [songs]);

  const reload = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('program_song_suggestions')
      .select('*')
      .eq('program_id', program.id)
      .order('sort_order', { ascending: true });
    setItems(data || []);
    setLoading(false);
  };

  useEffect(() => { reload(); }, [program.id]);

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex(i => i.id === active.id);
    const newIndex = items.findIndex(i => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    // persist new order
    try {
      await Promise.all(next.map((it, idx) =>
        supabase.from('program_song_suggestions').update({ sort_order: idx }).eq('id', it.id)
      ));
    } catch (e) {
      console.error('Błąd zapisu kolejności', e);
    }
  };

  const handleChangeKey = async (id, newKey) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, song_key: newKey } : i));
    await supabase.from('program_song_suggestions').update({ song_key: newKey }).eq('id', id);
  };

  const handleSaveNote = async (id) => {
    const value = noteDraft.trim() || null;
    setItems(prev => prev.map(i => i.id === id ? { ...i, note: value } : i));
    setEditingNoteId(null);
    setNoteDraft('');
    await supabase.from('program_song_suggestions').update({ note: value }).eq('id', id);
  };

  const handleDelete = async (id) => {
    if (!confirm('Usunąć pieśń z propozycji?')) return;
    setItems(prev => prev.filter(i => i.id !== id));
    await supabase.from('program_song_suggestions').delete().eq('id', id);
  };

  const handleAddSong = async (song) => {
    const nextOrder = items.length > 0 ? Math.max(...items.map(i => i.sort_order || 0)) + 1 : 0;
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('program_song_suggestions').insert([{
      program_id: program.id,
      song_id: song.id,
      song_key: song.key || null,
      sort_order: nextOrder,
      created_by_email: user?.email || null,
    }]).select().single();
    if (error) {
      if (error.code === '23505') {
        alert('Ta pieśń jest już przypisana do tego programu.');
      } else {
        alert('Błąd: ' + error.message);
      }
      return;
    }
    setItems(prev => [...prev, data]);
    setShowAddPicker(false);
  };

  const assignedIds = new Set(items.map(i => i.song_id));
  const unassignedSongs = (songs || []).filter(s => !assignedIds.has(s.id));

  return (
    <>
      <div className="flex justify-between items-center px-6 pt-6 pb-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition text-gray-500 dark:text-gray-400 shrink-0"
            title={tr('Wróć do listy programów')}
          >
            <ChevronLeft size={20} />
          </button>
          <div className="min-w-0">
            <h3 className="font-bold text-xl text-gray-800 dark:text-white truncate">
              {program.title || formatDateFull(program.date)}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
              {program.title ? formatDateFull(program.date) + ' · ' : ''}
              Sugerowane pieśni
            </p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition text-gray-500 dark:text-gray-400 shrink-0">
          <X size={20} />
        </button>
      </div>

      <div className="px-6 pb-6 overflow-y-auto custom-scrollbar flex-1">
        {loading ? (
          <div className="p-10 text-center text-sm text-gray-400">{tr('Ładowanie...')}</div>
        ) : items.length === 0 ? (
          <div className="text-center py-10 px-4 bg-gray-50 dark:bg-gray-800/40 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
            <Music size={32} className="mx-auto mb-2 text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {tr('Brak pieśni przypisanych do tego programu.')}
            </p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {items.map((it, idx) => (
                  <SortableSuggestionRow
                    key={it.id}
                    item={it}
                    index={idx}
                    song={songsById[it.song_id]}
                    isEditingNote={editingNoteId === it.id}
                    noteDraft={noteDraft}
                    onStartEditNote={() => { setEditingNoteId(it.id); setNoteDraft(it.note || ''); }}
                    onChangeNoteDraft={setNoteDraft}
                    onSaveNote={() => handleSaveNote(it.id)}
                    onCancelNote={() => { setEditingNoteId(null); setNoteDraft(''); }}
                    onChangeKey={(k) => handleChangeKey(it.id, k)}
                    onDelete={() => handleDelete(it.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        <div className="mt-4">
          {!showAddPicker ? (
            <button
              onClick={() => setShowAddPicker(true)}
              className="w-full px-4 py-3 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-500 dark:text-gray-400 hover:border-accent-primary-light hover:text-accent-primary dark:hover:border-accent-primary-dark dark:hover:text-accent-primary-light transition flex items-center justify-center gap-2"
            >
              <Plus size={16} /> Dodaj pieśń z bazy
            </button>
          ) : (
            <SongPickerInline
              songs={unassignedSongs}
              onPick={handleAddSong}
              onCancel={() => setShowAddPicker(false)}
            />
          )}
        </div>
      </div>
    </>
  );
}

function SortableSuggestionRow({
  item, index, song, isEditingNote, noteDraft,
  onStartEditNote, onChangeNoteDraft, onSaveNote, onCancelNote,
  onChangeKey, onDelete,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 999 : 'auto',
    position: 'relative',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm"
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div {...attributes} {...listeners} className="cursor-grab text-gray-300 dark:text-gray-600 hover:text-accent-primary active:cursor-grabbing shrink-0">
          <GripVertical size={16} />
        </div>
        <span className="text-accent-primary dark:text-accent-primary-light font-bold text-xs w-6 shrink-0">{index + 1}.</span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-gray-800 dark:text-white truncate">
            {song?.title || <span className="italic text-gray-400">{tr('[pieśń usunięta]')}</span>}
          </div>
          {song?.author && (
            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{song.author}</div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <select
            value={item.song_key || song?.key || 'C'}
            onChange={e => onChangeKey(e.target.value)}
            className="text-xs font-bold bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 border border-accent-primary-lighter dark:border-accent-primary-dark text-accent-primary-dark dark:text-accent-primary-light rounded-lg px-2 py-1 focus:outline-none cursor-pointer"
            title="Tonacja"
          >
            {KEYS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <button
            onClick={onStartEditNote}
            className={`p-1.5 rounded-lg transition ${item.note ? 'text-accent-secondary bg-accent-secondary-lightest dark:bg-accent-secondary-darkest/20 hover:bg-accent-secondary-lighter' : 'text-gray-300 dark:text-gray-600 hover:text-accent-secondary-light hover:bg-accent-secondary-lightest dark:hover:bg-accent-secondary-darkest/20'}`}
            title={item.note ? 'Edytuj notatkę' : 'Dodaj notatkę'}
          >
            <StickyNote size={14} />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-gray-300 dark:text-gray-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition"
            title={tr('Usuń')}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {(isEditingNote || item.note) && (
        <div className="px-3 pb-3 pt-0">
          {isEditingNote ? (
            <div className="flex flex-col gap-2 bg-accent-secondary-lightest/50 dark:bg-accent-secondary-darkest/10 border border-accent-secondary-lighter dark:border-accent-secondary-dark/40 rounded-lg p-2">
              <textarea
                autoFocus
                value={noteDraft}
                onChange={e => onChangeNoteDraft(e.target.value)}
                placeholder="Notatka..."
                className="w-full px-2 py-1.5 text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md outline-none focus:ring-2 focus:ring-accent-primary-light/20 resize-y min-h-[50px] text-gray-700 dark:text-gray-200"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={onCancelNote}
                  className="px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition"
                >
                  Anuluj
                </button>
                <button
                  onClick={onSaveNote}
                  className="px-3 py-1 text-xs font-bold bg-accent-primary text-white rounded-md hover:bg-accent-primary-dark transition flex items-center gap-1"
                >
                  <Check size={12} /> Zapisz
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={onStartEditNote}
              className="w-full text-left text-xs text-gray-600 dark:text-gray-400 bg-accent-secondary-lightest/50 dark:bg-accent-secondary-darkest/10 border border-accent-secondary-lighter dark:border-accent-secondary-dark/40 rounded-lg px-3 py-2 hover:bg-accent-secondary-lightest dark:hover:bg-accent-secondary-darkest/20 transition"
            >
              <span className="font-semibold text-accent-secondary dark:text-accent-secondary-light">Notatka: </span>
              {item.note}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SongPickerInline({ songs, onPick, onCancel }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return songs;
    return songs.filter(s =>
      (s.title || '').toLowerCase().includes(q) ||
      (s.author || '').toLowerCase().includes(q)
    );
  }, [songs, search]);

  return (
    <div className="bg-white dark:bg-gray-800 border border-accent-primary-lighter dark:border-accent-primary-dark/40 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <Search size={14} className="text-gray-400" />
        <input
          autoFocus
          className="flex-1 bg-transparent outline-none text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400"
          placeholder={tr('Szukaj pieśni...')}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition">
          <X size={16} />
        </button>
      </div>
      <div className="max-h-56 overflow-y-auto custom-scrollbar">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-xs text-gray-400">{tr('Brak pieśni')}</div>
        ) : (
          filtered.map(s => (
            <button
              key={s.id}
              onClick={() => onPick(s)}
              className="w-full text-left px-4 py-2 hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest/20 transition border-b border-gray-50 dark:border-gray-700/40 last:border-0 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{s.title}</div>
                {s.author && <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{s.author}</div>}
              </div>
              <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded shrink-0">{s.key}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
