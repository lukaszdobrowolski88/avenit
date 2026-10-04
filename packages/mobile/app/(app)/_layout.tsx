import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuthSession } from '../../src/lib/auth';
import { FloatingTabBar } from '../../src/components/navigation/FloatingTabBar';

// Nawigacja: pięć zakładek w (tabs), a wszystkie pozostałe ekrany na JEDNYM wspólnym stosie
// nad nimi. Każde wejście dokłada ekran do tej samej historii, więc „wstecz” zawsze wraca
// tam, skąd się przyszło (wcześniej sekcje były ukrytymi zakładkami z własnymi stosami —
// wstecz skakało na Start albo na zapamiętany wcześniej ekran sekcji).
// Pasek zakładek to nakładka nad całym stosem.
export const unstable_settings = {
  // Wejście z linku (powiadomienie) prosto w ekran — pod spodem i tak są zakładki.
  initialRouteName: '(tabs)',
};

export default function AppLayout() {
  const { session, loading } = useAuthSession();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F6F4EE' }}>
        <ActivityIndicator color="#2A2312" />
      </View>
    );
  }
  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
      <FloatingTabBar />
    </View>
  );
}
