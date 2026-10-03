import { Stack } from 'expo-router';
import { ModuleGate } from '../../../src/components/ModuleGate';

export default function MembersLayout() {
  return (
    <ModuleGate moduleKey="members">
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="[id]" options={{ headerShown: true, title: 'Profil' }} />
      </Stack>
    </ModuleGate>
  );
}
