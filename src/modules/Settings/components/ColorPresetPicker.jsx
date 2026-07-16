import React, { useState, useEffect } from 'react';
import { Check, Palette, Plus, Trash2 } from 'lucide-react';
import { COLOR_PRESETS, applyColorPreset, applyCustomColors, getCustomPreset, generateShades } from '../../../lib/colorPresets';
import { supabase } from '../../../lib/supabase';
import { useT } from '../../../i18n';

export default function ColorPresetPicker({ currentPreset: initialPreset }) {
  const t = useT();
  const [currentPreset, setCurrentPreset] = useState(initialPreset || 'pink-orange');
  const [saving, setSaving] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [customPrimary, setCustomPrimary] = useState('#3b82f6');
  const [customSecondary, setCustomSecondary] = useState('#8b5cf6');
  const [customPresets, setCustomPresets] = useState([]);
  const [customLabel, setCustomLabel] = useState('');

  // Załaduj własne presety z bazy
  useEffect(() => {
    supabase.from('app_settings').select('key, value')
      .like('key', 'custom_color_preset_%')
      .then(({ data }) => {
        if (data) {
          const presets = data.map(s => {
            try { return { key: s.key, ...JSON.parse(s.value) }; }
            catch { return null; }
          }).filter(Boolean);
          setCustomPresets(presets);
        }
      });

    // Jeśli aktywny preset to custom, załaduj kolory
    if (initialPreset === 'custom') {
      const custom = getCustomPreset();
      if (custom) {
        setCustomPrimary(custom.primary);
        setCustomSecondary(custom.secondary);
      }
    } else if (initialPreset?.startsWith('custom_color_preset_')) {
      supabase.from('app_settings').select('value').eq('key', initialPreset).single()
        .then(({ data }) => {
          if (data) {
            try {
              const parsed = JSON.parse(data.value);
              setCustomPrimary(parsed.primary);
              setCustomSecondary(parsed.secondary);
            } catch {}
          }
        });
    }
  }, []);

  const handleSelect = async (key) => {
    if (key.startsWith('custom_color_preset_')) {
      const preset = customPresets.find(p => p.key === key);
      if (preset) {
        applyCustomColors(preset.primary, preset.secondary);
        setCurrentPreset(key);
      }
    } else {
      applyColorPreset(key);
      setCurrentPreset(key);
    }
    setSaving(true);
    try {
      await supabase.from('app_settings').upsert(
        { key: 'color_preset', value: key, description: 'Preset kolorów aplikacji' },
        { onConflict: 'key' }
      );
    } catch (err) {
      console.error('Error saving color preset:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCustom = async () => {
    const id = `custom_color_preset_${Date.now()}`;
    const label = customLabel.trim() || 'Własny';
    const value = JSON.stringify({ primary: customPrimary, secondary: customSecondary, label });

    setSaving(true);
    try {
      await supabase.from('app_settings').upsert(
        { key: id, value, description: `Własny preset: ${label}` },
        { onConflict: 'key' }
      );
      const newPreset = { key: id, primary: customPrimary, secondary: customSecondary, label };
      setCustomPresets(prev => [...prev, newPreset]);

      // Aktywuj nowy preset
      applyCustomColors(customPrimary, customSecondary);
      setCurrentPreset(id);
      await supabase.from('app_settings').upsert(
        { key: 'color_preset', value: id, description: 'Preset kolorów aplikacji' },
        { onConflict: 'key' }
      );

      setShowEditor(false);
      setCustomLabel('');
    } catch (err) {
      console.error('Error saving custom preset:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCustom = async (key) => {
    setSaving(true);
    try {
      await supabase.from('app_settings').delete().eq('key', key);
      setCustomPresets(prev => prev.filter(p => p.key !== key));
      if (currentPreset === key) {
        handleSelect('pink-orange');
      }
    } catch (err) {
      console.error('Error deleting preset:', err);
    } finally {
      setSaving(false);
    }
  };

  // Live preview przy zmianie kolorów w edytorze
  const handlePrimaryChange = (hex) => {
    setCustomPrimary(hex);
    applyCustomColors(hex, customSecondary);
  };

  const handleSecondaryChange = (hex) => {
    setCustomSecondary(hex);
    applyCustomColors(customPrimary, hex);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary flex items-center justify-center">
            <Palette size={20} className="text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Kolorystyka</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('Wybierz lub stwórz schemat kolorów')}</p>
          </div>
        </div>
        <button
          onClick={() => setShowEditor(!showEditor)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition text-sm font-medium"
        >
          <Plus size={16} />
          Własny
        </button>
      </div>

      {/* Edytor własnego presetu */}
      {showEditor && (
        <div className="mb-6 p-5 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600">
          <h4 className="font-semibold text-gray-800 dark:text-white mb-4">{t('Nowy schemat kolorów')}</h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">{t('Kolor główny')}</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={customPrimary}
                  onChange={(e) => handlePrimaryChange(e.target.value)}
                  className="w-12 h-12 rounded-lg cursor-pointer border-2 border-gray-200 dark:border-gray-600 p-0.5"
                />
                <input
                  type="text"
                  value={customPrimary}
                  onChange={(e) => handlePrimaryChange(e.target.value)}
                  className="flex-1 !py-2 !px-3 text-sm font-mono"
                  placeholder="#3b82f6"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Kolor dodatkowy</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={customSecondary}
                  onChange={(e) => handleSecondaryChange(e.target.value)}
                  className="w-12 h-12 rounded-lg cursor-pointer border-2 border-gray-200 dark:border-gray-600 p-0.5"
                />
                <input
                  type="text"
                  value={customSecondary}
                  onChange={(e) => handleSecondaryChange(e.target.value)}
                  className="flex-1 !py-2 !px-3 text-sm font-mono"
                  placeholder="#8b5cf6"
                />
              </div>
            </div>
          </div>

          {/* Podgląd gradientu */}
          <div className="mb-4">
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">{t('Podgląd')}</label>
            <div className="h-14 rounded-xl shadow-inner" style={{ background: `linear-gradient(135deg, ${customPrimary}, ${customSecondary})` }} />
          </div>

          {/* Podgląd generowanych odcieni */}
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t('Odcienie główne')}</label>
              <div className="flex gap-1">
                {['lightest', 'lighter', 'light', 'DEFAULT', 'dark', 'darkest'].map(shade => {
                  const shades = generateShades(customPrimary);
                  const rgb = shades[shade];
                  return <div key={shade} className="flex-1 h-6 rounded" style={{ backgroundColor: `rgb(${rgb})` }} title={shade} />;
                })}
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Odcienie dodatkowe</label>
              <div className="flex gap-1">
                {['lightest', 'lighter', 'light', 'DEFAULT', 'dark', 'darkest'].map(shade => {
                  const shades = generateShades(customSecondary);
                  const rgb = shades[shade];
                  return <div key={shade} className="flex-1 h-6 rounded" style={{ backgroundColor: `rgb(${rgb})` }} title={shade} />;
                })}
              </div>
            </div>
          </div>

          {/* Nazwa i zapis */}
          <div className="flex gap-3">
            <input
              type="text"
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              placeholder={t('Nazwa presetu (np. Mój kościół)')}
              className="flex-1 !py-2 !px-3 text-sm"
            />
            <button
              onClick={handleSaveCustom}
              disabled={saving}
              className="px-5 py-2 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-xl hover:shadow-lg transition font-bold text-sm"
            >
              Zapisz
            </button>
            <button
              onClick={() => {
                setShowEditor(false);
                // Przywróć aktywny preset
                if (currentPreset !== 'custom') {
                  const p = customPresets.find(cp => cp.key === currentPreset);
                  if (p) applyCustomColors(p.primary, p.secondary);
                  else applyColorPreset(currentPreset);
                }
              }}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition text-sm"
            >
              Anuluj
            </button>
          </div>
        </div>
      )}

      {/* Wbudowane presety */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {Object.entries(COLOR_PRESETS).map(([key, preset]) => {
          const isActive = currentPreset === key;
          return (
            <button
              key={key}
              onClick={() => handleSelect(key)}
              disabled={saving}
              className={`relative group rounded-xl border-2 p-4 transition-all ${
                isActive
                  ? 'border-accent-primary shadow-lg scale-[1.02]'
                  : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 hover:shadow-md'
              }`}
            >
              {isActive && (
                <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-accent-primary flex items-center justify-center shadow-md">
                  <Check size={14} className="text-white" />
                </div>
              )}
              <div
                className="w-full h-12 rounded-lg mb-3 shadow-sm"
                style={{ background: `linear-gradient(135deg, ${preset.preview[0]}, ${preset.preview[1]})` }}
              />
              <div className="flex gap-1.5 mb-2">
                <div className="w-6 h-6 rounded-full shadow-inner" style={{ backgroundColor: preset.preview[0] }} />
                <div className="w-6 h-6 rounded-full shadow-inner" style={{ backgroundColor: preset.preview[1] }} />
              </div>
              <p className={`text-xs font-medium ${isActive ? 'text-accent-primary' : 'text-gray-600 dark:text-gray-300'}`}>
                {preset.label}
              </p>
            </button>
          );
        })}

        {/* Własne presety */}
        {customPresets.map((preset) => {
          const isActive = currentPreset === preset.key;
          return (
            <div key={preset.key} className="relative">
              <button
                onClick={() => handleSelect(preset.key)}
                disabled={saving}
                className={`w-full rounded-xl border-2 p-4 transition-all ${
                  isActive
                    ? 'border-accent-primary shadow-lg scale-[1.02]'
                    : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 hover:shadow-md'
                }`}
              >
                {isActive && (
                  <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-accent-primary flex items-center justify-center shadow-md z-10">
                    <Check size={14} className="text-white" />
                  </div>
                )}
                <div
                  className="w-full h-12 rounded-lg mb-3 shadow-sm"
                  style={{ background: `linear-gradient(135deg, ${preset.primary}, ${preset.secondary})` }}
                />
                <div className="flex gap-1.5 mb-2">
                  <div className="w-6 h-6 rounded-full shadow-inner" style={{ backgroundColor: preset.primary }} />
                  <div className="w-6 h-6 rounded-full shadow-inner" style={{ backgroundColor: preset.secondary }} />
                </div>
                <p className={`text-xs font-medium ${isActive ? 'text-accent-primary' : 'text-gray-600 dark:text-gray-300'}`}>
                  {preset.label}
                </p>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteCustom(preset.key); }}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-red-100 dark:bg-red-900/30 text-red-500 dark:text-red-400 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:!opacity-100 hover:bg-red-200 dark:hover:bg-red-900/50 transition"
                title={t('Usuń preset')}
              >
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
