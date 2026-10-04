import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Gift, Lock } from 'lucide-react-native';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { B } from '../../../src/components/ui/brand';
import { useAuthSession } from '../../../src/lib/auth';
import { supabase, tenantWebBase } from '../../../src/lib/supabase';
import { formatMoney } from '../../../src/features/giving/api';
import { goBack } from '../../../src/lib/navigation';

// Darowizna online (Przelewy24): kwota na ciemnej karcie, częstotliwość, e-mail i notatka
// (bez wyboru celu — cel/intencję wpisuje się w notatce); przycisk płatności przyklejony
// nad paskiem zakładek, zawsze widoczny.

const F = {
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  xbold: 'Manrope_800ExtraBold',
} as const;

const QUICK = [20, 50, 100, 200, 500];

const SectionLabel = ({ children }: { children: string }) => (
  <Text style={{ marginTop: 22, marginBottom: 10, marginLeft: 4, fontSize: 12, letterSpacing: 1.3, textTransform: 'uppercase', color: B.gold, fontFamily: F.bold }}>
    {children}
  </Text>
);

// Kwota wpisywana ręcznie: cyfry + jeden separator, maks. 2 miejsca po przecinku.
const cleanAmount = (t: string) => {
  const s = t.replace(/[^\d,.]/g, '').replace('.', ',');
  const [int, ...rest] = s.split(',');
  const dec = rest.join('').slice(0, 2);
  return rest.length ? `${int.slice(0, 6)},${dec}` : int.slice(0, 6);
};

