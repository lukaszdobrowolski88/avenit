import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import {
  Bell,
  Check,
  Fingerprint,
  KeyRound,
  LayoutGrid,
  LogOut,
  Moon,
  Palette,
  Shield,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserCog,
} from 'lucide-react-native';
import * as Notifications from 'expo-notifications';
import { useColorScheme } from 'nativewind';
import { useAuthSession, signOut } from '../../../../src/lib/auth';
import { registerPushToken } from '../../../../src/lib/push';
import {
  isBiometricEnabled,
  setBiometricEnabled,
  authenticateWithBiometric,
  getBiometricCapability,
} from '../../../../src/lib/biometric';
import { GradientAvatar } from '../../../../src/components/ui/GradientAvatar';
import { SettingsGroup, SettingsRow } from '../../../../src/components/ui/SettingsRow';
import { CampusSelector } from '../../../../src/components/CampusSelector';
import { useCampus } from '../../../../src/contexts/CampusContext';
import { tenantWebBase } from '../../../../src/lib/supabase';
import { useMyProfile, use2FAStatus } from '../../../../src/features/account/api';
import { useT, useLang } from '../../../../src/i18n';
import { goToTab } from '../../../../src/lib/navigation';

// Otwiera stronę web tenanta (np. politykę prywatności) — host tenanta z getTenant(),
// z fallbackiem na apex. Wymagane linki prawne + usuwanie konta (wymóg App Store / Play).
const openWeb = (path: string) => {
  const base = tenantWebBase() || 'https://avenit.pl';
  Linking.openURL(`${base}${path}`).catch(() =>
    Alert.alert('Błąd', 'Nie udało się otworzyć strony.'),
  );
};

