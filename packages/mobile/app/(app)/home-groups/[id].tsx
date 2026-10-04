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
          backgroundColor: member.is_leader ? '#fef3c7' : '#FFF8E1',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            color: member.is_leader ? '#b45309' : '#8A6606',
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
            style={{
              fontSize: 14,
              color: '#2A2312',
              letterSpacing: -0.2,
              fontFamily: 'Manrope_600SemiBold',
            }}
          >
            {member.full_name}
          </Text>
          {member.is_leader ? <Crown size={12} color="#b45309" strokeWidth={2.4} /> : null}
        </View>
        {member.email || member.phone ? (
          <Text
            numberOfLines={1}
            style={{
              fontSize: 12,
              color: '#7A7466',
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
          hitSlop={6}
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            backgroundColor: '#F1EEE6',
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
      <Icon size={14} color="#7A7466" strokeWidth={2.2} />
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
  const { data, isLoading } = useHomeGroupDetail(String(id ?? ''));

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
        <Text style={{ color: '#7A7466', fontFamily: 'Manrope_500Medium' }}>
          Grupa nie istnieje.
        </Text>
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
            onPress={() => router.back()}
            hitSlop={10}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: '#F1EEE6',
              borderWidth: 1,
              borderColor: '#E3DDD0',
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
              width: 80,
              height: 80,
              borderRadius: 22,
              backgroundColor: '#dbeafe',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 12,
            }}
          >
            <Home size={36} color="#1d4ed8" strokeWidth={2} />
          </View>
          <Text
            style={{
              fontSize: 22,
              color: '#2A2312',
              textAlign: 'center',
              letterSpacing: -0.5,
              fontFamily: 'Manrope_700Bold',
            }}
          >
            {group.name}
          </Text>
          {group.description ? (
            <Text
              style={{
                fontSize: 13,
                color: '#7A7466',
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
              backgroundColor: '#F6F4EE',
              shadowColor: '#2A2312',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.05,
              shadowRadius: 14,
              elevation: 2,
            }}
          >
            <View
              style={{
                borderRadius: 20,
                borderWidth: 1,
                borderColor: '#E6E1D5',
                paddingHorizontal: 16,
                paddingVertical: 12,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  color: '#7A7466',
                  marginBottom: 4,
                  letterSpacing: 0.6,
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
                    backgroundColor: '#eff6ff',
                    borderWidth: 1,
                    borderColor: '#bfdbfe',
                  }}
                >
                  <Navigation size={16} color="#1d4ed8" strokeWidth={2.4} />
                  <Text style={{ fontSize: 14, color: '#1d4ed8', fontFamily: 'Manrope_700Bold' }}>
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
              backgroundColor: '#F6F4EE',
              shadowColor: '#2A2312',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.05,
              shadowRadius: 14,
              elevation: 2,
            }}
          >
            <View
              style={{
                borderRadius: 20,
                borderWidth: 1,
                borderColor: '#E6E1D5',
                paddingHorizontal: 16,
                paddingVertical: 12,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  color: '#7A7466',
                  marginBottom: 8,
                  letterSpacing: 0.6,
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
                    backgroundColor: '#fef3c7',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Crown size={18} color="#b45309" strokeWidth={2.2} />
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
                      backgroundColor: '#F1EEE6',
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
              backgroundColor: '#F1EEE6',
              borderWidth: 1,
              borderColor: '#E6E1D5',
              paddingVertical: 20,
              paddingHorizontal: 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Users size={16} color="#A8A59E" strokeWidth={2.2} />
            <Text
              style={{
                flex: 1,
                fontSize: 13,
                color: '#7A7466',
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
              backgroundColor: '#F6F4EE',
              shadowColor: '#2A2312',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.05,
              shadowRadius: 14,
              elevation: 2,
            }}
          >
            <View
              style={{
                borderRadius: 20,
                borderWidth: 1,
                borderColor: '#E6E1D5',
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
                <Users size={14} color="#7A7466" strokeWidth={2.4} />
                <Text
                  style={{
                    fontSize: 11,
                    color: '#7A7466',
                    letterSpacing: 0.6,
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
