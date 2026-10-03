import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import {
  Bell,
  BookOpen,
  CalendarCheck,
  CalendarOff,
  Check,
  ClipboardList,
  Fingerprint,
  FolderOpen,
  Gift,
  Heart,
  Home,
  KeyRound,
  LogOut,
  ListTodo,
  Music,
  Moon,
  Palette,
  Podcast,
  Shield,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserCog,
  Users,
} from 'lucide-react-native';
import * as Notifications from 'expo-notifications';
import { useColorScheme } from 'nativewind';
import { useAuthSession, signOut, isStaffUser } from '../../../src/lib/auth';
import { registerPushToken } from '../../../src/lib/push';
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
import { tenantWebBase } from '../../../src/lib/supabase';
import { useMyProfile, use2FAStatus } from '../../../src/features/account/api';
import { useT, useLang } from '../../../src/i18n';

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
  // Treści „służbowe" — zwykły członek ich nie widzi (Formularze, katalog Członków).
  const staff = isStaffUser(user);

  return (
    <ScrollView
      className="flex-1"
      style={{ backgroundColor: '#ffffff' }}
      contentContainerStyle={{ paddingBottom: 120 }}
    >
      <View className="items-center pb-8 px-4" style={{ paddingTop: insets.top + 16 }}>
        {avatarUrl ? (
          <Image
            source={{ uri: avatarUrl }}
            style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: '#f5f5f4' }}
            contentFit="cover"
          />
        ) : (
          <GradientAvatar initial={initial} size={88} />
        )}
        <Text
          className="mt-4 text-[18px]"
          style={{
            color: '#0c0a09',
            letterSpacing: -0.4,
            fontFamily: 'Inter_700Bold',
          }}
        >
          {fullName || email}
        </Text>
        <Text
          className="text-[12px] mt-1"
          style={{ color: '#78716c', fontFamily: 'Inter_500Medium' }}
        >
          {fullName ? email : t('Konto')}
        </Text>
      </View>

      <SettingsGroup title={t("Profil")}>
        <SettingsRow
          variant="nav"
          Icon={UserCog}
          iconTint="#be185d"
          iconBg="#fce7f3"
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
              color: '#78716c',
              letterSpacing: 0.6,
              fontFamily: 'Inter_700Bold',
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
              color: '#a8a29e',
              fontFamily: 'Inter_500Medium',
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
          iconTint="#7c3aed"
          iconBg="#ede9fe"
          title={t("Tryb ciemny")}
          description={isDark ? t('Włączony') : t('Zgodny z systemem')}
          value={isDark}
          onValueChange={(v) => setColorScheme(v ? 'dark' : 'light')}
        />
        <SettingsRow
          variant="nav"
          Icon={Palette}
          iconTint="#0891b2"
          iconBg="#cffafe"
          title={t("Motyw systemowy")}
          description={t("Dopasuj automatycznie do urządzenia")}
          onPress={() => setColorScheme('system')}
        />
      </SettingsGroup>

      <View className="mb-4">
        <Text
          className="text-[11px] uppercase mx-5 mb-2"
          style={{ color: '#78716c', letterSpacing: 0.6, fontFamily: 'Inter_700Bold' }}
        >
          {t('Język')}
        </Text>
        <View
          className="mx-4"
          style={{ borderRadius: 16, borderWidth: 1, borderColor: '#eef0f3', overflow: 'hidden' }}
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
                  borderTopColor: '#f5f5f4',
                  backgroundColor: active ? '#fdf2f8' : '#ffffff',
                }}
              >
                <Text style={{ fontSize: 20 }}>{l.flag}</Text>
                <Text
                  style={{
                    flex: 1,
                    fontSize: 15,
                    color: '#0c0a09',
                    fontFamily: active ? 'Inter_700Bold' : 'Inter_500Medium',
                  }}
                >
                  {l.label}
                </Text>
                {active ? <Check size={18} color="#ec4899" /> : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      <SettingsGroup title={t("Bezpieczeństwo")}>
        <SettingsRow
          variant="toggle"
          Icon={Fingerprint}
          iconTint="#059669"
          iconBg="#d1fae5"
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
          iconTint="#0891b2"
          iconBg="#cffafe"
          title={t("Weryfikacja dwustopniowa")}
          description={twoFa.data?.enabled ? t('Włączona — zarządzaj') : t('Wyłączona — włącz zabezpieczenie')}
          onPress={() => router.push('/(app)/account/two-factor')}
        />
        <SettingsRow
          variant="nav"
          Icon={KeyRound}
          iconTint="#d97706"
          iconBg="#fef3c7"
          title={t("Zmień hasło")}
          description={t("Wprowadź nowe hasło dla zalogowanego konta")}
          onPress={() => router.push('/(auth)/reset-password')}
        />
      </SettingsGroup>

      <SettingsGroup title={t("Powiadomienia")}>
        <SettingsRow
          variant="toggle"
          Icon={Bell}
          iconTint="#ec4899"
          iconBg="#fce7f3"
          title={t("Powiadomienia push")}
          description={pushOn ? t('Włączone') : t('Wyłączone')}
          value={pushOn}
          onValueChange={handlePushToggle}
        />
        <SettingsRow
          variant="nav"
          Icon={Smartphone}
          iconTint="#2563eb"
          iconBg="#dbeafe"
          title={t("Aktywne sesje")}
          description={t("Zalogowane urządzenia i wylogowanie zdalne")}
          onPress={() => router.push('/(app)/account/sessions')}
        />
      </SettingsGroup>

      <SettingsGroup title={t("Dla Ciebie")}>
        <SettingsRow
          variant="nav"
          Icon={CalendarCheck}
          iconTint="#db2777"
          iconBg="#fce7f3"
          title={t("Moje zaproszenia")}
          description={t("Potwierdź obecność na wydarzeniach")}
          onPress={() => router.push('/(app)/rsvp')}
        />
        <SettingsRow
          variant="nav"
          Icon={CalendarOff}
          iconTint="#be123c"
          iconBg="#ffe4e6"
          title={t("Moja niedostępność")}
          description={t("Zgłoś dni, w które nie możesz służyć")}
          onPress={() => router.push('/(app)/serve/availability')}
        />
        <SettingsRow
          variant="nav"
          Icon={Gift}
          iconTint="#059669"
          iconBg="#d1fae5"
          title={t("Dawanie")}
          description={t("Twoje darowizny i wsparcie wspólnoty")}
          onPress={() => router.push('/(app)/giving')}
        />
        <SettingsRow
          variant="nav"
          Icon={Podcast}
          iconTint="#7c3aed"
          iconBg="#ede9fe"
          title={t("Kazania")}
          description={t("Posłuchaj lub obejrzyj kazania")}
          onPress={() => router.push('/(app)/sermons')}
        />
      </SettingsGroup>

      <SettingsGroup title={t("Moduły zespołów")}>
        <SettingsRow
          variant="nav"
          Icon={ListTodo}
          iconTint="#0d9488"
          iconBg="#ccfbf1"
          title={t("Moja praca")}
          description={t("Zadania przypisane do Ciebie na tablicach")}
          onPress={() => router.push('/(app)/work')}
        />
        <SettingsRow
          variant="nav"
          Icon={Music}
          iconTint="#7c3aed"
          iconBg="#ede9fe"
          title={t("Planowane pieśni")}
          description={t("Setlisty nadchodzących nabożeństw")}
          onPress={() => router.push('/(app)/setlist')}
        />
        <SettingsRow
          variant="nav"
          Icon={Users}
          iconTint="#be185d"
          iconBg="#fce7f3"
          title={t("Zespoły")}
          description={t("Worship, Media, Atmosfera, Kids, Młodzieżówka")}
          onPress={() => router.push('/(app)/teams')}
        />
        <SettingsRow
          variant="nav"
          Icon={Home}
          iconTint="#1d4ed8"
          iconBg="#dbeafe"
          title={t("Grupy domowe")}
          description={t("Lista grup, członkowie, spotkania")}
          onPress={() => router.push('/(app)/home-groups')}
        />
        <SettingsRow
          variant="nav"
          Icon={Heart}
          iconTint="#be185d"
          iconBg="#fce7f3"
          title={t("Ściana modlitwy")}
          description={t("Intencje wspólnoty")}
          onPress={() => router.push('/(app)/prayers')}
        />
        {staff ? (
          <SettingsRow
            variant="nav"
            Icon={Users}
            iconTint="#0e7490"
            iconBg="#cffafe"
            title={t("Członkowie")}
            description={t("Lista członków wspólnoty")}
            onPress={() => router.push('/(app)/members')}
          />
        ) : null}
        <SettingsRow
          variant="nav"
          Icon={BookOpen}
          iconTint="#6d28d9"
          iconBg="#ede9fe"
          title={t("Nauczania")}
          description={t("Kazania i serie tematyczne")}
          onPress={() => router.push('/(app)/teachings')}
        />
        <SettingsRow
          variant="nav"
          Icon={FolderOpen}
          iconTint="#0e7490"
          iconBg="#cffafe"
          title={t("Materiały")}
          description={t("Pliki i dokumenty")}
          onPress={() => router.push('/(app)/materials')}
        />
        {staff ? (
          <SettingsRow
            variant="nav"
            Icon={ClipboardList}
            iconTint="#047857"
            iconBg="#d1fae5"
            title={t("Formularze")}
            description={t("Aktywne formularze i ankiety")}
            onPress={() => router.push('/(app)/forms')}
          />
        ) : null}
        <SettingsRow
          variant="nav"
          Icon={Bell}
          iconTint="#ec4899"
          iconBg="#fce7f3"
          title={t("Powiadomienia")}
          description={t("Centrum powiadomień")}
          onPress={() => router.push('/(app)/notifications')}
        />
      </SettingsGroup>

      <SettingsGroup title={t("Prywatność")}>
        <SettingsRow
          variant="nav"
          Icon={Shield}
          iconTint="#475569"
          iconBg="#e2e8f0"
          title={t("Polityka prywatności")}
          description={t("Otwórz w przeglądarce")}
          onPress={() => openWeb('/polityka-prywatnosci')}
        />
        <SettingsRow
          variant="nav"
          Icon={Shield}
          iconTint="#475569"
          iconBg="#e2e8f0"
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
        style={{ color: '#a8a29e', fontFamily: 'Inter_500Medium' }}
      >
        Avenit · v1.0.0
      </Text>
    </ScrollView>
  );
}
