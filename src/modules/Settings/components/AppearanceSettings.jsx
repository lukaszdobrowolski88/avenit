import React from 'react';
import { Palette, Moon, Image as ImageIcon, Upload, Type, Heading, PaintBucket, Wallpaper, Ruler, Frame, PanelLeft, Sparkles, LogIn, Code2, Download, RotateCcw, Layers, Save, X, Check } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { SettingsCard, SettingRow, Toggle, SelectSetting } from './SettingsUI';
import ColorPresetPicker from './ColorPresetPicker';
import {
  FONT_OPTIONS, HEADING_FONT_OPTIONS, BACKGROUND_OPTIONS, BG_PATTERN_OPTIONS,
  SCALE_OPTIONS, RADIUS_OPTIONS, SIDEBAR_OPTIONS, SIDEBAR_WIDTH_OPTIONS, LOGIN_BG_OPTIONS,
  THEME_KEYS, THEME_LOOK_KEYS, BUILTIN_THEMES,
  applyFont, applyHeadingFont, applyBackground, applyBgPattern, applyScale, applyRadius,
  applySidebar, applySidebarWidth, applyMotion, applyScrollbar, applyOled, injectCustomCss, clearThemeLocal, clearThemeLookLocal,
  getFont, getHeadingFont, getBackground, getBgPattern, getBgUrl, getScale, getRadius,
  getSidebar, getSidebarWidth, getMotion, getScrollbar, getFontUrl, getOled, getCustomCss,
} from '../../../lib/appearance';
import { COLOR_PRESETS } from '../../../lib/colorPresets';
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

  const customCss = get('custom_css') || getCustomCss();

  // Eksport całego motywu (klucze wyglądu z app_settings) do pliku JSON.
  const exportTheme = async () => {
    const { data } = await supabase.from('app_settings').select('key, value');
    const settings = {};
    (data || []).forEach((r) => { if (THEME_KEYS.includes(r.key) || r.key.startsWith('custom_color_preset_')) settings[r.key] = r.value; });
    const blob = new Blob([JSON.stringify({ _type: 'avenit-theme', version: 1, settings }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'motyw-avenit.json';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  // Import motywu z pliku JSON → upsert kluczy + przeładowanie (czyste zastosowanie).
  const importTheme = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const settings = parsed.settings || parsed;
      const rows = Object.entries(settings)
        .filter(([k]) => THEME_KEYS.includes(k) || k.startsWith('custom_color_preset_'))
        .map(([key, value]) => ({ key, value: String(value) }));
      if (!rows.length) { alert(tr('Plik nie zawiera ustawień motywu')); return; }
      await supabase.from('app_settings').upsert(rows, { onConflict: 'key' });
      window.location.reload();
    } catch { alert(tr('Nieprawidłowy plik motywu')); }
  };

  // --- NAZWANE MOTYWY (wbudowane + zapisane przez użytkownika) ---
  let savedThemes = [];
  try { savedThemes = JSON.parse(get('saved_themes') || '[]') || []; } catch { savedThemes = []; }

  // Podgląd motywu — gradient z palety color_preset (lub akcent, gdy brak).
  const themePreviewStyle = (settings) => {
    const p = COLOR_PRESETS[settings?.color_preset];
    return p ? { background: `linear-gradient(135deg, ${p.preview[0]} 0%, ${p.preview[1]} 100%)` } : undefined;
  };

  // Zastosuj motyw: ustaw klucze wyglądu (brakujące → domyślne), wyczyść lokalny stan, przeładuj.
  // Nie rusza brandingu (logo/logowanie/kolory modułów/własny CSS).
  const applyTheme = async (settings) => {
    const s = settings || {};
    const upserts = THEME_LOOK_KEYS.filter((k) => s[k] != null).map((k) => ({ key: k, value: String(s[k]) }));
    const deletes = THEME_LOOK_KEYS.filter((k) => s[k] == null);
    if (upserts.length) await supabase.from('app_settings').upsert(upserts, { onConflict: 'key' });
    if (deletes.length) await supabase.from('app_settings').delete().in('key', deletes);
    clearThemeLookLocal();
    window.location.reload();
  };

  // Zapisz bieżący wygląd jako nowy nazwany motyw.
  const saveCurrentTheme = () => {
    const name = prompt(tr('Nazwa motywu:'));
    if (!name || !name.trim()) return;
    const settings = {};
    THEME_LOOK_KEYS.forEach((k) => { const v = get(k); if (v != null) settings[k] = v; });
    const list = [...savedThemes, { id: 'u' + Date.now(), name: name.trim(), settings }];
    save('saved_themes', JSON.stringify(list));
  };

  const deleteTheme = (id) => {
    const list = savedThemes.filter((t) => t.id !== id);
    save('saved_themes', JSON.stringify(list));
  };

  // Przywróć domyślny wygląd — usuń klucze motywu i lokalny stan, przeładuj.
  const resetTheme = async () => {
    if (!confirm(tr('Przywrócić domyślny wygląd? Bieżące ustawienia wyglądu zostaną usunięte.'))) return;
    await supabase.from('app_settings').delete().in('key', THEME_KEYS);
    await supabase.from('app_settings').delete().like('key', 'custom_color_preset_%');
    clearThemeLocal();
    window.location.reload();
  };

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

      {/* --- NAZWANE MOTYWY --- */}
      <SettingsCard title="Motywy" description={tr('Gotowe zestawy — przełącz cały wygląd jednym kliknięciem.')} icon={Layers}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {BUILTIN_THEMES.map((th) => (
            <button
              key={th.id}
              type="button"
              onClick={() => applyTheme(th.settings)}
              className="text-left rounded-2xl border-2 border-gray-200 dark:border-gray-700 hover:border-accent-primary-light/60 p-3 transition"
            >
              <div className="h-12 rounded-xl mb-2" style={{ background: `linear-gradient(135deg, ${th.preview[0]} 0%, ${th.preview[1]} 100%)` }} />
              <div className="text-xs font-semibold text-gray-700 dark:text-gray-200 truncate">{th.name}</div>
            </button>
          ))}
          {savedThemes.map((th) => (
            <div key={th.id} className="relative">
              <button
                type="button"
                onClick={() => applyTheme(th.settings)}
                className="w-full text-left rounded-2xl border-2 border-gray-200 dark:border-gray-700 hover:border-accent-primary-light/60 p-3 transition"
              >
                <div className="h-12 rounded-xl mb-2 bg-gradient-to-br from-accent-primary to-accent-secondary" style={themePreviewStyle(th.settings)} />
                <div className="text-xs font-semibold text-gray-700 dark:text-gray-200 truncate pr-5">{th.name}</div>
              </button>
              <button
                type="button"
                onClick={() => deleteTheme(th.id)}
                title={tr('Usuń')}
                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/90 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-400 hover:text-red-500 flex items-center justify-center shadow-sm"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={saveCurrentTheme}
          className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border border-gray-200 dark:border-gray-700 hover:border-accent-primary-light/60 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-900 transition"
        >
          <Save size={15} /> {tr('Zapisz bieżący wygląd')}
        </button>
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

      {/* --- ZAAWANSOWANE: WŁASNY CSS + EKSPORT/IMPORT/RESET --- */}
      <SettingsCard title="Zaawansowane" description={tr('Własny CSS i zarządzanie całym motywem.')} icon={Code2}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5">{tr('Własny CSS')}</label>
            <textarea
              defaultValue={customCss}
              onBlur={(e) => { injectCustomCss(e.target.value); save('custom_css', e.target.value); }}
              placeholder=":root { /* własne reguły */ }"
              rows={6}
              spellCheck={false}
              className="w-full font-mono text-xs"
            />
            <p className="text-xs text-gray-400 mt-1.5">{tr('Reguły stosowane globalnie w całej aplikacji. Zaawansowane — błędny CSS może zepsuć wygląd.')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
            <button type="button" onClick={exportTheme} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border border-gray-200 dark:border-gray-700 hover:border-accent-primary-light/60 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-900 transition">
              <Download size={15} /> {tr('Eksportuj motyw')}
            </button>
            <button type="button" onClick={() => document.getElementById('theme-import-appearance').click()} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border border-gray-200 dark:border-gray-700 hover:border-accent-primary-light/60 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-900 transition">
              <Upload size={15} /> {tr('Importuj motyw')}
            </button>
            <input id="theme-import-appearance" type="file" className="hidden" accept="application/json,.json" onChange={importTheme} />
            <button type="button" onClick={resetTheme} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition">
              <RotateCcw size={15} /> {tr('Przywróć domyślne')}
            </button>
          </div>
        </div>
      </SettingsCard>
    </div>
  );
}
