import { useEffect, useState } from 'react';
import { Text, TextInput, type TextStyle } from 'react-native';
import { useFonts } from 'expo-font';

// Krój marki: Manrope (księga znaku Avenit). Pliki statyczne w assets/fonts — bez paczki npm.
export const FONT = {
  light: 'Manrope_300Light',
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extrabold: 'Manrope_800ExtraBold',
} as const;

export const familyForWeight = (
  weight: TextStyle['fontWeight'] | string | number | undefined,
): string => {
  const w = String(weight ?? '');
  if (w === '800' || w === '900') return FONT.extrabold;
  if (w === '700' || w === 'bold') return FONT.bold;
  if (w === '600') return FONT.semibold;
  if (w === '500') return FONT.medium;
  if (w === '300' || w === '200' || w === '100') return FONT.light;
  return FONT.regular;
};

let defaultsApplied = false;
const applyDefaults = () => {
  if (defaultsApplied) return;
  defaultsApplied = true;
  const TextAny = Text as unknown as { defaultProps?: { style?: unknown } };
  TextAny.defaultProps = TextAny.defaultProps ?? {};
  TextAny.defaultProps.style = [
    { fontFamily: FONT.regular },
    TextAny.defaultProps.style,
  ];
  const InputAny = TextInput as unknown as { defaultProps?: { style?: unknown } };
  InputAny.defaultProps = InputAny.defaultProps ?? {};
  InputAny.defaultProps.style = [
    { fontFamily: FONT.regular },
    InputAny.defaultProps.style,
  ];
};

export const useAppFonts = () => {
  const [loaded, error] = useFonts({
    [FONT.light]: require('../../assets/fonts/Manrope_300Light.ttf'),
    [FONT.regular]: require('../../assets/fonts/Manrope_400Regular.ttf'),
    [FONT.medium]: require('../../assets/fonts/Manrope_500Medium.ttf'),
    [FONT.semibold]: require('../../assets/fonts/Manrope_600SemiBold.ttf'),
    [FONT.bold]: require('../../assets/fonts/Manrope_700Bold.ttf'),
    [FONT.extrabold]: require('../../assets/fonts/Manrope_800ExtraBold.ttf'),
  });
  // Zabezpieczenie: NIGDY nie blokuj startu na fontach. Gdyby `useFonts` zwróciło
  // błąd albo utknęło (asset/bundling), po timeoutcie i tak wchodzimy do apki
  // (fonty systemowe jako fallback) — inaczej apka wisi na ekranie startowym.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 2500);
    return () => clearTimeout(t);
  }, []);
  const ready = loaded || !!error || timedOut;
  useEffect(() => {
    if (ready) applyDefaults();
  }, [ready]);
  return ready;
};
