import { Stack } from 'expo-router';
import { ModuleGate } from '../../../src/components/ModuleGate';

export default function CalendarLayout() {
  return (
    <ModuleGate moduleKey="calendar">
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
      </Stack>
    </ModuleGate>
  );
}
