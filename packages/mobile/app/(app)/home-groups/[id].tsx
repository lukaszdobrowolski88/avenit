import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Calendar,
  ChevronLeft,
  Crown,
  Home,
  Mail,
  MapPin,
  Phone,
  Users,
} from 'lucide-react-native';
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
        borderBottomColor: '#f5f5f4',
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: member.is_leader ? '#fef3c7' : '#fef3f2',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            color: member.is_leader ? '#b45309' : '#be185d',
            fontFamily: 'Inter_700Bold',
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
              color: '#0c0a09',
              letterSpacing: -0.2,
              fontFamily: 'Inter_600SemiBold',
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
              color: '#78716c',
              marginTop: 2,
              fontFamily: 'Inter_500Medium',
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
            backgroundColor: '#fafaf9',
            borderWidth: 1,
            borderColor: '#eef0f3',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Phone size={14} color="#57534e" />
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
      <Icon size={14} color="#78716c" strokeWidth={2.2} />
      <Text
        style={{
          fontSize: 14,
          color: onPress ? '#be185d' : '#1c1917',
          fontFamily: onPress ? 'Inter_600SemiBold' : 'Inter_500Medium',
        }}
      >
        {text}
      </Text>
    </Wrap>
  );
};

export default function HomeGroupDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading } = useHomeGroupDetail(String(id ?? ''));

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#ffffff',
        }}
      >
        <ActivityIndicator color="#ec4899" />
      </View>
    );
  }

  const group = data?.group ?? null;
  const members = data?.members ?? [];

  if (!group) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#ffffff',
          paddingHorizontal: 24,
        }}
      >
        <Text style={{ color: '#78716c', fontFamily: 'Inter_500Medium' }}>
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
        style={{ flex: 1, backgroundColor: '#ffffff' }}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 48,
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
              backgroundColor: '#fafaf9',
              borderWidth: 1,
              borderColor: '#e7e5e4',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ChevronLeft size={20} color="#1c1917" strokeWidth={2.2} />
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
              color: '#0c0a09',
              textAlign: 'center',
              letterSpacing: -0.5,
              fontFamily: 'Inter_700Bold',
            }}
          >
            {group.name}
          </Text>
          {group.description ? (
            <Text
              style={{
                fontSize: 13,
                color: '#78716c',
                textAlign: 'center',
                marginTop: 6,
                lineHeight: 19,
                fontFamily: 'Inter_400Regular',
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
              backgroundColor: '#ffffff',
              shadowColor: '#0f172a',
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
                borderColor: '#eef0f3',
                paddingHorizontal: 16,
                paddingVertical: 12,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  color: '#78716c',
                  marginBottom: 4,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  fontFamily: 'Inter_700Bold',
                }}
              >
                Spotkania
              </Text>
              <InfoLine Icon={Calendar} text={meetingLine} />
              <InfoLine Icon={MapPin} text={group.location || group.address || ''} />
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
            </View>
          </View>
        )}

        {group.leader ? (
          <View
            style={{
              marginHorizontal: 16,
              marginBottom: 12,
              borderRadius: 20,
              backgroundColor: '#ffffff',
              shadowColor: '#0f172a',
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
                borderColor: '#eef0f3',
                paddingHorizontal: 16,
                paddingVertical: 12,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  color: '#78716c',
                  marginBottom: 8,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  fontFamily: 'Inter_700Bold',
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
                      color: '#0c0a09',
                      letterSpacing: -0.3,
                      fontFamily: 'Inter_700Bold',
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
                          color: '#be185d',
                          marginTop: 2,
                          fontFamily: 'Inter_500Medium',
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
                      backgroundColor: '#fafaf9',
                      borderWidth: 1,
                      borderColor: '#eef0f3',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Phone size={15} color="#57534e" />
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        ) : null}

        {members.length > 0 ? (
          <View
            style={{
              marginHorizontal: 16,
              borderRadius: 20,
              backgroundColor: '#ffffff',
              shadowColor: '#0f172a',
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
                borderColor: '#eef0f3',
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
                <Users size={14} color="#78716c" strokeWidth={2.4} />
                <Text
                  style={{
                    fontSize: 11,
                    color: '#78716c',
                    letterSpacing: 0.6,
                    textTransform: 'uppercase',
                    fontFamily: 'Inter_700Bold',
                  }}
                >
                  Członkowie · {members.length}
                </Text>
              </View>
              {members.map((m, idx) => (
                <MemberRow key={m.id} member={m} isLast={idx === members.length - 1} />
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </>
  );
}
