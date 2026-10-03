import { Stack } from 'expo-router';
import { ModuleGate } from '../../../src/components/ModuleGate';

export default function SermonsLayout() {
  return (
    <ModuleGate moduleKey="sermons">
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="[id]" />
      </Stack>
    </ModuleGate>
  );
}
