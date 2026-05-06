import { Stack } from 'expo-router';
import { useTheme } from '../../../src/contexts/ThemeContext';

export default function ProgramsLayout() {
  const { theme } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.background.secondary },
        headerTintColor: theme.colors.text.primary,
        headerTitleStyle: { fontFamily: 'Inter', fontWeight: '600' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Programy' }} />
      <Stack.Screen name="[id]" options={{ title: 'Szczegóły programu' }} />
    </Stack>
  );
}
