import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { Calendar, Check, Clock, History, Lightbulb, X as XIcon } from 'lucide-react-native';
import { formatDate } from '../../../lib/domain';
import { WidgetCard } from './WidgetCard';
import type { UpcomingMinistryItem, UpcomingProgramItem } from '../api';

type TabKey = 'upcoming' | 'suggestions' | 'history';

interface Props {
  ministry: UpcomingMinistryItem[];
  suggestions: UpcomingMinistryItem[];
  history: UpcomingMinistryItem[];
  programs: UpcomingProgramItem[];
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
        <Text style={{ fontSize: 10, color: '#047857', fontFamily: 'Inter_700Bold' }}>
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
        <Text style={{ fontSize: 10, color: '#be123c', fontFamily: 'Inter_700Bold' }}>
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
      <Text style={{ fontSize: 10, color: '#b45309', fontFamily: 'Inter_700Bold' }}>Oczekuje</Text>
    </View>
  );
};

const Tab = ({
  active,
  onPress,
  Icon,
  label,
}: {
  active: boolean;
  onPress: () => void;
  Icon: typeof Clock;
  label: string;
}) => (
  <Pressable
    onPress={onPress}
    style={{
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: active ? '#ffffff' : 'transparent',
      shadowColor: active ? '#0f172a' : 'transparent',
      shadowOpacity: active ? 0.06 : 0,
      shadowRadius: active ? 4 : 0,
      shadowOffset: { width: 0, height: 1 },
      elevation: active ? 2 : 0,
    }}
  >
    <Icon size={12} color={active ? '#0c0a09' : '#78716c'} />
    <Text
      style={{
        fontSize: 12,
        color: active ? '#0c0a09' : '#78716c',
        fontFamily: 'Inter_600SemiBold',
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
  return (
    <Link
      href={{ pathname: '/(app)/programs/[id]', params: { id: String(programId) } }}
      asChild
    >
      <Pressable
        className="active:opacity-70"
        style={{
          flexDirection: 'row',
          alignItems: 'stretch',
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: isLast ? 0 : 1,
          borderBottomColor: '#f5f5f4',
        }}
      >
        <View style={{ width: 4, borderRadius: 2, backgroundColor: m.typeColor || '#ec4899' }} />
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 11,
              color: '#78716c',
              letterSpacing: 0.4,
              textTransform: 'uppercase',
              fontFamily: 'Inter_600SemiBold',
            }}
          >
            {formatDate(m.date, 'EEEE, d MMM')}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              fontSize: 14,
              color: '#0c0a09',
              marginTop: 2,
              letterSpacing: -0.2,
              fontFamily: 'Inter_600SemiBold',
            }}
          >
            {m.title || m.typeName || 'Nabożeństwo'}
          </Text>
          {(myRole || status) && (
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}
            >
              {myRole ? (
                <Text
                  style={{ fontSize: 12, color: '#57534e', fontFamily: 'Inter_500Medium' }}
                >
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

const EmptyState = ({
  Icon,
  title,
  subtitle,
}: {
  Icon: typeof Calendar;
  title: string;
  subtitle?: string;
}) => (
  <View style={{ paddingHorizontal: 16, paddingVertical: 32, alignItems: 'center' }}>
    <View
      style={{
        width: 48,
        height: 48,
        borderRadius: 14,
        backgroundColor: '#f5f5f4',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
      }}
    >
      <Icon size={20} color="#a8a29e" />
    </View>
    <Text style={{ fontSize: 13, color: '#0c0a09', fontFamily: 'Inter_600SemiBold' }}>
      {title}
    </Text>
    {subtitle ? (
      <Text
        style={{
          fontSize: 11,
          color: '#78716c',
          marginTop: 2,
          textAlign: 'center',
          fontFamily: 'Inter_400Regular',
        }}
      >
        {subtitle}
      </Text>
    ) : null}
  </View>
);

export const MinistryWidget = ({ ministry, suggestions, history }: Props) => {
  const [tab, setTab] = useState<TabKey>('upcoming');

  return (
    <WidgetCard title="Moja Służba" Icon={Calendar}>
      <View style={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8 }}>
        <View
          style={{
            flexDirection: 'row',
            gap: 4,
            backgroundColor: '#f5f5f4',
            padding: 4,
            borderRadius: 14,
          }}
        >
          <Tab
            active={tab === 'upcoming'}
            onPress={() => setTab('upcoming')}
            Icon={Clock}
            label="Nadchodzące"
          />
          <Tab
            active={tab === 'suggestions'}
            onPress={() => setTab('suggestions')}
            Icon={Lightbulb}
            label="Sugestie"
          />
          <Tab
            active={tab === 'history'}
            onPress={() => setTab('history')}
            Icon={History}
            label="Historia"
          />
        </View>
      </View>

      {tab === 'upcoming' ? (
        ministry.length > 0 ? (
          ministry.map((m, i) => (
            <Row key={`${m.programId}-${i}`} m={m} isLast={i === ministry.length - 1} />
          ))
        ) : (
          <EmptyState
            Icon={Calendar}
            title="Brak nadchodzących służb"
            subtitle="Nie jesteś przypisany do żadnego programu"
          />
        )
      ) : null}

      {tab === 'suggestions' ? (
        suggestions.length > 0 ? (
          suggestions.length > 5 ? (
            <ScrollView style={{ maxHeight: 5 * 80 }} nestedScrollEnabled>
              {suggestions.map((m, i) => (
                <Row
                  key={`${m.programId}-${i}`}
                  m={m}
                  isLast={i === suggestions.length - 1}
                />
              ))}
            </ScrollView>
          ) : (
            suggestions.map((m, i) => (
              <Row
                key={`${m.programId}-${i}`}
                m={m}
                isLast={i === suggestions.length - 1}
              />
            ))
          )
        ) : (
          <EmptyState
            Icon={Lightbulb}
            title="Brak zaproszeń do służby"
            subtitle="Tu zobaczysz nowe propozycje z grafiku i programu"
          />
        )
      ) : null}

      {tab === 'history' ? (
        history.length > 0 ? (
          history.length > 5 ? (
            <ScrollView style={{ maxHeight: 5 * 80 }} nestedScrollEnabled>
              {history.map((m, i) => (
                <Row key={`${m.programId}-${i}`} m={m} isLast={i === history.length - 1} />
              ))}
            </ScrollView>
          ) : (
            history.map((m, i) => (
              <Row key={`${m.programId}-${i}`} m={m} isLast={i === history.length - 1} />
            ))
          )
        ) : (
          <EmptyState Icon={History} title="Brak historii służby" />
        )
      ) : null}
    </WidgetCard>
  );
};
