import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { Check, Clock, X as XIcon } from 'lucide-react-native';
import { formatDate } from '../../../lib/domain';
import { EmptyRow, WidgetCard } from './WidgetCard';
import { D, F } from '../theme';
import type { UpcomingMinistryItem, UpcomingProgramItem } from '../api';

type TabKey = 'upcoming' | 'suggestions' | 'history';

interface Props {
  ministry: UpcomingMinistryItem[];
  suggestions: UpcomingMinistryItem[];
  history: UpcomingMinistryItem[];
}

const StatusPill = ({ status }: { status: 'pending' | 'accepted' | 'rejected' }) => {
  if (status === 'accepted') {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 999,
          backgroundColor: '#d1fae5',
        }}
      >
        <Check size={10} color="#047857" />
        <Text style={{ fontSize: 10, color: '#047857', fontFamily: F.bold }}>
          Potwierdzone
        </Text>
      </View>
    );
  }
  if (status === 'rejected') {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 999,
          backgroundColor: '#ffe4e6',
        }}
      >
        <XIcon size={10} color="#be123c" />
        <Text style={{ fontSize: 10, color: '#be123c', fontFamily: F.bold }}>
          Odrzucone
        </Text>
      </View>
    );
  }
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 999,
        backgroundColor: '#fef3c7',
      }}
    >
      <Clock size={10} color="#b45309" />
      <Text style={{ fontSize: 10, color: '#b45309', fontFamily: F.bold }}>Oczekuje</Text>
    </View>
  );
};

const Tab = ({ active, onPress, label }: { active: boolean; onPress: () => void; label: string }) => (
  <Pressable onPress={onPress} hitSlop={8} accessibilityRole="tab" accessibilityState={{ selected: active }}>
    <Text
      style={{
        fontSize: 17,
        letterSpacing: -0.4,
        color: active ? D.ink : D.ink3,
        fontFamily: active ? F.bold : F.semibold,
      }}
    >
      {label}
    </Text>
  </Pressable>
);

const Row = ({
  m,
  isLast,
}: {
  m: UpcomingMinistryItem | UpcomingProgramItem;
  isLast: boolean;
}) => {
  const status = 'status' in m ? m.status : null;
  const myRole = 'myRole' in m ? m.myRole : null;
  const programId = 'programId' in m ? m.programId : (m as UpcomingProgramItem).id;
  // Służba na wydarzeniu (grafik od migracji 055) → kalendarz; na programie → program.
  const href =
    programId != null
      ? ({ pathname: '/(app)/programs/[id]', params: { id: String(programId) } } as const)
      : ('/(app)/calendar' as const);
  return (
    <Link href={href} asChild>
      <Pressable
        className="active:opacity-70"
        style={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: isLast ? 16 : 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: m.typeColor || D.accent }} />
            <Text style={{ fontSize: 12, color: D.ink2, fontFamily: F.medium }}>
              {formatDate(m.date, 'EEEE, d MMM')}
            </Text>
          </View>
          <Text
            numberOfLines={1}
            style={{
              fontSize: 15,
              color: D.ink,
              marginTop: 3,
              letterSpacing: -0.2,
              fontFamily: F.semibold,
            }}
          >
            {m.title || m.typeName || 'Nabożeństwo'}
          </Text>
          {(myRole || status) && (
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}
            >
              {myRole ? (
                <Text style={{ fontSize: 13, color: D.ink2, fontFamily: F.medium }}>
                  {myRole}
                </Text>
              ) : null}
              {status ? <StatusPill status={status} /> : null}
            </View>
          )}
        </View>
      </Pressable>
    </Link>
  );
};

export const MinistryWidget = ({ ministry, suggestions, history }: Props) => {
  const [tab, setTab] = useState<TabKey>('upcoming');

  return (
    <WidgetCard title="Moja służba" count={ministry.length}>
      <View style={{ flexDirection: 'row', gap: 18, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 }}>
        <Tab active={tab === 'upcoming'} onPress={() => setTab('upcoming')} label="Nadchodzące" />
        <Tab active={tab === 'suggestions'} onPress={() => setTab('suggestions')} label="Sugestie" />
        <Tab active={tab === 'history'} onPress={() => setTab('history')} label="Historia" />
      </View>

      {tab === 'upcoming' ? (
        ministry.length > 0 ? (
          ministry.map((m, i) => (
            <Row key={`${m.programId ?? m.eventId}-${i}`} m={m} isLast={i === ministry.length - 1} />
          ))
        ) : (
          <EmptyRow text="Nie masz nadchodzących służb" />
        )
      ) : null}

      {tab === 'suggestions' ? (
        suggestions.length > 0 ? (
          suggestions.length > 5 ? (
            <ScrollView style={{ maxHeight: 5 * 80 }} nestedScrollEnabled>
              {suggestions.map((m, i) => (
                <Row
                  key={`${m.programId ?? m.eventId}-${i}`}
                  m={m}
                  isLast={i === suggestions.length - 1}
                />
              ))}
            </ScrollView>
          ) : (
            suggestions.map((m, i) => (
              <Row
                key={`${m.programId ?? m.eventId}-${i}`}
                m={m}
                isLast={i === suggestions.length - 1}
              />
            ))
          )
        ) : (
          <EmptyRow text="Brak nowych propozycji służby" />
        )
      ) : null}

      {tab === 'history' ? (
        history.length > 0 ? (
          history.length > 5 ? (
            <ScrollView style={{ maxHeight: 5 * 80 }} nestedScrollEnabled>
              {history.map((m, i) => (
                <Row key={`${m.programId ?? m.eventId}-${i}`} m={m} isLast={i === history.length - 1} />
              ))}
            </ScrollView>
          ) : (
            history.map((m, i) => (
              <Row key={`${m.programId ?? m.eventId}-${i}`} m={m} isLast={i === history.length - 1} />
            ))
          )
        ) : (
          <EmptyRow text="Brak historii służby" />
        )
      ) : null}
    </WidgetCard>
  );
};
