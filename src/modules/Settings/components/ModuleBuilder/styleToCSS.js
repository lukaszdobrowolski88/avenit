// Konwersja obiektu stylu elementu (el.style) na inline-CSS Reacta. Wersjonowalne
// przez migrateOldStyle() (na wypadek zmian schematu w przyszłości).
const SPACE = { none: 0, sm: 8, md: 16, lg: 24, xl: 40 };
const RADIUS = { none: 0, sm: 6, md: 10, lg: 14, xl: 18, '2xl': 24, full: 9999 };
const SHADOW = {
  none: 'none',
  sm: '0 1px 2px rgba(0,0,0,0.06)',
  md: '0 4px 12px rgba(0,0,0,0.08)',
  lg: '0 10px 25px rgba(0,0,0,0.12)',
  xl: '0 20px 40px rgba(0,0,0,0.16)',
};

export function migrateOldStyle(style) {
  return style || {};
}

export function styleToCSS(style = {}) {
  const s = {};
  const st = migrateOldStyle(style);
  if (st.bg) s.backgroundColor = st.bg;
  if (st.color) s.color = st.color;
  if (st.align) s.textAlign = st.align;
  if (st.fontSize) s.fontSize = Number(st.fontSize);
  if (st.fontWeight) s.fontWeight = st.fontWeight;
  if (st.padding && SPACE[st.padding] != null) s.padding = SPACE[st.padding];
  if (st.marginTop && SPACE[st.marginTop] != null) s.marginTop = SPACE[st.marginTop];
  if (st.marginBottom && SPACE[st.marginBottom] != null) s.marginBottom = SPACE[st.marginBottom];
  if (st.radius && RADIUS[st.radius] != null) s.borderRadius = RADIUS[st.radius];
  if (st.border) s.border = `1px solid ${st.borderColor || 'rgba(0,0,0,0.1)'}`;
  if (st.shadow && SHADOW[st.shadow]) s.boxShadow = SHADOW[st.shadow];
  return s;
}

export function hasStyle(style) {
  return Object.keys(styleToCSS(style)).length > 0;
}

export const SPACE_OPTIONS = [
  { value: '', label: 'Domyślny' }, { value: 'none', label: 'Brak' },
  { value: 'sm', label: 'Mały' }, { value: 'md', label: 'Średni' },
  { value: 'lg', label: 'Duży' }, { value: 'xl', label: 'Bardzo duży' },
];
export const RADIUS_OPTIONS = [
  { value: '', label: 'Domyślne' }, { value: 'none', label: 'Brak' },
  { value: 'md', label: 'Średnie' }, { value: 'lg', label: 'Duże' },
  { value: 'xl', label: 'Bardzo duże' }, { value: '2xl', label: 'Największe' }, { value: 'full', label: 'Pełne' },
];
export const SHADOW_OPTIONS = [
  { value: '', label: 'Brak' }, { value: 'sm', label: 'Mały' },
  { value: 'md', label: 'Średni' }, { value: 'lg', label: 'Duży' }, { value: 'xl', label: 'Bardzo duży' },
];
