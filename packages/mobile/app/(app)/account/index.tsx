import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Bell,
  BookOpen,
  ClipboardList,
  Fingerprint,
  FolderOpen,
  Heart,
  Home,
  KeyRound,
  LogOut,
  Moon,
  Palette,
  Shield,
  ShieldCheck,
  Smartphone,
  Users,
} from 'lucide-react-native';
import * as Notifications from 'expo-notifications';
import { useColorScheme } from 'nativewind';
import { useAuthSession, signOut } from '../../../src/lib/auth';
import {
  isBiometricEnabled,
  setBiometricEnabled,
  authenticateWithBiometric,
  getBiometricCapability,
} from '../../../src/lib/biometric';
import { GradientAvatar } from '../../../src/components/ui/GradientAvatar';
import { SettingsGroup, SettingsRow } from '../../../src/components/ui/SettingsRow';
import { CampusSelector } from '../../../src/components/CampusSelector';
import { useCampus } from '../../../src/contexts/CampusContext';

export default function AccountScreen() {
  const router = useRouter();
  const { user } = useAuthSession();
  const { colorScheme, setColorScheme } = useColorScheme();
  const { campuses } = useCampus();

  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricOn, setBiometricOn] = useState(false);
  const [pushOn, setPushOn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cap = await getBiometricCapability();
      const enabled = await isBiometricEnabled();
      const perm = await Notifications.getPermissionsAsync();
      if (cancelled) return;
      setBiometricSupported(cap.available);
      setBiometricOn(enabled && cap.available);
      setPushOn(perm.status === 'granted');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleBiometricToggle = async (next: boolean) => {
    if (!biometricSupported) return;
    if (next) {
      const ok = await authenticateWithBiometric('Włącz biometrykę dla Avenit');
      if (!ok) return;
    }
    await setBiometricEnabled(next);
    setBiometricOn(next);
  };

  const handlePushToggle = async (next: boolean) => {
    if (next) {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Powiadomienia wyłączone',
          'Aby otrzymywać powiadomienia, włącz je w ustawieniach systemu.',
        );
        return;
      }
      setPushOn(true);
    } else {
      Alert.alert(
        'Wyłączyć powiadomienia?',
        'Powiadomienia możesz w pełni wyłączyć w ustawieniach systemu Twojego urządzenia.',
        [{ text: 'OK' }],
      );
    }
  };

  const handleSignOut = async () => {
    Alert.alert('Wylogować?', 'Konto zostanie odłączone od urządzenia.', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Wyloguj',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const email = user?.email ?? '—';
  const initial = email.charAt(0).toUpperCase();
  const isDark = colorScheme === 'dark';
  const showCampusSection = campuses.length > 0;

  return (
    <ScrollView
      className="flex-1"
      style={{ backgroundColor: '#ffffff' }}
      contentContainerStyle={{ paddingBottom: 120 }}
    >
      <View className="items-center pt-12 pb-8 px-4">
        <GradientAvatar initial={initial} size={88} />
        <Text
          className="mt-4 text-[18px]"
          style={{
            color: '#0c0a09',
            letterSpacing: -0.4,
            fontFamily: 'Inter_700Bold',
          }}
        >
          {email}
        </Text>
        <Text
          className="text-[12px] mt-1"
          style={{ color: '#78716c', fontFamily: 'Inter_500Medium' }}
        >
          Konto
        </Text>
      </View>

      {showCampusSection ? (
        <View className="mb-4">
          <Text
            className="text-[11px] uppercase mx-5 mb-2"
            style={{
              color: '#78716c',
              letterSpacing: 0.6,
              fontFamily: 'Inter_700Bold',
            }}
          >
            Lokalizacja
          </Text>
          <View className="mx-4">
            <CampusSelector />
          </View>
          <Text
            className="text-[11px] mx-5 mt-2"
            style={{
              color: '#a8a29e',
              fontFamily: 'Inter_500Medium',
              lineHeight: 16,
            }}
          >
            Filtruje członków, programy i kalendarz po wybranej lokalizacji.
          </Text>
        </View>
      ) : null}

      <SettingsGroup title="Wygląd">
        <SettingsRow
          variant="toggle"
          Icon={Moon}
          iconTint="#7c3aed"
          iconBg="#ede9fe"
          title="Tryb ciemny"
          description={isDark ? 'Włączony' : 'Zgodny z systemem'}
          value={isDark}
          onValueChange={(v) => setColorScheme(v ? 'dark' : 'light')}
        />
        <SettingsRow
          variant="nav"
          Icon={Palette}
          iconTint="#0891b2"
          iconBg="#cffafe"
          title="Motyw systemowy"
          description="Dopasuj automatycznie do urządzenia"
          onPress={() => setColorScheme('system')}
        />
      </SettingsGroup>

      <SettingsGroup title="Bezpieczeństwo">
        <SettingsRow
          variant="toggle"
          Icon={Fingerprint}
          iconTint="#059669"
          iconBg="#d1fae5"
          title="Logowanie biometryczne"
          description={
            biometricSupported
              ? 'Odblokuj aplikację Face ID / odciskiem palca'
              : 'Niedostępne na tym urządzeniu'
          }
          value={biometricOn}
          onValueChange={handleBiometricToggle}
          disabled={!biometricSupported}
        />
        <SettingsRow
          variant="nav"
          Icon={ShieldCheck}
          iconTint="#0891b2"
          iconBg="#cffafe"
          title="Weryfikacja dwustopniowa"
          description="Zarządzanie 2FA — w aplikacji webowej"
          onPress={() =>
            Alert.alert(
              'Weryfikacja dwustopniowa',
              'Konfiguracja 2FA jest dostępna w aplikacji webowej. Tu używasz kodów do logowania.',
            )
          }
        />
        <SettingsRow
          variant="nav"
          Icon={KeyRound}
          iconTint="#d97706"
          iconBg="#fef3c7"
          title="Zmień hasło"
          description="Wprowadź nowe hasło dla zalogowanego konta"
          onPress={() => router.push('/(auth)/reset-password')}
        />
      </SettingsGroup>

      <SettingsGroup title="Powiadomienia">
        <SettingsRow
          variant="toggle"
          Icon={Bell}
          iconTint="#ec4899"
          iconBg="#fce7f3"
          title="Powiadomienia push"
          description={pushOn ? 'Włączone' : 'Wyłączone'}
          value={pushOn}
          onValueChange={handlePushToggle}
        />
        <SettingsRow
          variant="nav"
          Icon={Smartphone}
          iconTint="#2563eb"
          iconBg="#dbeafe"
          title="Moje urządzenia"
          description="Zarejestrowane tokeny push"
          onPress={() =>
            Alert.alert('Wkrótce', 'Lista zarejestrowanych urządzeń pojawi się w kolejnej wersji.')
          }
        />
      </SettingsGroup>

      <SettingsGroup title="Moduły zespołów">
        <SettingsRow
          variant="nav"
          Icon={Users}
          iconTint="#be185d"
          iconBg="#fce7f3"
          title="Zespoły"
          description="Worship, Media, Atmosfera, Kids, Młodzieżówka"
          onPress={() => router.push('/(app)/teams')}
        />
        <SettingsRow
          variant="nav"
          Icon={Home}
          iconTint="#1d4ed8"
          iconBg="#dbeafe"
          title="Grupy domowe"
          description="Lista grup, członkowie, spotkania"
          onPress={() => router.push('/(app)/home-groups')}
        />
        <SettingsRow
          variant="nav"
          Icon={Heart}
          iconTint="#be185d"
          iconBg="#fce7f3"
          title="Ściana modlitwy"
          description="Intencje wspólnoty"
          onPress={() => router.push('/(app)/prayers')}
        />
        <SettingsRow
          variant="nav"
          Icon={Users}
          iconTint="#0e7490"
          iconBg="#cffafe"
          title="Członkowie"
          description="Lista członków wspólnoty"
          onPress={() => router.push('/(app)/members')}
        />
        <SettingsRow
          variant="nav"
          Icon={BookOpen}
          iconTint="#6d28d9"
          iconBg="#ede9fe"
          title="Nauczania"
          description="Kazania i serie tematyczne"
          onPress={() => router.push('/(app)/teachings')}
        />
        <SettingsRow
          variant="nav"
          Icon={FolderOpen}
          iconTint="#0e7490"
          iconBg="#cffafe"
          title="Materiały"
          description="Pliki i dokumenty"
          onPress={() => router.push('/(app)/materials')}
        />
        <SettingsRow
          variant="nav"
          Icon={ClipboardList}
          iconTint="#047857"
          iconBg="#d1fae5"
          title="Formularze"
          description="Aktywne formularze i ankiety"
          onPress={() => router.push('/(app)/forms')}
        />
        <SettingsRow
          variant="nav"
          Icon={Bell}
          iconTint="#ec4899"
          iconBg="#fce7f3"
          title="Powiadomienia"
          description="Centrum powiadomień"
          onPress={() => router.push('/(app)/notifications')}
        />
      </SettingsGroup>

      <SettingsGroup title="Prywatność">
        <SettingsRow
          variant="nav"
          Icon={Shield}
          iconTint="#475569"
          iconBg="#e2e8f0"
          title="Polityka prywatności"
          description="Otwórz w przeglądarce"
          onPress={() =>
            Alert.alert('Wkrótce', 'Link do polityki prywatności pojawi się przy publikacji.')
          }
        />
        <SettingsRow
          variant="nav"
          Icon={Shield}
          iconTint="#475569"
          iconBg="#e2e8f0"
          title="Regulamin"
          onPress={() =>
            Alert.alert('Wkrótce', 'Link do regulaminu pojawi się przy publikacji.')
          }
        />
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow
          variant="action"
          Icon={LogOut}
          destructive
          title="Wyloguj"
          onPress={handleSignOut}
        />
      </SettingsGroup>

      <Text
        className="text-[11px] text-center mt-2"
        style={{ color: '#a8a29e', fontFamily: 'Inter_500Medium' }}
      >
        Avenit · v1.0.0
      </Text>
    </ScrollView>
  );
}
