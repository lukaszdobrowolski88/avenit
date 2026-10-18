import { Stack } from 'expo-router';
import { ModuleGate } from '../../../../src/components/ModuleGate';

// Kampanie sms — tylko z module:sms_campaigns (jak trasa na webie); wysyłka dodatkowo action:sms_campaigns:send.
export default function SmsCampaignsLayout() {
  return (
    <ModuleGate moduleKey="sms_campaigns">
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="new" />
      </Stack>
    </ModuleGate>
  );
}
