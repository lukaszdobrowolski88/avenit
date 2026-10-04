import { ActivityIndicator, RefreshControl, ScrollView, StatusBar, Text, View } from 'react-native';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { Gift } from 'lucide-react-native';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { NoModuleAccess } from '../../../src/components/ModuleGate';
import { usePermissions } from '../../../src/lib/permissions';
import { useCampusQuery } from '../../../src/hooks/useCampusQuery';
import { useGivingOverview, type GivingOverview } from '../../../src/features/giving/admin';
import { Empty, money } from '../../../src/features/teams/tabs/ui';

const MONTHS = ['S', 'L', 'M', 'K', 'M', 'C', 'L', 'S', 'W', 'P', 'L', 'G'];

const Kpi = ({ label, value }: { label: string; value: string }) => (
  <View style={{ flexBasis: '47%', flexGrow: 1, borderRadius: 18, backgroundColor: '#EFEBE2', padding: 14 }}>
    <Text style={{ fontSize: 11, color: '#6B6557', fontFamily: 'Manrope_700Bold', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</Text>
    <Text style={{ fontSize: 22, color: '#2A2312', fontFamily: 'Manrope_700Bold', marginTop: 2, letterSpacing: -0.5 }}>{value}</Text>
  </View>
);

const SectionTitle = ({ children }: { children: string }) => (
  <Text style={{ fontSize: 13, color: '#6B6557', letterSpacing: 0.5, textTransform: 'uppercase', fontFamily: 'Manrope_700Bold', marginTop: 20, marginBottom: 10 }}>
    {children}
  </Text>
);

// Pulpit Dawania dla skarbnika/rady (module:giving) — jak zakładka Pulpit na webie.
export default function GivingAdminScreen() {
  const perms = usePermissions();
  const { selectedCampusId, withCampusFilter } = useCampusQuery();
  const allowed = perms.ready && perms.moduleVisible('giving');
  const ov = useGivingOverview({ selectedCampusId, withCampusFilter }, allowed);

  if (!perms.ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F6F4EE' }}>
        <ActivityIndicator color="#2A2312" />
      </View>
    );
  }
  if (!allowed) return <NoModuleAccess />;

  const d: GivingOverview | undefined = ov.data;
  const maxMonth = Math.max(1, ...(d?.months ?? [0]));
  const currentMonth = new Date().getMonth();

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: '#F6F4EE' }}>
        <PageHeader title="Dawanie" subtitle={`Pulpit ${d?.year ?? new Date().getFullYear()}`} Icon={Gift} showBack />
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 130 }}
          refreshControl={<RefreshControl refreshing={ov.isRefetching} onRefresh={() => ov.refetch()} tintColor="#2A2312" />}
        >
          {ov.isLoading ? <ActivityIndicator color="#2A2312" style={{ marginTop: 32 }} /> : null}
          {ov.isError ? <Empty Icon={Gift} title="Nie udało się wczytać danych" hint="Sprawdź uprawnienia do modułu Dawanie." /> : null}
          {d ? (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                <Kpi label="Od stycznia" value={money(d.yearTotal)} />
                <Kpi label={format(new Date(), 'LLLL', { locale: pl })} value={money(d.monthTotal)} />
                <Kpi label="Darczyńców" value={String(d.donors)} />
                <Kpi label="Wpłat" value={String(d.count)} />
              </View>

              <SectionTitle>Miesiące</SectionTitle>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 90, borderRadius: 18, backgroundColor: '#EFEBE2', padding: 12 }}>
                {d.months.map((v, i) => (
                  <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                    <View
                      style={{
                        width: '100%',
                        height: Math.max(3, Math.round((v / maxMonth) * 50)),
                        borderRadius: 4,
                        backgroundColor: i === currentMonth ? '#FFBE0B' : '#F3E3B0',
                      }}
                    />
                    <Text style={{ fontSize: 9, color: '#857F70', fontFamily: 'Manrope_600SemiBold' }}>{MONTHS[i]}</Text>
                  </View>
                ))}
              </View>

              {d.byFund.length ? (
                <>
                  <SectionTitle>Fundusze</SectionTitle>
                  {d.byFund.map((f) => (
                    <View key={f.name} style={{ marginBottom: 10, gap: 5 }}>
                      <View style={{ flexDirection: 'row' }}>
                        <Text style={{ flex: 1, fontSize: 14, color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}>{f.name}</Text>
                        <Text style={{ fontSize: 13, color: '#4A463E', fontFamily: 'Manrope_600SemiBold' }}>
                          {money(f.total)} · {f.pct}%
                        </Text>
                      </View>
                      <View style={{ height: 6, borderRadius: 3, backgroundColor: '#E6E1D5', overflow: 'hidden' }}>
                        <View style={{ width: `${f.pct}%`, height: 6, backgroundColor: f.color ?? '#FFBE0B' }} />
                      </View>
                    </View>
                  ))}
                </>
              ) : null}

              {d.campaigns.length ? (
                <>
                  <SectionTitle>Zbiórki</SectionTitle>
                  {d.campaigns.map((c) => (
                    <View key={c.id} style={{ borderRadius: 18, backgroundColor: '#EFEBE2', padding: 14, marginBottom: 10, gap: 6 }}>
                      <Text style={{ fontSize: 15, color: '#2A2312', fontFamily: 'Manrope_700Bold' }}>{c.name}</Text>
                      <View style={{ height: 8, borderRadius: 4, backgroundColor: '#F6F4EE', overflow: 'hidden' }}>
                        <View style={{ width: `${c.pct}%`, height: 8, backgroundColor: '#15803d' }} />
                      </View>
                      <Text style={{ fontSize: 12, color: '#4A463E', fontFamily: 'Manrope_500Medium' }}>
                        {money(c.raised)}
                        {c.goal ? ` z ${money(c.goal)} · ${c.pct}%` : ''}
                      </Text>
                    </View>
                  ))}
                </>
              ) : null}

              <SectionTitle>Ostatnie wpłaty</SectionTitle>
              {d.recent.length === 0 ? (
                <Text style={{ fontSize: 13, color: '#857F70', fontFamily: 'Manrope_500Medium' }}>Brak wpłat w tym roku.</Text>
              ) : null}
              {d.recent.map((r) => (
                <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E9E4D8' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}>{r.who}</Text>
                    <Text style={{ fontSize: 12, color: '#6B6557', fontFamily: 'Manrope_500Medium' }}>{[r.date, r.fund].filter(Boolean).join(' · ')}</Text>
                  </View>
                  <Text style={{ fontSize: 15, color: '#2A2312', fontFamily: 'Manrope_700Bold' }}>{money(r.amount)}</Text>
                </View>
              ))}
            </>
          ) : null}
        </ScrollView>
      </View>
    </>
  );
}
