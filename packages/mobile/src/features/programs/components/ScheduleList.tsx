import { Text, View } from 'react-native';
import { Image as ImageIcon, MoreHorizontal, Music, Type as TypeIcon } from 'lucide-react-native';
import {
  formatTime,
  type ProgramScheduleItem,
  type ScheduleItemType,
} from '../../../lib/domain';

const TYPE_META: Record<ScheduleItemType, { Icon: typeof Music; tint: string; bg: string }> = {
  item: { Icon: TypeIcon, tint: '#4A463E', bg: '#ECE8DE' },
  header: { Icon: MoreHorizontal, tint: '#8A6606', bg: '#FFF1C2' },
  song: { Icon: Music, tint: '#9d174d', bg: '#FFF1C2' },
  media: { Icon: ImageIcon, tint: '#2A2312', bg: '#ECE8DE' },
};

interface Props {
  schedule: ProgramScheduleItem[];
}

export const ScheduleList = ({ schedule }: Props) => {
  if (schedule.length === 0) {
    return (
      <Text
        style={{
          textAlign: 'center',
          paddingVertical: 24,
          color: '#6B6557',
          fontFamily: 'Manrope_500Medium',
        }}
      >
        Brak elementów w programie.
      </Text>
    );
  }
  return (
    <View>
      {schedule.map((item, idx) => {
        const meta = TYPE_META[item.type as ScheduleItemType] ?? TYPE_META.item;
        const { Icon } = meta;
        if (item.type === 'header') {
          return (
            <View
              key={item.id ?? idx}
              style={{
                backgroundColor: meta.bg,
                borderRadius: 14,
                paddingHorizontal: 14,
                paddingVertical: 10,
                marginBottom: 8,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  color: meta.tint,
                  letterSpacing: 0.4,
                  textTransform: 'uppercase',
                  fontFamily: 'Manrope_700Bold',
                }}
              >
                Sekcja
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: '#2A2312',
                  marginTop: 2,
                  letterSpacing: -0.2,
                  fontFamily: 'Manrope_700Bold',
                }}
              >
                {item.title || 'Nowa sekcja'}
              </Text>
            </View>
          );
        }
        return (
          <View
            key={item.id ?? idx}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingHorizontal: 12,
              paddingVertical: 12,
              marginBottom: 6,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: '#E6E1D5',
              backgroundColor: '#F6F4EE',
            }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: meta.bg,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon size={18} color={meta.tint} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 14,
                  color: '#2A2312',
                  letterSpacing: -0.2,
                  fontFamily: 'Manrope_600SemiBold',
                }}
              >
                {item.title || (item.type === 'song' ? 'Pieśń' : 'Element')}
              </Text>
              {item.notes ? (
                <Text
                  numberOfLines={2}
                  style={{
                    fontSize: 12,
                    color: '#6B6557',
                    marginTop: 2,
                    fontFamily: 'Manrope_400Regular',
                  }}
                >
                  {item.notes}
                </Text>
              ) : null}
            </View>
            <Text
              style={{
                fontSize: 12,
                color: '#6B6557',
                fontVariant: ['tabular-nums'],
                fontFamily: 'Manrope_500Medium',
              }}
            >
              {formatTime(item.duration ?? 0)}
            </Text>
          </View>
        );
      })}
    </View>
  );
};
