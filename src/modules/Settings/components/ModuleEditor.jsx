import React, { useState, useEffect } from 'react';
import { Save, AlertCircle } from 'lucide-react';
import IconPicker from './IconPicker';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { supabase } from '../../../lib/supabase';
import { invalidateModuleLabels } from '../../../hooks/useModuleLabel';
import { useT } from '../../../i18n';
import { tr } from '../../../i18n';

const MODULE_COLORS = ['#6366f1', '#00c875', '#e2445c', '#fdab3d', '#a25ddc', '#0086c0', '#ff5ac4', '#579bfc', '#22c55e', '#f97316'];

export default function ModuleEditor({ module, onClose, onSave, existingKeys = [] }) {
  const t = useT();
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
  const [color, setColor] = useState('');

  // Wczytaj bieżący kolor modułu (app_settings 'module_colors') dla tego klucza.
  useEffect(() => {
    if (!module?.key) return;
    supabase.from('app_settings').select('value').eq('key', 'module_colors').maybeSingle()
      .then(({ data }) => { try { setColor(JSON.parse(data?.value || '{}')[module.key] || ''); } catch { /* noop */ } });
  }, [module?.key]);

  const saveModuleColor = async (key) => {
    let map = {};
    try {
      const { data } = await supabase.from('app_settings').select('value').eq('key', 'module_colors').maybeSingle();
      map = JSON.parse(data?.value || '{}') || {};
    } catch { map = {}; }
    if (color) map[key] = color; else delete map[key];
    await supabase.from('app_settings').upsert({ key: 'module_colors', value: JSON.stringify(map) }, { onConflict: 'key' });
    invalidateModuleLabels();
  };

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
      newErrors.label = tr('Nazwa modułu jest wymagana');
    }

    if (!form.key.trim()) {
      newErrors.key = tr('Klucz modułu jest wymagany');
    } else if (!/^[a-z0-9_]+$/.test(form.key)) {
      newErrors.key = tr('Klucz może zawierać tylko małe litery, cyfry i znak podkreślenia (_)');
    } else if (!isEditing && existingKeys.includes(form.key)) {
      newErrors.key = tr('Moduł z takim kluczem już istnieje');
    }

    if (!form.path.trim()) {
      newErrors.path = tr('Ścieżka jest wymagana');
    } else if (!form.path.startsWith('/')) {
      newErrors.path = tr('Ścieżka musi zaczynać się od /');
    }

    if (!form.icon) {
      newErrors.icon = tr('Ikona jest wymagana');
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
      await saveModuleColor(form.key);
      onClose();
    } catch (err) {
      setErrors({ submit: err.message });
    } finally {
      setSaving(false);
    }
  };

  if (!document.body) return null;

  return (
    <Modal
      isOpen
      onClose={onClose}
      closeOnBackdrop={false}
      zIndex={150}
      title={isEditing ? tr('Edytuj moduł') : tr('Nowy moduł')}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{tr('Anuluj')}</Button>
        <Button icon={Save} onClick={handleSubmit} loading={saving}>{tr('Zapisz')}</Button>
      </>}
    >
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
            {tr('Nazwa modułu')}
          </label>
          <input
            type="text"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            placeholder={t('np. Mój nowy moduł')}
            className={`w-full px-4 py-3 border rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 transition
              ${errors.label
                ? 'border-red-300 dark:border-red-700 focus:border-red-500 focus:ring-red-500/20'
                : 'border-gray-200 dark:border-gray-700 focus:border-accent-primary-light focus:ring-accent-primary-light/20'
              } focus:outline-none focus:ring-2`}
          />
          {errors.label && (
            <p className="mt-1 text-xs text-red-500">{errors.label}</p>
          )}
        </div>

        {/* Ikona */}
        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5 ml-1">
            {tr('Ikona')}
          </label>
          <IconPicker
            value={form.icon}
            onChange={(icon) => setForm({ ...form, icon })}
          />
          {errors.icon && (
            <p className="mt-1 text-xs text-red-500">{errors.icon}</p>
          )}
        </div>

        {/* Kolor akcentu */}
        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5 ml-1">
            {tr('Kolor modułu')}
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={() => setColor('')}
              className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-[10px] text-gray-400 ${!color ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-offset-gray-900 border-gray-300' : 'border-gray-200 dark:border-gray-700'}`}
              title={tr('Domyślny (gradient)')} aria-label={tr('Domyślny kolor')} aria-pressed={!color}>—</button>
            {MODULE_COLORS.map((c) => (
              <button type="button" key={c} onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full transition ${color === c ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-offset-gray-900' : ''}`}
                aria-label={tr('Kolor {c}', { c })} aria-pressed={color === c}
                style={{ backgroundColor: c }} />
            ))}
          </div>
          <p className="mt-1.5 text-xs text-gray-400">{tr('Kolor kafelka-ikony w nagłówku modułu. „—" = domyślny gradient.')}</p>
        </div>

        {/* Zaawansowane: identyfikator i adres (techniczne — schowane, UXE-13) */}
        <details className="rounded-xl border border-gray-200 dark:border-gray-700" open={errors.key || errors.path ? true : undefined}>
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
            {tr('Ustawienia zaawansowane (adres i identyfikator)')}
          </summary>
          <div className="px-4 pb-4 space-y-5">
            {/* Klucz modułu */}
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5 ml-1">
                {tr('Identyfikator')}
              </label>
              <input
                type="text"
                value={form.key}
                onChange={(e) => setForm({ ...form, key: e.target.value.toLowerCase() })}
                placeholder={tr('np. moj_modul')}
                disabled={isEditing && module?.is_system}
                className={`w-full px-4 py-3 border rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 transition
                  ${isEditing && module?.is_system ? 'opacity-50 cursor-not-allowed' : ''}
                  ${errors.key
                    ? 'border-red-300 dark:border-red-700 focus:border-red-500 focus:ring-red-500/20'
                    : 'border-gray-200 dark:border-gray-700 focus:border-accent-primary-light focus:ring-accent-primary-light/20'
                  } focus:outline-none focus:ring-2`}
              />
              {errors.key && (
                <p className="mt-1 text-xs text-red-500">{errors.key}</p>
              )}
              {isEditing && module?.is_system && (
                <p className="mt-1 text-xs text-gray-400">{t('Klucz modułu systemowego nie może być zmieniony')}</p>
              )}
            </div>

            {/* Ścieżka URL */}
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5 ml-1">
                {tr('Adres w aplikacji')}
              </label>
              <input
                type="text"
                value={form.path}
                onChange={(e) => setForm({ ...form, path: e.target.value })}
                placeholder={tr('np. /moj-modul')}
                disabled={isEditing && module?.is_system}
                className={`w-full px-4 py-3 border rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 transition
                  ${isEditing && module?.is_system ? 'opacity-50 cursor-not-allowed' : ''}
                  ${errors.path
                    ? 'border-red-300 dark:border-red-700 focus:border-red-500 focus:ring-red-500/20'
                    : 'border-gray-200 dark:border-gray-700 focus:border-accent-primary-light focus:ring-accent-primary-light/20'
                  } focus:outline-none focus:ring-2`}
              />
              {errors.path && (
                <p className="mt-1 text-xs text-red-500">{errors.path}</p>
              )}
            </div>

          </div>
        </details>
      </div>
    </Modal>
  );
}
