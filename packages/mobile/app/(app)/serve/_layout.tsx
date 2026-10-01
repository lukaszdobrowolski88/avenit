import { Stack } from 'expo-router';

export default function ServeLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="availability" />
    </Stack>
  );
}
