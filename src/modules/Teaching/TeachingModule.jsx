import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import {
  Calendar, BookOpen, Users, Plus, Edit3, Trash2, X, Loader2,
  MessageSquare, ChevronDown, ChevronUp, Image as ImageIcon, Check, Mail, ArrowLeft, FolderOpen
} from 'lucide-react';
import { useUserRole } from '../../hooks/useUserRole';
import { hasTabAccess } from '../../utils/tabPermissions';
import WallTab from '../shared/WallTab';
import MaterialsTab from '../shared/MaterialsTab';
import CustomDatePicker from '../../components/CustomDatePicker';
import ResponsiveTabs from '../../components/ResponsiveTabs';

// ================== TABLE SELECT COMPONENT ==================

function useDropdownPosition(triggerRef, isOpen) {
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, openUpward: false });

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const updatePosition = () => {
        const rect = triggerRef.current.getBoundingClientRect();
        const dropdownMaxHeight = 240;
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const openUpward = spaceBelow < dropdownMaxHeight && spaceAbove > spaceBelow;

        setCoords({
          top: openUpward
            ? rect.top + window.scrollY - 4
            : rect.bottom + window.scrollY + 4,
          left: rect.left + window.scrollX,
          width: rect.width,
          openUpward
        });
      };

      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);

      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
      };
    }
  }, [isOpen, triggerRef]);

  return coords;
}

