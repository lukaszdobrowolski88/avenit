import { COLOR_PRESETS, rgbTripletToColor, generateShades } from '@schtomy/shared';

export interface AccentColors {
  primary: string;
  primaryLight: string;
  primaryLighter: string;
  primaryLightest: string;
  primaryDark: string;
  primaryDarkest: string;
  secondary: string;
  secondaryLight: string;
  secondaryLighter: string;
  secondaryLightest: string;
  secondaryDark: string;
  secondaryDarkest: string;
}

export interface ThemeColors {
  accent: AccentColors;
  background: {
    primary: string;
    secondary: string;
    tertiary: string;
  };
  text: {
    primary: string;
    secondary: string;
    muted: string;
    inverse: string;
  };
  border: {
    default: string;
    light: string;
  };
  card: {
    background: string;
    border: string;
  };
  input: {
    background: string;
    border: string;
    placeholder: string;
  };
  tabBar: {
    background: string;
    border: string;
    active: string;
    inactive: string;
  };
}

export interface Theme {
  dark: boolean;
  colors: ThemeColors;
}

function presetsToAccent(preset: typeof COLOR_PRESETS[keyof typeof COLOR_PRESETS]): AccentColors {
  return {
    primary: rgbTripletToColor(preset.primary.DEFAULT),
    primaryLight: rgbTripletToColor(preset.primary.light),
    primaryLighter: rgbTripletToColor(preset.primary.lighter),
    primaryLightest: rgbTripletToColor(preset.primary.lightest),
    primaryDark: rgbTripletToColor(preset.primary.dark),
    primaryDarkest: rgbTripletToColor(preset.primary.darkest),
    secondary: rgbTripletToColor(preset.secondary.DEFAULT),
    secondaryLight: rgbTripletToColor(preset.secondary.light),
    secondaryLighter: rgbTripletToColor(preset.secondary.lighter),
    secondaryLightest: rgbTripletToColor(preset.secondary.lightest),
    secondaryDark: rgbTripletToColor(preset.secondary.dark),
    secondaryDarkest: rgbTripletToColor(preset.secondary.darkest),
  };
}

function customToAccent(primaryHex: string, secondaryHex: string): AccentColors {
  const p = generateShades(primaryHex);
  const s = generateShades(secondaryHex);
  return {
    primary: rgbTripletToColor(p.DEFAULT),
    primaryLight: rgbTripletToColor(p.light),
    primaryLighter: rgbTripletToColor(p.lighter),
    primaryLightest: rgbTripletToColor(p.lightest),
    primaryDark: rgbTripletToColor(p.dark),
    primaryDarkest: rgbTripletToColor(p.darkest),
    secondary: rgbTripletToColor(s.DEFAULT),
    secondaryLight: rgbTripletToColor(s.light),
    secondaryLighter: rgbTripletToColor(s.lighter),
    secondaryLightest: rgbTripletToColor(s.lightest),
    secondaryDark: rgbTripletToColor(s.dark),
    secondaryDarkest: rgbTripletToColor(s.darkest),
  };
}

export function getAccentColors(presetKey: string, customPrimary?: string, customSecondary?: string): AccentColors {
  if (presetKey === 'custom' && customPrimary && customSecondary) {
    return customToAccent(customPrimary, customSecondary);
  }
  const preset = COLOR_PRESETS[presetKey as keyof typeof COLOR_PRESETS];
  if (!preset) {
    return presetsToAccent(COLOR_PRESETS['amber-yellow']);
  }
  return presetsToAccent(preset);
}

export function buildTheme(dark: boolean, accent: AccentColors): Theme {
  if (dark) {
    return {
      dark: true,
      colors: {
        accent,
        background: {
          primary: '#111827',    // gray-900
          secondary: '#1f2937',  // gray-800
          tertiary: '#374151',   // gray-700
        },
        text: {
          primary: '#f9fafb',    // gray-50
          secondary: '#d1d5db',  // gray-300
          muted: '#9ca3af',      // gray-400
          inverse: '#111827',
        },
        border: {
          default: '#374151',    // gray-700
          light: '#4b5563',      // gray-600
        },
        card: {
          background: '#1f2937', // gray-800
          border: '#374151',
        },
        input: {
          background: '#374151',
          border: '#4b5563',
          placeholder: '#9ca3af',
        },
        tabBar: {
          background: '#1f2937',
          border: '#374151',
          active: accent.primary,
          inactive: '#9ca3af',
        },
      },
    };
  }

  return {
    dark: false,
    colors: {
      accent,
      background: {
        primary: '#f9fafb',    // gray-50
        secondary: '#ffffff',
        tertiary: '#f3f4f6',   // gray-100
      },
      text: {
        primary: '#111827',    // gray-900
        secondary: '#4b5563',  // gray-600
        muted: '#9ca3af',      // gray-400
        inverse: '#ffffff',
      },
      border: {
        default: '#e5e7eb',    // gray-200
        light: '#f3f4f6',      // gray-100
      },
      card: {
        background: '#ffffff',
        border: '#e5e7eb',
      },
      input: {
        background: '#f9fafb',
        border: '#d1d5db',
        placeholder: '#9ca3af',
      },
      tabBar: {
        background: '#ffffff',
        border: '#e5e7eb',
        active: accent.primary,
        inactive: '#9ca3af',
      },
    },
  };
}

// Domyślny motyw
const defaultAccent = getAccentColors('amber-yellow');
export const defaultTheme = buildTheme(false, defaultAccent);
