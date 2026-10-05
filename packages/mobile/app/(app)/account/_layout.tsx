import { Stack } from 'expo-router';

export default function AccountLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="edit-profile" />
      <Stack.Screen name="two-factor" />
      <Stack.Screen name="sessions" />
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="dashboard-items" />
    </Stack>
  );
}
