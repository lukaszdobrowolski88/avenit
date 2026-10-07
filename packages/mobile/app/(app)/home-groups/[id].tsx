import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Calendar,
  ChevronLeft,
  Crown,
  Home,
  Mail,
  MapPin,
  Navigation,
  Phone,
  Users,
} from 'lucide-react-native';

// Otwiera natywną aplikację map z zapytaniem po adresie (bez współrzędnych — grupy ich
// nie mają). iOS → Apple Maps, pozostałe → geo:/Google Maps. Keyless, bez nowej zależności.
const openMaps = (query: string) => {
  const q = encodeURIComponent(query);
  const url = Platform.select({
    ios: `http://maps.apple.com/?q=${q}`,
    android: `geo:0,0?q=${q}`,
    default: `https://www.google.com/maps/search/?api=1&query=${q}`,
  })!;
  Linking.openURL(url).catch(() =>
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`).catch(() =>
      Alert.alert('Nie udało się otworzyć map', query),
    ),
  );
};
import {
  formatMeetingDay,
  formatMeetingTime,
  useHomeGroupDetail,
  type HomeGroupMember,
} from '../../../src/features/home-groups/api';
import { goBack } from '../../../src/lib/navigation';
import { friendlyError } from '../../../src/lib/errors';

const MemberRow = ({ member, isLast }: { member: HomeGroupMember; isLast: boolean }) => {
  const initials = member.full_name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: '#ECE8DE',
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: member.is_leader ? '#FFF1C2' : '#FFF8E1',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            color: member.is_leader ? '#8A6606' : '#8A6606',
            fontFamily: 'Manrope_700Bold',
            fontSize: 13,
          }}
        >
          {initials || '?'}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text
            numberOfLines={1}
            style={{
              flexShrink: 1,
              fontSize: 14,
              color: '#2A2312',
              letterSpacing: -0.2,
              fontFamily: 'Manrope_600SemiBold',
            }}
          >
            {member.full_name}
          </Text>
          {member.is_leader ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 3,
                paddingHorizontal: 7,
                paddingVertical: 2,
                borderRadius: 999,
                backgroundColor: '#FFF1C2',
              }}
            >
              <Crown size={10} color="#6B4F05" strokeWidth={2.4} />
              <Text style={{ fontSize: 10, color: '#6B4F05', fontFamily: 'Manrope_700Bold' }}>Lider</Text>
            </View>
          ) : null}
        </View>
        {member.email || member.phone ? (
          <Text
            numberOfLines={1}
            style={{
              fontSize: 12,
              color: '#6B6557',
              marginTop: 2,
              fontFamily: 'Manrope_500Medium',
            }}
          >
            {member.email || member.phone}
          </Text>
        ) : null}
      </View>
      {member.phone ? (
        <Pressable
          onPress={() => Linking.openURL(`tel:${member.phone}`)}
          accessibilityLabel={`Zadzwoń: ${member.full_name}`}
          hitSlop={6}
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: '#E6E1D5',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Phone size={14} color="#4A463E" />
        </Pressable>
      ) : null}
    </View>
  );
};

const InfoLine = ({
  Icon,
  text,
  onPress,
}: {
  Icon: typeof Calendar;
  text: string;
  onPress?: () => void;
}) => {
  if (!text) return null;
  const Wrap: any = onPress ? Pressable : View;
  return (
    <Wrap
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 6,
      }}
    >
      <Icon size={14} color="#6B6557" strokeWidth={2.2} />
      <Text
        style={{
          fontSize: 14,
          color: onPress ? '#8A6606' : '#2A2312',
          fontFamily: onPress ? 'Manrope_600SemiBold' : 'Manrope_500Medium',
        }}
      >
        {text}
      </Text>
    </Wrap>
  );
};

export default function HomeGroupDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError, error, refetch } = useHomeGroupDetail(String(id ?? ''));

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#F6F4EE',
        }}
      >
        <ActivityIndicator color="#2A2312" />
      </View>
    );
  }

  const group = data?.group ?? null;
  const members = data?.members ?? [];
  // Kontakty/osoby widoczne tylko dla członków grupy (scoped endpoint ustala po e-mailu).
  const isMine = data?.is_mine ?? false;

  if (!group) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#F6F4EE',
          paddingHorizontal: 24,
        }}
      >
        <Text style={{ color: '#4A463E', fontFamily: 'Manrope_500Medium', textAlign: 'center', lineHeight: 20 }}>
          {isError
            ? friendlyError(error, 'Nie udało się wczytać grupy.')
            : 'Nie znaleziono tej grupy. Mogła zostać usunięta.'}
        </Text>
        <Pressable
          onPress={() => (isError ? refetch() : goBack(router))}
          className="active:opacity-70"
          style={{ marginTop: 14, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: '#2A2312' }}
        >
          <Text style={{ color: '#F6F4EE', fontFamily: 'Manrope_700Bold', fontSize: 14 }}>
            {isError ? 'Spróbuj ponownie' : 'Wróć'}
          </Text>
        </Pressable>
      </View>
    );
  }

  const day = formatMeetingDay(group.meeting_day);
  const time = formatMeetingTime(group.meeting_time);
  const meetingLine = day && time ? `${day}, ${time}` : day || time;

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <ScrollView
        style={{ flex: 1, backgroundColor: '#F6F4EE' }}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: insets.top + 6,
            paddingBottom: 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Pressable
            onPress={() => goBack(router)}
            hitSlop={10}
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: '#FFFFFF',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ChevronLeft size={20} color="#2A2312" strokeWidth={2.2} />
          </Pressable>
        </View>

        <View
          style={{
            alignItems: 'center',
            paddingTop: 8,
            paddingBottom: 20,
            paddingHorizontal: 16,
          }}
        >
          <View
            style={{
              width: 84,
              height: 84,
              borderRadius: 42,
              backgroundColor: '#FFBE0B',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 12,
            }}
          >
            <Home size={36} color="#2A2312" strokeWidth={2} />
          </View>
          <Text
            style={{
              fontSize: 26,
              color: '#2A2312',
              textAlign: 'center',
              letterSpacing: -0.8,
              fontFamily: 'Manrope_700Bold',
            }}
          >
            {group.name}
          </Text>
          {group.description ? (
            <Text
              style={{
                fontSize: 13,
                color: '#6B6557',
                textAlign: 'center',
                marginTop: 6,
                lineHeight: 19,
                fontFamily: 'Manrope_400Regular',
              }}
            >
              {group.description}
            </Text>
          ) : null}
        </View>

        {(meetingLine || group.location || group.address || group.phone || group.email) && (
          <View
            style={{
              marginHorizontal: 16,
              marginBottom: 12,
              borderRadius: 20,
              backgroundColor: '#FFFFFF',
            }}
          >
            <View
              style={{
                borderRadius: 20,
                paddingHorizontal: 16,
                paddingVertical: 12,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  color: '#8A6606',
                  marginBottom: 4,
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                  fontFamily: 'Manrope_700Bold',
                }}
              >
                Spotkania
              </Text>
              <InfoLine Icon={Calendar} text={meetingLine} />
              <InfoLine
                Icon={MapPin}
                text={group.location || group.address || ''}
                onPress={
                  group.address || group.location
                    ? () => openMaps(group.address || group.location || '')
                    : undefined
                }
              />
              <InfoLine
                Icon={Phone}
                text={group.phone || ''}
                onPress={group.phone ? () => Linking.openURL(`tel:${group.phone}`) : undefined}
              />
              <InfoLine
                Icon={Mail}
                text={group.email || ''}
                onPress={
                  group.email ? () => Linking.openURL(`mailto:${group.email}`) : undefined
                }
              />

              {group.address || group.location ? (
                <Pressable
                  onPress={() => openMaps(group.address || group.location || '')}
                  className="active:opacity-80"
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    marginTop: 10,
                    paddingVertical: 12,
                    borderRadius: 14,
                    backgroundColor: '#FFFFFF',
                    borderWidth: 1,
                    borderColor: '#E3DDD0',
                  }}
                >
                  <Navigation size={16} color="#2A2312" strokeWidth={2.4} />
                  <Text style={{ fontSize: 14, color: '#2A2312', fontFamily: 'Manrope_700Bold' }}>
                    Nawiguj do grupy
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        )}

        {group.leader ? (
          <View
            style={{
              marginHorizontal: 16,
              marginBottom: 12,
              borderRadius: 20,
              backgroundColor: '#FFFFFF',
            }}
          >
            <View
              style={{
                borderRadius: 20,
                paddingHorizontal: 16,
                paddingVertical: 12,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  color: '#8A6606',
                  marginBottom: 8,
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                  fontFamily: 'Manrope_700Bold',
                }}
              >
                Lider
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: '#FFF1C2',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Crown size={18} color="#8A6606" strokeWidth={2.2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 15,
                      color: '#2A2312',
                      letterSpacing: -0.3,
                      fontFamily: 'Manrope_700Bold',
                    }}
                  >
                    {group.leader.full_name}
                  </Text>
                  {group.leader.email ? (
                    <Pressable
                      onPress={() => Linking.openURL(`mailto:${group.leader!.email}`)}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          color: '#8A6606',
                          marginTop: 2,
                          fontFamily: 'Manrope_500Medium',
                        }}
                      >
                        {group.leader.email}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
                {group.leader.phone ? (
                  <Pressable
                    onPress={() => Linking.openURL(`tel:${group.leader!.phone}`)}
                    hitSlop={6}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 12,
                      backgroundColor: '#FFFFFF',
                      borderWidth: 1,
                      borderColor: '#E6E1D5',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Phone size={15} color="#4A463E" />
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        ) : null}

        {!isMine ? (
          <View
            style={{
              marginHorizontal: 16,
              marginTop: 4,
              borderRadius: 20,
              backgroundColor: '#FFFFFF',
              borderWidth: 1,
              borderColor: '#E6E1D5',
              paddingVertical: 20,
              paddingHorizontal: 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Users size={16} color="#6E685A" strokeWidth={2.2} />
            <Text
              style={{
                flex: 1,
                fontSize: 13,
                color: '#6B6557',
                fontFamily: 'Manrope_500Medium',
                lineHeight: 18,
              }}
            >
              Lista osób i dane kontaktowe są widoczne tylko dla członków tej grupy.
            </Text>
          </View>
        ) : members.length > 0 ? (
          <View
            style={{
              marginHorizontal: 16,
              borderRadius: 20,
              backgroundColor: '#FFFFFF',
            }}
          >
            <View
              style={{
                borderRadius: 20,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingHorizontal: 16,
                  paddingTop: 12,
                  paddingBottom: 8,
                }}
              >
                <Users size={14} color="#6B6557" strokeWidth={2.4} />
                <Text
                  style={{
                    fontSize: 11,
                    color: '#8A6606',
                    letterSpacing: 1.2,
                    textTransform: 'uppercase',
                    fontFamily: 'Manrope_700Bold',
                  }}
                >
                  Członkowie · {members.length}
                </Text>
              </View>
              {members.map((m: HomeGroupMember, idx: number) => (
                <MemberRow key={m.id} member={m} isLast={idx === members.length - 1} />
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </>
  );
}
