import { Stack } from 'expo-router';
import { ModuleGate } from '../../../../src/components/ModuleGate';

// Kampanie push — tylko z module:push_campaigns (jak trasa na webie); wysyłka dodatkowo action:push_campaigns:send.
export default function PushCampaignsLayout() {
  return (
    <ModuleGate moduleKey="push_campaigns">
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="new" />
      </Stack>
    </ModuleGate>
  );
}
