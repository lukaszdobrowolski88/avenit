import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Music, Video, Users, BookOpen, Mic, History, Clock, Save, ChevronDown, GripVertical, Trash2, Search, Check, Inbox, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useScheduleAssignments } from '../../../hooks/useScheduleAssignments';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { tr, appLocale } from '../../../i18n';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import Spinner from '../../../components/Spinner';
import EmptyState from '../../../components/EmptyState';

const ROLE_ICONS = {
  'Zespół': Music,
  'Produkcja': Video,
  'Atmosfera': Users,
  'Szkółka': BookOpen,
  'Scena': Mic,
};

const ROLE_COLORS = {
  'Zespół': 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  'Produkcja': 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  'Atmosfera': 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  'Szkółka': 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
  'Scena': 'bg-accent-primary-lighter dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light',
};

const ROLE_LABELS = {
  lider: 'Lider',
  piano: 'Piano',
  gitara_akustyczna: 'Gitara akustyczna',
  gitara_elektryczna: 'Gitara elektryczna',
  bas: 'Bas',
  wokale: 'Wokale',
  cajon: 'Cajon',
  naglosnienie: 'Nagłośnienie',
  propresenter: 'ProPresenter',
  social: 'Social Media',
  host: 'Host',
  przygotowanie: 'Przygotowanie',
  witanie: 'Witanie',
  mlodsza: 'Grupa młodsza',
  srednia: 'Grupa średnia',
  starsza: 'Grupa starsza',
  prowadzenie: 'Prowadzenie',
  czytanie: 'Czytanie',
  kazanie: 'Kazanie',
  modlitwa: 'Modlitwa',
  wieczerza: 'Wieczerza',
  ogloszenia: 'Ogłoszenia',
};

// Etykieta roli tłumaczona przy wyświetlaniu (klucz roli bez etykiety — bez zmian).
const roleLabel = (k) => (ROLE_LABELS[k] ? tr(ROLE_LABELS[k]) : k);

const PROGRAM_ELEMENTS = ['Wstęp', 'Uwielbienie', 'Modlitwa', 'Czytanie', 'Kazanie', 'Wieczerza', 'Uwielbienie / Kolekta', 'Ogłoszenia', 'Zakończenie'];
const MUSICAL_KEYS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];

// ============================================
// CUSTOM SELECT
// ============================================