const TableSelect = ({ options, value, onChange, placeholder = 'Wybierz...' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef(null);
  const coords = useDropdownPosition(triggerRef, isOpen);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event) {
      if (triggerRef.current && !triggerRef.current.contains(event.target)) {
        if (!event.target.closest('.portal-table-select')) {
          setIsOpen(false);
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const selectedOption = options.find(opt => opt.value === value);
  const displayValue = selectedOption ? selectedOption.label : placeholder;

  return (
    <div ref={triggerRef} className="relative w-full">
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full min-h-[32px] px-2 py-1 bg-white dark:bg-gray-800 border rounded-lg text-xs cursor-pointer flex items-center justify-between transition
          ${isOpen
            ? 'border-pink-500 ring-1 ring-pink-500/20'
            : 'border-gray-200 dark:border-gray-700 hover:border-pink-300 dark:hover:border-pink-500'
          }
        `}
      >
        <span className={`truncate ${selectedOption ? 'text-gray-800 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500 italic'}`}>
          {displayValue}
        </span>
        <ChevronDown size={12} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && coords.width > 0 && document.body && createPortal(
        <div
          className="portal-table-select fixed z-[9999] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-h-48 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-100"
          style={{
            ...(coords.openUpward
              ? { bottom: `calc(100vh - ${coords.top}px)` }
              : { top: coords.top }),
            left: coords.left,
            width: Math.max(coords.width, 150)
          }}
        >
          {options.map((opt, idx) => {
            const isActive = opt.value === value;
            return (
              <div
                key={idx}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`px-3 py-1.5 text-xs cursor-pointer transition flex items-center justify-between
                  ${isActive
                    ? 'bg-pink-50 dark:bg-pink-900/30 text-pink-600 dark:text-pink-300 font-medium'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }
                `}
              >
                <span>{opt.label}</span>
                {isActive && <Check size={12} />}
              </div>
            );
          })}
          {options.length === 0 && (
            <div className="p-2 text-gray-400 text-xs text-center">Brak opcji</div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};

// ================== SCHEDULE TABLE ==================

const ScheduleTable = ({ programs, speakers, series, onUpdateProgram }) => {
  const [expandedMonths, setExpandedMonths] = useState({});

  const groupedPrograms = programs.reduce((acc, prog) => {
    if (!prog.date) return acc;
    const date = new Date(prog.date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(prog);
    return acc;
  }, {});

  const sortedMonths = Object.keys(groupedPrograms).sort().reverse();

  useEffect(() => {
    const currentMonthKey = new Date().toISOString().slice(0, 7);
    setExpandedMonths(prev => ({ ...prev, [currentMonthKey]: true }));
  }, []);

  const toggleMonth = (monthKey) => {
    setExpandedMonths(prev => ({ ...prev, [monthKey]: !prev[monthKey] }));
  };

  const formatMonthName = (monthKey) => {
    const [year, month] = monthKey.split('-');
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase());
  };

  const formatDateShort = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const speakerOptions = [
    { value: '', label: '-- Wybierz --' },
    ...speakers.map(s => ({ value: s.id, label: s.name }))
  ];

  const seriesOptions = [
    { value: '', label: '-- Wybierz --' },
    ...series.map(s => ({ value: s.id, label: s.name }))
  ];

  const updateTeachingField = async (programId, field, value) => {
    const programToUpdate = programs.find(p => p.id === programId);
    if (!programToUpdate) return;
    const currentTeaching = programToUpdate.teaching || {};
    const updatedTeaching = { ...currentTeaching, [field]: value };
    await onUpdateProgram(programId, { teaching: updatedTeaching });
  };

  const columns = [
    { key: 'speaker_id', label: 'Mówca', type: 'select', options: speakerOptions },
    { key: 'series_id', label: 'Seria', type: 'select', options: seriesOptions },
    { key: 'title', label: 'Tytuł kazania', type: 'text' },
    { key: 'scripture', label: 'Fragment', type: 'text' },
    { key: 'main_point', label: 'Główna myśl', type: 'text' },
    { key: 'notes', label: 'Notatki', type: 'text' },
  ];

  return (
    <div className="space-y-4">
      {sortedMonths.map(monthKey => {
        const isExpanded = expandedMonths[monthKey];

        return (
          <div
            key={monthKey}
            className={`bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm relative z-0 transition-all duration-300 ${isExpanded ? 'mb-8' : 'mb-0'}`}
          >
            <button
              onClick={() => toggleMonth(monthKey)}
              className={`w-full px-6 py-4 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 flex justify-between items-center transition border-b border-gray-200 dark:border-gray-700 ${isExpanded ? 'rounded-t-2xl' : 'rounded-2xl'}`}
            >
              <span className="font-bold text-gray-800 dark:text-gray-100 text-sm uppercase tracking-wider">{formatMonthName(monthKey)}</span>
              {isExpanded ? <ChevronUp size={18} className="text-gray-500 dark:text-gray-400" /> : <ChevronDown size={18} className="text-gray-500 dark:text-gray-400" />}
            </button>

            {isExpanded && (
              <div className="overflow-x-auto pb-4 bg-white dark:bg-gray-900 rounded-b-2xl">
                <table className="w-full text-left border-collapse min-w-max">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 dark:text-gray-400 uppercase border-b border-gray-200 dark:border-gray-700">
                      <th className="p-3 font-semibold w-24 min-w-[90px]">Data</th>
                      {columns.map(col => (
                        <th key={col.key} className="p-3 font-semibold min-w-[130px]">{col.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-800 relative">
                    {groupedPrograms[monthKey]
                      .sort((a, b) => new Date(a.date) - new Date(b.date))
                      .map((prog) => (
                        <tr key={prog.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition relative">
                          <td className="p-3 font-medium text-gray-700 dark:text-gray-300 font-mono text-xs">
                            {formatDateShort(prog.date)}
                          </td>
                          {columns.map(col => (
                            <td key={col.key} className="p-2 relative">
                              {col.type === 'select' ? (
                                <TableSelect
                                  options={col.options}
                                  value={prog.teaching?.[col.key] || ''}
                                  onChange={(val) => updateTeachingField(prog.id, col.key, val || null)}
                                />
                              ) : (
                                <input
                                  className="w-full bg-transparent border-b border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-pink-500 text-xs p-1 outline-none transition placeholder-gray-300 dark:placeholder-gray-600 text-gray-700 dark:text-gray-300"
                                  placeholder="Wpisz..."
                                  defaultValue={prog.teaching?.[col.key] || ''}
                                  onBlur={(e) => updateTeachingField(prog.id, col.key, e.target.value)}
                                />
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {sortedMonths.length === 0 && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
          Brak programów nabożeństw. Dodaj programy w module "Programy".
        </div>
      )}
    </div>
  );
};

// ================== SPEAKERS SECTION ==================

function SpeakersSection({ speakers, onAdd, onEdit, onDelete }) {
  const [showModal, setShowModal] = useState(false);
  const [editingSpeaker, setEditingSpeaker] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', bio: '', photo_url: '' });
  const fileInputRef = useRef(null);

  const openAdd = () => {
    setForm({ name: '', email: '', bio: '', photo_url: '' });
    setEditingSpeaker(null);
    setShowModal(true);
  };

  const openEdit = (speaker) => {
    setForm({
      name: speaker.name,
      email: speaker.email || '',
      bio: speaker.bio || '',
      photo_url: speaker.photo_url || ''
    });
    setEditingSpeaker(speaker);
    setShowModal(true);
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `speaker_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `teaching/speakers/${fileName}`;

      const { error } = await supabase.storage.from('public-assets').upload(filePath, file);
      if (error) throw error;

      const { data } = supabase.storage.from('public-assets').getPublicUrl(filePath);
      setForm(prev => ({ ...prev, photo_url: data.publicUrl }));
    } catch (err) {
      console.error('Upload error:', err);
      alert('Błąd przesyłania zdjęcia');
    }
    setUploading(false);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return alert('Podaj imię i nazwisko mówcy');

    if (editingSpeaker) {
      await onEdit(editingSpeaker.id, form);
    } else {
      await onAdd(form);
    }
    setShowModal(false);
  };

  return (
    <section className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Mówcy</h2>
        <button
          onClick={openAdd}
          className="bg-gradient-to-r from-pink-600 to-orange-600 text-white px-4 py-2 rounded-xl font-medium hover:shadow-lg transition flex items-center gap-2"
        >
          <Plus size={18} /> Dodaj mówcę
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {speakers.map(speaker => (
          <div
            key={speaker.id}
            className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center gap-4">
              {speaker.photo_url ? (
                <img
                  src={speaker.photo_url}
                  alt={speaker.name}
                  className="w-16 h-16 rounded-full object-cover"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-pink-500 to-orange-500 flex items-center justify-center text-white text-xl font-bold">
                  {speaker.name.charAt(0)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-gray-800 dark:text-gray-100 truncate">{speaker.name}</h3>
                {speaker.email && (
                  <a href={`mailto:${speaker.email}`} className="text-sm text-pink-500 hover:text-pink-600 flex items-center gap-1 truncate">
                    <Mail size={12} />
                    {speaker.email}
                  </a>
                )}
                {speaker.bio && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mt-1">{speaker.bio}</p>
                )}
              </div>
            </div>
            <div className="flex gap-2 mt-4 justify-end">
              <button
                onClick={() => openEdit(speaker)}
                className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition"
              >
                <Edit3 size={16} />
              </button>
              <button
                onClick={() => onDelete(speaker.id)}
                className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        {speakers.length === 0 && (
          <div className="col-span-full text-center py-12 text-gray-500 dark:text-gray-400">
            Brak mówców. Dodaj pierwszego mówcę.
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && document.body && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-md border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">
                {editingSpeaker ? 'Edytuj mówcę' : 'Dodaj mówcę'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Photo upload */}
              <div className="flex flex-col items-center">
                <div className="relative group">
                  {form.photo_url ? (
                    <img
                      src={form.photo_url}
                      alt=""
                      className="w-24 h-24 rounded-full object-cover border-4 border-white dark:border-gray-700 shadow-lg"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-pink-500 to-orange-500 flex items-center justify-center text-white text-3xl font-bold border-4 border-white dark:border-gray-700 shadow-lg">
                      {form.name ? form.name.charAt(0).toUpperCase() : '?'}
                    </div>
                  )}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="absolute bottom-0 right-0 bg-pink-500 text-white p-2 rounded-full shadow-lg hover:bg-pink-600 transition"
                  >
                    {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
                <span className="text-xs text-gray-400 mt-2">Kliknij aby dodać zdjęcie</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                  Imię i nazwisko *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white"
                  placeholder="Jan Kowalski"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                  Adres e-mail
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white"
                  placeholder="jan.kowalski@example.com"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                  Bio / Opis
                </label>
                <textarea
                  value={form.bio}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white resize-none"
                  placeholder="Krótki opis mówcy..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"
              >
                Anuluj
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-gradient-to-r from-pink-600 to-orange-600 text-white rounded-xl font-medium"
              >
                {editingSpeaker ? 'Zapisz' : 'Dodaj'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </section>
  );
}

// ================== SERIES SECTION (TILES) ==================

function SeriesSection({ series, programs, speakers, onAdd, onEdit, onDelete }) {
  const [showModal, setShowModal] = useState(false);
  const [editingSeries, setEditingSeries] = useState(null);
  const [selectedSeries, setSelectedSeries] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    scripture: '',
    start_date: '',
    end_date: '',
    graphics: []
  });

  const openAdd = () => {
    setForm({ name: '', description: '', scripture: '', start_date: '', end_date: '', graphics: [] });
    setEditingSeries(null);
    setShowModal(true);
  };

  const openEdit = (s, e) => {
    e?.stopPropagation();
    setForm({
      name: s.name,
      description: s.description || '',
      scripture: s.scripture || '',
      start_date: s.start_date || '',
      end_date: s.end_date || '',
      graphics: s.graphics || []
    });
    setEditingSeries(s);
    setShowModal(true);
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploading(true);
    try {
      const uploadedFiles = [];
      for (const file of files) {
        const fileExt = file.name.split('.').pop();
        const fileName = `series_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `teaching/series/${fileName}`;

        const { error } = await supabase.storage.from('public-assets').upload(filePath, file);
        if (error) throw error;

        const { data } = supabase.storage.from('public-assets').getPublicUrl(filePath);
        uploadedFiles.push({ name: file.name, url: data.publicUrl });
      }
      setForm(prev => ({ ...prev, graphics: [...prev.graphics, ...uploadedFiles] }));
    } catch (err) {
      console.error('Upload error:', err);
      alert('Błąd przesyłania pliku');
    }
    setUploading(false);
  };

  const removeGraphic = (index) => {
    setForm(prev => ({ ...prev, graphics: prev.graphics.filter((_, i) => i !== index) }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) return alert('Podaj nazwę serii');

    if (editingSeries) {
      await onEdit(editingSeries.id, form);
    } else {
      await onAdd(form);
    }
    setShowModal(false);
  };

  // Get sermons for a series
  const getSermonsForSeries = (seriesId) => {
    return programs
      .filter(p => p.teaching?.series_id === seriesId)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  };

  // Render detail view for selected series
  if (selectedSeries) {
    const sermons = getSermonsForSeries(selectedSeries.id);

    return (
      <section className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header with cover image */}
        <div className="relative h-48 bg-gradient-to-br from-purple-600 to-pink-600">
          {selectedSeries.graphics?.[0] && (
            <img
              src={selectedSeries.graphics[0].url}
              alt=""
              className="w-full h-full object-cover opacity-50"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <button
            onClick={() => setSelectedSeries(null)}
            className="absolute top-4 left-4 p-2 bg-white/20 backdrop-blur-sm rounded-xl text-white hover:bg-white/30 transition"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="absolute bottom-4 left-6 right-6">
            <h2 className="text-3xl font-bold text-white mb-1">{selectedSeries.name}</h2>
            {selectedSeries.scripture && (
              <p className="text-pink-200 font-medium">{selectedSeries.scripture}</p>
            )}
          </div>
          <div className="absolute top-4 right-4 flex gap-2">
            <button
              onClick={(e) => openEdit(selectedSeries, e)}
              className="p-2 bg-white/20 backdrop-blur-sm rounded-xl text-white hover:bg-white/30 transition"
            >
              <Edit3 size={18} />
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* Description */}
          {selectedSeries.description && (
            <p className="text-gray-600 dark:text-gray-400 mb-6">{selectedSeries.description}</p>
          )}

          {/* Date range */}
          {(selectedSeries.start_date || selectedSeries.end_date) && (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-6">
              <Calendar size={16} />
              {selectedSeries.start_date && new Date(selectedSeries.start_date).toLocaleDateString('pl-PL')}
              {selectedSeries.start_date && selectedSeries.end_date && ' - '}
              {selectedSeries.end_date && new Date(selectedSeries.end_date).toLocaleDateString('pl-PL')}
            </div>
          )}

          {/* Graphics gallery */}
          {selectedSeries.graphics && selectedSeries.graphics.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase mb-3">Grafiki serii</h3>
              <div className="flex flex-wrap gap-3">
                {selectedSeries.graphics.map((g, i) => (
                  <a key={i} href={g.url} target="_blank" rel="noreferrer" className="block">
                    <img src={g.url} alt={g.name} className="w-32 h-32 rounded-xl object-cover hover:opacity-80 transition shadow-md" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Sermons list */}
          <div>
            <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase mb-4">
              Kazania w serii ({sermons.length})
            </h3>
            {sermons.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sermons.map((sermon, idx) => {
                  const speaker = speakers.find(s => s.id === sermon.teaching?.speaker_id);

                  return (
                    <div
                      key={sermon.id}
                      className="group bg-gradient-to-br from-gray-50 to-white dark:from-gray-800 dark:to-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg hover:border-pink-300 dark:hover:border-pink-600 transition-all duration-300"
                    >
                      {/* Card header with number */}
                      <div className="bg-gradient-to-r from-pink-500 to-orange-500 px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white font-bold text-sm">
                            {idx + 1}
                          </div>
                          <span className="text-white/90 text-sm font-medium">
                            {new Date(sermon.date).toLocaleDateString('pl-PL', {
                              weekday: 'short',
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric'
                            })}
                          </span>
                        </div>
                      </div>

                      {/* Card content */}
                      <div className="p-4">
                        <h4 className="font-bold text-gray-800 dark:text-gray-100 text-lg mb-2 line-clamp-2 min-h-[3.5rem]">
                          {sermon.teaching?.title || 'Bez tytułu'}
                        </h4>

                        {/* Speaker */}
                        {speaker && (
                          <div className="flex items-center gap-2 mb-3">
                            {speaker.photo_url ? (
                              <img
                                src={speaker.photo_url}
                                alt={speaker.name}
                                className="w-8 h-8 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-400 to-orange-400 flex items-center justify-center text-white text-xs font-bold">
                                {speaker.name.charAt(0)}
                              </div>
                            )}
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              {speaker.name}
                            </span>
                          </div>
                        )}

                        {/* Scripture */}
                        {sermon.teaching?.scripture && (
                          <div className="flex items-center gap-2 mb-3">
                            <BookOpen size={14} className="text-pink-500 shrink-0" />
                            <span className="text-sm text-pink-600 dark:text-pink-400 font-medium">
                              {sermon.teaching.scripture}
                            </span>
                          </div>
                        )}

                        {/* Main point */}
                        {sermon.teaching?.main_point && (
                          <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-3 bg-gray-100 dark:bg-gray-800 rounded-xl p-3 italic">
                            "{sermon.teaching.main_point}"
                          </p>
                        )}

                        {/* Notes indicator */}
                        {sermon.teaching?.notes && (
                          <div className="mt-3 flex items-center gap-1 text-xs text-gray-400">
                            <MessageSquare size={12} />
                            <span>Zawiera notatki</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                <BookOpen size={40} className="mx-auto mb-3 opacity-50" />
                <p>Brak kazań przypisanych do tej serii</p>
                <p className="text-sm mt-1">Przypisz kazania w zakładce "Grafik"</p>
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  // Render tiles view
  return (
    <section className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Serie</h2>
        <button
          onClick={openAdd}
          className="bg-gradient-to-r from-pink-600 to-orange-600 text-white px-4 py-2 rounded-xl font-medium hover:shadow-lg transition flex items-center gap-2"
        >
          <Plus size={18} /> Dodaj serię
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {series.map(s => {
          const sermonsCount = getSermonsForSeries(s.id).length;

          return (
            <div
              key={s.id}
              onClick={() => setSelectedSeries(s)}
              className="group cursor-pointer bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-xl hover:border-pink-300 dark:hover:border-pink-600 transition-all duration-300"
            >
              {/* Cover image */}
              <div className="h-40 bg-gradient-to-br from-purple-500 to-pink-500 relative overflow-hidden">
                {s.graphics && s.graphics[0] ? (
                  <img
                    src={s.graphics[0].url}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <BookOpen className="text-white/50" size={48} />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute bottom-3 left-3 right-3">
                  <h3 className="font-bold text-white text-lg truncate">{s.name}</h3>
                  {s.scripture && (
                    <p className="text-pink-200 text-sm truncate">{s.scripture}</p>
                  )}
                </div>
                {/* Action buttons */}
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => openEdit(s, e)}
                    className="p-1.5 bg-white/20 backdrop-blur-sm rounded-lg text-white hover:bg-white/30 transition"
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                    className="p-1.5 bg-white/20 backdrop-blur-sm rounded-lg text-white hover:bg-red-500/80 transition"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Info */}
              <div className="p-4">
                {s.description && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">{s.description}</p>
                )}
                <div className="flex items-center justify-between text-xs text-gray-400">
                  {(s.start_date || s.end_date) && (
                    <span>
                      {s.start_date && new Date(s.start_date).toLocaleDateString('pl-PL', { month: 'short', year: 'numeric' })}
                      {s.end_date && ` - ${new Date(s.end_date).toLocaleDateString('pl-PL', { month: 'short', year: 'numeric' })}`}
                    </span>
                  )}
                  <span className="bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 px-2 py-0.5 rounded-full font-medium">
                    {sermonsCount} {sermonsCount === 1 ? 'kazanie' : sermonsCount < 5 ? 'kazania' : 'kazań'}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        {series.length === 0 && (
          <div className="col-span-full text-center py-12 text-gray-500 dark:text-gray-400">
            Brak serii. Dodaj pierwszą serię nauczania.
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && document.body && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">
                {editingSeries ? 'Edytuj serię' : 'Dodaj serię'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                  Nazwa serii *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white"
                  placeholder="Np. Fundamenty wiary"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                  Fragment biblijny
                </label>
                <input
                  type="text"
                  value={form.scripture}
                  onChange={(e) => setForm({ ...form, scripture: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white"
                  placeholder="Np. List do Rzymian 1-8"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                  Opis serii
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white resize-none"
                  placeholder="Krótki opis serii..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <CustomDatePicker
                  label="Data rozpoczęcia"
                  value={form.start_date}
                  onChange={(val) => setForm({ ...form, start_date: val })}
                />
                <CustomDatePicker
                  label="Data zakończenia"
                  value={form.end_date}
                  onChange={(val) => setForm({ ...form, end_date: val })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                  Grafiki
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {form.graphics.map((g, i) => (
                    <div key={i} className="relative group">
                      <img src={g.url} alt="" className="w-20 h-20 rounded-lg object-cover" />
                      <button
                        onClick={() => removeGraphic(i)}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
                <label className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl cursor-pointer hover:border-pink-500 transition">
                  <ImageIcon size={20} className="text-gray-400" />
                  <span className="text-sm text-gray-500">{uploading ? 'Przesyłanie...' : 'Dodaj grafiki'}</span>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handleFileUpload} disabled={uploading} />
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"
              >
                Anuluj
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-gradient-to-r from-pink-600 to-orange-600 text-white rounded-xl font-medium"
              >
                {editingSeries ? 'Zapisz' : 'Dodaj'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </section>
  );
}

// ================== MAIN MODULE ==================

export default function TeachingModule() {
  const { userRole } = useUserRole();
  const [activeTab, setActiveTab] = useState('wall');
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState({ email: '', name: '' });

  const [speakers, setSpeakers] = useState([]);
  const [series, setSeries] = useState([]);
  const [programs, setPrograms] = useState([]);

  useEffect(() => {
    fetchData();
    fetchCurrentUser();
  }, []);

  const fetchCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('app_users')
        .select('full_name')
        .eq('email', user.email)
        .single();
      setCurrentUser({
        email: user.email,
        name: profile?.full_name || user.email
      });
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [speakersRes, seriesRes, programsRes] = await Promise.all([
        supabase.from('teaching_speakers').select('*').order('name'),
        supabase.from('teaching_series').select('*').order('start_date', { ascending: false }),
        supabase.from('programs').select('*').order('date', { ascending: false })
      ]);

      if (speakersRes.data) setSpeakers(speakersRes.data);
      if (seriesRes.data) setSeries(seriesRes.data);
      if (programsRes.data) setPrograms(programsRes.data);
    } catch (err) {
      console.error('Error fetching data:', err);
    }
    setLoading(false);
  };

  // SPEAKERS CRUD
  const addSpeaker = async (data) => {
    const { error } = await supabase.from('teaching_speakers').insert([data]);
    if (error) { alert('Błąd: ' + error.message); return; }
    fetchData();
  };

  const editSpeaker = async (id, data) => {
    const { error } = await supabase.from('teaching_speakers').update(data).eq('id', id);
    if (error) { alert('Błąd: ' + error.message); return; }
    fetchData();
  };

  const deleteSpeaker = async (id) => {
    if (!confirm('Usunąć tego mówcę?')) return;
    const { error } = await supabase.from('teaching_speakers').delete().eq('id', id);
    if (error) { alert('Błąd: ' + error.message); return; }
    fetchData();
  };

  // SERIES CRUD
  const addSeries = async (data) => {
    const { error } = await supabase.from('teaching_series').insert([data]);
    if (error) { alert('Błąd: ' + error.message); return; }
    fetchData();
  };

  const editSeries = async (id, data) => {
    const { error } = await supabase.from('teaching_series').update(data).eq('id', id);
    if (error) { alert('Błąd: ' + error.message); return; }
    fetchData();
  };

  const deleteSeries = async (id) => {
    if (!confirm('Usunąć tę serię?')) return;
    const { error } = await supabase.from('teaching_series').delete().eq('id', id);
    if (error) { alert('Błąd: ' + error.message); return; }
    fetchData();
  };

  // PROGRAM UPDATE (for teaching data)
  const handleProgramUpdate = async (id, updates) => {
    // Optimistic update
    setPrograms(prev => prev.map(p => {
      if (p.id === id) {
        if (updates.teaching) {
          return { ...p, ...updates, teaching: { ...p.teaching, ...updates.teaching } };
        }
        return { ...p, ...updates };
      }
      return p;
    }));

    await supabase.from('programs').update(updates).eq('id', id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600 dark:border-pink-400"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-pink-600 to-orange-600 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent">
          Nauczanie
        </h1>
      </div>

      {/* TAB NAVIGATION */}
      <ResponsiveTabs
        tabs={[
          { id: 'wall', label: 'Tablica', icon: MessageSquare },
          { id: 'schedule', label: 'Grafik', icon: Calendar },
          { id: 'series', label: 'Serie', icon: BookOpen },
          ...(hasTabAccess('teaching', 'speakers', userRole) ? [{ id: 'speakers', label: 'Mówcy', icon: Users }] : []),
          { id: 'files', label: 'Pliki', icon: FolderOpen },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* CONTENT */}
      {activeTab === 'wall' && (
        <section className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <WallTab
            ministry="Nauczanie"
            currentUserEmail={currentUser.email}
            currentUserName={currentUser.name}
          />
        </section>
      )}

      {activeTab === 'schedule' && (
        <section className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Grafik Nauczania</h2>
          </div>
          <ScheduleTable
            programs={programs}
            speakers={speakers}
            series={series}
            onUpdateProgram={handleProgramUpdate}
          />
        </section>
      )}

      {activeTab === 'series' && (
        <SeriesSection
          series={series}
          programs={programs}
          speakers={speakers}
          onAdd={addSeries}
          onEdit={editSeries}
          onDelete={deleteSeries}
        />
      )}

      {activeTab === 'speakers' && (
        <SpeakersSection
          speakers={speakers}
          onAdd={addSpeaker}
          onEdit={editSpeaker}
          onDelete={deleteSpeaker}
        />
      )}

      {activeTab === 'files' && (
        <section className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <MaterialsTab moduleKey="teaching" canEdit={true} />
        </section>
      )}
    </div>
  );
}
