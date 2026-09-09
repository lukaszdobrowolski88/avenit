import React from 'react';
import { Palette, Moon, Image as ImageIcon, Upload, Type, Heading, PaintBucket, Wallpaper, Ruler, Frame, PanelLeft, Sparkles, LogIn, Check } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { SettingsCard, SettingRow, Toggle, SelectSetting } from './SettingsUI';
import ColorPresetPicker from './ColorPresetPicker';
import {
  FONT_OPTIONS, HEADING_FONT_OPTIONS, BACKGROUND_OPTIONS, BG_PATTERN_OPTIONS,
  SCALE_OPTIONS, RADIUS_OPTIONS, SIDEBAR_OPTIONS, SIDEBAR_WIDTH_OPTIONS, LOGIN_BG_OPTIONS,
  applyFont, applyHeadingFont, applyBackground, applyBgPattern, applyScale, applyRadius,
  applySidebar, applySidebarWidth, applyMotion, applyScrollbar, applyOled,
  getFont, getHeadingFont, getBackground, getBgPattern, getBgUrl, getScale, getRadius,
  getSidebar, getSidebarWidth, getMotion, getScrollbar, getFontUrl, getOled,
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

// Wygląd i personalizacja: logo, kolory, czcionki, tło+deseń, rozmiar, radius, pasek, efekty.
export default function AppearanceSettings({ get, save, logoUrl, onLogoUpload, onFontUpload, onBgUpload, onLoginBgUpload }) {
  const t = useT();

  // Wartości: najpierw org-wide (app_settings), potem lokalny wybór (localStorage) jako fallback.
  const font = get('ui_font') || getFont();
  const headingFont = get('ui_font_heading') || getHeadingFont();
  const bg = get('ui_bg') || getBackground();
  const pattern = get('ui_bg_pattern') || getBgPattern();
  const scale = get('ui_scale') || getScale();
  const radius = get('ui_radius') || getRadius();
  const sidebar = get('ui_sidebar') || getSidebar();
  const sidebarW = get('ui_sidebar_w') || getSidebarWidth();
  const motion = get('ui_motion') || getMotion();
  const scrollbar = get('ui_scrollbar') || getScrollbar();
  const oled = get('ui_oled') || getOled();
  const hasCustomFont = !!(get('custom_font_url') || getFontUrl());
  const customBgUrl = get('ui_bg_url') || getBgUrl();
  const hasCustomBg = !!customBgUrl;
  const loginBg = get('login_bg') || 'default';
  const loginBgUrl = get('login_bg_url') || '';
  const hasLoginBg = !!loginBgUrl;

  const pickFont = (k) => { applyFont(k); save('ui_font', k); };
  const pickHeading = (k) => { applyHeadingFont(k); save('ui_font_heading', k); };
  const pickBg = (k) => { applyBackground(k); save('ui_bg', k); };
  const pickPattern = (k) => { applyBgPattern(k); save('ui_bg_pattern', k); };
  const pickScale = (k) => { applyScale(k); save('ui_scale', k); };
  const pickRadius = (k) => { applyRadius(k); save('ui_radius', k); };
  const pickSidebar = (k) => { applySidebar(k); save('ui_sidebar', k); };
  const pickSidebarW = (k) => { applySidebarWidth(k); save('ui_sidebar_w', k); };
  const pickMotion = (k) => { applyMotion(k); save('ui_motion', k); };
  const pickScrollbar = (k) => { applyScrollbar(k); save('ui_scrollbar', k); };
  const pickOled = (k) => { applyOled(k); save('ui_oled', k); };
  const pickLoginBg = (k) => { save('login_bg', k); };

  // Karty 'custom' widoczne tylko, gdy organizacja wgrała odpowiedni zasób.
  const fontEntries = Object.entries(FONT_OPTIONS).filter(([k]) => k !== 'custom' || hasCustomFont);
  const headingEntries = Object.entries(HEADING_FONT_OPTIONS).filter(([k]) => k !== 'custom' || hasCustomFont);
  const headingStack = (k) => (k === 'body' ? undefined : k === 'custom' ? FONT_OPTIONS.custom.stack : HEADING_FONT_OPTIONS[k]?.stack);

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

      {/* --- CZCIONKA TREŚCI --- */}
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

      {/* --- CZCIONKA NAGŁÓWKÓW --- */}
      <SettingsCard title="Czcionka nagłówków" description={tr('Osobny krój dla tytułów (opcjonalnie).')} icon={Heading}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {headingEntries.map(([key, opt]) => (
            <PickCard key={key} selected={headingFont === key} onClick={() => pickHeading(key)}>
              <div className="text-3xl leading-none text-gray-900 dark:text-white mb-1.5" style={{ fontFamily: headingStack(key) }}>Aa</div>
              <div className="text-xs font-medium text-gray-600 dark:text-gray-300 truncate" style={{ fontFamily: headingStack(key) }}>{opt.label}</div>
            </PickCard>
          ))}
        </div>
      </SettingsCard>

      {/* --- TŁO APLIKACJI (KOLOR) --- */}
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

      {/* --- DESEŃ / OBRAZ TŁA --- */}
      <SettingsCard title="Deseń i obraz tła" description={tr('Delikatny wzór lub własny obraz w tle aplikacji.')} icon={Wallpaper}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Object.entries(BG_PATTERN_OPTIONS).map(([key, opt]) => (
            <PickCard key={key} selected={pattern === key} onClick={() => pickPattern(key)}>
              <div
                className="h-14 rounded-xl border border-gray-200/70 dark:border-gray-700 mb-2 bg-gray-50 dark:bg-gray-800"
                style={{ backgroundImage: opt.image, backgroundSize: opt.size, backgroundPosition: 'center' }}
              />
              <div className="text-xs font-medium text-gray-600 dark:text-gray-300 truncate">{opt.label}</div>
            </PickCard>
          ))}
          {hasCustomBg && (
            <PickCard selected={pattern === 'custom'} onClick={() => pickPattern('custom')}>
              <div
                className="h-14 rounded-xl border border-gray-200/70 dark:border-gray-700 mb-2"
                style={{ backgroundImage: `url("${customBgUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center' }}
              />
              <div className="text-xs font-medium text-gray-600 dark:text-gray-300 truncate">{tr('Własny obraz')}</div>
            </PickCard>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => document.getElementById('bg-upload-appearance').click()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border border-gray-200 dark:border-gray-700 hover:border-accent-primary-light/60 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-900 transition"
          >
            <Upload size={15} /> {hasCustomBg ? tr('Zmień obraz tła') : tr('Wgraj obraz tła')}
          </button>
          <input id="bg-upload-appearance" type="file" className="hidden" accept="image/*" onChange={onBgUpload} />
          <span className="text-xs text-gray-400">JPG · PNG · WEBP</span>
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

      {/* --- PASEK BOCZNY (STYL + SZEROKOŚĆ) --- */}
      <SettingsCard title="Pasek boczny" description={tr('Wygląd i szerokość menu bocznego.')} icon={PanelLeft}>
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(SIDEBAR_OPTIONS).map(([key, opt]) => (
            <PickCard key={key} selected={sidebar === key} onClick={() => pickSidebar(key)}>
              <SidebarPreview variant={key} />
              <div className="text-xs font-medium text-gray-600 dark:text-gray-300 truncate text-center">{opt.label}</div>
            </PickCard>
          ))}
        </div>
        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mt-4 mb-2">{tr('Szerokość')}</div>
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(SIDEBAR_WIDTH_OPTIONS).map(([key, opt]) => (
            <PickCard key={key} selected={sidebarW === key} onClick={() => pickSidebarW(key)} className="flex flex-col items-center justify-center text-center">
              <div className="flex justify-center mb-2">
                <div className="h-8 bg-accent-primary/20 border-2 border-accent-primary rounded-md" style={{ width: key === 'narrow' ? '22px' : key === 'wide' ? '42px' : '32px' }} />
              </div>
              <div className="text-[11px] font-medium text-gray-600 dark:text-gray-300 leading-tight">{opt.label}</div>
            </PickCard>
          ))}
        </div>
      </SettingsCard>

      {/* --- EFEKTY I WYKOŃCZENIE --- */}
      <SettingsCard title="Efekty i wykończenie" description={tr('Drobne akcenty wizualne i dostępność.')} icon={Sparkles}>
        <SettingRow label={tr('Tryb OLED (czysta czerń)')} hint={tr('Czarne tło i powierzchnie w trybie ciemnym')}>
          <Toggle checked={oled === 'on'} onChange={(v) => pickOled(v ? 'on' : 'off')} />
        </SettingRow>
        <SettingRow label={tr('Pasek przewijania w kolorze akcentu')} hint={tr('Suwak przewijania w kolorze przewodnim')}>
          <Toggle checked={scrollbar === 'accent'} onChange={(v) => pickScrollbar(v ? 'accent' : 'default')} />
        </SettingRow>
        <SettingRow label={tr('Ogranicz animacje')} hint={tr('Wyłącza przejścia i animacje w całej aplikacji')} last>
          <Toggle checked={motion === 'reduced'} onChange={(v) => pickMotion(v ? 'reduced' : 'full')} />
        </SettingRow>
      </SettingsCard>

      {/* --- EKRAN LOGOWANIA --- */}
      <SettingsCard title="Ekran logowania" description={tr('Personalizacja strony logowania (widoczna przed zalogowaniem).')} icon={LogIn}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5">{tr('Nagłówek powitalny')}</label>
            <input type="text" defaultValue={get('login_title') || ''} onBlur={(e) => save('login_title', e.target.value)} placeholder="Witaj ponownie" className="w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5">{tr('Podtytuł')}</label>
            <input type="text" defaultValue={get('login_subtitle') || ''} onBlur={(e) => save('login_subtitle', e.target.value)} placeholder={tr('Zaloguj się do Avenit')} className="w-full" />
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">{tr('Tło')}</div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {Object.entries(LOGIN_BG_OPTIONS).map(([key, opt]) => (
                <PickCard key={key} selected={loginBg === key} onClick={() => pickLoginBg(key)}>
                  <div className="h-12 rounded-xl border border-gray-200/70 dark:border-gray-700 mb-2 bg-gray-100 dark:bg-gray-800" style={opt.css ? { background: opt.css } : undefined} />
                  <div className="text-[11px] font-medium text-gray-600 dark:text-gray-300 truncate text-center">{opt.label}</div>
                </PickCard>
              ))}
              {hasLoginBg && (
                <PickCard selected={loginBg === 'custom'} onClick={() => pickLoginBg('custom')}>
                  <div className="h-12 rounded-xl border border-gray-200/70 dark:border-gray-700 mb-2" style={{ backgroundImage: `url("${loginBgUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                  <div className="text-[11px] font-medium text-gray-600 dark:text-gray-300 truncate text-center">{tr('Własny obraz')}</div>
                </PickCard>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => document.getElementById('loginbg-upload-appearance').click()}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border border-gray-200 dark:border-gray-700 hover:border-accent-primary-light/60 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-900 transition"
              >
                <Upload size={15} /> {hasLoginBg ? tr('Zmień obraz tła') : tr('Wgraj obraz tła')}
              </button>
              <input id="loginbg-upload-appearance" type="file" className="hidden" accept="image/*" onChange={onLoginBgUpload} />
              <span className="text-xs text-gray-400">JPG · PNG · WEBP</span>
            </div>
          </div>
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
