import { useMemo } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StatusBar, Text, View } from 'react-native';
import { Link2 } from 'lucide-react-native';
import { PageHeader } from '../../../components/ui/PageHeader';
import { EmptyState } from '../../../components/ui/EmptyState';
import { PrimaryButton } from '../../../components/ui/Sheet';
import { B } from '../../../components/ui/brand';
import { FONT as F } from '../../../lib/fonts';
import { WEEKDAY_LABELS } from '@avenit/shared/src/lib/social.js';
import { openOnWeb } from '../../modules/useModules';
import { useSlots, useSocialRealtime, useSocialStatus, type SocialAccount } from '../api';
import { ChannelAvatar, channelName, providerLabel } from '../components/ui';
import { Card, Hint, SectionTitle } from '../../campaigns/components/ui';

// Kanały: lista połączonych stron FB i kont IG ze statusem oraz harmonogram kolejki (podgląd).
// Łączenie wymaga logowania do Facebooka w przeglądarce (ekran zgód Meta) — otwieramy web z biletem SSO.

const STATUS: Record<SocialAccount['status'], { label: string; fg: string; bg: string }> = {
  active: { label: 'Połączony', fg: B.okFg, bg: B.okBg },
  error: { label: 'Problem', fg: B.goldDeep, bg: B.kurkumaSoft },
  revoked: { label: 'Połącz ponownie', fg: B.danger, bg: B.dangerBg },
};

export const SocialChannelsScreen = () => {
  const status = useSocialStatus();
  const slots = useSlots();
  useSocialRealtime();
  const accounts = status.data?.accounts ?? [];
  const access = status.data?.access ?? {};

  // Harmonogram: wspólny i własny per kanał (dzień → godziny).
  const schedules = useMemo(() => {
    const out = new Map<string | null, Map<number, string[]>>();
    for (const s of slots.data ?? []) {
      const key = s.account_id || null;
      if (!out.has(key)) out.set(key, new Map());
      const days = out.get(key)!;
      days.set(s.weekday, [...(days.get(s.weekday) ?? []), s.time].sort());
    }
    return out;
  }, [slots.data]);
  const byId = new Map(accounts.map((a) => [a.id, a]));

  const Schedule = ({ days }: { days: Map<number, string[]> }) => (
    <View style={{ gap: 6 }}>
      {WEEKDAY_LABELS.map((label: string, i: number) => {
        const times = days.get(i + 1) ?? [];
        return (
          <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ width: 104, fontSize: 14, color: B.ink2, fontFamily: F.semibold }}>{label}</Text>
            <Text style={{ flex: 1, fontSize: 14, color: times.length ? B.ink : B.ink4, fontFamily: F.medium, fontVariant: ['tabular-nums'] }}>
              {times.length ? times.join('  ·  ') : 'brak'}
            </Text>
          </View>
        );
      })}
    </View>
  );

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: B.paper }}>
        <PageHeader title="Kanały" subtitle="Social Media" Icon={Link2} showBack />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140 }}
          refreshControl={<RefreshControl refreshing={status.isRefetching} onRefresh={() => { status.refetch(); slots.refetch(); }} tintColor={B.ink} />}>
          {status.isLoading ? <ActivityIndicator color={B.ink} style={{ marginTop: 32 }} /> : null}
          {!status.isLoading && !accounts.length ? (
            <EmptyState Icon={Link2} title="Brak podłączonych kanałów"
              hint={access.manage ? 'Połącz stronę na Facebooku i konto firmowe na Instagramie — logowanie do Facebooka otworzy się w przeglądarce.' : 'Poproś administratora o podłączenie kanałów.'} />
          ) : null}
          {accounts.length ? (
            <Card style={{ paddingVertical: 4, marginTop: 4 }}>
              {accounts.map((a, i) => {
                const st = STATUS[a.status] ?? STATUS.active;
                return (
                  <View key={a.id} style={{ paddingVertical: 12, borderBottomWidth: i === accounts.length - 1 ? 0 : 1, borderBottomColor: B.line }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <ChannelAvatar account={a} size={40} />
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={{ fontSize: 15, color: B.ink, fontFamily: F.semibold }}>{channelName(a)}</Text>
                        <Text numberOfLines={1} style={{ fontSize: 12, color: B.ink4, fontFamily: F.medium }}>
                          {`${providerLabel(a.provider)}${a.provider === 'instagram' && a.username ? ` · ${a.name}` : ''}`}
                        </Text>
                      </View>
                      <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: st.bg }}>
                        <Text style={{ fontSize: 11, color: st.fg, fontFamily: F.bold }}>{st.label}</Text>
                      </View>
                    </View>
                    {a.last_error && a.status !== 'active' ? <Text style={{ marginTop: 6, fontSize: 12, color: B.danger, fontFamily: F.medium }}>{a.last_error}</Text> : null}
                  </View>
                );
              })}
            </Card>
          ) : null}
          {access.manage && status.data?.meta?.configured ? (
            <View style={{ marginTop: 14 }}>
              <PrimaryButton label={accounts.length ? 'Dodaj / odśwież kanały' : 'Połącz Facebook i Instagram'} onPress={() => openOnWeb('/social?tab=channels')} />
              <Hint>Logowanie do Facebooka i wybór stron otworzą się w przeglądarce. Po połączeniu kanały pojawią się tutaj same.</Hint>
            </View>
          ) : null}
          {access.manage && status.data && !status.data.meta?.configured ? (
            <Hint tone="warn">Łączenie z Facebookiem nie jest jeszcze włączone na platformie Avenit.</Hint>
          ) : null}

          <SectionTitle>Harmonogram kolejki</SectionTitle>
          <Card>
            {slots.isLoading ? <ActivityIndicator color={B.ink} /> : <Schedule days={schedules.get(null) ?? new Map()} />}
            <Hint>Godziny publikacji postów dodanych „do kolejki” (czas polski). Zmienisz je na webie w zakładce Kanały.</Hint>
          </Card>
          {[...schedules.keys()].filter((k): k is string => !!k && byId.has(k)).map((k) => (
            <View key={k}>
              <SectionTitle>{`Własne godziny · ${channelName(byId.get(k))}`}</SectionTitle>
              <Card><Schedule days={schedules.get(k)!} /></Card>
            </View>
          ))}
        </ScrollView>
      </View>
    </>
  );
};
