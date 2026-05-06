import { Stack } from 'expo-router';
import { useTheme } from '../../../src/contexts/ThemeContext';

export default function MoreLayout() {
  const { theme } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.background.secondary },
        headerTintColor: theme.colors.text.primary,
        headerTitleStyle: { fontFamily: 'Inter', fontWeight: '600' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Więcej' }} />
      <Stack.Screen name="calendar" options={{ title: 'Kalendarz' }} />
      <Stack.Screen name="members" options={{ title: 'Członkowie' }} />
      <Stack.Screen name="kids" options={{ title: 'Małe SCH TOMY' }} />
      <Stack.Screen name="profile" options={{ title: 'Profil' }} />
      <Stack.Screen name="settings" options={{ title: 'Ustawienia' }} />
    </Stack>
  );
}
