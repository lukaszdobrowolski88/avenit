import React, { useState } from 'react';
import { Check, Palette } from 'lucide-react';
import { COLOR_PRESETS, applyColorPreset } from '../../../lib/colorPresets';
import { supabase } from '../../../lib/supabase';

export default function ColorPresetPicker({ currentPreset: initialPreset }) {
  const [currentPreset, setCurrentPreset] = useState(initialPreset || 'pink-orange');
  const [saving, setSaving] = useState(false);

  const handleSelect = async (key) => {
    applyColorPreset(key);
    setCurrentPreset(key);
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

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary flex items-center justify-center">
          <Palette size={20} className="text-white" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Kolorystyka</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Wybierz schemat kolorów aplikacji</p>
        </div>
      </div>

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
                style={{
                  background: `linear-gradient(135deg, ${preset.preview[0]}, ${preset.preview[1]})`
                }}
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
      </div>
    </div>
  );
}
