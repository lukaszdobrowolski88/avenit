import { Stack } from "expo-router";
import { ModuleGate } from "../../../src/components/ModuleGate";

export default function MessengerLayout() {
  return (
    <ModuleGate moduleKey="komunikator">
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="new" />
        <Stack.Screen name="[conversationId]" options={{ headerShown: false }} />
      </Stack>
    </ModuleGate>
  );
}
