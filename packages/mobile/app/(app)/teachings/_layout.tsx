import { Stack } from 'expo-router';
import { ModuleGate } from '../../../src/components/ModuleGate';

export default function TeachingsLayout() {
  return (
    <ModuleGate moduleKey="teaching">
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
      </Stack>
    </ModuleGate>
  );
}
