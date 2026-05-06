import { Text, TextProps, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

interface ThemedTextProps extends TextProps {
  variant?: 'primary' | 'secondary' | 'muted' | 'inverse';
  size?: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl';
  weight?: 'normal' | 'medium' | 'semibold' | 'bold';
}

const sizes = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
};

const weights: Record<string, TextProps['style']> = {
  normal: { fontWeight: '400' },
  medium: { fontWeight: '500' },
  semibold: { fontWeight: '600' },
  bold: { fontWeight: '700' },
};

export function ThemedText({
  style,
  variant = 'primary',
  size = 'base',
  weight = 'normal',
  ...props
}: ThemedTextProps) {
  const { theme } = useTheme();

  return (
    <Text
      style={[
        {
          color: theme.colors.text[variant],
          fontSize: sizes[size],
          fontFamily: 'Inter',
        },
        weights[weight],
        style,
      ]}
      {...props}
    />
  );
}
