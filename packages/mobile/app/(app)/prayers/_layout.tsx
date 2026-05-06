import { Stack } from 'expo-router';

export default function PrayersLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="new"
        options={{ presentation: 'modal', headerShown: true, title: 'Nowa intencja' }}
      />
    </Stack>
  );
}
