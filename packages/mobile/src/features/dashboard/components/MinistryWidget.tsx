import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Check, Clock, X as XIcon } from 'lucide-react-native';
import { formatDate } from '../../../lib/domain';
import { B } from '../../../components/ui/brand';
import { EmptyRow, WidgetCard } from './WidgetCard';
import { D, F } from '../theme';
import { useRespondToAssignment } from '../respond';
import type { UpcomingMinistryItem } from '../api';

type TabKey = 'upcoming' | 'suggestions' | 'history';

interface Props {
  ministry: UpcomingMinistryItem[];
  suggestions: UpcomingMinistryItem[];
  history: UpcomingMinistryItem[];
}

// Statusy czytelne i stonowane (tekst ≥ 4,5:1), bez tęczy.
const STATUS = {
  accepted: { label: 'Potwierdzone', bg: B.okBg, fg: B.okFg, Icon: Check },
  rejected: { label: 'Odrzucone', bg: B.dangerBg, fg: B.danger, Icon: XIcon },
  pending: { label: 'Czeka na Twoją odpowiedź', bg: D.accentSoft, fg: B.goldDeep, Icon: Clock },
} as const;

const StatusPill = ({ status }: { status: keyof typeof STATUS }) => {
  const s = STATUS[status];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: s.bg }}>
      <s.Icon size={11} color={s.fg} strokeWidth={2.4} />
      <Text style={{ fontSize: 11, color: s.fg, fontFamily: F.bold }}>{s.label}</Text>
    </View>
  );
};

const Tab = ({ active, onPress, label, count }: { active: boolean; onPress: () => void; label: string; count?: number }) => (
  <Pressable
    onPress={onPress}
    hitSlop={8}
    accessibilityRole="tab"
    accessibilityState={{ selected: active }}
    accessibilityLabel={count ? `${label}, ${count}` : label}
    style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 32 }}
  >
    <Text style={{ fontSize: 16, letterSpacing: -0.3, color: active ? D.ink : D.ink3, fontFamily: active ? F.bold : F.semibold }}>
      {label}
    </Text>
    {count ? (
      <View style={{ minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: active ? D.accent : D.hair, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 11, color: D.ink, fontFamily: F.bold }}>{count}</Text>
      </View>
    ) : null}
  </Pressable>
);

type Answer = ReturnType<typeof useRespondToAssignment>;

const Row = ({ m, isLast, answer }: { m: UpcomingMinistryItem; isLast: boolean; answer?: Answer }) => {
  const router = useRouter();
  const title = m.title || m.typeName || 'Nabożeństwo';
  // Służba na wydarzeniu (grafik) → ekran wydarzenia; na starym programie → program.
  const open = () => {
    if (m.eventId) router.push({ pathname: '/(app)/events/[id]', params: { id: String(m.eventId) } });
    else if (m.programId != null) router.push({ pathname: '/(app)/programs/[id]', params: { id: String(m.programId) } });
  };
  const busy = answer?.pendingId === m.id;
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: isLast ? 16 : 12, borderBottomWidth: isLast ? 0 : 1, borderBottomColor: D.hair }}>
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${formatDate(m.date, 'EEEE, d MMMM')}`}
        className="active:opacity-70"
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: m.typeColor || D.accent }} />
          <Text style={{ fontSize: 12, color: D.ink2, fontFamily: F.medium }}>{formatDate(m.date, 'EEEE, d MMM')}</Text>
        </View>
        <Text numberOfLines={1} style={{ fontSize: 15, color: D.ink, marginTop: 3, letterSpacing: -0.2, fontFamily: F.semibold }}>
          {title}
        </Text>
        {m.myRole || m.status ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
            {m.myRole ? <Text style={{ fontSize: 13, color: D.ink2, fontFamily: F.medium }}>{m.myRole}</Text> : null}
            {m.status && !answer ? <StatusPill status={m.status} /> : null}
          </View>
        ) : null}
      </Pressable>
      {answer ? (
        busy ? (
          <View style={{ height: 42, marginTop: 10, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={D.ink} />
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <Pressable
              onPress={() => answer.reject(m.id, title)}
              disabled={!!answer.pendingId}
              accessibilityRole="button"
              accessibilityLabel={`Odrzucam: ${title}`}
              className="active:opacity-70"
              style={{ flex: 1, height: 42, borderRadius: 21, backgroundColor: D.well, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 14, color: D.ink, fontFamily: F.semibold }}>Odrzucam</Text>
            </Pressable>
            <Pressable
              onPress={() => answer.accept(m.id)}
              disabled={!!answer.pendingId}
              accessibilityRole="button"
              accessibilityLabel={`Akceptuję: ${title}`}
              className="active:opacity-80"
              style={{ flex: 1, height: 42, borderRadius: 21, backgroundColor: D.accent, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 14, color: D.ink, fontFamily: F.bold }}>Akceptuję</Text>
            </Pressable>
          </View>
        )
      ) : null}
    </View>
  );
};

const List = ({ items, answer }: { items: UpcomingMinistryItem[]; answer?: Answer }) => {
  const rows = items.map((m, i) => <Row key={`${m.id}-${i}`} m={m} isLast={i === items.length - 1} answer={answer} />);
  return items.length > 5 ? (
    <ScrollView style={{ maxHeight: 5 * 92 }} nestedScrollEnabled>
      {rows}
    </ScrollView>
  ) : (
    <>{rows}</>
  );
};

// „Moja służba” — jak widżet weba: Nadchodzące / Sugestie (zaproszenia do potwierdzenia,
// odpowiedź przez /api/assignment/:id/respond) / Historia.
export const MinistryWidget = ({ ministry, suggestions, history }: Props) => {
  const [tab, setTab] = useState<TabKey>('upcoming');
  const answer = useRespondToAssignment();

  return (
    <WidgetCard title="Moja służba" count={ministry.length}>
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 18, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
        <Tab active={tab === 'upcoming'} onPress={() => setTab('upcoming')} label="Nadchodzące" />
        <Tab active={tab === 'suggestions'} onPress={() => setTab('suggestions')} label="Sugestie" count={suggestions.length} />
        <Tab active={tab === 'history'} onPress={() => setTab('history')} label="Historia" />
      </View>

      {tab === 'upcoming' ? (
        ministry.length > 0 ? (
          <List items={ministry} />
        ) : (
          <EmptyRow text="Brak nadchodzących służb" hint="Gdy lider wpisze Cię do grafiku, zobaczysz to tutaj." />
        )
      ) : null}

      {tab === 'suggestions' ? (
        suggestions.length > 0 ? (
          <List items={suggestions} answer={answer} />
        ) : (
          <EmptyRow text="Brak oczekujących sugestii" hint="Gdy ktoś Cię przypisze do służby, zobaczysz to tutaj." />
        )
      ) : null}

      {tab === 'history' ? (
        history.length > 0 ? (
          <List items={history} />
        ) : (
          <EmptyRow text="Brak historii służb" hint="Historia pojawi się po zakończeniu służb." />
        )
      ) : null}
    </WidgetCard>
  );
};
