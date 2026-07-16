import React from 'react';
import { Palette, Moon, Image as ImageIcon, Upload } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { SettingsCard, SettingRow, Toggle, SelectSetting } from './SettingsUI';
import ColorPresetPicker from './ColorPresetPicker';
import { useT } from '../../../i18n';

// Wygląd i personalizacja: logo, motyw kolorystyczny, tryb ciemny, gęstość.
export default function AppearanceSettings({ get, save, logoUrl, onLogoUpload }) {
  const t = useT();
  return (
    <div className="max-w-3xl">
      <SettingsCard title="Logo organizacji" description="Wyświetlane na ekranie logowania i w menu." icon={ImageIcon}>
        <div className="flex gap-6 items-center">
          <div className="w-32 h-32 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-2xl flex items-center justify-center bg-gray-50 dark:bg-gray-700 relative overflow-hidden group shrink-0">
            {logoUrl
              ? <img src={logoUrl} alt="Logo" className="w-full h-full object-contain p-3" />
              : <ImageIcon size={32} className="text-gray-300 dark:text-gray-500" />}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
              <button onClick={() => document.getElementById('logo-upload-appearance').click()} className="bg-white text-gray-900 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow">
                <Upload size={14} /> Zmień
              </button>
            </div>
            <input id="logo-upload-appearance" type="file" className="hidden" accept="image/*" onChange={onLogoUpload} />
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            <p>{t('Zalecany format: PNG lub SVG z przezroczystym tłem.')}</p>
            <p className="mt-1">Kwadratowe, min. 256×256 px.</p>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Motyw kolorystyczny" description="Kolor przewodni aplikacji." icon={Palette}>
        <ColorPresetPicker currentPreset={get('color_preset') || 'pink-orange'} />
      </SettingsCard>

      <SettingsCard title="Interfejs" description="Domyślny wygląd dla nowych użytkowników." icon={Moon}>
        <SettingRow label="Domyślny motyw" hint="Jasny, ciemny lub zgodny z systemem">
          <SelectSetting
            value={get('appearance_theme') || 'system'}
            onChange={(v) => save('appearance_theme', v)}
            options={[
              { value: 'system', label: 'Jak w systemie' },
              { value: 'light', label: 'Jasny' },
              { value: 'dark', label: 'Ciemny' },
            ]}
          />
        </SettingRow>
        <SettingRow label="Kompaktowy widok" hint="Mniejsze odstępy, więcej treści na ekranie" last>
          <Toggle checked={(get('appearance_compact') ?? 'false') === 'true'} onChange={(v) => save('appearance_compact', String(v))} />
        </SettingRow>
      </SettingsCard>
    </div>
  );
}
