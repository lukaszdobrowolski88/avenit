// Design system „north-star" — czysta, świeża paleta wspólnotowa (bursztyn + pastele).
// Źródło prawdy dla nowego wyglądu mobile. Używaj przez useDS() (reaguje na tryb ciemny).
import { useColorScheme } from 'nativewind';
import { Platform } from 'react-native';

export interface Palette {
  ground: string; ground2: string;
  ink: string; inkSoft: string;
  card: string; line: string;
  amber: string; amberDeep: string; amberTint: string; amberInk: string;
  rose: string; roseInk: string;
  green: string; greenInk: string;
  sky: string; skyInk: string;
  violet: string; violetInk: string;
  online: string; onAccent: string;
}

const light: Palette = {
  ground: '#FBFAF7', ground2: '#F1EFEA',
  ink: '#1F1A24', inkSoft: '#847E8A',
  card: '#FFFFFF', line: '#ECE9E4',
  amber: '#F5911F', amberDeep: '#E27A0C', amberTint: '#FFEFD6', amberInk: '#C96B08',
  rose: '#FFE1EB', roseInk: '#E5487F',
  green: '#D8F4E3', greenInk: '#12A257',
  sky: '#DFEDFF', skyInk: '#2C7BE0',
  violet: '#ECE4FF', violetInk: '#7A52E6',
  online: '#34C759', onAccent: '#FFFFFF',
};

const dark: Palette = {
  ground: '#141216', ground2: '#1E1B22',
  ink: '#F4EFF6', inkSoft: '#A69FAC',
  card: '#232029', line: '#332F3A',
  amber: '#FBA43C', amberDeep: '#F5911F', amberTint: '#3A2A13', amberInk: '#FBA43C',
  rose: '#3C2130', roseInk: '#FF9DC0',
  green: '#15392A', greenInk: '#4FD293',
  sky: '#152A44', skyInk: '#7DB4F5',
  violet: '#271F42', violetInk: '#B79BF5',
  online: '#34C759', onAccent: '#FFFFFF',
};

/** Kolory „tint" (tło + atrament) dla modułów — kolorowe chipy ikon. */
export type Tint = 'amber' | 'rose' | 'green' | 'sky' | 'violet';
export function tintBg(c: Palette, t: Tint): string {
  return { amber: c.amberTint, rose: c.rose, green: c.green, sky: c.sky, violet: c.violet }[t];
}
export function tintInk(c: Palette, t: Tint): string {
  return { amber: c.amberInk, rose: c.roseInk, green: c.greenInk, sky: c.skyInk, violet: c.violetInk }[t];
}

/** Gradienty (expo-linear-gradient przyjmuje tablicę). */
export const grad = {
  amber: ['#FFB24D', '#F5911F', '#EA7B12'] as const,
  amberAvatar: ['#FFB84E', '#F5911F'] as const,
  rose: ['#FF9FBB', '#E5487F'] as const,
  green: ['#4FD08C', '#12A257'] as const,
  sky: ['#6FB0F5', '#2C7BE0'] as const,
  violet: ['#9E72F8', '#7A52E6'] as const,
};

export const radius = { card: 24, chip: 20, tile: 20, pill: 16, sm: 14, icon: 14 } as const;
export const space = { screen: 20, gap: 12, section: 22 } as const;

export const font = {
  heavy: 'Inter_800ExtraBold',
  display: 'Inter_800ExtraBold',
  bold: 'Inter_700Bold',
  semibold: 'Inter_600SemiBold',
  medium: 'Inter_500Medium',
  regular: 'Inter_400Regular',
} as const;

/** Miękki, wielowarstwowy cień kart (iOS: shadow*, Android: elevation). */
export function cardShadow(isDark: boolean) {
  if (Platform.OS === 'android') return { elevation: 2 };
  return {
    shadowColor: isDark ? '#000000' : '#2A1E3C',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: isDark ? 0.4 : 0.07,
    shadowRadius: 16,
  };
}
export function accentShadow(color: string) {
  if (Platform.OS === 'android') return { elevation: 6 };
  return { shadowColor: color, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.34, shadowRadius: 16 };
}

export function useDS(): { dark: boolean; c: Palette } {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  return { dark: isDark, c: isDark ? dark : light };
}

export const palettes = { light, dark };
