import React from 'react';
import { Palette, Moon, Image as ImageIcon, Upload, Type, PaintBucket, Ruler, Frame, PanelLeft, Check } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { SettingsCard, SettingRow, Toggle, SelectSetting } from './SettingsUI';
import ColorPresetPicker from './ColorPresetPicker';
import {
  FONT_OPTIONS, BACKGROUND_OPTIONS, SCALE_OPTIONS, RADIUS_OPTIONS, SIDEBAR_OPTIONS,
  applyFont, applyBackground, applyScale, applyRadius, applySidebar,
  getFont, getBackground, getScale, getRadius, getSidebar, getFontUrl,
} from '../../../lib/appearance';
import { useT } from '../../../i18n';
import { tr } from '../../../i18n';

// Karta wyboru z ramką akcentu + znacznikiem po zaznaczeniu (wspólny wygląd dla pickerów).
function PickCard({ selected, onClick, children, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative text-left rounded-2xl border-2 p-3 transition-all ${
        selected
          ? 'border-accent-primary ring-2 ring-accent-primary/30 bg-accent-primary-lightest/40 dark:bg-gray-800'
          : 'border-gray-200 dark:border-gray-700 hover:border-accent-primary-light/60 bg-white dark:bg-gray-900'
      } ${className}`}
    >
      {selected && (
        <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-accent-primary text-white flex items-center justify-center shadow">
          <Check size={14} strokeWidth={3} />
        </span>
      )}
      {children}
    </button>
  );
}

// Mini-podgląd okna aplikacji dla stylu paska bocznego.
function SidebarPreview({ variant }) {
  const strip =
    variant === 'dark' ? 'bg-gray-800'
    : variant === 'accent' ? 'bg-gradient-to-b from-accent-primary to-accent-secondary'
    : 'bg-white dark:bg-gray-700 border-r border-gray-200 dark:border-gray-600';
  return (
    <div className="h-16 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 flex mb-2">
      <div className={`w-1/3 ${strip} flex flex-col gap-1 p-1.5`}>
        <span className="h-1.5 rounded-full bg-white/70" />
        <span className="h-1.5 rounded-full bg-white/40" />
        <span className="h-1.5 rounded-full bg-white/40" />
      </div>
      <div className="flex-1 bg-gray-50 dark:bg-gray-900" />
    </div>
  );
}

// Wygląd i personalizacja: logo, kolory, czcionka (+własna), tło, rozmiar, zaokrąglenie, pasek.
export default function AppearanceSettings({ get, save, logoUrl, onLogoUpload, onFontUpload }) {
  const t = useT();

  // Wartości: najpierw org-wide (app_settings), potem lokalny wybór (localStorage) jako fallback.
  const font = get('ui_font') || getFont();
  const bg = get('ui_bg') || getBackground();
  const scale = get('ui_scale') || getScale();
  const radius = get('ui_radius') || getRadius();
  const sidebar = get('ui_sidebar') || getSidebar();
  const hasCustomFont = !!(get('custom_font_url') || getFontUrl());

  const pickFont = (k) => { applyFont(k); save('ui_font', k); };
  const pickBg = (k) => { applyBackground(k); save('ui_bg', k); };
  const pickScale = (k) => { applyScale(k); save('ui_scale', k); };
  const pickRadius = (k) => { applyRadius(k); save('ui_radius', k); };
  const pickSidebar = (k) => { applySidebar(k); save('ui_sidebar', k); };

  // Karta 'custom' widoczna tylko, gdy organizacja wgrała czcionkę.
  const fontEntries = Object.entries(FONT_OPTIONS).filter(([k]) => k !== 'custom' || hasCustomFont);

  return (
    <div className="max-w-3xl">
      <SettingsCard title="Logo organizacji" description={tr('Wyświetlane na ekranie logowania i w menu.')} icon={ImageIcon}>
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

      {/* --- CZCIONKA --- */}
      <SettingsCard title="Czcionka" description={tr('Krój pisma w całej aplikacji.')} icon={Type}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {fontEntries.map(([key, opt]) => (
            <PickCard key={key} selected={font === key} onClick={() => pickFont(key)}>
              <div className="text-3xl leading-none text-gray-900 dark:text-white mb-1.5" style={{ fontFamily: opt.stack }}>Aa</div>
              <div className="text-xs font-medium text-gray-600 dark:text-gray-300 truncate" style={{ fontFamily: opt.stack }}>{opt.label}</div>
            </PickCard>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => document.getElementById('font-upload-appearance').click()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border border-gray-200 dark:border-gray-700 hover:border-accent-primary-light/60 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-900 transition"
          >
            <Upload size={15} /> {hasCustomFont ? tr('Zmień własną czcionkę') : tr('Wgraj własną czcionkę')}
          </button>
          <input id="font-upload-appearance" type="file" className="hidden" accept=".woff2,.woff,.ttf,.otf,font/*" onChange={onFontUpload} />
          <span className="text-xs text-gray-400">woff2 · woff · ttf · otf</span>
        </div>
      </SettingsCard>

      {/* --- TŁO APLIKACJI --- */}
      <SettingsCard title="Tło aplikacji" description={tr('Kolor tła — osobno dla trybu jasnego i ciemnego.')} icon={PaintBucket}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Object.entries(BACKGROUND_OPTIONS).map(([key, opt]) => (
            <PickCard key={key} selected={bg === key} onClick={() => pickBg(key)}>
              <div className="flex h-12 rounded-xl overflow-hidden border border-gray-200/70 dark:border-gray-700 mb-2">
                <span className="flex-1" style={{ background: opt.light }} />
                <span className="flex-1" style={{ background: opt.dark }} />
              </div>
              <div className="text-xs font-medium text-gray-600 dark:text-gray-300 truncate">{opt.label}</div>
            </PickCard>
          ))}
        </div>
      </SettingsCard>

      {/* --- ROZMIAR INTERFEJSU --- */}
      <SettingsCard title="Rozmiar interfejsu" description={tr('Zagęszczenie i wielkość elementów w całej aplikacji.')} icon={Ruler}>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {Object.entries(SCALE_OPTIONS).map(([key, opt]) => (
            <PickCard key={key} selected={scale === key} onClick={() => pickScale(key)} className="flex flex-col items-center justify-center text-center">
              <div className="text-gray-900 dark:text-white font-semibold leading-none mb-1.5" style={{ fontSize: opt.px || '14px' }}>Aa</div>
              <div className="text-[11px] font-medium text-gray-600 dark:text-gray-300 leading-tight">{opt.label}</div>
            </PickCard>
          ))}
        </div>
      </SettingsCard>

      {/* --- ZAOKRĄGLENIE ROGÓW --- */}
      <SettingsCard title="Zaokrąglenie rogów" description={tr('Promień kart, przycisków i pól w całej aplikacji.')} icon={Frame}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(RADIUS_OPTIONS).map(([key, opt]) => {
            const s = opt.scale ? parseFloat(opt.scale) : 1;
            return (
              <PickCard key={key} selected={radius === key} onClick={() => pickRadius(key)} className="flex flex-col items-center justify-center text-center">
                <div className="w-14 h-9 bg-accent-primary/20 border-2 border-accent-primary mb-2" style={{ borderRadius: `${Math.round(12 * s)}px` }} />
                <div className="text-[11px] font-medium text-gray-600 dark:text-gray-300 leading-tight">{opt.label}</div>
              </PickCard>
            );
          })}
        </div>
      </SettingsCard>

      {/* --- PASEK BOCZNY --- */}
      <SettingsCard title="Pasek boczny" description={tr('Wygląd menu bocznego niezależnie od motywu.')} icon={PanelLeft}>
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(SIDEBAR_OPTIONS).map(([key, opt]) => (
            <PickCard key={key} selected={sidebar === key} onClick={() => pickSidebar(key)}>
              <SidebarPreview variant={key} />
              <div className="text-xs font-medium text-gray-600 dark:text-gray-300 truncate text-center">{opt.label}</div>
            </PickCard>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard title="Interfejs" description={tr('Domyślny wygląd dla nowych użytkowników.')} icon={Moon}>
        <SettingRow label={tr('Domyślny motyw')} hint="Jasny, ciemny lub zgodny z systemem">
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
        <SettingRow label="Kompaktowy widok" hint={tr('Mniejsze odstępy, więcej treści na ekranie')} last>
          <Toggle checked={(get('appearance_compact') ?? 'false') === 'true'} onChange={(v) => save('appearance_compact', String(v))} />
        </SettingRow>
      </SettingsCard>
    </div>
  );
}
