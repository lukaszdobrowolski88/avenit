import { Stack } from 'expo-router';
import { ModuleGate } from '../../../src/components/ModuleGate';

export default function FormsLayout() {
  return (
    <ModuleGate moduleKey="forms">
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
      </Stack>
    </ModuleGate>
  );
}
