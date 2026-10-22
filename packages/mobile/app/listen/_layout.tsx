import { Stack } from 'expo-router';

// Ekrany linków tłumaczenia na żywo (Universal Links / App Links, kod QR) — POZA (app), więc działają
// bez logowania: publiczny słuchacz z tokenu, bramka słuchania z konta, przekierowanie do przeglądarki.
export default function ListenLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
