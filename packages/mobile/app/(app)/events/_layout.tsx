import { Stack } from 'expo-router';
import { ModuleGate } from '../../../src/components/ModuleGate';

export default function EventsLayout() {
  return (
    <ModuleGate moduleKey="calendar">
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="[id]" />
      </Stack>
    </ModuleGate>
  );
}
