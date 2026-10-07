import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import {
  ArrowUpRight,
  Building2,
  Bell,
  BellRing,
  Send,
  Check,
  FileText,
  Fingerprint,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  MoonStar,
  Shield,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserCog,
  UserX,
  ScrollText,
} from 'lucide-react-native';
import * as Notifications from 'expo-notifications';
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
import { B } from '../../../../src/components/ui/brand';
import { CampusSelector } from '../../../../src/components/CampusSelector';
import { useCampus } from '../../../../src/contexts/CampusContext';
import { supabase, tenantWebBase } from '../../../../src/lib/supabase';
import { showError } from '../../../../src/lib/errors';
import { useMyProfile, use2FAStatus } from '../../../../src/features/account/api';
import { openModule, openOnWeb, useModules } from '../../../../src/features/modules/useModules';
import { useT, useLang } from '../../../../src/i18n';
import { usePermissions } from '../../../../src/lib/permissions';
import { SUPPORT_EMAIL } from '../../../../src/features/account/terms';
import { useQuietHours } from '../../../../src/features/messenger/plus';
import { ChatQuietHoursSheet, quietHoursSummary } from '../../../../src/features/messenger/components/ChatQuietHoursSheet';

// Strony prawne i usuwanie konta (wymóg App Store / Play) — host tenanta, z fallbackiem na apex.
const openLegal = (path: string) => {
  const base = tenantWebBase() || 'https://avenit.pl';
  Linking.openURL(`${base}${path}`).catch((e) => showError('Nie udało się otworzyć strony', e));
};

