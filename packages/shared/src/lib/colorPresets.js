// Presety kolorów - każdy kolor jako RGB triplet (dla Tailwind opacity)
export const COLOR_PRESETS = {
  'pink-orange': {
    label: 'Różowo-Pomarańczowy',
    primary: { lightest: '253 242 248', lighter: '252 231 243', light: '236 72 153', DEFAULT: '219 39 119', dark: '157 23 77', darkest: '131 24 67' },
    secondary: { lightest: '255 247 237', lighter: '255 237 213', light: '249 115 22', DEFAULT: '234 88 12', dark: '154 52 18', darkest: '124 45 18' },
    preview: ['#db2777', '#ea580c']
  },
  'blue-indigo': {
    label: 'Niebiesko-Indygo',
    primary: { lightest: '239 246 255', lighter: '219 234 254', light: '59 130 246', DEFAULT: '37 99 235', dark: '30 64 175', darkest: '30 58 138' },
    secondary: { lightest: '238 242 255', lighter: '224 231 255', light: '99 102 241', DEFAULT: '79 70 229', dark: '55 48 163', darkest: '49 46 129' },
    preview: ['#2563eb', '#4f46e5']
  },
  'emerald-teal': {
    label: 'Szmaragdowo-Morski',
    primary: { lightest: '236 253 245', lighter: '209 250 229', light: '16 185 129', DEFAULT: '5 150 105', dark: '6 95 70', darkest: '6 78 59' },
    secondary: { lightest: '240 253 250', lighter: '204 251 241', light: '20 184 166', DEFAULT: '13 148 136', dark: '17 94 89', darkest: '19 78 74' },
    preview: ['#059669', '#0d9488']
  },
  'violet-purple': {
    label: 'Fioletowy',
    primary: { lightest: '245 243 255', lighter: '237 233 254', light: '139 92 246', DEFAULT: '124 58 237', dark: '91 33 182', darkest: '76 29 149' },
    secondary: { lightest: '250 245 255', lighter: '243 232 255', light: '168 85 247', DEFAULT: '147 51 234', dark: '107 33 168', darkest: '88 28 135' },
    preview: ['#7c3aed', '#9333ea']
  },
  'rose-red': {
    label: 'Czerwono-Różowy',
    primary: { lightest: '255 241 242', lighter: '255 228 230', light: '244 63 94', DEFAULT: '225 29 72', dark: '159 18 57', darkest: '136 19 55' },
    secondary: { lightest: '254 242 242', lighter: '254 226 226', light: '239 68 68', DEFAULT: '220 38 38', dark: '153 27 27', darkest: '127 29 29' },
    preview: ['#e11d48', '#dc2626']
  },
  'amber-yellow': {
    label: 'Bursztynowo-Żółty',
    primary: { lightest: '255 251 235', lighter: '254 243 199', light: '245 158 11', DEFAULT: '217 119 6', dark: '146 64 14', darkest: '120 53 15' },
    secondary: { lightest: '254 252 232', lighter: '254 249 195', light: '234 179 8', DEFAULT: '202 138 4', dark: '133 77 14', darkest: '113 63 18' },
    preview: ['#d97706', '#ca8a04']
  },
};

// Konwersja hex -> RGB triplet string
export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r} ${g} ${b}`;
}

// Mieszaj kolor z białym (rozjaśnij) lub czarnym (ściemnij)
export function mixColor(hex, factor) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  if (factor > 0) {
    return `${Math.round(r + (255 - r) * factor)} ${Math.round(g + (255 - g) * factor)} ${Math.round(b + (255 - b) * factor)}`;
  }
  const f = 1 + factor;
  return `${Math.round(r * f)} ${Math.round(g * f)} ${Math.round(b * f)}`;
}

// Generuj pełny zestaw odcieni z jednego koloru hex
export function generateShades(hex) {
  return {
    lightest: mixColor(hex, 0.92),
    lighter: mixColor(hex, 0.82),
    light: hexToRgb(hex),
    DEFAULT: mixColor(hex, -0.15),
    dark: mixColor(hex, -0.45),
    darkest: mixColor(hex, -0.55),
  };
}

/**
 * Konwersja RGB triplet ('217 119 6') na rgb() string ('rgb(217,119,6)')
 * Używane przez mobile do tworzenia kolorów z presetów
 */
export function rgbTripletToColor(triplet) {
  return `rgb(${triplet.replace(/ /g, ',')})`;
}

/**
 * Pobiera pełną paletę kolorów dla danego presetu w formacie rgb()
 * Używane przez mobile ThemeContext
 */
export function getPresetColors(presetKey) {
  const preset = COLOR_PRESETS[presetKey];
  if (!preset) return null;

  const convert = (shades) => ({
    lightest: rgbTripletToColor(shades.lightest),
    lighter: rgbTripletToColor(shades.lighter),
    light: rgbTripletToColor(shades.light),
    DEFAULT: rgbTripletToColor(shades.DEFAULT),
    dark: rgbTripletToColor(shades.dark),
    darkest: rgbTripletToColor(shades.darkest),
  });

  return {
    primary: convert(preset.primary),
    secondary: convert(preset.secondary),
    label: preset.label,
    preview: preset.preview,
  };
}
