import { Stack } from 'expo-router';

export default function TeamsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[ministry]" />
    </Stack>
  );
}
