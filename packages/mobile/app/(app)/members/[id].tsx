import { ActivityIndicator, Linking, Pressable, ScrollView, StatusBar, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Cake,
  ChevronLeft,
  Home,
  Mail,
  MapPin,
  Phone,
  Users as UsersIcon,
} from 'lucide-react-native';
import { formatDate } from '../../../src/lib/domain';
import { useCampusQuery } from '../../../src/hooks/useCampusQuery';
import {
  useMember,
  useHousehold,
  fullName,
  initials,
  STATUS_META,
  MINISTRY_LABELS,
} from '../../../src/features/members/api';

const SectionCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
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
        overflow: 'hidden',
      }}
    >
      <Text
        style={{
          fontSize: 11,
          color: '#78716c',
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 4,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          fontFamily: 'Inter_700Bold',
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  </View>
);

const InfoRow = ({
  Icon,
  label,
  value,
  onPress,
  isLast,
}: {
  Icon: typeof Mail;
  label: string;
  value: string | null;
  onPress?: () => void;
  isLast?: boolean;
}) => {
  if (!value) return null;
  const Wrapper: any = onPress ? Pressable : View;
  return (
    <Wrapper
      onPress={onPress}
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
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#fef3f2',
        }}
      >
        <Icon size={16} color="#ec4899" strokeWidth={2.2} />
      </View>
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
          {label}
        </Text>
        <Text
          style={{
            fontSize: 15,
            color: onPress ? '#be185d' : '#0c0a09',
            marginTop: 1,
            letterSpacing: -0.2,
            fontFamily: onPress ? 'Inter_600SemiBold' : 'Inter_500Medium',
          }}
        >
          {value}
        </Text>
      </View>
    </Wrapper>
  );
};

export default function MemberDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { selectedCampusId } = useCampusQuery();
  const { data: member, isLoading } = useMember(id ?? '', selectedCampusId);
  const { data: household } = useHousehold(member?.household_id ?? null);

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
  if (!member) {
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
          Osoba nie istnieje.
        </Text>
      </View>
    );
  }

  const meta = member.status ? STATUS_META[member.status] : null;
  const ministries = (member.ministries ?? []).filter(Boolean);

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <ScrollView
        style={{ flex: 1, backgroundColor: '#ffffff' }}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 48,
            paddingBottom: 8,
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
            paddingTop: 12,
            paddingBottom: 24,
            paddingHorizontal: 16,
          }}
        >
          <View
            style={{
              width: 96,
              height: 96,
              borderRadius: 48,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 12,
              backgroundColor: meta?.bg ?? '#fef3f2',
            }}
          >
            <Text
              style={{
                fontSize: 32,
                color: meta?.tint ?? '#be185d',
                letterSpacing: -0.5,
                fontFamily: 'Inter_700Bold',
              }}
            >
              {initials(member)}
            </Text>
          </View>
          <Text
            style={{
              fontSize: 22,
              color: '#0c0a09',
              letterSpacing: -0.5,
              fontFamily: 'Inter_700Bold',
            }}
          >
            {fullName(member)}
          </Text>
          {meta ? (
            <View
              style={{
                paddingHorizontal: 12,
                paddingVertical: 4,
                borderRadius: 999,
                marginTop: 8,
                backgroundColor: meta.bg,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  color: meta.tint,
                  fontFamily: 'Inter_700Bold',
                }}
              >
                {meta.label}
              </Text>
            </View>
          ) : null}
        </View>

        <SectionCard title="Kontakt">
          <InfoRow
            Icon={Mail}
            label="Email"
            value={member.email}
            onPress={member.email ? () => Linking.openURL(`mailto:${member.email}`) : undefined}
          />
          <InfoRow
            Icon={Phone}
            label="Telefon"
            value={member.phone}
            onPress={member.phone ? () => Linking.openURL(`tel:${member.phone}`) : undefined}
          />
          <InfoRow Icon={MapPin} label="Adres" value={member.address} />
          {member.birth_date ? (
            <InfoRow
              Icon={Cake}
              label="Data urodzenia"
              value={formatDate(member.birth_date, 'd MMMM yyyy')}
              isLast
            />
          ) : null}
        </SectionCard>

        {household ? (
          <SectionCard title="Gospodarstwo domowe">
            <InfoRow Icon={Home} label="Rodzina" value={household.family_name} />
            {household.address ? (
              <InfoRow Icon={MapPin} label="Adres" value={household.address} isLast />
            ) : null}
          </SectionCard>
        ) : null}

        {ministries.length > 0 ? (
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
                paddingVertical: 14,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <UsersIcon size={14} color="#ec4899" strokeWidth={2.4} />
                <Text
                  style={{
                    fontSize: 11,
                    color: '#78716c',
                    letterSpacing: 0.6,
                    textTransform: 'uppercase',
                    fontFamily: 'Inter_700Bold',
                  }}
                >
                  Służby
                </Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {ministries.map((m) => (
                  <View
                    key={m}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 999,
                      backgroundColor: '#fef3f2',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        color: '#be185d',
                        fontFamily: 'Inter_600SemiBold',
                      }}
                    >
                      {MINISTRY_LABELS[m] || m}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        ) : null}

        {member.membership_date ? (
          <SectionCard title="Członkostwo">
            <InfoRow
              Icon={Cake}
              label="Data członkostwa"
              value={formatDate(member.membership_date, 'd MMMM yyyy')}
              isLast
            />
          </SectionCard>
        ) : null}

        {member.notes ? (
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
                paddingVertical: 14,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  color: '#78716c',
                  marginBottom: 6,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  fontFamily: 'Inter_700Bold',
                }}
              >
                Notatki
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: '#0c0a09',
                  lineHeight: 20,
                  fontFamily: 'Inter_400Regular',
                }}
              >
                {member.notes}
              </Text>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </>
  );
}
