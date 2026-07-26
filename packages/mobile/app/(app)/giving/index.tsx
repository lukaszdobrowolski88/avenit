import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { Gift, Info, Repeat } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { formatDate } from '../../../src/lib/domain';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { GradientButton } from '../../../src/components/ui/GradientButton';
import { useAuthSession } from '../../../src/lib/auth';
import {
  METHOD_LABELS,
  formatMoney,
  useMyGiving,
  type Donation,
  type GivingFund,
} from '../../../src/features/giving/api';

const DonationCard = ({
  donation,
  fund,
  currency,
}: {
  donation: Donation;
  fund: GivingFund | undefined;
  currency: string;
}) => {
  const methodLabel = donation.method
    ? METHOD_LABELS[donation.method] ?? donation.method
    : null;
  return (
    <View
      className="mb-3"
      style={{
        borderRadius: 20,
        backgroundColor: '#ffffff',
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 14,
        elevation: 2,
      }}
    >
      <View
        className="overflow-hidden p-4 flex-row items-center"
        style={{ borderRadius: 20, borderWidth: 1, borderColor: '#eef0f3' }}
      >
        <View className="flex-1">
          <Text
            className="text-[11px] uppercase mb-1"
            style={{ color: '#78716c', letterSpacing: 0.4, fontFamily: 'Inter_600SemiBold' }}
          >
            {formatDate(donation.donation_date, 'd MMM yyyy')}
          </Text>
          <View className="flex-row items-center gap-1.5">
            {fund ? (
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: fund.color ?? '#10b981',
                }}
              />
            ) : null}
            <Text
              className="text-[15px]"
              style={{ color: '#0c0a09', letterSpacing: -0.3, fontFamily: 'Inter_700Bold' }}
            >
              {fund?.name ?? 'Darowizna'}
            </Text>
          </View>
          <View className="flex-row flex-wrap items-center gap-1.5 mt-2">
            {methodLabel ? (
              <View
                className="px-2 py-0.5"
                style={{ borderRadius: 999, backgroundColor: '#f1f5f9' }}
              >
                <Text
                  className="text-[11px]"
                  style={{ color: '#475569', fontFamily: 'Inter_600SemiBold' }}
                >
                  {methodLabel}
                </Text>
              </View>
            ) : null}
            {donation.is_recurring ? (
              <View
                className="flex-row items-center gap-1 px-2 py-0.5"
                style={{ borderRadius: 999, backgroundColor: '#dcfce7' }}
              >
                <Repeat size={10} color="#16a34a" />
                <Text
                  className="text-[11px]"
                  style={{ color: '#16a34a', fontFamily: 'Inter_600SemiBold' }}
                >
                  Cykliczna
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <Text
          className="text-[16px]"
          style={{ color: '#059669', letterSpacing: -0.4, fontFamily: 'Inter_700Bold' }}
        >
          {formatMoney(donation.amount, donation.currency ?? currency)}
        </Text>
      </View>
    </View>
  );
};

export default function GivingScreen() {
  const router = useRouter();
  const { user } = useAuthSession();
  const { data, isLoading, isError, error, refetch, isRefetching } = useMyGiving(
    user?.email ?? null,
  );

  const summary = data ?? {
    memberResolved: false,
    donations: [],
    funds: {},
    yearTotal: 0,
    allTimeTotal: 0,
    currency: 'PLN',
    year: new Date().getFullYear(),
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View className="flex-1" style={{ backgroundColor: '#ffffff' }}>
        <PageHeader title="Dawanie" subtitle="Twoje darowizny" Icon={Gift} showBack />

        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#ec4899" />
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center px-6">
            <Text
              className="text-center"
              style={{ color: '#e11d48', fontFamily: 'Inter_500Medium' }}
            >
              {(error as Error)?.message ?? 'Błąd'}
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 120 }}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#ec4899" />
            }
          >
            {/* Karta podsumowania roku */}
            <View
              className="mb-4 p-5"
              style={{
                borderRadius: 24,
                backgroundColor: '#ecfdf5',
                borderWidth: 1,
                borderColor: '#bbf7d0',
              }}
            >
              <Text
                className="text-[12px]"
                style={{ color: '#047857', fontFamily: 'Inter_600SemiBold' }}
              >
                Twoje dawanie w {summary.year}
              </Text>
              <Text
                className="text-[34px] mt-1"
                style={{ color: '#065f46', letterSpacing: -1, fontFamily: 'Inter_700Bold' }}
              >
                {formatMoney(summary.yearTotal, summary.currency)}
              </Text>
              {summary.allTimeTotal > summary.yearTotal ? (
                <Text
                  className="text-[12px] mt-1"
                  style={{ color: '#059669', fontFamily: 'Inter_500Medium' }}
                >
                  Łącznie: {formatMoney(summary.allTimeTotal, summary.currency)}
                </Text>
              ) : null}
              <View className="mt-4">
                <GradientButton onPress={() => router.push('/(app)/giving/donate')}>Wesprzyj wspólnotę</GradientButton>
              </View>
            </View>

            {/* Info, gdy nie ma powiązania konta z członkiem */}
            {!summary.memberResolved ? (
              <View
                className="mb-4 p-4 flex-row items-start gap-3"
                style={{
                  borderRadius: 20,
                  backgroundColor: '#fffbeb',
                  borderWidth: 1,
                  borderColor: '#fde68a',
                }}
              >
                <Info size={18} color="#d97706" style={{ marginTop: 1 }} />
                <Text
                  className="flex-1 text-[13px]"
                  style={{ color: '#92400e', fontFamily: 'Inter_400Regular', lineHeight: 19 }}
                >
                  Nie znaleźliśmy historii darowizn powiązanej z Twoim kontem. Jeśli wspierasz
                  wspólnotę, poproś koordynatora o powiązanie konta z Twoim profilem członka. Nadal
                  możesz wesprzeć wspólnotę powyższym przyciskiem.
                </Text>
              </View>
            ) : summary.donations.length === 0 ? (
              <View
                className="items-center justify-center p-8"
                style={{ borderRadius: 20 }}
              >
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 18,
                    backgroundColor: '#d1fae5',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 12,
                  }}
                >
                  <Gift size={28} color="#059669" />
                </View>
                <Text
                  className="text-[16px]"
                  style={{ color: '#0c0a09', fontFamily: 'Inter_600SemiBold' }}
                >
                  Brak darowizn
                </Text>
                <Text
                  className="text-[13px] text-center mt-1"
                  style={{ color: '#78716c', fontFamily: 'Inter_400Regular' }}
                >
                  Twoje darowizny pojawią się tutaj po zarejestrowaniu.
                </Text>
              </View>
            ) : (
              <>
                <Text
                  className="text-[11px] uppercase mb-2 mx-1"
                  style={{ color: '#78716c', letterSpacing: 0.6, fontFamily: 'Inter_700Bold' }}
                >
                  Historia
                </Text>
                {summary.donations.map((d) => (
                  <DonationCard
                    key={d.id}
                    donation={d}
                    fund={d.fund_id ? summary.funds[d.fund_id] : undefined}
                    currency={summary.currency}
                  />
                ))}
              </>
            )}
          </ScrollView>
        )}
      </View>
    </>
  );
}
