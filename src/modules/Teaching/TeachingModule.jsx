import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Spinner from '../../components/Spinner';
import Modal from '../../components/Modal';
import Button from '../../components/Button';
import EmptyState from '../../components/EmptyState';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import {
  Calendar, BookOpen, Users, Plus, Edit3, Trash2, X, Loader2,
  MessageSquare, ChevronDown, ChevronUp, Image as ImageIcon, Check, Mail, ArrowLeft, FolderOpen
} from 'lucide-react';
import { useTabAccess } from '../../components/Can';
import SermonsModule from '../Sermons/SermonsModule';
import { useCampusQuery } from '../../hooks/useCampusQuery';
import WallTab from '../shared/WallTab';
import MaterialsTab from '../shared/MaterialsTab';
import CustomDatePicker from '../../components/CustomDatePicker';
import ResponsiveTabs from '../../components/ResponsiveTabs';
import PageHeader from '../../components/PageHeader';
import { GraduationCap, Podcast } from 'lucide-react';
import { CampusBadge, useCampusBadge } from '../../components/CampusBadge';
import { tr, appLocale } from '../../i18n';
import { toast } from '../../lib/toast';
import { DataTable, THead, TH, TR, TD } from '../../components/ui/DataTable';
import { confirmDialog } from '../../lib/dialog';
import { patchEventAssignments, scheduleSaveErrorMessage } from '../../hooks/useScheduleAssignments';
import { TEACHING_KEY, buildTeachingRows, teachingOps, seriesSermons, normName, plural } from './teachingSchedule';

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

