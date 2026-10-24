import { Stack } from 'expo-router';
import { ModuleGate } from '../../../src/components/ModuleGate';

// Social Media — z module:social (jak trasa /social na webie); prawa szczegółowe liczy serwer.
export default function SocialLayout() {
  return (
    <ModuleGate moduleKey="social">
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="compose" />
        <Stack.Screen name="channels" />
        <Stack.Screen name="inbox" />
        <Stack.Screen name="post/[id]" />
      </Stack>
    </ModuleGate>
  );
}
