import { Alert, Pressable, Text, View } from 'react-native';
import { Calendar, MapPin, Trash2 } from 'lucide-react-native';
import { format, isSameDay } from 'date-fns';
import { pl } from 'date-fns/locale';
import { useDeleteMinistryEvent, type MinistryEvent, type MinistryKey } from '../api';

interface Props {
  event: MinistryEvent;
  ministry: MinistryKey;
  myEmail: string | null;
  tint: string;
  bg: string;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  proba: 'Próba',
  koncert: 'Koncert',
  nabozesnstwo: 'Nabożeństwo',
  warsztat: 'Warsztat',
  produkcja: 'Produkcja',
  szkolenie: 'Szkolenie',
  streaming: 'Streaming',
  inne: 'Inne',
};

export const EventRow = ({ event, ministry, myEmail, tint, bg }: Props) => {
  const start = new Date(event.start_date);
  const end = event.end_date ? new Date(event.end_date) : null;
  const isMine = myEmail === event.created_by;
  const deleteEvent = useDeleteMinistryEvent(ministry);

  const dateLabel = format(start, 'EEE, d MMM yyyy', { locale: pl });
  const timeLabel =
    end && !isSameDay(start, end)
      ? `${format(start, 'HH:mm')} → ${format(end, 'd MMM HH:mm', { locale: pl })}`
      : end
        ? `${format(start, 'HH:mm')} – ${format(end, 'HH:mm')}`
        : format(start, 'HH:mm');

  const typeLabel = EVENT_TYPE_LABELS[event.event_type] ?? event.event_type;

  const handleDelete = () => {
    Alert.alert('Usunąć wydarzenie?', `"${event.title}" zostanie usunięte.`, [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: () => deleteEvent.mutate(event.id),
      },
    ]);
  };

  return (
    <View
      style={{
        marginBottom: 10,
        borderRadius: 16,
        backgroundColor: '#ffffff',
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.04,
        shadowRadius: 10,
        elevation: 1,
      }}
    >
      <View
        style={{
          borderRadius: 16,
          borderWidth: 1,
          borderColor: '#eef0f3',
          padding: 14,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <View
            style={{
              width: 56,
              borderRadius: 12,
              backgroundColor: bg,
              paddingVertical: 10,
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                fontSize: 10,
                color: tint,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                fontFamily: 'Inter_700Bold',
              }}
            >
              {format(start, 'MMM', { locale: pl })}
            </Text>
            <Text
              style={{
                fontSize: 22,
                color: tint,
                marginTop: 2,
                letterSpacing: -0.6,
                fontFamily: 'Inter_700Bold',
              }}
            >
              {format(start, 'd')}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}
            >
              <View
                style={{
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 6,
                  backgroundColor: bg,
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    color: tint,
                    fontFamily: 'Inter_700Bold',
                    textTransform: 'uppercase',
                    letterSpacing: 0.4,
                  }}
                >
                  {typeLabel}
                </Text>
              </View>
            </View>
            <Text
              style={{
                fontSize: 15,
                color: '#0c0a09',
                letterSpacing: -0.3,
                fontFamily: 'Inter_700Bold',
              }}
            >
              {event.title}
            </Text>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}
            >
              <Calendar size={11} color="#78716c" />
              <Text
                style={{ fontSize: 12, color: '#78716c', fontFamily: 'Inter_500Medium' }}
              >
                {dateLabel} · {timeLabel}
              </Text>
            </View>
            {event.location ? (
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}
              >
                <MapPin size={11} color="#78716c" />
                <Text
                  style={{ fontSize: 12, color: '#78716c', fontFamily: 'Inter_500Medium' }}
                >
                  {event.location}
                </Text>
              </View>
            ) : null}
            {event.description ? (
              <Text
                style={{
                  fontSize: 13,
                  color: '#1c1917',
                  marginTop: 6,
                  fontFamily: 'Inter_400Regular',
                  lineHeight: 18,
                }}
              >
                {event.description}
              </Text>
            ) : null}
          </View>
          {isMine ? (
            <Pressable onPress={handleDelete} hitSlop={8} style={{ padding: 4 }}>
              <Trash2 size={15} color="#a8a29e" />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
};
