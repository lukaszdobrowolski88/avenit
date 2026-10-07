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
import { useMyGiving, formatMoney, isCashDonation, type Donation } from '../../../src/features/giving/api';
import { friendlyError } from '../../../src/lib/errors';

const isCompleted = (d: Donation) => (d.status ?? 'completed') === 'completed';
const yearOf = (iso: string) => String(iso ?? '').slice(0, 4);

export default function GivingStatementScreen() {
  const { user } = useAuthSession();
  const { data, isLoading, isError, error, refetch, isRefetching } = useMyGiving(user?.email ?? null);
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
  // Jak web (PIT): do odliczenia tylko wpłaty na rachunek; gotówka osobno, z adnotacją.
  const deductible = useMemo(() => inYear.filter((d) => !isCashDonation(d)), [inYear]);
  const cash = useMemo(() => inYear.filter(isCashDonation), [inYear]);
  const total = useMemo(() => deductible.reduce((s, d) => s + Number(d.amount ?? 0), 0), [deductible]);
  const cashTotal = useMemo(() => cash.reduce((s, d) => s + Number(d.amount ?? 0), 0), [cash]);

  const donorName = (user?.full_name as string | undefined)?.trim() || user?.email || '';

  const share = async () => {
    const line = (d: Donation) => `• ${formatDate(d.donation_date, 'd MMM yyyy')} — ${formatMoney(d.amount, currency)}`;
    const cashPart = cash.length
      ? `\n\nWpłaty gotówkowe (nie podlegają odliczeniu — art. 26 ust. 7 ustawy o PIT):\n` +
        `${cash.map(line).join('\n')}\nRazem gotówką: ${formatMoney(cashTotal, currency)}`
      : '';
    const message =
      `Zestawienie darowizn za rok ${activeYear}\n` +
      `Darczyńca: ${donorName}\n\n` +
      `Wpłaty na rachunek (do odliczenia):\n` +
      `${deductible.map(line).join('\n') || 'Brak wpłat na rachunek w tym roku.'}\n` +
      `Razem do odliczenia: ${formatMoney(total, currency)}` +
      cashPart +
      `\n\n(zestawienie wygenerowane w aplikacji Avenit)`;
    try {
      await Share.share({ message });
    } catch {
      Alert.alert('Nie udało się udostępnić', 'Spróbuj ponownie.');
    }
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: '#F6F4EE' }}>
        <PageHeader title="Zestawienie roczne" subtitle="Darowizny do rozliczenia (PIT)" showBack />

        {isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#2A2312" />
          </View>
        ) : isError ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
            <Text style={{ fontSize: 14, color: '#4A463E', textAlign: 'center', lineHeight: 20, fontFamily: 'Manrope_500Medium' }}>
              {friendlyError(error, 'Nie udało się wczytać Twoich darowizn.')}
            </Text>
            <Pressable
              onPress={() => refetch()}
              className="active:opacity-70"
              style={{ marginTop: 14, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: '#2A2312' }}
            >
              <Text style={{ color: '#F6F4EE', fontFamily: 'Manrope_700Bold', fontSize: 14 }}>Spróbuj ponownie</Text>
            </Pressable>
          </View>
        ) : donations.length === 0 ? (
          <ScrollView
            contentContainerStyle={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#2A2312" />}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 18,
                backgroundColor: '#ECE8DE',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}
            >
              <FileText size={28} color="#2A2312" />
            </View>
            <Text style={{ fontSize: 16, color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}>
              Brak darowizn
            </Text>
            <Text style={{ fontSize: 13, color: '#6B6557', textAlign: 'center', marginTop: 4, fontFamily: 'Manrope_400Regular' }}>
              Gdy Twoje wpłaty zostaną zarejestrowane, pojawi się tu roczne zestawienie.
            </Text>
          </ScrollView>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 140 }}
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#2A2312" />}
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
                      backgroundColor: active ? '#2A2312' : '#ECE8DE',
                      borderWidth: 1,
                      borderColor: active ? '#2A2312' : '#ECE8DE',
                    }}
                  >
                    <Text style={{ fontSize: 14, color: active ? '#ffffff' : '#2A2312', fontFamily: 'Manrope_700Bold' }}>
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
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: '#E3DDD0',
                marginBottom: 16,
              }}
            >
              <Text style={{ fontSize: 12, color: '#2A2312', fontFamily: 'Manrope_600SemiBold', letterSpacing: 0.3 }}>
                DO ODLICZENIA ZA ROK {activeYear}
              </Text>
              <Text style={{ fontSize: 30, color: '#2A2312', marginTop: 4, letterSpacing: -0.8, fontFamily: 'Manrope_700Bold' }}>
                {formatMoney(total, currency)}
              </Text>
              <Text style={{ fontSize: 12, color: '#2A2312', marginTop: 2, fontFamily: 'Manrope_500Medium' }}>
                {deductible.length}{' '}
                {deductible.length === 1
                  ? 'wpłata'
                  : [2, 3, 4].includes(deductible.length % 10) && ![12, 13, 14].includes(deductible.length % 100)
                    ? 'wpłaty'
                    : 'wpłat'}{' '}
                na rachunek · {donorName}
              </Text>
              {cash.length ? (
                <Text style={{ fontSize: 12, color: '#4A463E', marginTop: 8, lineHeight: 17, fontFamily: 'Manrope_500Medium' }}>
                  Gotówką: {formatMoney(cashTotal, currency)} — wpłaty gotówkowe nie podlegają odliczeniu
                  (art. 26 ust. 7 ustawy o PIT).
                </Text>
              ) : null}
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
                  borderColor: '#E6E1D5',
                  backgroundColor: '#F6F4EE',
                }}
              >
                <Text style={{ fontSize: 14, color: '#4A463E', fontFamily: 'Manrope_500Medium' }}>
                  {formatDate(d.donation_date, 'd MMM yyyy')}
                  {isCashDonation(d) ? ' · gotówka' : ''}
                </Text>
                <Text style={{ fontSize: 15, color: '#2A2312', fontFamily: 'Manrope_700Bold' }}>
                  {formatMoney(d.amount, currency)}
                </Text>
              </View>
            ))}

            <Text
              style={{ fontSize: 11, color: '#6E685A', textAlign: 'center', marginTop: 8, fontFamily: 'Manrope_400Regular', lineHeight: 16 }}
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
                <Share2 size={17} color="#2A2312" />
                <Text style={{ color: '#2A2312', fontSize: 15, fontFamily: 'Manrope_700Bold' }}>
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
