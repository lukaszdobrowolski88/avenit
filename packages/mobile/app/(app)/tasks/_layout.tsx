import { Stack } from 'expo-router';

// Zadanie (element tablicy) — bez ModuleGate: zadanie służby otwiera każdy, kto ma dostęp do tej
// służby (nie tylko module:boards), a zadanie Kalendarza — kto ma Kalendarz. O dostępie
// rozstrzyga serwer; ekran pokazuje „Brak dostępu”, gdy odmówi.
export default function TasksLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
