import { Stack } from 'expo-router';

export default function GivingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="donate" />
    </Stack>
  );
}
