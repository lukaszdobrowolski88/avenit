import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { FileText, Share2 } from 'lucide-react-native';
import { formatDate } from '../../../src/lib/domain';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { GradientButton } from '../../../src/components/ui/GradientButton';
import { useAuthSession } from '../../../src/lib/auth';
import { useMyGiving, formatMoney, type Donation } from '../../../src/features/giving/api';

const isCompleted = (d: Donation) => (d.status ?? 'completed') === 'completed';
const yearOf = (iso: string) => String(iso ?? '').slice(0, 4);

export default function GivingStatementScreen() {
  const { user } = useAuthSession();
  const { data, isLoading, refetch, isRefetching } = useMyGiving(user?.email ?? null);
  const donations = useMemo(() => ((data?.donations ?? []) as Donation[]).filter(isCompleted), [data]);
  const currency = data?.currency ?? 'PLN';

  const years = useMemo(() => {
    const set = new Set<string>();
    for (const d of donations) if (d.donation_date) set.add(yearOf(d.donation_date));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [donations]);

  const [year, setYear] = useState<string | null>(null);
  const activeYear = year ?? years[0] ?? String(new Date().getFullYear());

  const inYear = useMemo(
    () => donations.filter((d) => yearOf(d.donation_date) === activeYear),
    [donations, activeYear],
  );
  const total = useMemo(() => inYear.reduce((s, d) => s + Number(d.amount ?? 0), 0), [inYear]);

  const donorName = (user?.full_name as string | undefined)?.trim() || user?.email || '';

  const share = async () => {
    const lines = inYear
      .map((d) => `• ${formatDate(d.donation_date, 'd MMM yyyy')} — ${formatMoney(d.amount, currency)}`)
      .join('\n');
    const message =
      `Zestawienie darowizn za rok ${activeYear}\n` +
      `Darczyńca: ${donorName}\n\n` +
      `${lines || 'Brak darowizn w tym roku.'}\n\n` +
      `Razem: ${formatMoney(total, currency)}\n` +
      `(zestawienie wygenerowane w aplikacji Avenit)`;
    try {
      await Share.share({ message });
    } catch {
      Alert.alert('Nie udało się udostępnić', 'Spróbuj ponownie.');
    }
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
        <PageHeader title="Zestawienie roczne" subtitle="Darowizny do rozliczenia (PIT)" showBack />

        {isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#ec4899" />
          </View>
        ) : donations.length === 0 ? (
          <ScrollView
            contentContainerStyle={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#ec4899" />}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 18,
                backgroundColor: '#dcfce7',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}
            >
              <FileText size={28} color="#16a34a" />
            </View>
            <Text style={{ fontSize: 16, color: '#0c0a09', fontFamily: 'Inter_600SemiBold' }}>
              Brak darowizn
            </Text>
            <Text style={{ fontSize: 13, color: '#78716c', textAlign: 'center', marginTop: 4, fontFamily: 'Inter_400Regular' }}>
              Gdy Twoje wpłaty zostaną zarejestrowane, pojawi się tu roczne zestawienie.
            </Text>
          </ScrollView>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 140 }}
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#ec4899" />}
          >
            {/* Wybór roku */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingBottom: 12 }}
            >
              {years.map((y) => {
                const active = y === activeYear;
                return (
                  <Pressable
                    key={y}
                    onPress={() => setYear(y)}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                      borderRadius: 999,
                      backgroundColor: active ? '#16a34a' : '#f0fdf4',
                      borderWidth: 1,
                      borderColor: active ? '#16a34a' : '#dcfce7',
                    }}
                  >
                    <Text style={{ fontSize: 14, color: active ? '#ffffff' : '#15803d', fontFamily: 'Inter_700Bold' }}>
                      {y}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Suma roczna */}
            <View
              style={{
                borderRadius: 20,
                padding: 18,
                backgroundColor: '#f0fdf4',
                borderWidth: 1,
                borderColor: '#bbf7d0',
                marginBottom: 16,
              }}
            >
              <Text style={{ fontSize: 12, color: '#15803d', fontFamily: 'Inter_600SemiBold', letterSpacing: 0.3 }}>
                SUMA ZA ROK {activeYear}
              </Text>
              <Text style={{ fontSize: 30, color: '#14532d', marginTop: 4, letterSpacing: -0.8, fontFamily: 'Inter_700Bold' }}>
                {formatMoney(total, currency)}
              </Text>
              <Text style={{ fontSize: 12, color: '#16a34a', marginTop: 2, fontFamily: 'Inter_500Medium' }}>
                {inYear.length} {inYear.length === 1 ? 'wpłata' : 'wpłat'} · {donorName}
              </Text>
            </View>

            {/* Lista wpłat */}
            {inYear.map((d) => (
              <View
                key={d.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  marginBottom: 8,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: '#eef0f3',
                  backgroundColor: '#ffffff',
                }}
              >
                <Text style={{ fontSize: 14, color: '#57534e', fontFamily: 'Inter_500Medium' }}>
                  {formatDate(d.donation_date, 'd MMM yyyy')}
                </Text>
                <Text style={{ fontSize: 15, color: '#0c0a09', fontFamily: 'Inter_700Bold' }}>
                  {formatMoney(d.amount, currency)}
                </Text>
              </View>
            ))}

            <Text
              style={{ fontSize: 11, color: '#a8a29e', textAlign: 'center', marginTop: 8, fontFamily: 'Inter_400Regular', lineHeight: 16 }}
            >
              Zestawienie orientacyjne na podstawie zarejestrowanych wpłat. Oficjalne
              potwierdzenie do PIT wystaw w biurze wspólnoty.
            </Text>
          </ScrollView>
        )}

        {!isLoading && donations.length > 0 ? (
          <View style={{ position: 'absolute', left: 16, right: 16, bottom: 28 }}>
            <GradientButton onPress={share}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Share2 size={17} color="#ffffff" />
                <Text style={{ color: '#ffffff', fontSize: 15, fontFamily: 'Inter_700Bold' }}>
                  Udostępnij zestawienie {activeYear}
                </Text>
              </View>
            </GradientButton>
          </View>
        ) : null}
      </View>
    </>
  );
}
