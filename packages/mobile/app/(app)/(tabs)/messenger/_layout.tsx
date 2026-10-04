import { Stack } from 'expo-router';
import { ModuleGate } from '../../../../src/components/ModuleGate';

// Lista rozmów (zakładka). Wątek i nowa rozmowa są na wspólnym stosie: app/(app)/messenger.
export default function MessengerTabLayout() {
  return (
    <ModuleGate moduleKey="komunikator">
      <Stack screenOptions={{ headerShown: false }} />
    </ModuleGate>
  );
}
