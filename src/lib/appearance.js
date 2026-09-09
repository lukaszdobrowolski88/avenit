// Konfiguracja wyglądu — czcionka, tło, rozmiar interfejsu, zaokrąglenie rogów, styl paska
// bocznego i własna czcionka brandowa. Wzorowane na colorPresets.js: zapis w localStorage
// (szybki start, PRZED renderem React) + app_settings (org-wide, ładowane przez
// PermissionsContext). Aplikowane zmiennymi CSS (--app-font, --app-bg / --app-bg-dark,
// --app-scale, --radius-scale) i atrybutem/eventem dla paska. Kolory akcentu (--accent-*)
// nietknięte → multi-tenant OK.

// Kroje pisma — stosy systemowe/websafe (bez CDN → bez łamania CSP i bez migotania).
// 'custom' = czcionka wgrana przez organizację (patrz applyCustomFont / injectCustomFont).
export const FONT_OPTIONS = {
  inter:   { label: 'Inter (domyślna)', stack: "'Inter', system-ui, sans-serif" },
  system:  { label: 'Systemowa',        stack: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  rounded: { label: 'Zaokrąglona',      stack: "ui-rounded, 'SF Pro Rounded', 'Nunito', 'Segoe UI', system-ui, sans-serif" },
  grotesk: { label: 'Grotesk',          stack: "'Space Grotesk', 'Inter', system-ui, sans-serif" },
  serif:   { label: 'Szeryfowa',        stack: "'Iowan Old Style', Georgia, 'Times New Roman', serif" },
  mono:    { label: 'Techniczna',       stack: "ui-monospace, 'SF Mono', 'JetBrains Mono', Consolas, monospace" },
  custom:  { label: 'Własna (wgrana)',  stack: "'AppCustomFont', 'Inter', system-ui, sans-serif", custom: true },
};

// Tło aplikacji — para (jasny / ciemny motyw). Domyślne odwzorowuje obecny wygląd.
export const BACKGROUND_OPTIONS = {
  slate:    { label: 'Grafitowe (domyślne)', light: '#f9fafb', dark: '#111827' },
  white:    { label: 'Czyste białe',         light: '#ffffff', dark: '#0b0d12' },
  warm:     { label: 'Ciepłe kremowe',       light: '#f7f4ef', dark: '#15120d' },
  cool:     { label: 'Chłodny błękit',       light: '#eef2f8', dark: '#0c1119' },
  mint:     { label: 'Miętowe',              light: '#eef5f1', dark: '#0b1310' },
  lavender: { label: 'Lawendowe',            light: '#f2f0fa', dark: '#100e18' },
};

// Rozmiar interfejsu — baza font-size na <html>; Tailwind liczy w rem, więc skaluje CAŁĄ apkę.
// 'default' = null → nie ustawia zmiennej, więc index.css zachowuje auto (14px / 15px ≥1920px).
export const SCALE_OPTIONS = {
  default: { label: 'Domyślny (auto)', px: null },
  compact: { label: 'Kompaktowy',      px: '13px' },
  comfy:   { label: 'Wygodny',         px: '15px' },
  large:   { label: 'Duży',            px: '16px' },
  xl:      { label: 'Bardzo duży',     px: '18px' },
};

// Zaokrąglenie rogów — mnożnik skali promienia (Tailwind rounded-* = calc(base * --radius-scale)).
// 'default' = null → mnożnik 1 (fallback), czyli dokładnie dawne wartości Tailwinda.
export const RADIUS_OPTIONS = {
  sharp:   { label: 'Ostre',        scale: '0.35' },
  default: { label: 'Standardowe',  scale: null },
  round:   { label: 'Zaokrąglone',  scale: '1.5' },
  xround:  { label: 'Mocno zaokr.', scale: '2' },
};

// Styl paska bocznego. 'theme' = jak globalny motyw; 'dark'/'accent' wymuszane lokalnie
// (Sidebar owija się klasą .dark → ciemny panel niezależnie od motywu; 'accent' dokłada tło akcentu).
export const SIDEBAR_OPTIONS = {
  theme:  { label: 'Jak motyw' },
  dark:   { label: 'Ciemny' },
  accent: { label: 'W kolorze akcentu' },
};

// Czcionka nagłówków — osobny krój dla h1–h4. 'body' = ten sam co treść (usuwa zmienną).
export const HEADING_FONT_OPTIONS = {
  body: { label: 'Jak treść', stack: null },
  ...FONT_OPTIONS,
};

// Deseń / obraz tła — nakładany na tło powłoki (prześwituje pod treścią). Gradienty korzystają
// z kolorów akcentu (--accent-*), więc pasują do wybranej palety. 'custom' = wgrany obraz.
export const BG_PATTERN_OPTIONS = {
  none:    { label: 'Brak', image: 'none', size: 'auto' },
  dots:    { label: 'Kropki', image: 'radial-gradient(rgb(var(--accent-primary) / 0.10) 1px, transparent 1px)', size: '20px 20px' },
  grid:    { label: 'Siatka', image: 'linear-gradient(rgb(var(--accent-primary) / 0.07) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--accent-primary) / 0.07) 1px, transparent 1px)', size: '28px 28px' },
  aurora:  { label: 'Zorza', image: 'radial-gradient(60% 55% at 15% 5%, rgb(var(--accent-primary-light) / 0.28) 0%, transparent 60%), radial-gradient(55% 55% at 95% 10%, rgb(var(--accent-secondary-light) / 0.24) 0%, transparent 60%)', size: 'cover' },
  glow:    { label: 'Poświata', image: 'radial-gradient(80% 60% at 50% 0%, rgb(var(--accent-primary-light) / 0.22) 0%, transparent 70%)', size: 'cover' },
  diagonal:{ label: 'Ukośne', image: 'repeating-linear-gradient(45deg, rgb(var(--accent-primary) / 0.05) 0px, rgb(var(--accent-primary) / 0.05) 2px, transparent 2px, transparent 14px)', size: 'auto' },
};

// Szerokość paska bocznego (rozwiniętego). Kolaps (w-20) bez zmian.
export const SIDEBAR_WIDTH_OPTIONS = {
  narrow: { label: 'Wąski',        rem: '14rem' },
  normal: { label: 'Standardowy',  rem: '16rem' },
  wide:   { label: 'Szeroki',      rem: '18rem' },
};

// Tło ekranu logowania — pełnoekranowe gradienty (lub własny obraz jako 'custom').
// 'accent' korzysta z koloru marki. Login.jsx czyta login_bg/login_bg_url z app_settings.
export const LOGIN_BG_OPTIONS = {
  default: { label: 'Domyślne', css: null },
  accent:  { label: 'Kolor marki', css: 'linear-gradient(135deg, rgb(var(--accent-primary)) 0%, rgb(var(--accent-secondary)) 100%)' },
  ocean:   { label: 'Ocean', css: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)' },
  sunset:  { label: 'Zachód', css: 'linear-gradient(135deg, #f97316 0%, #db2777 100%)' },
  forest:  { label: 'Las', css: 'linear-gradient(135deg, #059669 0%, #0d9488 100%)' },
  aurora:  { label: 'Zorza', css: 'radial-gradient(60% 60% at 20% 20%, #6366f1 0%, transparent 60%), radial-gradient(50% 50% at 90% 30%, #db2777 0%, transparent 60%), #0f172a' },
  night:   { label: 'Noc', css: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)' },
};

const K = {
  font: 'ui_font', bg: 'ui_bg', scale: 'ui_scale',
  radius: 'ui_radius', sidebar: 'ui_sidebar', fontUrl: 'ui_font_url',
  heading: 'ui_font_heading', pattern: 'ui_bg_pattern', bgUrl: 'ui_bg_url',
  sidebarW: 'ui_sidebar_w', motion: 'ui_motion', scrollbar: 'ui_scrollbar',
  oled: 'ui_oled', css: 'custom_css',
};

// Klucze app_settings składające się na „motyw" — do eksportu/importu i resetu wyglądu.
export const THEME_KEYS = [
  'color_preset', 'ui_font', 'custom_font_url', 'ui_font_heading', 'ui_bg', 'ui_bg_pattern',
  'ui_bg_url', 'ui_scale', 'ui_radius', 'ui_sidebar', 'ui_sidebar_w', 'ui_motion',
  'ui_scrollbar', 'ui_oled', 'module_colors', 'module_covers', 'login_bg', 'login_bg_url',
  'login_title', 'login_subtitle', 'custom_css', 'org_logo_url',
];

// Podzbiór „wyglądu" (bez brandingu: logo/login/moduły/CSS) — nazwane motywy operują TYLKO na tym,
// więc przełączenie motywu nie rusza logo, ekranu logowania, kolorów modułów ani własnego CSS.
export const THEME_LOOK_KEYS = [
  'color_preset', 'ui_font', 'custom_font_url', 'ui_font_heading', 'ui_bg', 'ui_bg_pattern',
  'ui_bg_url', 'ui_scale', 'ui_radius', 'ui_sidebar', 'ui_sidebar_w', 'ui_motion',
  'ui_scrollbar', 'ui_oled',
];

// Gotowe, wbudowane motywy (zawsze dostępne, jednym kliknięciem). Ustawiają komplet kluczy
// wyglądu — brakujące (np. ui_oled) i tak są zerowane do domyślnych przy zastosowaniu.
export const BUILTIN_THEMES = [
  { id: 'ocean',    name: 'Ocean',    preview: ['#2563eb', '#4f46e5'], settings: { color_preset: 'blue-indigo',  ui_font: 'grotesk', ui_bg: 'cool',     ui_bg_pattern: 'aurora',   ui_sidebar: 'accent', ui_radius: 'round'  } },
  { id: 'forest',   name: 'Natura',   preview: ['#059669', '#0d9488'], settings: { color_preset: 'emerald-teal', ui_font: 'rounded', ui_bg: 'mint',     ui_bg_pattern: 'glow',     ui_sidebar: 'accent', ui_radius: 'round'  } },
  { id: 'sunset',   name: 'Ciepły',   preview: ['#d97706', '#ca8a04'], settings: { color_preset: 'amber-yellow', ui_font: 'serif',   ui_font_heading: 'serif', ui_bg: 'warm', ui_bg_pattern: 'diagonal', ui_sidebar: 'theme', ui_radius: 'round' } },
  { id: 'midnight', name: 'Midnight', preview: ['#7c3aed', '#9333ea'], settings: { color_preset: 'violet-purple', ui_font: 'inter',   ui_bg: 'slate',    ui_bg_pattern: 'none',     ui_sidebar: 'dark',   ui_oled: 'on', ui_scrollbar: 'accent' } },
  { id: 'minimal',  name: 'Minimal',  preview: ['#334155', '#64748b'], settings: { color_preset: 'blue-indigo',  ui_font: 'system',  ui_bg: 'white',    ui_bg_pattern: 'none',     ui_sidebar: 'theme',  ui_radius: 'sharp', ui_scale: 'compact' } },
  { id: 'rose',     name: 'Róż',      preview: ['#e11d48', '#db2777'], settings: { color_preset: 'rose-red',     ui_font: 'rounded', ui_bg: 'lavender', ui_bg_pattern: 'dots',     ui_sidebar: 'accent', ui_radius: 'xround' } },
];
const root = () => document.documentElement;

// --- CZCIONKA WŁASNA (@font-face wstrzykiwany do <head>) ---
export function injectCustomFont(url) {
  if (!url) return;
  let el = document.getElementById('app-custom-font');
  if (!el) { el = document.createElement('style'); el.id = 'app-custom-font'; document.head.appendChild(el); }
  el.textContent = `@font-face{font-family:'AppCustomFont';font-display:swap;src:url("${url}")}`;
  localStorage.setItem(K.fontUrl, url);
}

export function applyFont(key) {
  if (key === 'custom') {
    const u = getFontUrl();
    if (u) injectCustomFont(u);
    root().style.setProperty('--app-font', FONT_OPTIONS.custom.stack);
    localStorage.setItem(K.font, 'custom');
    return;
  }
  const o = FONT_OPTIONS[key] || FONT_OPTIONS.inter;
  root().style.setProperty('--app-font', o.stack);
  localStorage.setItem(K.font, key);
}

export function applyBackground(key) {
  const o = BACKGROUND_OPTIONS[key] || BACKGROUND_OPTIONS.slate;
  root().style.setProperty('--app-bg', o.light);
  root().style.setProperty('--app-bg-dark', o.dark);
  localStorage.setItem(K.bg, key);
}

export function applyScale(key) {
  const o = SCALE_OPTIONS[key] || SCALE_OPTIONS.default;
  if (o.px) root().style.setProperty('--app-scale', o.px);
  else root().style.removeProperty('--app-scale');
  localStorage.setItem(K.scale, key);
}

export function applyRadius(key) {
  const o = RADIUS_OPTIONS[key] || RADIUS_OPTIONS.default;
  if (o.scale) root().style.setProperty('--radius-scale', o.scale);
  else root().style.removeProperty('--radius-scale');
  localStorage.setItem(K.radius, key);
}

export function applySidebar(key) {
  const k = SIDEBAR_OPTIONS[key] ? key : 'theme';
  root().setAttribute('data-app-sidebar', k);
  localStorage.setItem(K.sidebar, k);
  // Sidebar (React) słucha eventu i przelicza klasy panelu na żywo.
  try { window.dispatchEvent(new CustomEvent('appearance:sidebar', { detail: k })); } catch { /* ignore */ }
}

export function applyHeadingFont(key) {
  const o = HEADING_FONT_OPTIONS[key] || HEADING_FONT_OPTIONS.body;
  const stack = key === 'custom' ? FONT_OPTIONS.custom.stack : o.stack;
  if (stack) root().style.setProperty('--app-font-heading', stack);
  else root().style.removeProperty('--app-font-heading');
  localStorage.setItem(K.heading, key);
}

export function applyBgPattern(key) {
  if (key === 'custom') {
    const u = getBgUrl();
    root().style.setProperty('--app-bg-image', u ? `url("${u}")` : 'none');
    root().style.setProperty('--app-bg-size', 'cover');
    localStorage.setItem(K.pattern, 'custom');
    return;
  }
  const o = BG_PATTERN_OPTIONS[key] || BG_PATTERN_OPTIONS.none;
  root().style.setProperty('--app-bg-image', o.image);
  root().style.setProperty('--app-bg-size', o.size);
  localStorage.setItem(K.pattern, key);
}

export function setBgUrl(url) { if (url) localStorage.setItem(K.bgUrl, url); }

export function applySidebarWidth(key) {
  const o = SIDEBAR_WIDTH_OPTIONS[key] || SIDEBAR_WIDTH_OPTIONS.normal;
  root().style.setProperty('--sidebar-w', o.rem);
  localStorage.setItem(K.sidebarW, key);
}

export function applyMotion(key) {
  const reduced = key === 'reduced';
  root().classList.toggle('reduce-motion', reduced);
  localStorage.setItem(K.motion, reduced ? 'reduced' : 'full');
}

export function applyScrollbar(key) {
  const accent = key === 'accent';
  root().classList.toggle('scrollbar-accent', accent);
  localStorage.setItem(K.scrollbar, accent ? 'accent' : 'default');
}

// Tryb OLED (czysta czerń) — działa tylko w trybie ciemnym (CSS: html.oled.dark ...).
export function applyOled(key) {
  const on = key === 'on';
  root().classList.toggle('oled', on);
  localStorage.setItem(K.oled, on ? 'on' : 'off');
}

// Własny CSS (tryb zaawansowany) — wstrzykiwany do <head> jako ostatni <style> (wygrywa kaskadę).
export function injectCustomCss(css) {
  let el = document.getElementById('app-custom-css');
  if (!el) { el = document.createElement('style'); el.id = 'app-custom-css'; document.head.appendChild(el); }
  el.textContent = css || '';
  if (css) localStorage.setItem(K.css, css); else localStorage.removeItem(K.css);
}
export const getCustomCss = () => localStorage.getItem(K.css) || '';

// Wyczyść lokalny stan motywu (localStorage) — używane przez „Przywróć domyślne" przed reloadem.
export function clearThemeLocal() {
  Object.values(K).forEach((k) => localStorage.removeItem(k));
  ['color_preset', 'custom_preset'].forEach((k) => localStorage.removeItem(k));
  const el = document.getElementById('app-custom-css'); if (el) el.textContent = '';
}

// Wyczyść TYLKO lokalny stan „wyglądu" (bez custom_css) — przed reloadem przy zmianie motywu,
// żeby usunięte klucze wróciły do domyślnych, a nie zostały z nieaktualnego localStorage.
export function clearThemeLookLocal() {
  ['ui_font', 'ui_font_url', 'ui_font_heading', 'ui_bg', 'ui_bg_pattern', 'ui_bg_url',
    'ui_scale', 'ui_radius', 'ui_sidebar', 'ui_sidebar_w', 'ui_motion', 'ui_scrollbar',
    'ui_oled', 'color_preset', 'custom_preset'].forEach((k) => localStorage.removeItem(k));
}

export const getFont       = () => localStorage.getItem(K.font)    || 'inter';
export const getBackground = () => localStorage.getItem(K.bg)      || 'slate';
export const getScale      = () => localStorage.getItem(K.scale)   || 'default';
export const getRadius     = () => localStorage.getItem(K.radius)  || 'default';
export const getSidebar    = () => localStorage.getItem(K.sidebar) || 'theme';
export const getFontUrl     = () => localStorage.getItem(K.fontUrl)   || '';
export const getHeadingFont = () => localStorage.getItem(K.heading)   || 'body';
export const getBgPattern   = () => localStorage.getItem(K.pattern)   || 'none';
export const getBgUrl       = () => localStorage.getItem(K.bgUrl)     || '';
export const getSidebarWidth= () => localStorage.getItem(K.sidebarW)  || 'normal';
export const getMotion      = () => localStorage.getItem(K.motion)    || 'full';
export const getScrollbar   = () => localStorage.getItem(K.scrollbar) || 'default';
export const getOled        = () => localStorage.getItem(K.oled)      || 'off';

// Zastosuj z localStorage od razu przy imporcie (zanim wyrenderuje się React).
const storedFontUrl = getFontUrl();
if (storedFontUrl) injectCustomFont(storedFontUrl);
const storedCss = getCustomCss();
if (storedCss) injectCustomCss(storedCss);
applyFont(getFont());
applyBackground(getBackground());
applyScale(getScale());
applyRadius(getRadius());
applySidebar(getSidebar());
applyHeadingFont(getHeadingFont());
applyBgPattern(getBgPattern());
applySidebarWidth(getSidebarWidth());
applyMotion(getMotion());
applyScrollbar(getScrollbar());
applyOled(getOled());
