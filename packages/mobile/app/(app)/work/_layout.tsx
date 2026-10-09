import { Stack } from 'expo-router';

// „Moje zadania” bez bramki module:boards — zadania z tablic służb (zakładki „Zadania” modułów)
// widzi także osoba bez dostępu do Projektów; serwer zawęża wiersze do tablic, które widzi.
export default function WorkLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
