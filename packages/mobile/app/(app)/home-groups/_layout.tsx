import { Stack } from 'expo-router';
import { ModuleGate } from '../../../src/components/ModuleGate';

export default function HomeGroupsLayout() {
  return (
    <ModuleGate moduleKey="homegroups">
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="[id]" />
        <Stack.Screen name="map" />
      </Stack>
    </ModuleGate>
  );
}
