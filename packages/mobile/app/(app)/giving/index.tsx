import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { FileText, Gift, Info, Repeat } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { formatDate } from '../../../src/lib/domain';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { GradientButton } from '../../../src/components/ui/GradientButton';
import { useAuthSession } from '../../../src/lib/auth';
import {
  METHOD_LABELS,
  formatMoney,
  useMyGiving,
  useGivingCampaigns,
  type Donation,
  type GivingCampaign,
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
        backgroundColor: '#FFFFFF',
      }}
    >
      <View
        className="overflow-hidden p-4 flex-row items-center"
        style={{ borderRadius: 20 }}
      >
        <View className="flex-1">
          <Text
            className="text-[11px] uppercase mb-1"
            style={{ color: '#8A6606', letterSpacing: 0.4, fontFamily: 'Manrope_600SemiBold' }}
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
                  backgroundColor: fund.color ?? '#2A2312',
                }}
              />
            ) : null}
            <Text
              className="text-[15px]"
              style={{ color: '#2A2312', letterSpacing: -0.3, fontFamily: 'Manrope_700Bold' }}
            >
              {fund?.name ?? 'Darowizna'}
            </Text>
          </View>
          <View className="flex-row flex-wrap items-center gap-1.5 mt-2">
            {methodLabel ? (
              <View
                className="px-2 py-0.5"
                style={{ borderRadius: 999, backgroundColor: '#ECE8DE' }}
              >
                <Text
                  className="text-[11px]"
                  style={{ color: '#4A463E', fontFamily: 'Manrope_600SemiBold' }}
                >
                  {methodLabel}
                </Text>
              </View>
            ) : null}
            {donation.is_recurring ? (
              <View
                className="flex-row items-center gap-1 px-2 py-0.5"
                style={{ borderRadius: 999, backgroundColor: '#ECE8DE' }}
              >
                <Repeat size={10} color="#2A2312" />
                <Text
                  className="text-[11px]"
                  style={{ color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}
                >
                  Cykliczna
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <Text
          className="text-[16px]"
          style={{ color: '#2A2312', letterSpacing: -0.4, fontFamily: 'Manrope_700Bold' }}
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
  const campaigns = useGivingCampaigns();

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
      <View className="flex-1" style={{ backgroundColor: '#F6F4EE' }}>
        <PageHeader title="Dawanie" subtitle="Twoje darowizny" Icon={Gift} showBack />

        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#2A2312" />
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center px-6">
            <Text
              className="text-center"
              style={{ color: '#e11d48', fontFamily: 'Manrope_500Medium' }}
            >
              {(error as Error)?.message ?? 'Błąd'}
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 120 }}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#2A2312" />
            }
          >
            {/* Karta podsumowania roku */}
            <View
              className="mb-4 p-5"
              // Karta-plakat marki: słód, kurkumowa etykieta, kwota dużym krojem.
              style={{ borderRadius: 28, backgroundColor: '#2A2312' }}
            >
              <Text style={{ fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase', color: '#FFBE0B', fontFamily: 'Manrope_700Bold' }}>
                Twoje dawanie w {summary.year}
              </Text>
              <Text
                className="text-[38px] mt-1"
                style={{ color: '#F6F4EE', letterSpacing: -1.4, fontFamily: 'Manrope_700Bold' }}
              >
                {formatMoney(summary.yearTotal, summary.currency)}
              </Text>
              {summary.allTimeTotal > summary.yearTotal ? (
                <Text
                  className="text-[13px] mt-1"
                  style={{ color: '#CFC8B6', fontFamily: 'Manrope_500Medium' }}
                >
                  Łącznie: {formatMoney(summary.allTimeTotal, summary.currency)}
                </Text>
              ) : null}
              <View className="mt-4">
                <GradientButton onPress={() => router.push('/(app)/giving/donate')}>Wesprzyj wspólnotę</GradientButton>
              </View>
              <Pressable
                onPress={() => router.push('/(app)/giving/statement')}
                className="mt-2 flex-row items-center justify-center gap-1.5 active:opacity-70"
                style={{ paddingVertical: 10 }}
              >
                <FileText size={15} color="#F6F4EE" />
                <Text className="text-[13px]" style={{ color: '#F6F4EE', fontFamily: 'Manrope_700Bold' }}>
                  Zestawienie roczne (PIT)
                </Text>
              </Pressable>
            </View>

            {/* Zbiórki (aktywne kampanie) */}
            {(campaigns.data?.length ?? 0) > 0 ? (
              <View className="mb-4">
                <Text
                  className="text-[11px] uppercase mb-2 px-1"
                  style={{ color: '#8A6606', letterSpacing: 0.6, fontFamily: 'Manrope_700Bold' }}
                >
                  Zbiórki
                </Text>
                {campaigns.data!.map((c: GivingCampaign) => {
                  const goal = Number(c.goal_amount) || 0;
                  const raised = Number(c.raised) || 0;
                  const pct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => router.push('/(app)/giving/donate')}
                      className="mb-2 active:opacity-90"
                      style={{ borderRadius: 18, borderWidth: 1, borderColor: '#E6E1D5', backgroundColor: '#F6F4EE', padding: 14 }}
                    >
                      <Text className="text-[15px]" style={{ color: '#2A2312', fontFamily: 'Manrope_700Bold' }} numberOfLines={1}>
                        {c.name}
                      </Text>
                      {c.description ? (
                        <Text
                          className="text-[12px] mt-0.5"
                          style={{ color: '#6B6557', fontFamily: 'Manrope_400Regular' }}
                          numberOfLines={2}
                        >
                          {c.description}
                        </Text>
                      ) : null}
                      {goal > 0 ? (
                        <>
                          <View style={{ height: 7, borderRadius: 4, backgroundColor: '#ECE8DE', overflow: 'hidden', marginTop: 10 }}>
                            <View style={{ height: '100%', width: `${pct}%`, borderRadius: 4, backgroundColor: '#FFBE0B' }} />
                          </View>
                          <View className="flex-row items-center justify-between mt-1.5">
                            <Text className="text-[12px]" style={{ color: '#2A2312', fontFamily: 'Manrope_700Bold' }}>
                              {formatMoney(raised, summary.currency)}
                            </Text>
                            <Text className="text-[12px]" style={{ color: '#857F70', fontFamily: 'Manrope_500Medium' }}>
                              z {formatMoney(goal, summary.currency)} · {pct}%
                            </Text>
                          </View>
                        </>
                      ) : (
                        <Text className="text-[12px] mt-2" style={{ color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}>
                          Wesprzyj →
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {/* Info, gdy nie ma powiązania konta z członkiem */}
            {!summary.memberResolved ? (
              <View
                className="mb-4 p-4 flex-row items-start gap-3"
                style={{
                  borderRadius: 20,
                  backgroundColor: '#FFF8E1',
                  borderWidth: 1,
                  borderColor: '#F3E3B0',
                }}
              >
                <Info size={18} color="#8A6606" style={{ marginTop: 1 }} />
                <Text
                  className="flex-1 text-[13px]"
                  style={{ color: '#8A6606', fontFamily: 'Manrope_400Regular', lineHeight: 19 }}
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
                    backgroundColor: '#ECE8DE',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 12,
                  }}
                >
                  <Gift size={28} color="#2A2312" />
                </View>
                <Text
                  className="text-[16px]"
                  style={{ color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}
                >
                  Brak darowizn
                </Text>
                <Text
                  className="text-[13px] text-center mt-1"
                  style={{ color: '#6B6557', fontFamily: 'Manrope_400Regular' }}
                >
                  Twoje darowizny pojawią się tutaj po zarejestrowaniu.
                </Text>
              </View>
            ) : (
              <>
                <Text
                  className="text-[11px] uppercase mb-2 mx-1"
                  style={{ color: '#8A6606', letterSpacing: 0.6, fontFamily: 'Manrope_700Bold' }}
                >
                  Historia
                </Text>
                {summary.donations.map((d: any) => (
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
