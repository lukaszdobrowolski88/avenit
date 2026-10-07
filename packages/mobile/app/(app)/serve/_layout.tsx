import { Stack } from 'expo-router';

export default function ServeLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Moduł „Dostępność” (lider): niedostępności wszystkich wolontariuszy. */}
      <Stack.Screen name="index" />
      {/* „Moje nieobecności” — każdy zgłasza własne. */}
      <Stack.Screen name="availability" />
    </Stack>
  );
}
