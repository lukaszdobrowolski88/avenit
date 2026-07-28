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
  if (st.letterSpacing) s.letterSpacing = st.letterSpacing;
  if (st.textTransform) s.textTransform = st.textTransform;
  if (st.gradient?.from && st.gradient?.to) s.backgroundImage = `linear-gradient(${st.gradient.dir || 'to right'}, ${st.gradient.from}, ${st.gradient.to})`;
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

// Efekt hover — jako klasy Tailwind (nie inline).
export function hoverClass(style = {}) {
  const map = {
    lift: 'transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg',
    scale: 'transition-transform duration-200 hover:scale-[1.03]',
    glow: 'transition-shadow duration-200 hover:shadow-xl hover:shadow-accent-primary-light/30',
  };
  return map[style.hover] || '';
}
export const HOVER_OPTIONS = [
  { value: '', label: 'Brak' }, { value: 'lift', label: 'Uniesienie' },
  { value: 'scale', label: 'Powiększenie' }, { value: 'glow', label: 'Poświata' },
];
export const GRADIENT_DIR_OPTIONS = [
  { value: 'to right', label: 'W prawo →' }, { value: 'to bottom right', label: 'Ukośnie ↘' },
  { value: 'to bottom', label: 'W dół ↓' }, { value: 'to top right', label: 'Ukośnie ↗' },
];
export const TRANSFORM_OPTIONS = [
  { value: '', label: 'Normalny' }, { value: 'uppercase', label: 'WERSALIKI' },
  { value: 'capitalize', label: 'Kapitaliki' }, { value: 'lowercase', label: 'małe litery' },
];
export const LETTER_OPTIONS = [
  { value: '', label: 'Domyślny' }, { value: '-0.02em', label: 'Ciasny' },
  { value: '0.05em', label: 'Luźny' }, { value: '0.1em', label: 'Bardzo luźny' },
];
export const WEIGHT_OPTIONS = [
  { value: '', label: 'Domyślna' }, { value: '400', label: 'Normalna' },
  { value: '500', label: 'Średnia' }, { value: '600', label: 'Półgruba' }, { value: '700', label: 'Gruba' },
];
