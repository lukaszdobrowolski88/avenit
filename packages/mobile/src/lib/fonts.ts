import { useEffect } from 'react';
import { Text, TextInput, type TextStyle } from 'react-native';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';

export const FONT = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
} as const;

export const familyForWeight = (
  weight: TextStyle['fontWeight'] | string | number | undefined,
): string => {
  const w = String(weight ?? '');
  if (w === '800' || w === '900') return FONT.extrabold;
  if (w === '700' || w === 'bold') return FONT.bold;
  if (w === '600') return FONT.semibold;
  if (w === '500') return FONT.medium;
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
  const [loaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });
  useEffect(() => {
    if (loaded) applyDefaults();
  }, [loaded]);
  return loaded;
};