const TableSelect = ({ options, value, onChange, placeholder }) => {
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
  const displayValue = selectedOption ? selectedOption.label : (placeholder === undefined ? tr('Wybierz...') : placeholder);

  return (
    <div ref={triggerRef} className="relative w-full">
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full min-h-[32px] px-2 py-1 bg-white dark:bg-gray-800 border rounded-lg text-xs cursor-pointer flex items-center justify-between transition
          ${isOpen
            ? 'border-accent-primary-light ring-1 ring-accent-primary-light/20'
            : 'border-gray-200 dark:border-gray-700 hover:border-accent-primary-light dark:hover:border-accent-primary-light'
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
                    ? 'bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light font-medium'
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
            <div className="p-2 text-gray-400 text-xs text-center">{tr('Brak opcji')}</div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};

// ================== SCHEDULE TABLE ==================

// Grafik nauczania = wydarzenia-nabożeństwa (te same niedziele co w grafikach Uwielbienia i Mediów).
// Zapis pola: events.assignments.teaching[pole] przez atomową fn (onUpdateField zwraca true/false).
const ScheduleTable = ({ rows, speakers, series, onUpdateField }) => {
  const navigate = useNavigate();
  const { getCampus } = useCampusBadge();
  const [expandedMonths, setExpandedMonths] = useState({});

  const groupedRows = rows.reduce((acc, row) => {
    if (!row.date) return acc;
    const key = row.date.slice(0, 7);
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});

  const sortedMonths = Object.keys(groupedRows).sort().reverse();

  useEffect(() => {
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setExpandedMonths(prev => ({ ...prev, [currentMonthKey]: true }));
  }, []);

  const toggleMonth = (monthKey) => {
    setExpandedMonths(prev => ({ ...prev, [monthKey]: !prev[monthKey] }));
  };

  const formatMonthName = (monthKey) => {
    const [year, month] = monthKey.split('-');
    const date = new Date(year, month - 1);
    return date.toLocaleDateString(appLocale(), { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase());
  };

  const formatDateShort = (ymd) => {
    const [y, m, d] = String(ymd).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString(appLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const speakerOptions = [
    { value: '', label: tr('-- Wybierz --') },
    ...speakers.map(s => ({ value: s.id, label: s.name }))
  ];

  const seriesOptions = [
    { value: '', label: tr('-- Wybierz --') },
    ...series.filter(s => s.is_active !== false).map(s => ({ value: s.id, label: s.name }))
  ];
  // Seria już wpisana, ale nieaktywna — dalej widoczna w swojej komórce.
  const seriesOptionsFor = (current) => (current && !seriesOptions.some(o => String(o.value) === String(current))
    ? [...seriesOptions, ...series.filter(s => String(s.id) === String(current)).map(s => ({ value: s.id, label: `${s.name} (${tr('nieaktywna')})` }))]
    : seriesOptions);

  const columns = [
    { key: 'speaker_id', label: tr('Mówca'), type: 'select', options: speakerOptions },
    { key: 'series_id', label: tr('Seria'), type: 'select', options: null },
    { key: 'title', label: tr('Tytuł kazania'), type: 'text' },
    { key: 'scripture', label: tr('Fragment'), type: 'text' },
    { key: 'main_point', label: tr('Główna myśl'), type: 'text' },
    { key: 'notes', label: tr('Notatki'), type: 'text' },
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
              aria-expanded={!!isExpanded}
              className={`w-full px-6 py-4 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 flex justify-between items-center transition border-b border-gray-200 dark:border-gray-700 ${isExpanded ? 'rounded-t-2xl' : 'rounded-2xl'}`}
            >
              <span className="font-bold text-gray-800 dark:text-gray-100 text-sm uppercase tracking-wider">{formatMonthName(monthKey)}</span>
              {isExpanded ? <ChevronUp size={18} className="text-gray-500 dark:text-gray-400" /> : <ChevronDown size={18} className="text-gray-500 dark:text-gray-400" />}
            </button>

            {isExpanded && (
              <DataTable flush className="pb-4 rounded-b-2xl" tableClassName="min-w-max">
                  <THead>
                    <tr>
                      <TH className="w-24 min-w-[120px]">{tr('Nabożeństwo')}</TH>
                      {columns.map(col => (
                        <TH key={col.key} className="min-w-[130px]">{col.label}</TH>
                      ))}
                    </tr>
                  </THead>
                  <tbody className="relative">
                    {groupedRows[monthKey].map((row) => (
                        <TR key={row.id} className="relative">
                          <TD numeric className="font-medium whitespace-nowrap">
                            <div className="flex flex-col gap-1 items-start">
                              <button
                                type="button"
                                onClick={() => navigate(`/wydarzenie/${row.id}`)}
                                className="text-left hover:text-accent-primary focus:outline-none focus-visible:underline"
                                title={tr('Otwórz wydarzenie')}
                              >
                                <span className="block">{formatDateShort(row.date)}{row.time ? ` ${row.time}` : ''}</span>
                                {row.title && <span className="block text-xs font-normal text-gray-500 dark:text-gray-400 max-w-[11rem] truncate">{row.title}</span>}
                              </button>
                              <CampusBadge campus={getCampus(row.campus_id)} />
                            </div>
                          </TD>
                          {columns.map(col => (
                            <TD key={col.key} className="relative">
                              {col.type === 'select' ? (
                                <TableSelect
                                  options={col.key === 'series_id' ? seriesOptionsFor(row.teaching?.series_id) : col.options}
                                  value={row.teaching?.[col.key] || ''}
                                  onChange={(val) => onUpdateField(row, col.key, val || null)}
                                />
                              ) : (
                                <input
                                  key={`${row.id}_${col.key}_${row.teaching?.[col.key] || ''}`}
                                  aria-label={`${col.label} — ${formatDateShort(row.date)}`}
                                  className="w-full bg-transparent border-b border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-accent-primary-light text-xs p-1 outline-none transition placeholder-gray-400 dark:placeholder-gray-500 text-gray-700 dark:text-gray-300"
                                  placeholder={tr('Wpisz...')}
                                  defaultValue={row.teaching?.[col.key] || ''}
                                  onBlur={(e) => {
                                    const v = e.target.value;
                                    if ((row.teaching?.[col.key] || '') === v) return; // bez zmian — bez zapisu
                                    onUpdateField(row, col.key, v);
                                  }}
                                />
                              )}
                            </TD>
                          ))}
                        </TR>
                      ))}
                  </tbody>
              </DataTable>
            )}
          </div>
        );
      })}

      {sortedMonths.length === 0 && (
        <EmptyState
          icon={Calendar}
          title={tr('Brak nabożeństw w kalendarzu')}
          subtitle={tr('Dodaj wydarzenie „Nabożeństwo” w module Wydarzenia — pojawi się tutaj i w grafikach zespołów.')}
          action={<Button variant="outline" size="sm" icon={Calendar} onClick={() => navigate('/wydarzenia')}>{tr('Przejdź do wydarzeń')}</Button>}
          className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700"
        />
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
      toast.error(tr('Błąd przesyłania zdjęcia'));
    }
    setUploading(false);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error(tr('Podaj imię i nazwisko mówcy'));

    const ok = editingSpeaker ? await onEdit(editingSpeaker.id, form) : await onAdd(form);
    if (ok) setShowModal(false);
  };

  return (
    <section className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">{tr('Mówcy')}</h2>
        <button
          onClick={openAdd}
          className="bg-gradient-to-r from-accent-primary to-accent-secondary text-white px-4 py-2 rounded-xl font-medium hover:shadow-lg transition flex items-center gap-2"
        >
          <Plus size={18} /> {tr('Dodaj mówcę')}
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
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-accent-primary-light to-accent-secondary-light flex items-center justify-center text-white text-xl font-bold">
                  {speaker.name.charAt(0)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-gray-800 dark:text-gray-100 truncate">{speaker.name}</h3>
                {speaker.email && (
                  <a href={`mailto:${speaker.email}`} className="text-sm text-accent-primary-light hover:text-accent-primary flex items-center gap-1 truncate">
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
                aria-label={tr('Edytuj mówcę {name}', { name: speaker.name })}
                className="p-2 text-gray-500 hover:text-accent-primary hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
              >
                <Edit3 size={16} />
              </button>
              <button
                onClick={() => onDelete(speaker)}
                aria-label={tr('Usuń mówcę {name}', { name: speaker.name })}
                className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        {speakers.length === 0 && (
          <EmptyState icon={Users} title={tr('Brak mówców. Dodaj pierwszego mówcę.')} className="col-span-full" />
        )}
      </div>

      {/* Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        closeOnBackdrop={false}
        size="sm"
        title={editingSpeaker ? tr('Edytuj mówcę') : tr('Dodaj mówcę')}
        footer={<>
          <Button variant="secondary" onClick={() => setShowModal(false)}>{tr('Anuluj')}</Button>
          <Button onClick={handleSave}>{editingSpeaker ? tr('Zapisz') : tr('Dodaj')}</Button>
        </>}
      >
        <div className="p-6 space-y-4">
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
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-accent-primary-light to-accent-secondary-light flex items-center justify-center text-white text-3xl font-bold border-4 border-white dark:border-gray-700 shadow-lg">
                  {form.name ? form.name.charAt(0).toUpperCase() : '?'}
                </div>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute bottom-0 right-0 bg-accent-primary-light text-white p-2 rounded-full shadow-lg hover:bg-accent-primary transition"
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
            <span className="text-xs text-gray-400 mt-2">{tr('Kliknij, aby dodać zdjęcie')}</span>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
              {tr('Imię i nazwisko *')}
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white"
              placeholder={tr('Jan Kowalski')}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
              {tr('Adres e-mail')}
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
              {tr('Bio / Opis')}
            </label>
            <textarea
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              rows={3}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white resize-none"
              placeholder={tr('Krótki opis mówcy...')}
            />
          </div>
        </div>
      </Modal>
    </section>
  );
}

// ================== SERIES SECTION (TILES) ==================

function SeriesSection({ series, rows, programs, sermons, speakers, onAdd, onEdit, onDelete, onAddSermon }) {
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
    graphics: [],
    is_active: true
  });

  const openAdd = () => {
    setForm({ name: '', description: '', scripture: '', start_date: '', end_date: '', graphics: [], is_active: true });
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
      graphics: s.graphics || [],
      is_active: s.is_active !== false
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
      toast.error(tr('Błąd przesyłania pliku'));
    }
    setUploading(false);
  };

  const removeGraphic = (index) => {
    setForm(prev => ({ ...prev, graphics: prev.graphics.filter((_, i) => i !== index) }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error(tr('Podaj nazwę serii'));

    const ok = editingSeries ? await onEdit(editingSeries, form) : await onAdd(form);
    if (!ok) return; // okno zostaje otwarte, dane nie przepadają
    setShowModal(false);
    // Szczegóły otwartej serii pokazują od razu nową nazwę/opis.
    if (editingSeries && selectedSeries?.id === editingSeries.id) setSelectedSeries({ ...selectedSeries, ...form });
  };

  // Kazania serii = grafik (wydarzenia) + stare programy + biblioteka „Kazania” (po nazwie serii).
  const getSermonsForSeries = (s) => seriesSermons(s, { rows, programs, sermons, speakers });
  const fmtDay = (ymd, opts) => {
    const [y, m, d] = String(ymd || '').split('-').map(Number);
    return y ? new Date(y, (m || 1) - 1, d || 1).toLocaleDateString(appLocale(), opts) : '';
  };

  // Render detail view for selected series
  if (selectedSeries) {
    const sermonsList = getSermonsForSeries(selectedSeries);

    return (
      <section className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header with cover image */}
        <div className="relative h-48 bg-gradient-to-br from-gray-700 to-gray-900">
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
            aria-label={tr('Wróć do listy serii')}
            className="absolute top-4 left-4 p-2 bg-white/20 backdrop-blur-sm rounded-xl text-white hover:bg-white/30 transition"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="absolute bottom-4 left-6 right-6">
            <h2 className="text-3xl font-bold text-white mb-1">{selectedSeries.name}</h2>
            {selectedSeries.scripture && (
              <p className="text-accent-primary-lighter font-medium">{selectedSeries.scripture}</p>
            )}
          </div>
          <div className="absolute top-4 right-4 flex gap-2">
            <button
              onClick={(e) => openEdit(selectedSeries, e)}
              aria-label={tr('Edytuj serię')}
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
              {selectedSeries.start_date && new Date(selectedSeries.start_date).toLocaleDateString(appLocale())}
              {selectedSeries.start_date && selectedSeries.end_date && ' - '}
              {selectedSeries.end_date && new Date(selectedSeries.end_date).toLocaleDateString(appLocale())}
            </div>
          )}

          {/* Graphics gallery */}
          {selectedSeries.graphics && selectedSeries.graphics.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase mb-3">{tr('Grafiki serii')}</h3>
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
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase">
                {tr('Kazania w serii')} ({sermonsList.length})
              </h3>
              {onAddSermon && (
                <Button size="sm" icon={Plus} onClick={() => onAddSermon(selectedSeries)}>{tr('Dodaj kazanie do serii')}</Button>
              )}
            </div>
            {sermonsList.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sermonsList.map((sermon, idx) => (
                    <div
                      key={sermon.key}
                      className="group bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg hover:border-accent-primary-light dark:hover:border-accent-primary transition-all duration-300"
                    >
                      {/* Card header with number */}
                      <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100 dark:border-gray-700">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 flex items-center justify-center text-accent-primary dark:text-accent-primary-light font-bold text-sm">
                            {idx + 1}
                          </div>
                          <span className="text-gray-600 dark:text-gray-300 text-sm font-medium">
                            {sermon.date ? fmtDay(sermon.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : tr('Bez daty')}
                          </span>
                        </div>
                        {sermon.sources?.includes('library') && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300" title={tr('Jest w archiwum kazań')}>
                            {sermon.isPublished ? tr('Opublikowane') : tr('W archiwum')}
                          </span>
                        )}
                      </div>

                      {/* Card content */}
                      <div className="p-4">
                        <h4 className="font-bold text-gray-800 dark:text-gray-100 text-lg mb-2 line-clamp-2">
                          {sermon.title || tr('Bez tytułu')}
                        </h4>

                        {sermon.speaker && (
                          <div className="flex items-center gap-2 mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                            <Users size={14} className="text-gray-400" aria-hidden="true" /> {sermon.speaker}
                          </div>
                        )}

                        {sermon.scripture && (
                          <div className="flex items-center gap-2 mb-3">
                            <BookOpen size={14} className="text-accent-primary-light shrink-0" aria-hidden="true" />
                            <span className="text-sm text-accent-primary dark:text-accent-primary-light font-medium">
                              {sermon.scripture}
                            </span>
                          </div>
                        )}

                        {sermon.main_point && (
                          <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-3 bg-gray-100 dark:bg-gray-800 rounded-xl p-3 italic">
                            "{sermon.main_point}"
                          </p>
                        )}

                        {sermon.notes && (
                          <div className="mt-3 flex items-center gap-1 text-xs text-gray-500">
                            <MessageSquare size={12} aria-hidden="true" />
                            <span>{tr('Zawiera notatki')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={BookOpen}
                title={tr('Ta seria nie ma jeszcze kazań')}
                subtitle={tr('Dodaj kazanie do serii albo wybierz tę serię przy nabożeństwie w zakładce „Grafik”.')}
                className="bg-gray-50 dark:bg-gray-800 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700"
              />
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
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">{tr('Serie')}</h2>
        <button
          onClick={openAdd}
          className="bg-gradient-to-r from-accent-primary to-accent-secondary text-white px-4 py-2 rounded-xl font-medium hover:shadow-lg transition flex items-center gap-2"
        >
          <Plus size={18} /> {tr('Dodaj serię')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {series.map(s => {
          const sermonsCount = getSermonsForSeries(s).length;

          return (
            <div
              key={s.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedSeries(s)}
              onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setSelectedSeries(s); } }}
              aria-label={tr('Otwórz serię {name}', { name: s.name })}
              className="group cursor-pointer bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-xl hover:border-accent-primary-light dark:hover:border-accent-primary transition-all duration-300"
            >
              {/* Cover image */}
              <div className="h-40 bg-gradient-to-br from-gray-700 to-gray-900 relative overflow-hidden">
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
                    <p className="text-accent-primary-lighter text-sm truncate">{s.scripture}</p>
                  )}
                </div>
                {/* Status aktywności */}
                <span className={`absolute top-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm ${s.is_active !== false ? 'bg-green-500/90 text-white' : 'bg-gray-600/80 text-white'}`}>
                  {s.is_active !== false ? tr('Aktywna') : tr('Nieaktywna')}
                </span>
                {/* Action buttons */}
                <div className="absolute top-2 right-2 flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => openEdit(s, e)}
                    aria-label={tr('Edytuj serię {name}', { name: s.name })}
                    className="p-1.5 bg-black/30 backdrop-blur-sm rounded-lg text-white hover:bg-black/50 transition"
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(s); }}
                    aria-label={tr('Usuń serię {name}', { name: s.name })}
                    className="p-1.5 bg-black/30 backdrop-blur-sm rounded-lg text-white hover:bg-red-600/90 transition"
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
                      {s.start_date && new Date(s.start_date).toLocaleDateString(appLocale(), { month: 'short', year: 'numeric' })}
                      {s.end_date && ` - ${new Date(s.end_date).toLocaleDateString(appLocale(), { month: 'short', year: 'numeric' })}`}
                    </span>
                  )}
                  <span className="bg-accent-primary-lighter dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light px-2 py-0.5 rounded-full font-medium">
                    {plural(sermonsCount, tr('{n} kazanie', { n: sermonsCount }), tr('{n} kazania', { n: sermonsCount }), tr('{n} kazań', { n: sermonsCount }))}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        {series.length === 0 && (
          <EmptyState icon={BookOpen} title={tr('Brak serii. Dodaj pierwszą serię nauczania.')} className="col-span-full" />
        )}
      </div>

      {/* Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        closeOnBackdrop={false}
        title={editingSeries ? tr('Edytuj serię') : tr('Dodaj serię')}
        footer={<>
          <Button variant="secondary" onClick={() => setShowModal(false)}>{tr('Anuluj')}</Button>
          <Button onClick={handleSave}>{editingSeries ? tr('Zapisz') : tr('Dodaj')}</Button>
        </>}
      >
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
              {tr('Nazwa serii *')}
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white"
              placeholder={tr('Np. Fundamenty wiary')}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
              {tr('Fragment biblijny')}
            </label>
            <input
              type="text"
              value={form.scripture}
              onChange={(e) => setForm({ ...form, scripture: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white"
              placeholder={tr('Np. List do Rzymian 1-8')}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
              {tr('Opis serii')}
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white resize-none"
              placeholder={tr('Krótki opis serii...')}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <CustomDatePicker
              label={tr('Data rozpoczęcia')}
              value={form.start_date}
              onChange={(val) => setForm({ ...form, start_date: val })}
            />
            <CustomDatePicker
              label={tr('Data zakończenia')}
              value={form.end_date}
              onChange={(val) => setForm({ ...form, end_date: val })}
            />
          </div>

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-accent-primary focus:ring-accent-primary"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {tr('Seria aktywna')} <span className="text-gray-400">({tr('do wyboru przy kazaniu')})</span>
            </span>
          </label>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
              {tr('Grafiki')}
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
            <label className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl cursor-pointer hover:border-accent-primary-light transition">
              <ImageIcon size={20} className="text-gray-400" />
              <span className="text-sm text-gray-500">{uploading ? tr('Przesyłanie...') : tr('Dodaj grafiki')}</span>
              <input type="file" accept="image/*" multiple className="hidden" onChange={handleFileUpload} disabled={uploading} />
            </label>
          </div>
        </div>
      </Modal>
    </section>
  );
}

// ================== MAIN MODULE ==================

export default function TeachingModule() {
  const hasTabAccess = useTabAccess();
  const { withCampusFilter, selectedCampusId } = useCampusQuery();
  const [activeTab, setActiveTab] = useState('wall');
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState({ email: '', name: '' });

  const [speakers, setSpeakers] = useState([]);
  const [series, setSeries] = useState([]);
  const [rows, setRows] = useState([]);          // wiersze grafiku = wydarzenia-nabożeństwa
  const [programs, setPrograms] = useState([]);  // stare programy (programs.teaching) — zapas i historia serii
  const [sermons, setSermons] = useState([]);    // biblioteka „Kazania” (do liczby kazań w seriach)
  const [sermonPreset, setSermonPreset] = useState(null);

  useEffect(() => {
    fetchData();
    fetchCurrentUser();
  }, [selectedCampusId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const fetchSermons = useCallback(async () => {
    const { data } = await withCampusFilter(supabase.from('sermons').select('id, title, series, sermon_date, speaker, scripture_ref, is_published'));
    setSermons(data || []);
  }, [withCampusFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [speakersRes, seriesRes, eventsRes, programsRes, rulesRes] = await Promise.all([
        supabase.from('teaching_speakers').select('*').order('name'),
        supabase.from('teaching_series').select('*').order('start_date', { ascending: false }),
        // Ten sam zbiór co grafiki Uwielbienia/Mediów: wydarzenia (nie programy).
        withCampusFilter(supabase.from('events').select('id, title, date, time, module_key, event_type, program_id, team_types, assignments, campus_id')),
        withCampusFilter(supabase.from('programs').select('id, date, title, teaching, campus_id')),
        supabase.from('app_settings').select('value').eq('key', 'event_type_teams').maybeSingle(),
      ]);
      const firstErr = speakersRes.error || seriesRes.error || eventsRes.error;
      if (firstErr) toast.error(firstErr, { fallback: tr('Nie udało się wczytać wszystkich danych nauczania. Odśwież stronę.') });

      let rules = [];
      try {
        const v = rulesRes?.data?.value;
        rules = v ? (typeof v === 'string' ? JSON.parse(v) : v) : [];
      } catch { rules = []; }

      setSpeakers(speakersRes.data || []);
      setSeries(seriesRes.data || []);
      setPrograms(programsRes.data || []);
      setRows(buildTeachingRows(eventsRes.data || [], Array.isArray(rules) ? rules : [], programsRes.data || []));
      await fetchSermons();
    } catch (err) {
      toast.error(err, { fallback: tr('Nie udało się wczytać danych nauczania. Odśwież stronę.') });
    }
    setLoading(false);
  };

  // SPEAKERS CRUD — zwracają true/false (okno zamyka się tylko po sukcesie)
  const addSpeaker = async (data) => {
    const { error } = await supabase.from('teaching_speakers').insert([data]);
    if (error) { toast.error(error, { fallback: tr('Nie udało się dodać mówcy.') }); return false; }
    toast.success(tr('Dodano mówcę'));
    fetchData();
    return true;
  };

  const editSpeaker = async (id, data) => {
    const { error } = await supabase.from('teaching_speakers').update(data).eq('id', id);
    if (error) { toast.error(error, { fallback: tr('Nie udało się zapisać mówcy.') }); return false; }
    toast.success(tr('Zapisano mówcę'));
    fetchData();
    return true;
  };

  const deleteSpeaker = async (speaker) => {
    if (!await confirmDialog({
      title: tr('Usunąć mówcę?'),
      message: tr('{name} zniknie z listy mówców i z wyboru w grafiku. Wpisy w grafiku zostaną bez mówcy.', { name: speaker?.name || '' }),
      isDelete: true,
    })) return;
    const { error } = await supabase.from('teaching_speakers').delete().eq('id', speaker.id);
    if (error) { toast.error(error, { fallback: tr('Nie udało się usunąć mówcy.') }); return; }
    toast.success(tr('Usunięto mówcę'));
    fetchData();
  };

  // SERIES CRUD
  // Puste daty z formularza ('') → null (kolumny date nie przyjmują pustego stringa).
  const cleanSeries = (data) => ({
    ...data,
    name: String(data.name || '').trim(),
    start_date: data.start_date || null,
    end_date: data.end_date || null,
  });
  const addSeries = async (data) => {
    const { error } = await supabase.from('teaching_series').insert([cleanSeries(data)]);
    if (error) { toast.error(error, { fallback: tr('Nie udało się dodać serii.') }); return false; }
    toast.success(tr('Dodano serię'));
    fetchData();
    return true;
  };

  // Kazania w bibliotece łączą się z serią po NAZWIE — przy zmianie nazwy przepinamy je na nową.
  const editSeries = async (prev, data) => {
    const row = cleanSeries(data);
    const { error } = await supabase.from('teaching_series').update(row).eq('id', prev.id);
    if (error) { toast.error(error, { fallback: tr('Nie udało się zapisać serii.') }); return false; }
    if (prev.name && normName(prev.name) !== normName(row.name)) {
      const ids = sermons.filter((x) => normName(x.series) === normName(prev.name)).map((x) => x.id);
      if (ids.length) {
        const { error: e2 } = await supabase.from('sermons').update({ series: row.name }).in('id', ids);
        if (e2) toast.error(e2, { fallback: tr('Zapisano serię, ale nie udało się przepiąć kazań na nową nazwę.') });
      }
    }
    toast.success(tr('Zapisano serię'));
    fetchData();
    return true;
  };

  const deleteSeries = async (s) => {
    if (!await confirmDialog({
      title: tr('Usunąć serię?'),
      message: tr('Seria „{name}” zostanie usunięta. Kazania zostają, ale bez przypisanej serii. Tej operacji nie można cofnąć.', { name: s?.name || '' }),
      isDelete: true,
    })) return;
    const { error } = await supabase.from('teaching_series').delete().eq('id', s.id);
    if (error) { toast.error(error, { fallback: tr('Nie udało się usunąć serii.') }); return; }
    // Sprzątanie PO udanym usunięciu: kazania z biblioteki tracą nazwę nieistniejącej serii.
    const ids = sermons.filter((x) => normName(x.series) === normName(s.name)).map((x) => x.id);
    if (ids.length) {
      const { error: e2 } = await supabase.from('sermons').update({ series: null }).in('id', ids);
      if (e2) toast.error(e2, { fallback: tr('Usunięto serię, ale nie udało się odpiąć od niej kazań.') });
    }
    toast.success(tr('Usunięto serię'));
    fetchData();
  };

  // GRAFIK: zapis jednego pola kazania na wydarzeniu (atomowo, bez nadpisywania innych służb).
  // Stan zmieniamy dopiero po udanym zapisie — przy błędzie wpisany tekst zostaje w polu.
  const handleTeachingUpdate = async (row, field, value) => {
    const { assignments, error } = await patchEventAssignments(row.id, teachingOps(row, field, value));
    if (error) {
      toast.error(scheduleSaveErrorMessage(error));
      return false;
    }
    const saved = assignments?.[TEACHING_KEY] || { ...(row.teaching || {}), [field]: value || undefined };
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, teaching: Object.fromEntries(Object.entries(saved).filter(([, v]) => v != null && v !== '')), legacyFromProgram: false } : r)));
    return true;
  };

  // „Dodaj kazanie do serii” → zakładka Kazania z otwartym formularzem i wybraną serią.
  const addSermonToSeries = (s) => {
    setSermonPreset({ series: s.name, nonce: Date.now() });
    setActiveTab('kazania');
  };

  if (loading) {
    return <Spinner center />;
  }

  return (
    <div className="space-y-8">
      <PageHeader moduleKey="teaching" icon={GraduationCap} title={tr('Nauczanie')} />

      {/* TAB NAVIGATION */}
      <ResponsiveTabs moduleKey="teaching"
        tabs={[
          { id: 'wall', label: tr('Wiadomości'), icon: MessageSquare },
          { id: 'schedule', label: tr('Grafik'), icon: Calendar, tour: 'teaching-schedule-tab' },
          { id: 'series', label: tr('Serie'), icon: BookOpen },
          ...(hasTabAccess('teaching', 'speakers') ? [{ id: 'speakers', label: tr('Mówcy'), icon: Users }] : []),
          { id: 'kazania', label: tr('Kazania'), icon: Podcast },
          { id: 'files', label: tr('Pliki'), icon: FolderOpen },
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
        <section data-tour="teaching-schedule-section" className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex flex-wrap justify-between items-center gap-2 mb-6">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">{tr('Grafik nauczania')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{tr('Te same nabożeństwa co w grafikach zespołów. Zmiany zapisują się po wyjściu z pola.')}</p>
          </div>
          <ScheduleTable
            rows={rows}
            speakers={speakers}
            series={series}
            onUpdateField={handleTeachingUpdate}
          />
        </section>
      )}

      {activeTab === 'series' && (
        <SeriesSection
          series={series}
          rows={rows}
          programs={programs}
          sermons={sermons}
          speakers={speakers}
          onAdd={addSeries}
          onEdit={editSeries}
          onDelete={deleteSeries}
          onAddSermon={addSermonToSeries}
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

      {activeTab === 'kazania' && (
        <SermonsModule embedded createPreset={sermonPreset} onChanged={fetchSermons} />
      )}
    </div>
  );
}
