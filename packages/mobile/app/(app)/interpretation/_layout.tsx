import { Stack } from 'expo-router';

// Tłumaczenie na żywo (słuchacz) — bez ModuleGate: dostęp sprawdza serwer (widzę wydarzenie
// albo mam publiczny link), a link z plakatu/czatu ma działać niezależnie od menu modułów.
export default function InterpretationLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
