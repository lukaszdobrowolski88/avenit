import { Stack } from 'expo-router';

// Konto (zakładka). Podstrony (profil, 2FA, sesje) są na wspólnym stosie: app/(app)/account.
export default function AccountTabLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