// Konto = „Mój profil” z weba (Ustawienia → Mój profil): dane osobowe, bezpieczeństwo
// i logowanie, powiadomienia, preferencje. Wygląd (motyw) jest ustawieniem całego kościoła
// na webie — apka ma jeden, jasny motyw marki, więc nie pokazujemy tu martwego przełącznika.
export default function AccountScreen() {
  const router = useRouter();
  const { user } = useAuthSession();
  const { campuses } = useCampus();
  const profile = useMyProfile(user?.email ?? null);
  const twoFa = use2FAStatus();
  const t = useT();
  const { lang, setLang, languages } = useLang();
  // Ustawienia kościoła (dla osób z dostępem) — przeniesione z zakładki Moduły.
  const { settings: settingsModule } = useModules();
  const insets = useSafeAreaInsets();

  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricOn, setBiometricOn] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  // Ciche godziny czatu (Komunikator+ K4) — tylko dla osób z dostępem do Komunikatora.
  const perms = usePermissions();
  const chatVisible = perms.moduleVisible('komunikator');
  const quiet = useQuietHours(chatVisible ? user?.email ?? null : null);
  const [quietOpen, setQuietOpen] = useState(false);

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
      const ok = await authenticateWithBiometric(t('Włącz odblokowanie biometryczne'));
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
          t('Powiadomienia są zablokowane'),
          t('Aby otrzymywać powiadomienia, włącz je dla Avenit w ustawieniach telefonu.'),
          [
            { text: t('Anuluj'), style: 'cancel' },
            { text: t('Otwórz ustawienia'), onPress: () => Linking.openSettings() },
          ],
        );
        return;
      }
      setPushOn(true);
      // Po przyznaniu zgody od razu rejestruj token push — inaczej push_tokens
      // pozostaje puste i serwer nie ma dokąd wysłać powiadomień.
      if (user?.email) registerPushToken(user.email).catch(() => undefined);
    } else {
      // Aplikacja nie może cofnąć zgody systemowej — odznaczamy przełącznik i kierujemy do
      // ustawień systemu, gdzie push można w pełni wyłączyć. „Anuluj" przywraca stan włączony.
      setPushOn(false);
      Alert.alert(
        t('Wyłączyć powiadomienia?'),
        t('Powiadomienia wyłączysz całkowicie w ustawieniach telefonu.'),
        [
          { text: t('Anuluj'), style: 'cancel', onPress: () => setPushOn(true) },
          { text: t('Otwórz ustawienia'), onPress: () => Linking.openSettings() },
        ],
      );
    }
  };

  // Test przez serwer: wysyłka do WSZYSTKICH moich urządzeń + zrozumiała diagnoza (np. brak
  // kluczy APNs w projekcie EAS albo brak zarejestrowanego telefonu).
  const sendPushTest = async () => {
    if (user?.email) await registerPushToken(user.email).catch(() => undefined);
    const { data, error } = await supabase.functions.invoke('push-test', { body: {} });
    if (error) { showError(t('Nie udało się wysłać testu'), error); return; }
    const res = data as { sent: number; devices: { phones: number; browsers: number }; problems: string[] };
    const all = (res.devices?.phones ?? 0) + (res.devices?.browsers ?? 0);
    const summary = all === 0
      ? t('Ten telefon nie jest jeszcze zarejestrowany do powiadomień. Włącz „Powiadomienia push” powyżej i zezwól na nie.')
      : t('Wysłano: {sent} z {all} (telefony: {phones}, przeglądarki: {browsers}).', { sent: res.sent, all, phones: res.devices.phones, browsers: res.devices.browsers });
    Alert.alert(t('Test powiadomień'), [summary, ...(res.problems ?? [])].join('\n\n'));
  };

  const handleSignOut = () => {
    Alert.alert(t('Wylogować się?'), t('Na tym telefonie trzeba będzie zalogować się ponownie.'), [
      { text: t('Anuluj'), style: 'cancel' },
      {
        text: t('Wyloguj'),
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
  const twoFaOn = !!twoFa.data?.enabled;
  const twoFaDescription = twoFaOn
    ? t('Włączone — logowanie wymaga kodu z aplikacji')
    : twoFa.data?.required
      ? t('Wymagane przez administratora — włącz teraz')
      : t('Wyłączone — włącz, aby lepiej chronić konto');
  const version = Constants.expoConfig?.version ?? '';

  return (
    <ScrollView
      className="flex-1"
      style={{ backgroundColor: B.paper }}
      contentContainerStyle={{ paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ paddingTop: insets.top + 18, paddingHorizontal: 20, paddingBottom: 24 }}>
        <Text style={{ fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', color: B.gold, fontFamily: 'Manrope_600SemiBold' }}>
          {t('Mój profil')}
        </Text>
        <Pressable
          onPress={() => router.push('/(app)/account/edit-profile')}
          accessibilityRole="button"
          accessibilityLabel={t('Edytuj profil')}
          className="active:opacity-80"
          style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 16 }}
        >
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: B.paper2 }}
              contentFit="cover"
            />
          ) : (
            <GradientAvatar initial={initial} size={72} />
          )}
          <View style={{ flex: 1 }}>
            <Text
              accessibilityRole="header"
              numberOfLines={2}
              style={{ fontSize: 24, lineHeight: 29, color: B.ink, letterSpacing: -0.7, fontFamily: 'Manrope_700Bold' }}
            >
              {fullName || t('Użytkownik')}
            </Text>
            <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 13, color: B.ink3, fontFamily: 'Manrope_500Medium' }}>
              {email}
            </Text>
          </View>
        </Pressable>
      </View>

      <SettingsGroup title={t('Dane osobowe')}>
        <SettingsRow
          variant="nav"
          Icon={UserCog}
          title={t('Edytuj profil')}
          description={t('Imię i nazwisko, zdjęcie profilowe')}
          onPress={() => router.push('/(app)/account/edit-profile')}
        />
      </SettingsGroup>

      {campuses.length > 0 ? (
        <View style={{ marginBottom: 20 }}>
          <Text
            accessibilityRole="header"
            style={{ fontSize: 12, marginHorizontal: 20, marginBottom: 8, color: B.gold, letterSpacing: 1.2, textTransform: 'uppercase', fontFamily: 'Manrope_700Bold' }}
          >
            {t('Lokalizacja')}
          </Text>
          <View className="mx-4">
            <CampusSelector />
          </View>
          <Text style={{ marginHorizontal: 20, marginTop: 8, fontSize: 12, lineHeight: 17, color: B.ink4, fontFamily: 'Manrope_500Medium' }}>
            {t('Filtruje członków, programy i kalendarz po wybranej lokalizacji.')}
          </Text>
        </View>
      ) : null}

      <SettingsGroup title={t('Bezpieczeństwo i logowanie')}>
        <SettingsRow
          variant="nav"
          Icon={KeyRound}
          title={t('Zmiana hasła')}
          description={t('Ustaw nowe hasło do konta')}
          onPress={() => router.push('/(app)/account/change-password')}
        />
        <SettingsRow
          variant="nav"
          Icon={ShieldCheck}
          title={t('Uwierzytelnianie dwuskładnikowe')}
          description={twoFaDescription}
          onPress={() => router.push('/(app)/account/two-factor')}
        />
        <SettingsRow
          variant="nav"
          Icon={Smartphone}
          title={t('Zalogowane urządzenia')}
          description={t('Gdzie jesteś zalogowany — możesz wylogować pozostałe')}
          onPress={() => router.push('/(app)/account/sessions')}
        />
        <SettingsRow
          variant="toggle"
          Icon={Fingerprint}
          title={t('Odblokowanie biometryczne')}
          description={
            biometricSupported
              ? t('Face ID lub odcisk palca przy otwieraniu aplikacji')
              : t('Niedostępne na tym urządzeniu')
          }
          value={biometricOn}
          onValueChange={handleBiometricToggle}
          disabled={!biometricSupported}
        />
      </SettingsGroup>

      <SettingsGroup title={t('Powiadomienia')}>
        <SettingsRow
          variant="toggle"
          Icon={BellRing}
          title={t('Powiadomienia push')}
          description={
            pushOn
              ? t('Włączone — dostajesz powiadomienia na ten telefon')
              : t('Włącz, aby otrzymywać powiadomienia nawet gdy aplikacja jest zamknięta')
          }
          value={pushOn}
          onValueChange={handlePushToggle}
        />
        {chatVisible ? (
          <SettingsRow
            variant="nav"
            Icon={MoonStar}
            title={t('Ciche godziny czatu')}
            description={t(quietHoursSummary(quiet.data))}
            onPress={() => setQuietOpen(true)}
          />
        ) : null}
        <SettingsRow
          variant="action"
          Icon={Send}
          title={t('Wyślij testowe powiadomienie')}
          onPress={sendPushTest}
        />
        <SettingsRow
          variant="nav"
          Icon={Bell}
          title={t('Ostatnie powiadomienia')}
          description={t('Wiadomości, zadania i wydarzenia')}
          onPress={() => router.push('/(app)/notifications')}
        />
      </SettingsGroup>

      <SettingsGroup title={t('Język aplikacji')} hint={t('Dotyczy tylko Ciebie i tego urządzenia.')}>
        {languages.map((l, idx) => {
          const active = lang === l.code;
          return (
            <Pressable
              key={l.code}
              onPress={() => setLang(l.code)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={l.label}
              className="active:opacity-80"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderTopWidth: idx === 0 ? 0 : 1,
                borderTopColor: B.line,
                backgroundColor: active ? B.kurkumaSoft : B.card,
              }}
            >
              <Text style={{ fontSize: 20 }}>{l.flag}</Text>
              <Text style={{ flex: 1, fontSize: 15, color: B.ink, fontFamily: active ? 'Manrope_700Bold' : 'Manrope_500Medium' }}>
                {l.label}
              </Text>
              {active ? <Check size={18} color={B.gold} /> : null}
            </Pressable>
          );
        })}
      </SettingsGroup>

      <SettingsGroup title={t('Preferencje')}>
        <SettingsRow
          variant="nav"
          Icon={LayoutDashboard}
          title={t('Dostosuj pulpit')}
          description={t('Sekcje, ich kolejność, skróty i moduły')}
          onPress={() => router.push('/(app)/account/dashboard')}
        />
        <SettingsRow
          variant="nav"
          Icon={FileText}
          title={t('Subskrypcja kalendarza i podpis e-mail')}
          description={t('Otwiera się na stronie kościoła w przeglądarce')}
          rightElement={<ArrowUpRight size={17} color={B.ink4} strokeWidth={2} />}
          onPress={() => openOnWeb('/profile')}
        />
        {settingsModule ? (
          <SettingsRow
            variant="nav"
            Icon={Building2}
            title={t('Ustawienia kościoła')}
            description={t('Moduły, użytkownicy, wygląd — w przeglądarce')}
            rightElement={<ArrowUpRight size={17} color={B.ink4} strokeWidth={2} />}
            onPress={() => openModule(settingsModule, router)}
          />
        ) : null}
      </SettingsGroup>

      <SettingsGroup title={t('Prywatność')}>
        <SettingsRow
          variant="nav"
          Icon={Shield}
          title={t('Polityka prywatności')}
          description={t('Otwiera się w przeglądarce')}
          rightElement={<ArrowUpRight size={17} color={B.ink4} strokeWidth={2} />}
          onPress={() => openLegal('/polityka-prywatnosci')}
        />
        <SettingsRow
          variant="nav"
          Icon={FileText}
          title={t('Regulamin')}
          description={t('Otwiera się w przeglądarce')}
          rightElement={<ArrowUpRight size={17} color={B.ink4} strokeWidth={2} />}
          onPress={() => openLegal('/regulamin')}
        />
        <SettingsRow
          variant="nav"
          Icon={ScrollText}
          title={t('Zasady społeczności')}
          description={t('Jak dbamy o bezpieczne rozmowy i modlitwy')}
          onPress={() => router.push('/(app)/account/terms')}
        />
        <SettingsRow
          variant="nav"
          Icon={UserX}
          title={t('Zablokowane osoby')}
          description={t('Osoby, których wiadomości i prośb nie widzisz')}
          onPress={() => router.push('/(app)/account/blocked')}
        />
        <SettingsRow
          variant="nav"
          Icon={Trash2}
          iconTint={B.danger}
          iconBg={B.dangerBg}
          title={t('Usuń konto')}
          description={t('Trwałe usunięcie konta i Twoich danych')}
          onPress={() => router.push('/(app)/account/delete')}
        />
      </SettingsGroup>

      <SettingsGroup title={t('Pomoc')}>
        <SettingsRow
          variant="nav"
          Icon={LifeBuoy}
          title={t('Napisz do nas')}
          description={SUPPORT_EMAIL}
          rightElement={<ArrowUpRight size={17} color={B.ink4} strokeWidth={2} />}
          onPress={() =>
            Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Avenit — pomoc')}`).catch((e) =>
              showError('Nie udało się otworzyć poczty', e),
            )
          }
        />
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow variant="action" Icon={LogOut} destructive title={t('Wyloguj')} onPress={handleSignOut} />
      </SettingsGroup>

      <Text style={{ marginTop: 2, textAlign: 'center', fontSize: 12, color: B.ink4, fontFamily: 'Manrope_500Medium' }}>
        {version ? `Avenit · ${t('wersja')} ${version}` : 'Avenit'}
      </Text>

      {chatVisible ? (
        <ChatQuietHoursSheet visible={quietOpen} onClose={() => setQuietOpen(false)} email={user?.email ?? null} />
      ) : null}
    </ScrollView>
  );
}
