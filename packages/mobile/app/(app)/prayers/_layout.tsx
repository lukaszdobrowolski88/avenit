import { Stack } from 'expo-router';
import { ModuleGate } from '../../../src/components/ModuleGate';

export default function PrayersLayout() {
  return (
    <ModuleGate moduleKey="prayer">
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen
          name="new"
          options={{ presentation: 'modal', headerShown: true, title: 'Nowa intencja' }}
        />
      </Stack>
    </ModuleGate>
  );
}
