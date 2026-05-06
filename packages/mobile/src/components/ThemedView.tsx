import { View, ViewProps, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

interface ThemedViewProps extends ViewProps {
  variant?: 'primary' | 'secondary' | 'tertiary' | 'card';
}

export function ThemedView({ style, variant = 'primary', ...props }: ThemedViewProps) {
  const { theme } = useTheme();

  const backgrounds = {
    primary: theme.colors.background.primary,
    secondary: theme.colors.background.secondary,
    tertiary: theme.colors.background.tertiary,
    card: theme.colors.card.background,
  };

  return (
    <View
      style={[{ backgroundColor: backgrounds[variant] }, style]}
      {...props}
    />
  );
}
