import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, Music, Video, Users, BookOpen, Mic, History, Clock, X, Save, ChevronDown, GripVertical, Trash2, Search, Check, Inbox, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useScheduleAssignments } from '../../../hooks/useScheduleAssignments';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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
  'Scena': 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300',
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
        className={`w-full flex items-center justify-between bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:border-pink-400 transition ${compact ? 'px-2 py-1' : 'px-3 py-2'}`}
      >
        <span className="truncate">{options.find(o => o.value === value)?.label || value || 'Wybierz...'}</span>
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
                className={`w-full px-3 py-2 text-left text-sm hover:bg-pink-50 dark:hover:bg-pink-900/20 ${value === opt.value ? 'bg-pink-50 dark:bg-pink-900/30 text-pink-600' : 'text-gray-700 dark:text-gray-300'}`}
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

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-pink-600 to-orange-600 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-xl">
              <Music size={24} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Program nabożeństwa</h2>
              {program && (
                <p className="text-white/80 text-sm">
                  {new Date(program.date).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition">
            <X size={24} className="text-white" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-4 border-pink-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : program ? (
            <div className="space-y-6">
              {/* Schedule */}
              {program.schedule && program.schedule.length > 0 && (
                <div>
                  <h3 className="font-bold text-gray-800 dark:text-white mb-3 flex items-center gap-2">
                    <div className="w-1 h-5 bg-pink-500 rounded-full" />
                    Plan nabożeństwa
                  </h3>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-xl overflow-hidden">
                    {program.schedule.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-4 px-4 py-3 border-b border-gray-100 dark:border-gray-700 last:border-0">
                        <span className="w-8 h-8 rounded-lg bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 flex items-center justify-center text-sm font-bold">
                          {idx + 1}
                        </span>
                        <div className="flex-1">
                          <p className="font-medium text-gray-800 dark:text-white">{item.element}</p>
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
                      Zespół Uwielbienia
                    </h4>
                    <div className="space-y-2">
                      {Object.entries(program.zespol).map(([key, value]) => {
                        if (!value || key === 'notatki' || key === 'absencja') return null;
                        return (
                          <div key={key} className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">{ROLE_LABELS[key] || key}</span>
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
                      Produkcja
                    </h4>
                    <div className="space-y-2">
                      {Object.entries(program.produkcja).map(([key, value]) => {
                        if (!value) return null;
                        return (
                          <div key={key} className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">{ROLE_LABELS[key] || key}</span>
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
                      Atmosfera Team
                    </h4>
                    <div className="space-y-2">
                      {Object.entries(program.atmosfera_team).map(([key, value]) => {
                        if (!value) return null;
                        return (
                          <div key={key} className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">{ROLE_LABELS[key] || key}</span>
                            <span className="font-medium text-gray-800 dark:text-white">{value}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Scena */}
                {program.scena && Object.keys(program.scena).some(k => program.scena[k]) && (
                  <div className="bg-pink-50 dark:bg-pink-900/20 rounded-xl p-4">
                    <h4 className="font-bold text-pink-700 dark:text-pink-400 mb-3 flex items-center gap-2">
                      <Mic size={18} />
                      Scena
                    </h4>
                    <div className="space-y-2">
                      {Object.entries(program.scena).map(([key, value]) => {
                        if (!value) return null;
                        return (
                          <div key={key} className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">{ROLE_LABELS[key] || key}</span>
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
                      Szkółka Niedzielna
                    </h4>
                    <div className="space-y-2">
                      {Object.entries(program.szkolka).map(([key, value]) => {
                        if (!value) return null;
                        return (
                          <div key={key} className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">{ROLE_LABELS[key] || key}</span>
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
            <div className="text-center py-20 text-gray-500">
              Nie znaleziono programu
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition"
          >
            Zamknij
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// ============================================
// MAIN WIDGET
// ============================================

export default function MyMinistryWidget({ upcomingMinistry, pastMinistry, userEmail }) {
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

    if (result.success) {
      // Usuń z grafiku programu
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

      setPendingAssignments(prev => prev.filter(a => a.id !== assignment.id));
    }
    setProcessingId(null);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const options = { day: 'numeric', month: 'long', year: 'numeric' };
    return date.toLocaleDateString('pl-PL', options);
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

  const handleProgramClick = (programId) => {
    setModalState({ isOpen: true, programId });
  };

  const currentList = activeTab === 'upcoming' ? upcomingMinistry : pastMinistry;

  const renderMinistryList = (list, isPast = false) => {
    if (!list || list.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-4">
            {isPast ? <History size={32} className="text-gray-400" /> : <Calendar size={32} className="text-gray-400" />}
          </div>
          <p className="text-gray-500 dark:text-gray-400 font-medium">
            {isPast ? 'Brak historii służb' : 'Brak nadchodzących służb'}
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            {isPast ? 'Historia pojawi się po zakończeniu służb' : 'Nie jesteś przypisany do żadnego programu'}
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {list.slice(0, 5).map((ministry) => (
          <div
            key={ministry.id}
            onClick={() => handleProgramClick(ministry.id)}
            className={`p-4 rounded-xl border transition-all hover:shadow-md cursor-pointer ${
              !isPast && isToday(ministry.date)
                ? 'bg-gradient-to-r from-pink-50 to-orange-50 dark:from-pink-900/20 dark:to-orange-900/20 border-pink-200 dark:border-pink-800'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-pink-300 dark:hover:border-pink-600'
            }`}
          >
            {/* Event header */}
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                !isPast && isToday(ministry.date)
                  ? 'bg-gradient-to-br from-pink-500 to-orange-500'
                  : isPast
                    ? 'bg-gray-200 dark:bg-gray-600'
                    : 'bg-gray-200 dark:bg-gray-600'
              }`}>
                <Calendar size={18} className="text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className={`font-bold truncate ${
                  !isPast && isToday(ministry.date)
                    ? 'text-pink-600 dark:text-pink-400'
                    : 'text-gray-800 dark:text-white'
                }`}>
                  {ministry.title}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {formatDate(ministry.date)}
                  {!isPast && isToday(ministry.date) && (
                    <span className="ml-2 text-pink-500 font-medium">• Dzisiaj</span>
                  )}
                  {!isPast && isTomorrow(ministry.date) && (
                    <span className="ml-2 text-orange-500 font-medium">• Jutro</span>
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
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${colorClass}`}
                  >
                    <IconComponent size={12} />
                    <span>{ROLE_LABELS[role.role] || role.role}</span>
                  </div>
                );
              })}
            </div>

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
            + {list.length - 5} więcej
          </p>
        )}
      </div>
    );
  };

  // Renderuj listę oczekujących przypisań
  const renderPendingAssignments = () => {
    if (loadingAssignments) {
      return (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-pink-500" />
        </div>
      );
    }

    if (!pendingAssignments || pendingAssignments.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-4">
            <Inbox size={32} className="text-gray-400" />
          </div>
          <p className="text-gray-500 dark:text-gray-400 font-medium">
            Brak oczekujących sugestii
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            Gdy ktoś Cię przypisze do służby, zobaczysz to tutaj
          </p>
        </div>
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
                    {ROLE_LABELS[assignment.role_key] || assignment.role_key}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {assignment.programs?.date ? formatDate(assignment.programs.date) : 'Nieznana data'}
                  </p>
                </div>
              </div>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Przypisał/a: <span className="font-medium">{assignment.assigned_by_name || 'Nieznany'}</span>
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
                Akceptuję
              </button>
              <button
                onClick={() => handleReject(assignment)}
                disabled={processingId === assignment.id}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
              >
                {processingId === assignment.id ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <XCircle size={16} />
                )}
                Odrzucam
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
          <span className="hidden sm:inline">Nadchodzące</span>
          <span className="sm:hidden">Nowe</span>
          {upcomingMinistry?.length > 0 && (
            <span className="px-1.5 py-0.5 text-xs rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400">
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
          Sugestie
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
          Historia
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
