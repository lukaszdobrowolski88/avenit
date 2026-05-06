import { Text, type TextProps, type TextStyle, StyleSheet } from 'react-native';
import { FONT, familyForWeight } from '../../lib/fonts';

type Weight = 'regular' | 'medium' | 'semibold' | 'bold' | 'extrabold';

interface Props extends TextProps {
  weight?: Weight;
}

const familyFor = (w?: Weight): string => {
  switch (w) {
    case 'extrabold':
      return FONT.extrabold;
    case 'bold':
      return FONT.bold;
    case 'semibold':
      return FONT.semibold;
    case 'medium':
      return FONT.medium;
    case 'regular':
      return FONT.regular;
    default:
      return '';
  }
};

/**
 * Drop-in replacement for <Text/> that applies the correct Inter weight.
 * Picks family from explicit `weight` prop, else from style fontWeight.
 * Always strips `fontWeight` so iOS doesn't fake-bold the variable font.
 */
export const Txt = ({ weight, style, ...rest }: Props) => {
  const flat = StyleSheet.flatten(style as TextStyle | TextStyle[] | undefined) ?? {};
  const explicit = familyFor(weight);
  const family = explicit || flat.fontFamily || familyForWeight(flat.fontWeight);
  return (
    <Text
      {...rest}
      style={[style, { fontFamily: family, fontWeight: undefined }]}
    />
  );
};