export default function DonateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuthSession();
  const amountRef = useRef<TextInput>(null);
  const [amount, setAmount] = useState('');
  const [email, setEmail] = useState(user?.email ?? '');
  const [note, setNote] = useState('');
  const [recurring, setRecurring] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user?.email && !email) setEmail(user.email);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const amt = Number(String(amount).replace(',', '.'));
  const ready = amt > 0 && !!email.trim();

  const submit = async () => {
    if (!amt || amt <= 0) {
      Alert.alert('Kwota', 'Wybierz albo wpisz kwotę darowizny.');
      return;
    }
    if (!email.trim()) {
      Alert.alert('E-mail', 'Podaj adres e-mail do potwierdzenia.');
      return;
    }
    setSubmitting(true);
    try {
      // Przez shim (functions.invoke) — sam dołącza X-Tenant (z SecureStore) i token.
      // Wcześniej surowy fetch dodawał X-Tenant tylko z EXPO_PUBLIC_TENANT, które w
      // buildzie uniwersalnym jest puste → backend odrzucał płatność („Nieznany tenant").
      const webBase = tenantWebBase();
      const { data, error } = await supabase.functions.invoke('giving-create-payment', {
        body: {
          amount: amt,
          email: email.trim(),
          donor_name: user?.full_name ?? null,
          // Bez wyboru celu — darowizna ogólna; ewentualny cel/intencja w notatce.
          fund_id: null,
          note: note.trim() || null,
          returnUrl: webBase ? `${webBase}/give/success` : undefined,
          recurring,
          frequency: recurring ? 'monthly' : undefined,
        },
      });
      if (error || !data?.paymentUrl) {
        throw new Error(error?.message || 'Nie udało się utworzyć płatności');
      }
      await Linking.openURL(data.paymentUrl);
      goBack(router);
    } catch (err) {
      Alert.alert('Błąd płatności', (err as Error)?.message || 'Spróbuj ponownie.');
    } finally {
      setSubmitting(false);
    }
  };

  // Przycisk płatności nad pływającym paskiem zakładek (ten sam odstęp co FloatingTabBar).
  const tabBarBottom = insets.bottom > 0 ? Math.max(insets.bottom - 10, 16) : 12;
  const footerBottom = tabBarBottom + 60 + 10;
  const summary = recurring ? 'Wpłata co miesiąc' : 'Wpłata jednorazowa';

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: B.paper }}>
        <PageHeader title="Wesprzyj" subtitle="Darowizna online" Icon={Gift} showBack />

        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 2, paddingBottom: footerBottom + 140 }}
        >
          {/* Kwota */}
          <Pressable onPress={() => amountRef.current?.focus()} style={{ backgroundColor: B.ink, borderRadius: 28, padding: 20, paddingBottom: 18 }}>
            <Text style={{ fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase', color: B.kurkuma, fontFamily: F.bold }}>Kwota</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 8, marginTop: 10, marginBottom: 16 }}>
              <TextInput
                ref={amountRef}
                value={amount}
                onChangeText={(t) => setAmount(cleanAmount(t))}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor="rgba(246,244,238,0.3)"
                selectionColor={B.kurkuma}
                maxLength={9}
                style={{
                  minWidth: 40,
                  fontSize: 54,
                  lineHeight: 62,
                  color: B.onDark,
                  fontFamily: F.xbold,
                  letterSpacing: -2,
                  textAlign: 'center',
                  padding: 0,
                  fontVariant: ['tabular-nums'],
                }}
              />
              <Text style={{ fontSize: 26, color: B.onDarkMuted, fontFamily: F.bold }}>zł</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {QUICK.map((q) => {
                const on = amt === q;
                return (
                  <Pressable
                    key={q}
                    onPress={() => setAmount(String(q))}
                    className="active:opacity-80"
                    style={{
                      flex: 1,
                      height: 40,
                      borderRadius: 999,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: on ? B.kurkuma : 'rgba(246,244,238,0.1)',
                    }}
                  >
                    <Text style={{ fontSize: 14, color: on ? B.ink : B.onDark, fontFamily: F.bold, fontVariant: ['tabular-nums'] }}>{q}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>

          {/* Częstotliwość */}
          <View style={{ flexDirection: 'row', gap: 4, padding: 4, marginTop: 12, borderRadius: 999, backgroundColor: B.paper2 }}>
            {[
              { v: false, label: 'Jednorazowo' },
              { v: true, label: 'Co miesiąc' },
            ].map((o) => {
              const on = recurring === o.v;
              return (
                <Pressable
                  key={o.label}
                  onPress={() => setRecurring(o.v)}
                  className="active:opacity-80"
                  style={{ flex: 1, height: 42, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? B.card : 'transparent' }}
                >
                  <Text style={{ fontSize: 14, color: on ? B.ink : B.ink3, fontFamily: on ? F.bold : F.semibold }}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {recurring ? (
            <Text style={{ marginTop: 8, marginHorizontal: 6, fontSize: 12, lineHeight: 17, color: B.ink3, fontFamily: F.medium }}>
              Pierwsza wpłata teraz, kolejne raz w miesiącu.
            </Text>
          ) : null}

          {/* Dane */}
          <SectionLabel>Szczegóły</SectionLabel>
          <View style={{ backgroundColor: B.card, borderRadius: 22, overflow: 'hidden' }}>
            <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 }}>
              <Text style={{ fontSize: 12, color: B.ink3, fontFamily: F.semibold }}>E-mail</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="twoj@email.pl"
                placeholderTextColor={B.ink4}
                style={{ marginTop: 2, paddingVertical: 4, fontSize: 16, color: B.ink, fontFamily: F.semibold }}
              />
            </View>
            <View style={{ height: 1, backgroundColor: B.line, marginLeft: 16 }} />
            <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 }}>
              <Text style={{ fontSize: 12, color: B.ink3, fontFamily: F.semibold }}>Notatka (opcjonalnie)</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="np. na misje, intencja, podziękowanie…"
                placeholderTextColor={B.ink4}
                multiline
                style={{ marginTop: 2, paddingVertical: 4, minHeight: 44, fontSize: 15, color: B.ink, fontFamily: F.medium, textAlignVertical: 'top' }}
              />
            </View>
          </View>
        </ScrollView>

        {/* Płatność — przyklejona nad paskiem zakładek, na pasie w kolorze tła (treść nie prześwituje). */}
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
          <LinearGradient pointerEvents="none" colors={['rgba(246,244,238,0)', B.paper]} style={{ height: 28 }} />
          <View style={{ backgroundColor: B.paper, paddingHorizontal: 16, paddingBottom: footerBottom }}>
            <Text numberOfLines={1} style={{ textAlign: 'center', fontSize: 12, color: B.ink3, fontFamily: F.semibold, marginBottom: 8 }}>
              {summary}
            </Text>
            <Pressable
              onPress={submit}
              disabled={submitting}
              className="active:opacity-80"
              style={{ height: 54, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: ready ? B.kurkuma : B.paper2 }}
            >
              {submitting ? (
                <ActivityIndicator color={B.ink} />
              ) : (
                <Text style={{ fontSize: 16, color: ready ? B.ink : B.ink3, fontFamily: F.bold }}>
                  {amt > 0 ? `Wpłać ${formatMoney(amt)}` : 'Wybierz kwotę'}
                </Text>
              )}
            </Pressable>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 8, marginBottom: 6 }}>
              <Lock size={11} color={B.ink4} />
              <Text style={{ fontSize: 11, color: B.ink4, fontFamily: F.medium }}>Bezpieczna płatność Przelewy24 · BLIK, karta, przelew</Text>
            </View>
          </View>
        </View>
      </View>
    </>
  );
}