export default function AccountScreen() {
  const router = useRouter();
  const { user } = useAuthSession();
  const { colorScheme, setColorScheme } = useColorScheme();
  const { campuses } = useCampus();
  const profile = useMyProfile(user?.email ?? null);
  const twoFa = use2FAStatus();
  const t = useT();
  const { lang, setLang, languages } = useLang();
  const insets = useSafeAreaInsets();

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
      setPushOn((perm as { status?: string }).status === 'granted');
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
      const { status } = (await Notifications.requestPermissionsAsync()) as {
        status?: string;
      };
      if (status !== 'granted') {
        Alert.alert(
          'Powiadomienia wyłączone',
          'Aby otrzymywać powiadomienia, włącz je w ustawieniach systemu.',
        );
        return;
      }
      setPushOn(true);
      // Po przyznaniu zgody od razu rejestruj token push — inaczej push_tokens
      // pozostaje puste i serwer nie ma dokąd wysłać powiadomień.
      if (user?.email) registerPushToken(user.email).catch(() => undefined);
    } else {
      // Aplikacja nie może cofnąć zgody systemowej — odznaczamy przełącznik (wcześniej
      // wracał na ON, bo nic nie zmienialiśmy) i kierujemy do ustawień systemu, gdzie push
      // można w pełni wyłączyć. „Anuluj" przywraca stan włączony.
      setPushOn(false);
      Alert.alert(
        'Wyłączyć powiadomienia?',
        'Aby całkowicie zablokować powiadomienia, wyłącz je w ustawieniach systemu.',
        [
          { text: 'Anuluj', style: 'cancel', onPress: () => setPushOn(true) },
          { text: 'Otwórz ustawienia', onPress: () => Linking.openSettings() },
        ],
      );
    }
  };

  const handleSignOut = async () => {
    Alert.alert(t('Wylogować?'), t('Konto zostanie odłączone od urządzenia.'), [
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
  const fullName = profile.data?.full_name?.trim() || (user?.full_name as string | undefined)?.trim() || '';
  const avatarUrl = profile.data?.avatar_url ?? null;
  const initial = (fullName || email).charAt(0).toUpperCase();
  const isDark = colorScheme === 'dark';
  const showCampusSection = campuses.length > 0;

  return (
    <ScrollView
      className="flex-1"
      style={{ backgroundColor: '#F6F4EE' }}
      contentContainerStyle={{ paddingBottom: 120 }}
    >
      <View className="items-center pb-8 px-4" style={{ paddingTop: insets.top + 16 }}>
        {avatarUrl ? (
          <Image
            source={{ uri: avatarUrl }}
            style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: '#ECE8DE' }}
            contentFit="cover"
          />
        ) : (
          <GradientAvatar initial={initial} size={88} />
        )}
        <Text
          className="mt-4 text-[18px]"
          style={{
            color: '#2A2312',
            letterSpacing: -0.4,
            fontFamily: 'Manrope_700Bold',
          }}
        >
          {fullName || email}
        </Text>
        <Text
          className="text-[12px] mt-1"
          style={{ color: '#6B6557', fontFamily: 'Manrope_500Medium' }}
        >
          {fullName ? email : t('Konto')}
        </Text>
      </View>

      <SettingsGroup title={t("Profil")}>
        <SettingsRow
          variant="nav"
          Icon={UserCog}
          iconTint="#2A2312"
          iconBg="#ECE8DE"
          title={t("Edytuj profil")}
          description={t("Zmień imię i zdjęcie profilowe")}
          onPress={() => router.push('/(app)/account/edit-profile')}
        />
      </SettingsGroup>

      {showCampusSection ? (
        <View className="mb-4">
          <Text
            className="text-[11px] uppercase mx-5 mb-2"
            style={{
              color: '#8A6606',
              letterSpacing: 0.6,
              fontFamily: 'Manrope_700Bold',
            }}
          >
            {t('Lokalizacja')}
          </Text>
          <View className="mx-4">
            <CampusSelector />
          </View>
          <Text
            className="text-[11px] mx-5 mt-2"
            style={{
              color: '#857F70',
              fontFamily: 'Manrope_500Medium',
              lineHeight: 16,
            }}
          >
            {t('Filtruje członków, programy i kalendarz po wybranej lokalizacji.')}
          </Text>
        </View>
      ) : null}

      <SettingsGroup title={t("Wygląd")}>
        <SettingsRow
          variant="toggle"
          Icon={Moon}
          iconTint="#2A2312"
          iconBg="#ECE8DE"
          title={t("Tryb ciemny")}
          description={isDark ? t('Włączony') : t('Zgodny z systemem')}
          value={isDark}
          onValueChange={(v) => setColorScheme(v ? 'dark' : 'light')}
        />
        <SettingsRow
          variant="nav"
          Icon={Palette}
          iconTint="#2A2312"
          iconBg="#ECE8DE"
          title={t("Motyw systemowy")}
          description={t("Dopasuj automatycznie do urządzenia")}
          onPress={() => setColorScheme('system')}
        />
      </SettingsGroup>

      <View className="mb-4">
        <Text
          className="text-[11px] uppercase mx-5 mb-2"
          style={{ color: '#8A6606', letterSpacing: 0.6, fontFamily: 'Manrope_700Bold' }}
        >
          {t('Język')}
        </Text>
        <View
          className="mx-4"
          style={{ borderRadius: 16, borderWidth: 1, borderColor: '#E6E1D5', overflow: 'hidden' }}
        >
          {languages.map((l, idx) => {
            const active = lang === l.code;
            return (
              <Pressable
                key={l.code}
                onPress={() => setLang(l.code)}
                className="active:opacity-80"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  borderTopWidth: idx === 0 ? 0 : 1,
                  borderTopColor: '#ECE8DE',
                  backgroundColor: active ? '#FFF8E1' : '#F6F4EE',
                }}
              >
                <Text style={{ fontSize: 20 }}>{l.flag}</Text>
                <Text
                  style={{
                    flex: 1,
                    fontSize: 15,
                    color: '#2A2312',
                    fontFamily: active ? 'Manrope_700Bold' : 'Manrope_500Medium',
                  }}
                >
                  {l.label}
                </Text>
                {active ? <Check size={18} color="#8A6606" /> : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      <SettingsGroup title={t("Bezpieczeństwo")}>
        <SettingsRow
          variant="toggle"
          Icon={Fingerprint}
          iconTint="#2A2312"
          iconBg="#ECE8DE"
          title={t("Logowanie biometryczne")}
          description={
            biometricSupported
              ? t('Odblokuj aplikację Face ID / odciskiem palca')
              : t('Niedostępne na tym urządzeniu')
          }
          value={biometricOn}
          onValueChange={handleBiometricToggle}
          disabled={!biometricSupported}
        />
        <SettingsRow
          variant="nav"
          Icon={ShieldCheck}
          iconTint="#2A2312"
          iconBg="#ECE8DE"
          title={t("Weryfikacja dwustopniowa")}
          description={twoFa.data?.enabled ? t('Włączona — zarządzaj') : t('Wyłączona — włącz zabezpieczenie')}
          onPress={() => router.push('/(app)/account/two-factor')}
        />
        <SettingsRow
          variant="nav"
          Icon={KeyRound}
          iconTint="#2A2312"
          iconBg="#ECE8DE"
          title={t("Zmień hasło")}
          description={t("Wprowadź nowe hasło dla zalogowanego konta")}
          onPress={() => router.push('/(auth)/reset-password')}
        />
      </SettingsGroup>

      <SettingsGroup title={t("Powiadomienia")}>
        <SettingsRow
          variant="toggle"
          Icon={Bell}
          iconTint="#2A2312"
          iconBg="#ECE8DE"
          title={t("Powiadomienia push")}
          description={pushOn ? t('Włączone') : t('Wyłączone')}
          value={pushOn}
          onValueChange={handlePushToggle}
        />
        <SettingsRow
          variant="nav"
          Icon={Smartphone}
          iconTint="#2A2312"
          iconBg="#ECE8DE"
          title={t("Aktywne sesje")}
          description={t("Zalogowane urządzenia i wylogowanie zdalne")}
          onPress={() => router.push('/(app)/account/sessions')}
        />
      </SettingsGroup>

      <SettingsGroup title={t("Aplikacja")}>
        <SettingsRow
          variant="nav"
          Icon={LayoutGrid}
          iconTint="#2A2312"
          iconBg="#ECE8DE"
          title={t("Wszystkie moduły")}
          description={t("Zespoły, grupy, materiały i reszta — według Twoich uprawnień")}
          onPress={() => goToTab(router, 'modules')}
        />
        <SettingsRow
          variant="nav"
          Icon={Bell}
          iconTint="#2A2312"
          iconBg="#ECE8DE"
          title={t("Powiadomienia")}
          description={t("Centrum powiadomień")}
          onPress={() => router.push('/(app)/notifications')}
        />
      </SettingsGroup>

      <SettingsGroup title={t("Prywatność")}>
        <SettingsRow
          variant="nav"
          Icon={Shield}
          iconTint="#2A2312"
          iconBg="#ECE8DE"
          title={t("Polityka prywatności")}
          description={t("Otwórz w przeglądarce")}
          onPress={() => openWeb('/polityka-prywatnosci')}
        />
        <SettingsRow
          variant="nav"
          Icon={Shield}
          iconTint="#2A2312"
          iconBg="#ECE8DE"
          title={t("Regulamin")}
          description={t("Otwórz w przeglądarce")}
          onPress={() => openWeb('/regulamin')}
        />
        <SettingsRow
          variant="nav"
          Icon={Trash2}
          iconTint="#dc2626"
          iconBg="#fee2e2"
          title={t("Usuń konto")}
          description={t("Trwałe usunięcie konta i danych")}
          onPress={() => openWeb('/usun-konto')}
        />
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow
          variant="action"
          Icon={LogOut}
          destructive
          title={t("Wyloguj")}
          onPress={handleSignOut}
        />
      </SettingsGroup>

      <Text
        className="text-[11px] text-center mt-2"
        style={{ color: '#857F70', fontFamily: 'Manrope_500Medium' }}
      >
        Avenit · v1.0.0
      </Text>
    </ScrollView>
  );
}
