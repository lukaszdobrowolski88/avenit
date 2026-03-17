import React, { useState, useEffect, useRef } from 'react';
import { CalendarX, Plus, X, Trash2, ChevronDown } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

// ============================================
// CUSTOM DROPDOWN COMPONENT
// ============================================

function CustomSelect({ value, onChange, options, placeholder }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(o => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500 transition-colors"
      >
        <span className={selectedOption ? '' : 'text-gray-400 dark:text-gray-500'}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown size={18} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg max-h-48 overflow-y-auto">
          <button
            type="button"
            onClick={() => { onChange(''); setIsOpen(false); }}
            className="w-full px-3 py-2 text-left text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm"
          >
            {placeholder}
          </button>
          {options.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => { onChange(option.value); setIsOpen(false); }}
              className={`w-full px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 text-sm ${
                value === option.value
                  ? 'bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400'
                  : 'text-gray-700 dark:text-gray-300'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// MAIN WIDGET
// ============================================

// Funkcja do oznaczania użytkownika jako nieobecnego w grafiku programu
const markUserAsAbsentInSchedule = async (program, userName) => {
  if (!userName || !program) return;

  const updates = {};
  let hasChanges = false;

  // Lista pól JSONB z kluczem absencja
  const fieldsWithAbsence = [
    { field: 'produkcja', absenceKey: 'absencja' },
    { field: 'zespol', absenceKey: 'absencja' },
    { field: 'atmosfera_team', absenceKey: 'absencja' },
    { field: 'szkolka', absenceKey: 'absencja' },
    { field: 'scena', absenceKey: 'absencja' },
  ];

  for (const { field, absenceKey } of fieldsWithAbsence) {
    const fieldData = program[field];
    if (!fieldData || typeof fieldData !== 'object') continue;

    const updatedField = { ...fieldData };
    const currentAbsence = updatedField[absenceKey] || '';
    const absentList = currentAbsence.split(',').map(s => s.trim()).filter(Boolean);

    // Sprawdź czy użytkownik już jest na liście nieobecności
    const isAlreadyAbsent = absentList.some(name =>
      name.toLowerCase() === userName.toLowerCase()
    );

    if (!isAlreadyAbsent) {
      // Dodaj użytkownika do listy nieobecności
      absentList.push(userName);
      updatedField[absenceKey] = absentList.join(', ');
      updates[field] = updatedField;
      hasChanges = true;
    }
  }

  // Zaktualizuj program jeśli są zmiany
  if (hasChanges) {
    const { error } = await supabase
      .from('programs')
      .update(updates)
      .eq('id', program.id);

    if (error) {
      console.error('Error updating program schedule:', error);
    }
  }
};

// Funkcja do przywracania użytkownika w grafiku programu (przy usuwaniu nieobecności)
const restoreUserInSchedule = async (programId, userName) => {
  if (!userName || !programId) return;

  // Pobierz aktualny program
  const { data: program, error: fetchError } = await supabase
    .from('programs')
    .select('*')
    .eq('id', programId)
    .single();

  if (fetchError || !program) return;

  const updates = {};
  let hasChanges = false;

  // Lista pól JSONB z kluczem absencja
  const fieldsWithAbsence = [
    { field: 'produkcja', absenceKey: 'absencja' },
    { field: 'zespol', absenceKey: 'absencja' },
    { field: 'atmosfera_team', absenceKey: 'absencja' },
    { field: 'szkolka', absenceKey: 'absencja' },
    { field: 'scena', absenceKey: 'absencja' },
  ];

  for (const { field, absenceKey } of fieldsWithAbsence) {
    const fieldData = program[field];
    if (!fieldData || typeof fieldData !== 'object') continue;

    const updatedField = { ...fieldData };
    const currentAbsence = updatedField[absenceKey] || '';
    const absentList = currentAbsence.split(',').map(s => s.trim()).filter(Boolean);

    // Usuń użytkownika z listy nieobecności
    const filteredList = absentList.filter(name =>
      name.toLowerCase() !== userName.toLowerCase()
    );

    if (filteredList.length !== absentList.length) {
      updatedField[absenceKey] = filteredList.join(', ');
      updates[field] = updatedField;
      hasChanges = true;
    }
  }

  if (hasChanges) {
    const { error } = await supabase
      .from('programs')
      .update(updates)
      .eq('id', programId);

    if (error) {
      console.error('Error restoring user in schedule:', error);
    }
  }
};

export default function MyAbsencesWidget({ absences, programs = [], userEmail, userName, onRefresh }) {
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({
    program_id: '',
    note: '',
  });
  const [saving, setSaving] = useState(false);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const formatEventLabel = (program) => {
    const title = program.title || 'Nabożeństwo niedzielne';
    const date = formatDate(program.date);
    return `${title}, ${date}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.program_id) return;

    const selectedProgram = programs.find(p => p.id.toString() === formData.program_id);
    if (!selectedProgram) return;

    setSaving(true);
    try {
      // 1. Dodaj nieobecność do tabeli user_absences (od razu zatwierdzona)
      const { error: absenceError } = await supabase
        .from('user_absences')
        .insert({
          user_email: userEmail,
          user_name: userName,
          absence_date: selectedProgram.date,
          program_id: parseInt(formData.program_id),
          note: formData.note || null,
          status: 'approved',
        });

      if (absenceError) throw absenceError;

      // 2. Zaktualizuj grafik programu - oznacz użytkownika jako nieobecnego
      await markUserAsAbsentInSchedule(selectedProgram, userName);

      setFormData({ program_id: '', note: '' });
      setIsAdding(false);
      onRefresh?.();
    } catch (error) {
      console.error('Error adding absence:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (absence) => {
    if (!confirm('Czy na pewno chcesz usunąć tę nieobecność?')) return;

    try {
      // 1. Usuń nieobecność z bazy
      await supabase.from('user_absences').delete().eq('id', absence.id);

      // 2. Przywróć użytkownika w grafiku (usuń prefix [NIEOBECNY])
      if (absence.program_id) {
        await restoreUserInSchedule(absence.program_id, userName);
      }

      onRefresh?.();
    } catch (error) {
      console.error('Error deleting absence:', error);
    }
  };

  // Pokaż wszystkie nadchodzące wydarzenia do wyboru
  const programOptions = programs.map(p => ({
    value: p.id.toString(),
    label: formatEventLabel(p),
  }));

  return (
    <div className="space-y-4">
      {/* Add button */}
      {!isAdding && (
        <button
          onClick={() => setIsAdding(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-xl text-gray-500 dark:text-gray-400 hover:border-pink-300 dark:hover:border-pink-600 hover:text-pink-500 dark:hover:text-pink-400 transition-colors"
        >
          <Plus size={18} />
          <span className="font-medium">Zgłoś nieobecność</span>
        </button>
      )}

      {/* Add form */}
      {isAdding && (
        <form onSubmit={handleSubmit} className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 space-y-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium text-gray-800 dark:text-white">Zgłoś nieobecność</h4>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
            >
              <X size={18} />
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Wydarzenie *
            </label>
            <CustomSelect
              value={formData.program_id}
              onChange={(val) => setFormData(prev => ({ ...prev, program_id: val }))}
              options={programOptions}
              placeholder="Wybierz wydarzenie"
            />
            {programOptions.length === 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Brak nadchodzących wydarzeń
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Notatka (opcjonalnie)
            </label>
            <textarea
              value={formData.note}
              onChange={(e) => setFormData(prev => ({ ...prev, note: e.target.value }))}
              placeholder="Powód nieobecności..."
              rows={2}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500 resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={saving || !formData.program_id}
            className="w-full py-2.5 bg-gradient-to-r from-pink-500 to-orange-500 text-white rounded-xl font-medium hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Zapisywanie...' : 'Zgłoś nieobecność'}
          </button>
        </form>
      )}

      {/* Absences list */}
      {absences && absences.length > 0 ? (
        <div className="space-y-2">
          {absences.slice(0, 5).map(absence => {
            // Znajdź program dla nieobecności, żeby wyświetlić tytuł
            const program = programs.find(p => p.id === absence.program_id);
            const eventTitle = program?.title || 'Nabożeństwo niedzielne';
            const isFuture = new Date(absence.absence_date) >= new Date(new Date().toISOString().split('T')[0]);

            return (
              <div
                key={absence.id}
                className={`flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl border ${
                  isFuture
                    ? 'border-gray-200 dark:border-gray-700'
                    : 'border-gray-100 dark:border-gray-800 opacity-60'
                }`}
              >
                <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                  <CalendarX size={18} className="text-gray-500 dark:text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 dark:text-white truncate">
                    {eventTitle}, {formatDate(absence.absence_date)}
                  </p>
                  {absence.note && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {absence.note}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {/* Możliwość usunięcia tylko dla przyszłych nieobecności */}
                  {isFuture && (
                    <button
                      onClick={() => handleDelete(absence)}
                      className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : !isAdding && (
        <div className="text-center py-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Brak zgłoszonych nieobecności
          </p>
        </div>
      )}

      {absences && absences.length > 5 && (
        <p className="text-center text-sm text-gray-500 dark:text-gray-400">
          + {absences.length - 5} więcej nieobecności
        </p>
      )}
    </div>
  );
}
