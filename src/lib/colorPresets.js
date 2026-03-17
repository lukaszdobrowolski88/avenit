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

export function applyColorPreset(presetKey) {
  const preset = COLOR_PRESETS[presetKey];
  if (!preset) return;

  const root = document.documentElement;
  root.style.setProperty('--accent-primary', preset.primary.DEFAULT);
  root.style.setProperty('--accent-primary-light', preset.primary.light);
  root.style.setProperty('--accent-primary-lighter', preset.primary.lighter);
  root.style.setProperty('--accent-primary-lightest', preset.primary.lightest);
  root.style.setProperty('--accent-primary-dark', preset.primary.dark);
  root.style.setProperty('--accent-primary-darkest', preset.primary.darkest);

  root.style.setProperty('--accent-secondary', preset.secondary.DEFAULT);
  root.style.setProperty('--accent-secondary-light', preset.secondary.light);
  root.style.setProperty('--accent-secondary-lighter', preset.secondary.lighter);
  root.style.setProperty('--accent-secondary-lightest', preset.secondary.lightest);
  root.style.setProperty('--accent-secondary-dark', preset.secondary.dark);
  root.style.setProperty('--accent-secondary-darkest', preset.secondary.darkest);

  localStorage.setItem('color_preset', presetKey);
}

export function getPresetKey() {
  return localStorage.getItem('color_preset') || 'pink-orange';
}

// Zastosuj preset natychmiast przy imporcie (przed renderem React)
applyColorPreset(getPresetKey());
