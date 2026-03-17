import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, AlertCircle, Calendar, CheckSquare, DollarSign, Users, MessageSquare, Layers, CalendarDays, UserCog, FolderOpen } from 'lucide-react';
import IconPicker from './IconPicker';

// Dostępne typy komponentów
const COMPONENT_TYPES = [
  { key: 'empty', label: 'Pusta zakładka', icon: Layers, description: 'Pusta strona do przyszłej rozbudowy' },
  { key: 'events', label: 'Wydarzenia', icon: Calendar, description: 'Lista wydarzeń z kalendarzem' },
  { key: 'tasks', label: 'Zadania', icon: CheckSquare, description: 'Tablica kanban z zadaniami' },
  { key: 'finance', label: 'Finanse', icon: DollarSign, description: 'Przychody i wydatki' },
  { key: 'members', label: 'Członkowie', icon: Users, description: 'Lista członków zespołu' },
  { key: 'wall', label: 'Tablica', icon: MessageSquare, description: 'Tablica z wpisami i komentarzami' },
  { key: 'schedule', label: 'Grafik', icon: CalendarDays, description: 'Harmonogram służb na wydarzenia' },
  { key: 'duty', label: 'Służby', icon: UserCog, description: 'Zarządzanie służbami i przypisaniami' },
  { key: 'materials', label: 'Materiały', icon: FolderOpen, description: 'Pliki i dokumenty do pobrania' }
];

export default function TabEditor({ tab, moduleId, moduleName, onClose, onSave, existingKeys = [] }) {
  const isEditing = !!tab?.id;

  const [form, setForm] = useState({
    key: tab?.key || '',
    label: tab?.label || '',
    icon: tab?.icon || 'Square',
    component_type: tab?.component_type || 'empty'
  });

  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // Automatyczne generowanie klucza z nazwy
  useEffect(() => {
    if (!isEditing && form.label && !form.key) {
      const generatedKey = form.label
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');

      setForm(prev => ({
        ...prev,
        key: generatedKey
      }));
    }
  }, [form.label, isEditing]);

  // Automatycznie ustaw ikonę na podstawie typu komponentu
  useEffect(() => {
    if (!isEditing) {
      const iconMap = {
        events: 'Calendar',
        tasks: 'CheckSquare',
        finance: 'DollarSign',
        members: 'Users',
        wall: 'MessageSquare',
        schedule: 'CalendarDays',
        duty: 'UserCog',
        materials: 'FolderOpen'
      };
      if (iconMap[form.component_type]) {
        setForm(prev => ({ ...prev, icon: iconMap[form.component_type] }));
      }
    }
  }, [form.component_type, isEditing]);

  const validate = () => {
    const newErrors = {};

    if (!form.label.trim()) {
      newErrors.label = 'Nazwa zakładki jest wymagana';
    }

    if (!form.key.trim()) {
      newErrors.key = 'Klucz zakładki jest wymagany';
    } else if (!/^[a-z0-9_]+$/.test(form.key)) {
      newErrors.key = 'Klucz może zawierać tylko małe litery, cyfry i podkreślniki';
    } else if (!isEditing && existingKeys.includes(form.key)) {
      newErrors.key = 'Zakładka z takim kluczem już istnieje';
    }

    if (!form.icon) {
      newErrors.icon = 'Ikona jest wymagana';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setSaving(true);
    try {
      await onSave({
        ...form,
        module_id: moduleId
      });
      onClose();
    } catch (err) {
      setErrors({ submit: err.message });
    } finally {
      setSaving(false);
    }
  };

  if (!document.body) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[160]">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-lg border border-white/20 dark:border-gray-700 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center shrink-0">
          <h3 className="font-bold text-xl bg-gradient-to-r from-pink-600 to-orange-600 bg-clip-text text-transparent">
            {isEditing ? 'Edytuj zakładkę' : 'Nowa zakładka'}
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {errors.submit && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
              <AlertCircle size={16} />
              {errors.submit}
            </div>
          )}

          {/* Typ komponentu */}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 ml-1">
              Typ zawartości
            </label>
            <div className="grid grid-cols-2 gap-2">
              {COMPONENT_TYPES.map(comp => {
                const CompIcon = comp.icon;
                const isSelected = form.component_type === comp.key;
                return (
                  <button
                    key={comp.key}
                    type="button"
                    onClick={() => setForm({ ...form, component_type: comp.key })}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      isSelected
                        ? 'border-pink-500 bg-pink-50 dark:bg-pink-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-pink-300 dark:hover:border-pink-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <CompIcon size={18} className={isSelected ? 'text-pink-600' : 'text-gray-400'} />
                      <span className={`font-medium text-sm ${isSelected ? 'text-pink-700 dark:text-pink-300' : 'text-gray-700 dark:text-gray-300'}`}>
                        {comp.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{comp.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Nazwa zakładki */}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5 ml-1">
              Nazwa zakładki
            </label>
            <input
              type="text"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="np. Finanse"
              className={`w-full px-4 py-3 border rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 transition
                ${errors.label
                  ? 'border-red-300 dark:border-red-700 focus:border-red-500 focus:ring-red-500/20'
                  : 'border-gray-200 dark:border-gray-700 focus:border-pink-500 focus:ring-pink-500/20'
                } focus:outline-none focus:ring-2`}
            />
            {errors.label && (
              <p className="mt-1 text-xs text-red-500">{errors.label}</p>
            )}
          </div>

          {/* Klucz zakładki */}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5 ml-1">
              Klucz (slug)
            </label>
            <input
              type="text"
              value={form.key}
              onChange={(e) => setForm({ ...form, key: e.target.value.toLowerCase() })}
              placeholder="np. finanse"
              disabled={isEditing && tab?.is_system}
              className={`w-full px-4 py-3 border rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 transition
                ${isEditing && tab?.is_system ? 'opacity-50 cursor-not-allowed' : ''}
                ${errors.key
                  ? 'border-red-300 dark:border-red-700 focus:border-red-500 focus:ring-red-500/20'
                  : 'border-gray-200 dark:border-gray-700 focus:border-pink-500 focus:ring-pink-500/20'
                } focus:outline-none focus:ring-2`}
            />
            {errors.key && (
              <p className="mt-1 text-xs text-red-500">{errors.key}</p>
            )}
            {isEditing && tab?.is_system && (
              <p className="mt-1 text-xs text-gray-400">Klucz zakładki systemowej nie może być zmieniony</p>
            )}
          </div>

          {/* Ikona */}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5 ml-1">
              Ikona
            </label>
            <IconPicker
              value={form.icon}
              onChange={(icon) => setForm({ ...form, icon })}
            />
            {errors.icon && (
              <p className="mt-1 text-xs text-red-500">{errors.icon}</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition font-medium"
          >
            Anuluj
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-5 py-2.5 bg-gradient-to-r from-pink-600 to-orange-600 text-white rounded-xl hover:shadow-lg hover:shadow-pink-500/30 transition font-medium flex items-center gap-2 disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? 'Zapisuję...' : 'Zapisz'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
