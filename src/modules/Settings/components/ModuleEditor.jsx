import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, AlertCircle } from 'lucide-react';
import IconPicker from './IconPicker';

export default function ModuleEditor({ module, onClose, onSave, existingKeys = [] }) {
  const isEditing = !!module?.id;

  const [form, setForm] = useState({
    key: module?.key || '',
    label: module?.label || '',
    icon: module?.icon || 'Square',
    path: module?.path || '/',
    is_enabled: module?.is_enabled ?? true
  });

  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // Automatyczne generowanie klucza i ścieżki z nazwy
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
        key: generatedKey,
        path: `/${generatedKey}`
      }));
    }
  }, [form.label, isEditing]);

  const validate = () => {
    const newErrors = {};

    if (!form.label.trim()) {
      newErrors.label = 'Nazwa modułu jest wymagana';
    }

    if (!form.key.trim()) {
      newErrors.key = 'Klucz modułu jest wymagany';
    } else if (!/^[a-z0-9_]+$/.test(form.key)) {
      newErrors.key = 'Klucz może zawierać tylko małe litery, cyfry i podkreślniki';
    } else if (!isEditing && existingKeys.includes(form.key)) {
      newErrors.key = 'Moduł z takim kluczem już istnieje';
    }

    if (!form.path.trim()) {
      newErrors.path = 'Ścieżka jest wymagana';
    } else if (!form.path.startsWith('/')) {
      newErrors.path = 'Ścieżka musi zaczynać się od /';
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
        resource_key: `module:${form.key}`
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[150]">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-lg border border-white/20 dark:border-gray-700">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h3 className="font-bold text-xl bg-gradient-to-r from-pink-600 to-orange-600 bg-clip-text text-transparent">
            {isEditing ? 'Edytuj moduł' : 'Nowy moduł'}
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {errors.submit && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
              <AlertCircle size={16} />
              {errors.submit}
            </div>
          )}

          {/* Nazwa modułu */}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5 ml-1">
              Nazwa modułu
            </label>
            <input
              type="text"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="np. Mój nowy moduł"
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

          {/* Klucz modułu */}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5 ml-1">
              Klucz (slug)
            </label>
            <input
              type="text"
              value={form.key}
              onChange={(e) => setForm({ ...form, key: e.target.value.toLowerCase() })}
              placeholder="np. moj_modul"
              disabled={isEditing && module?.is_system}
              className={`w-full px-4 py-3 border rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 transition
                ${isEditing && module?.is_system ? 'opacity-50 cursor-not-allowed' : ''}
                ${errors.key
                  ? 'border-red-300 dark:border-red-700 focus:border-red-500 focus:ring-red-500/20'
                  : 'border-gray-200 dark:border-gray-700 focus:border-pink-500 focus:ring-pink-500/20'
                } focus:outline-none focus:ring-2`}
            />
            {errors.key && (
              <p className="mt-1 text-xs text-red-500">{errors.key}</p>
            )}
            {isEditing && module?.is_system && (
              <p className="mt-1 text-xs text-gray-400">Klucz modułu systemowego nie może być zmieniony</p>
            )}
          </div>

          {/* Ścieżka URL */}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5 ml-1">
              Ścieżka URL
            </label>
            <input
              type="text"
              value={form.path}
              onChange={(e) => setForm({ ...form, path: e.target.value })}
              placeholder="np. /moj-modul"
              disabled={isEditing && module?.is_system}
              className={`w-full px-4 py-3 border rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 transition
                ${isEditing && module?.is_system ? 'opacity-50 cursor-not-allowed' : ''}
                ${errors.path
                  ? 'border-red-300 dark:border-red-700 focus:border-red-500 focus:ring-red-500/20'
                  : 'border-gray-200 dark:border-gray-700 focus:border-pink-500 focus:ring-pink-500/20'
                } focus:outline-none focus:ring-2`}
            />
            {errors.path && (
              <p className="mt-1 text-xs text-red-500">{errors.path}</p>
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
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
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
