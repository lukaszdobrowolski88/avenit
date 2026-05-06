import { Pressable, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { Check, ChevronRight, Clock, X as XIcon } from 'lucide-react-native';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import type { ScheduleEntry } from '../api';

interface Props {
  entry: ScheduleEntry;
  highlightMine: boolean;
  myEmail: string | null;
}

const StatusPill = ({ status }: { status: ScheduleEntry['status'] }) => {
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
      <Text style={{ fontSize: 10, color: '#b45309', fontFamily: 'Inter_700Bold' }}>
        Oczekuje
      </Text>
    </View>
  );
};

export const ScheduleRow = ({ entry, highlightMine, myEmail }: Props) => {
  const isMine = !!myEmail && entry.assignedEmail === myEmail;
  const accent = entry.typeColor || '#ec4899';
  const date = new Date(entry.programDate);
  return (
    <Link
      href={{ pathname: '/(app)/programs/[id]', params: { id: String(entry.programId) } }}
      asChild
    >
      <Pressable
        className="active:opacity-80"
        style={{
          marginBottom: 8,
          borderRadius: 14,
          backgroundColor: '#ffffff',
          shadowColor: '#0f172a',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 8,
          elevation: 1,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            padding: 12,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: highlightMine && isMine ? '#fbcfe8' : '#eef0f3',
            backgroundColor: highlightMine && isMine ? '#fef3f2' : '#ffffff',
          }}
        >
          <View
            style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: accent }}
          />
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
              {format(date, 'EEE, d MMM', { locale: pl })}
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
              {entry.programTitle || entry.typeName || 'Nabożeństwo'}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                marginTop: 6,
                flexWrap: 'wrap',
              }}
            >
              <Text
                style={{ fontSize: 12, color: '#0c0a09', fontFamily: 'Inter_700Bold' }}
              >
                {entry.assignedName}
              </Text>
              <View
                style={{
                  paddingHorizontal: 6,
                  paddingVertical: 1,
                  borderRadius: 6,
                  backgroundColor: '#f5f5f4',
                }}
              >
                <Text
                  style={{ fontSize: 11, color: '#57534e', fontFamily: 'Inter_500Medium' }}
                >
                  {entry.roleKey}
                </Text>
              </View>
              <StatusPill status={entry.status} />
            </View>
          </View>
          <ChevronRight size={16} color="#a8a29e" />
        </View>
      </Pressable>
    </Link>
  );
};
