import { Stack } from 'expo-router';
import { ModuleGate } from '../../../src/components/ModuleGate';

export default function FinanceLayout() {
  return (
    <ModuleGate moduleKey="finance">
      <Stack screenOptions={{ headerShown: false }} />
    </ModuleGate>
  );
}
