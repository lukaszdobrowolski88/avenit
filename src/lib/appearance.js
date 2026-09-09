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

const K = {
  font: 'ui_font', bg: 'ui_bg', scale: 'ui_scale',
  radius: 'ui_radius', sidebar: 'ui_sidebar', fontUrl: 'ui_font_url',
};
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

export const getFont       = () => localStorage.getItem(K.font)    || 'inter';
export const getBackground = () => localStorage.getItem(K.bg)      || 'slate';
export const getScale      = () => localStorage.getItem(K.scale)   || 'default';
export const getRadius     = () => localStorage.getItem(K.radius)  || 'default';
export const getSidebar    = () => localStorage.getItem(K.sidebar) || 'theme';
export const getFontUrl    = () => localStorage.getItem(K.fontUrl) || '';

// Zastosuj z localStorage od razu przy imporcie (zanim wyrenderuje się React).
const storedFontUrl = getFontUrl();
if (storedFontUrl) injectCustomFont(storedFontUrl);
applyFont(getFont());
applyBackground(getBackground());
applyScale(getScale());
applyRadius(getRadius());
applySidebar(getSidebar());
