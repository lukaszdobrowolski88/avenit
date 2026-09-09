// Konfiguracja wyglądu — czcionka, tło aplikacji i rozmiar interfejsu.
// Wzorowane na colorPresets.js: zapis w localStorage (szybki start, PRZED renderem React)
// + app_settings (org-wide, ładowane przez PermissionsContext). Aplikowane zmiennymi CSS
// (--app-font, --app-bg / --app-bg-dark, --app-scale) czytanymi w index.css. Multi-tenant:
// kolory akcentu zostają na --accent-*; tu sterujemy tylko krojem, tłem i gęstością.

// Kroje pisma — wyłącznie stosy systemowe/websafe (bez CDN → bez łamania CSP i bez migotania).
export const FONT_OPTIONS = {
  inter:   { label: 'Inter (domyślna)', stack: "'Inter', system-ui, sans-serif" },
  system:  { label: 'Systemowa',        stack: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  rounded: { label: 'Zaokrąglona',      stack: "ui-rounded, 'SF Pro Rounded', 'Nunito', 'Segoe UI', system-ui, sans-serif" },
  grotesk: { label: 'Grotesk',          stack: "'Space Grotesk', 'Inter', system-ui, sans-serif" },
  serif:   { label: 'Szeryfowa',        stack: "'Iowan Old Style', Georgia, 'Times New Roman', serif" },
  mono:    { label: 'Techniczna',       stack: "ui-monospace, 'SF Mono', 'JetBrains Mono', Consolas, monospace" },
};

// Tło aplikacji — para (jasny / ciemny motyw). Domyślne odwzorowuje obecny wygląd
// (bg-gray-50 / bg-gray-900), więc bez wyboru nic się nie zmienia.
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

const K = { font: 'ui_font', bg: 'ui_bg', scale: 'ui_scale' };
const root = () => document.documentElement;

export function applyFont(key) {
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

export const getFont       = () => localStorage.getItem(K.font)  || 'inter';
export const getBackground = () => localStorage.getItem(K.bg)    || 'slate';
export const getScale      = () => localStorage.getItem(K.scale) || 'default';

// Zastosuj z localStorage od razu przy imporcie (zanim wyrenderuje się React).
applyFont(getFont());
applyBackground(getBackground());
applyScale(getScale());