const CustomSelect = ({ value, onChange, options, compact = false }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:border-accent-primary-light transition ${compact ? 'px-2 py-1' : 'px-3 py-2'}`}
      >
        <span className="truncate">{options.find(o => o.value === value)?.label || value || tr('Wybierz...')}</span>
        <ChevronDown size={14} className="text-gray-400 ml-1" />
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {options.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setIsOpen(false); }}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest/20 ${value === opt.value ? 'bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 text-accent-primary' : 'text-gray-700 dark:text-gray-300'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// ============================================
// PROGRAM MODAL (uproszczona wersja)
// ============================================

const ProgramModal = ({ isOpen, onClose, programId, onSave }) => {
  const [program, setProgram] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && programId) {
      const fetchProgram = async () => {
        setLoading(true);
        const { data } = await supabase.from('programs').select('*').eq('id', programId).single();
        if (data) {
          if (!data.schedule) data.schedule = [];
          setProgram(data);
        }
        setLoading(false);
      };
      fetchProgram();
    }
  }, [isOpen, programId]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      closeOnBackdrop={false}
      icon={Music}
      title={tr('Program nabożeństwa')}
      subtitle={program ? new Date(program.date).toLocaleDateString(appLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : undefined}
      size="xl"
      footer={<Button variant="secondary" onClick={onClose}>{tr('Zamknij')}</Button>}
    >
        <div className="p-6">
          {loading ? (
            <Spinner center />
          ) : program ? (
            <div className="space-y-6">
              {/* Schedule */}
              {program.schedule && program.schedule.length > 0 && (
                <div>
                  <h3 className="font-bold text-gray-800 dark:text-white mb-3 flex items-center gap-2">
                    <div className="w-1 h-5 bg-accent-primary-light rounded-full" />
                    {tr('Plan nabożeństwa')}
                  </h3>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-xl overflow-hidden">
                    {program.schedule.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-4 px-4 py-3 border-b border-gray-100 dark:border-gray-700 last:border-0">
                        <span className="w-8 h-8 rounded-lg bg-accent-primary-lighter dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light flex items-center justify-center text-sm font-bold">
                          {idx + 1}
                        </span>
                        <div className="flex-1">
                          <p className="font-medium text-gray-800 dark:text-white">{tr(item.element)}</p>
                          {item.person && <p className="text-sm text-gray-500 dark:text-gray-400">{item.person}</p>}
                        </div>
                        {item.details && (
                          <p className="text-sm text-gray-500 dark:text-gray-400">{item.details}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Teams */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Zespół */}
                {program.zespol && Object.keys(program.zespol).some(k => program.zespol[k]) && (
                  <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4">
                    <h4 className="font-bold text-purple-700 dark:text-purple-400 mb-3 flex items-center gap-2">
                      <Music size={18} />
                      {tr('Zespół Uwielbienia')}
                    </h4>
                    <div className="space-y-2">
                      {Object.entries(program.zespol).map(([key, value]) => {
                        if (!value || key === 'notatki' || key === 'absencja') return null;
                        return (
                          <div key={key} className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">{roleLabel(key)}</span>
                            <span className="font-medium text-gray-800 dark:text-white">{value}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Produkcja */}
                {program.produkcja && Object.keys(program.produkcja).some(k => program.produkcja[k]) && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4">
                    <h4 className="font-bold text-blue-700 dark:text-blue-400 mb-3 flex items-center gap-2">
                      <Video size={18} />
                      {tr('Produkcja')}
                    </h4>
                    <div className="space-y-2">
                      {Object.entries(program.produkcja).map(([key, value]) => {
                        if (!value) return null;
                        return (
                          <div key={key} className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">{roleLabel(key)}</span>
                            <span className="font-medium text-gray-800 dark:text-white">{value}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Atmosfera */}
                {program.atmosfera_team && Object.keys(program.atmosfera_team).some(k => program.atmosfera_team[k]) && (
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4">
                    <h4 className="font-bold text-green-700 dark:text-green-400 mb-3 flex items-center gap-2">
                      <Users size={18} />
                      {tr('Atmosfera Team')}
                    </h4>
                    <div className="space-y-2">
                      {Object.entries(program.atmosfera_team).map(([key, value]) => {
                        if (!value) return null;
                        return (
                          <div key={key} className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">{roleLabel(key)}</span>
                            <span className="font-medium text-gray-800 dark:text-white">{value}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Scena */}
                {program.scena && Object.keys(program.scena).some(k => program.scena[k]) && (
                  <div className="bg-accent-primary-lightest dark:bg-accent-primary-darkest/20 rounded-xl p-4">
                    <h4 className="font-bold text-accent-primary dark:text-accent-primary-light mb-3 flex items-center gap-2">
                      <Mic size={18} />
                      {tr('Scena')}
                    </h4>
                    <div className="space-y-2">
                      {Object.entries(program.scena).map(([key, value]) => {
                        if (!value) return null;
                        return (
                          <div key={key} className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">{roleLabel(key)}</span>
                            <span className="font-medium text-gray-800 dark:text-white">{value}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Szkółka */}
                {program.szkolka && Object.keys(program.szkolka).some(k => program.szkolka[k]) && (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-4">
                    <h4 className="font-bold text-yellow-700 dark:text-yellow-400 mb-3 flex items-center gap-2">
                      <BookOpen size={18} />
                      {tr('Szkółka Niedzielna')}
                    </h4>
                    <div className="space-y-2">
                      {Object.entries(program.szkolka).map(([key, value]) => {
                        if (!value) return null;
                        return (
                          <div key={key} className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">{roleLabel(key)}</span>
                            <span className="font-medium text-gray-800 dark:text-white">{value}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <EmptyState compact icon={Search} title={tr('Nie znaleziono programu')} />
          )}
        </div>
    </Modal>
  );
};

// ============================================
// MAIN WIDGET
// ============================================

export default function MyMinistryWidget({ upcomingMinistry, pastMinistry, userEmail }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('upcoming');
  const [modalState, setModalState] = useState({ isOpen: false, programId: null });
  const [pendingAssignments, setPendingAssignments] = useState([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [processingId, setProcessingId] = useState(null);

  const { fetchPendingAssignments, acceptAssignment, rejectAssignment } = useScheduleAssignments();

  // Pobierz oczekujące przypisania
  useEffect(() => {
    const loadPendingAssignments = async () => {
      if (!userEmail) return;
      setLoadingAssignments(true);
      const data = await fetchPendingAssignments(userEmail);
      setPendingAssignments(data);
      setLoadingAssignments(false);
    };

    loadPendingAssignments();

    // Subskrybuj zmiany
    const channel = supabase
      .channel('my-assignments')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'schedule_assignments',
        filter: `assigned_email=eq.${userEmail}`
      }, () => {
        loadPendingAssignments();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userEmail, fetchPendingAssignments]);

  // Obsługa akceptacji przypisania
  const handleAccept = async (assignmentId) => {
    setProcessingId(assignmentId);
    const result = await acceptAssignment(assignmentId);
    if (result.success) {
      setPendingAssignments(prev => prev.filter(a => a.id !== assignmentId));
    }
    setProcessingId(null);
  };

  // Obsługa odrzucenia przypisania
  const handleReject = async (assignment) => {
    setProcessingId(assignment.id);
    const result = await rejectAssignment(assignment.id);

    if (result.success && assignment.program_id) {
      // Stary grafik programu (sprzed przeniesienia na wydarzenia) — usuń imię z JSON-a.
      // Na wydarzeniu imię zostaje, a lider widzi odmowę w grafiku.
      const { data: programData } = await supabase
        .from('programs')
        .select('zespol')
        .eq('id', assignment.program_id)
        .single();

      if (programData?.zespol) {
        const zespol = { ...programData.zespol };
        const roleKey = assignment.role_key;
        const currentValue = zespol[roleKey] || '';
        const names = currentValue.split(',').map(s => s.trim()).filter(Boolean);
        const newNames = names.filter(n => n !== assignment.assigned_name);
        zespol[roleKey] = newNames.join(', ');

        await supabase
          .from('programs')
          .update({ zespol })
          .eq('id', assignment.program_id);
      }

    }
    if (result.success) setPendingAssignments(prev => prev.filter(a => a.id !== assignment.id));
    setProcessingId(null);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const options = { day: 'numeric', month: 'long', year: 'numeric' };
    return date.toLocaleDateString(appLocale(), options);
  };

  const isToday = (dateString) => {
    const today = new Date().toISOString().split('T')[0];
    return dateString === today;
  };

  const isTomorrow = (dateString) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return dateString === tomorrow.toISOString().split('T')[0];
  };

  // Wydarzenie → pełny ekran wydarzenia (plan, służby, materiały); stary program → podgląd.
  const handleItemClick = (item) => {
    if (item.kind === 'event') navigate(`/wydarzenie/${item.id}`);
    else setModalState({ isOpen: true, programId: item.id });
  };

  const currentList = activeTab === 'upcoming' ? upcomingMinistry : pastMinistry;

  const renderMinistryList = (list, isPast = false) => {
    if (!list || list.length === 0) {
      return (
        <EmptyState
          compact
          icon={isPast ? History : Calendar}
          title={isPast ? tr('Brak historii służb') : tr('Brak nadchodzących służb')}
          subtitle={isPast ? tr('Historia pojawi się po zakończeniu służb') : tr('Gdy lider wpisze Cię do grafiku, zobaczysz to tutaj')}
        />
      );
    }

    return (
      <div className="space-y-3">
        {list.slice(0, 5).map((ministry) => (
          <div
            key={`${ministry.kind || 'program'}-${ministry.id}`}
            onClick={() => handleItemClick(ministry)}
            className={`p-4 rounded-xl border transition-all hover:shadow-md cursor-pointer ${
              !isPast && isToday(ministry.date)
                ? 'bg-gradient-to-r from-accent-primary-lightest to-accent-secondary-lightest dark:from-accent-primary-darkest/20 dark:to-accent-secondary-darkest/20 border-accent-primary-lighter dark:border-accent-primary-dark'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-accent-primary-light dark:hover:border-accent-primary'
            }`}
          >
            {/* Event header */}
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                !isPast && isToday(ministry.date)
                  ? 'bg-gradient-to-br from-accent-primary-light to-accent-secondary-light'
                  : isPast
                    ? 'bg-gray-200 dark:bg-gray-600'
                    : 'bg-gray-200 dark:bg-gray-600'
              }`}>
                <Calendar size={18} className="text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className={`font-bold truncate ${
                  !isPast && isToday(ministry.date)
                    ? 'text-accent-primary dark:text-accent-primary-light'
                    : 'text-gray-800 dark:text-white'
                }`}>
                  {ministry.title}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {formatDate(ministry.date)}
                  {ministry.time ? `, ${ministry.time}` : ''}
                  {!isPast && isToday(ministry.date) && (
                    <span className="ml-2 text-accent-primary-light font-medium">• {tr('Dzisiaj')}</span>
                  )}
                  {!isPast && isTomorrow(ministry.date) && (
                    <span className="ml-2 text-accent-secondary-light font-medium">• {tr('Jutro')}</span>
                  )}
                </p>
              </div>
            </div>

            {/* Roles */}
            <div className="flex flex-wrap gap-2">
              {ministry.roles.map((role, index) => {
                const IconComponent = ROLE_ICONS[role.category] || Users;
                const colorClass = ROLE_COLORS[role.category] || 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';

                return (
                  <div
                    key={index}
                    title={role.status === 'pending' ? tr('Czeka na Twoje potwierdzenie') : role.status === 'rejected' ? tr('Odmówiono') : undefined}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${colorClass} ${role.status === 'rejected' ? 'line-through opacity-60' : ''}`}
                  >
                    <IconComponent size={12} />
                    <span>{roleLabel(role.role)}</span>
                    {role.status === 'accepted' && <Check size={12} />}
                    {role.status === 'pending' && <Clock size={12} />}
                  </div>
                );
              })}
            </div>

            {ministry.absent && !isPast && (
              <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
                {tr('Masz zgłoszoną nieobecność w tym terminie — daj znać liderowi.')}
              </p>
            )}

            {/* Notes */}
            {ministry.notes && (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 italic">
                {ministry.notes}
              </p>
            )}
          </div>
        ))}

        {list.length > 5 && (
          <p className="text-center text-sm text-gray-500 dark:text-gray-400">
            + {tr('{n} więcej', { n: list.length - 5 })}
          </p>
        )}
      </div>
    );
  };

  // Renderuj listę oczekujących przypisań
  const renderPendingAssignments = () => {
    if (loadingAssignments) {
      return <Spinner center />;
    }

    if (!pendingAssignments || pendingAssignments.length === 0) {
      return (
        <EmptyState
          compact
          icon={Inbox}
          title={tr('Brak oczekujących sugestii')}
          subtitle={tr('Gdy ktoś Cię przypisze do służby, zobaczysz to tutaj')}
        />
      );
    }

    return (
      <div className="space-y-3">
        {pendingAssignments.map((assignment) => (
          <div
            key={assignment.id}
            className="p-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0">
                  <Music size={18} className="text-amber-600 dark:text-amber-400" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-gray-800 dark:text-white truncate">
                    {assignment.role_label || roleLabel(assignment.role_key)}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {(() => {
                      const target = assignment.events || assignment.programs;
                      if (!target?.date) return tr('Nieznana data');
                      return [target.title, formatDate(target.date), assignment.events?.time ? String(assignment.events.time).slice(0, 5) : null].filter(Boolean).join(' · ');
                    })()}
                  </p>
                </div>
              </div>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              {tr('Zaproszenie od')}: <span className="font-medium">{assignment.assigned_by_name || tr('lidera')}</span>
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => handleAccept(assignment.id)}
                disabled={processingId === assignment.id}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
              >
                {processingId === assignment.id ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <CheckCircle size={16} />
                )}
                {tr('Akceptuję')}
              </button>
              <button
                onClick={() => handleReject(assignment)}
                disabled={processingId === assignment.id}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-accent-secondary-light hover:bg-accent-secondary text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
              >
                {processingId === assignment.id ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <XCircle size={16} />
                )}
                {tr('Odrzucam')}
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-700 rounded-xl">
        <button
          onClick={() => setActiveTab('upcoming')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'upcoming'
              ? 'bg-white dark:bg-gray-600 text-gray-800 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <Clock size={14} />
          <span className="hidden sm:inline">{tr('Nadchodzące')}</span>
          <span className="sm:hidden">{tr('Nowe')}</span>
          {upcomingMinistry?.length > 0 && (
            <span className="px-1.5 py-0.5 text-xs rounded-full bg-accent-primary-lighter dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light">
              {upcomingMinistry.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('suggestions')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'suggestions'
              ? 'bg-white dark:bg-gray-600 text-gray-800 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <Inbox size={14} />
          {tr('Sugestie')}
          {pendingAssignments?.length > 0 && (
            <span className="px-1.5 py-0.5 text-xs rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
              {pendingAssignments.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('past')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'past'
              ? 'bg-white dark:bg-gray-600 text-gray-800 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <History size={14} />
          {tr('Historia')}
        </button>
      </div>

      {/* Content */}
      {activeTab === 'suggestions' ? renderPendingAssignments() : renderMinistryList(currentList, activeTab === 'past')}

      {/* Modal */}
      <ProgramModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ isOpen: false, programId: null })}
        programId={modalState.programId}
      />
    </div>
  );
}
