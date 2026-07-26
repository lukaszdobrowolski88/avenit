import { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Gift } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { GradientButton } from '../../../src/components/ui/GradientButton';
import { useAuthSession } from '../../../src/lib/auth';
import { supabase } from '../../../src/lib/supabase';
import { formatMoney } from '../../../src/features/giving/api';

const API_URL = process.env.EXPO_PUBLIC_API_URL || '';
const TENANT = process.env.EXPO_PUBLIC_TENANT || '';
const QUICK = [20, 50, 100, 200, 500];

function webBase(): string {
  const api = API_URL.replace(/\/$/, '');
  return api ? api.replace('://api.', TENANT ? `://${TENANT}.` : '://') : '';
}

interface Fund { id: string; name: string; color?: string | null }

export default function DonateScreen() {
  const router = useRouter();
  const { user } = useAuthSession();
  const [funds, setFunds] = useState<Fund[]>([]);
  const [amount, setAmount] = useState('');
  const [fundId, setFundId] = useState<string | null>(null);
  const [email, setEmail] = useState(user?.email ?? '');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('giving_funds')
          .select('id, name, color')
          .eq('is_active', true)
          .order('sort_order');
        setFunds((data ?? []) as Fund[]);
      } catch {
        // fundusze opcjonalne
      }
    })();
  }, []);

  useEffect(() => {
    if (user?.email && !email) setEmail(user.email);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const amt = Number(String(amount).replace(',', '.'));

  const submit = async () => {
    if (!amt || amt <= 0) { Alert.alert('Kwota', 'Podaj poprawną kwotę darowizny.'); return; }
    if (!email) { Alert.alert('E-mail', 'Podaj adres e-mail do potwierdzenia.'); return; }
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_URL}/api/fn/giving-create-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(TENANT ? { 'X-Tenant': TENANT } : {}),
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          amount: amt,
          email,
          donor_name: null,
          fund_id: fundId,
          note: note || null,
          returnUrl: webBase() ? `${webBase()}/give/success` : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.paymentUrl) {
        throw new Error(json?.error || 'Nie udało się utworzyć płatności');
      }
      await Linking.openURL(json.paymentUrl);
      router.back();
    } catch (err) {
      Alert.alert('Błąd płatności', (err as Error)?.message || 'Spróbuj ponownie.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View className="flex-1" style={{ backgroundColor: '#ffffff' }}>
        <PageHeader title="Wesprzyj" subtitle="Szybka darowizna online" Icon={Gift} showBack />

        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 120 }}>
          {/* Szybkie kwoty */}
          <Text className="text-[11px] uppercase mb-2 mx-1" style={{ color: '#78716c', letterSpacing: 0.6, fontFamily: 'Inter_700Bold' }}>
            Kwota
          </Text>
          <View className="flex-row flex-wrap gap-2 mb-3">
            {QUICK.map((q) => {
              const active = amt === q;
              return (
                <Pressable key={q} onPress={() => setAmount(String(q))}
                  style={{
                    paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14, borderWidth: 1,
                    borderColor: active ? '#059669' : '#e5e7eb', backgroundColor: active ? '#059669' : '#ffffff',
                  }}>
                  <Text style={{ color: active ? '#ffffff' : '#334155', fontFamily: 'Inter_600SemiBold' }}>{q} zł</Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="Inna kwota (zł)"
            placeholderTextColor="#9ca3af"
            style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 18, fontFamily: 'Inter_700Bold', color: '#0c0a09', marginBottom: 16 }}
          />

          {/* Fundusze */}
          {funds.length > 0 && (
            <>
              <Text className="text-[11px] uppercase mb-2 mx-1" style={{ color: '#78716c', letterSpacing: 0.6, fontFamily: 'Inter_700Bold' }}>
                Cel
              </Text>
              <View className="flex-row flex-wrap gap-2 mb-4">
                {funds.map((f) => {
                  const active = fundId === f.id;
                  return (
                    <Pressable key={f.id} onPress={() => setFundId(active ? null : f.id)}
                      style={{
                        paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1,
                        borderColor: active ? '#059669' : '#e5e7eb', backgroundColor: active ? '#ecfdf5' : '#ffffff',
                      }}>
                      <Text style={{ color: active ? '#047857' : '#334155', fontFamily: 'Inter_500Medium', fontSize: 13 }}>{f.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {/* E-mail */}
          <Text className="text-[11px] uppercase mb-2 mx-1" style={{ color: '#78716c', letterSpacing: 0.6, fontFamily: 'Inter_700Bold' }}>
            E-mail (potwierdzenie)
          </Text>
          <TextInput
            value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="twoj@email.pl"
            placeholderTextColor="#9ca3af"
            style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, fontFamily: 'Inter_400Regular', color: '#0c0a09', marginBottom: 16 }}
          />

          {/* Notatka */}
          <TextInput
            value={note} onChangeText={setNote} placeholder="Intencja / wiadomość (opcjonalnie)"
            placeholderTextColor="#9ca3af"
            style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, fontFamily: 'Inter_400Regular', color: '#0c0a09', marginBottom: 20 }}
          />

          <GradientButton onPress={submit} disabled={submitting}>
            {submitting ? 'Przekierowanie...' : `Zapłać${amt ? ' ' + formatMoney(amt) : ''}`}
          </GradientButton>
          <Text className="text-center mt-3" style={{ color: '#9ca3af', fontFamily: 'Inter_400Regular', fontSize: 12 }}>
            Bezpieczna płatność Przelewy24 — BLIK, karta lub przelew.
          </Text>
        </ScrollView>
      </View>
    </>
  );
}
