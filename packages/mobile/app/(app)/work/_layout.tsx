import { Stack } from 'expo-router';

// „Moje zadania” bez bramki module:boards — zadania z tablic służb (zakładki „Zadania” modułów)
// widzi także osoba bez dostępu do Projektów; serwer zawęża wiersze do tablic, które widzi.
// „boards” (lista tablic Projektów) ma własną bramkę module:boards; „[boardId]” (jedna tablica)
// — bez bramki, jak ekran zadania: o dostępie rozstrzyga serwer.
export default function WorkLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="boards" />
      <Stack.Screen name="[boardId]" />
    </Stack>
  );
}
