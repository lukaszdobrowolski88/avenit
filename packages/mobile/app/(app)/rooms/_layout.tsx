import { Stack } from 'expo-router';
import { ModuleGate } from '../../../src/components/ModuleGate';

export default function RoomsLayout() {
  return (
    <ModuleGate moduleKey="rooms">
      <Stack screenOptions={{ headerShown: false }} />
    </ModuleGate>
  );
}
