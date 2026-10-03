import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { Bell, Calendar, CheckSquare, Heart, MessageCircle } from 'lucide-react-native';
import { useMyProfile } from '../../account/api';
import { useUnreadNotificationsCount } from '../../notifications/api';

interface Props {
  email: string | null | undefined;
  tasksCount?: number;
  ministryCount?: number;
  prayersCount?: number;
  pendingInvitations?: number;
  unreadMessages?: number;
}

const greeting = () => {
  const h = new Date().getHours();
  if (h < 5) return 'Dobranoc';
  if (h < 12) return 'Dzień dobry';
  if (h < 18) return 'Witaj';
  return 'Dobry wieczór';
};

// Polska odmiana liczebników: 1 zadanie, 2–4 zadania (poza 12–14), 5+ zadań.
export const plural = (n: number, one: string, few: string, many: string) => {
  if (n === 1) return one;
  const d = n % 10;
  const t = n % 100;
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many;
};

const firstName = (fullName: string | null | undefined, email: string | null | undefined) => {
  const fromName = (fullName ?? '').trim().split(/\s+/)[0];
  if (fromName) return fromName;
  const local = (email ?? '').split('@')[0]?.split('.')[0] ?? '';
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : '';
};

const Chip = ({
  Icon,
  text,
  tint,
  onPress,
}: {
  Icon: typeof CheckSquare;
  text: string;
  tint: string;
  onPress?: () => void;
}) => (
  <Pressable
    onPress={onPress}
    disabled={!onPress}
    className="active:opacity-70"
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 11,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: '#ffffff',
    }}
  >
    <Icon size={13} color={tint} strokeWidth={2.4} />
    <Text style={{ fontSize: 12, color: '#1c1917', fontFamily: 'Inter_600SemiBold' }}>{text}</Text>
  </Pressable>
);

export const Greeting = ({
  email,
  tasksCount = 0,
  ministryCount = 0,
  prayersCount = 0,
  pendingInvitations = 0,
  unreadMessages = 0,
}: Props) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useMyProfile(email ?? null);
  const unread = useUnreadNotificationsCount(email ?? null);
  const unreadCount = unread.data ?? 0;

  const name = firstName(profile.data?.full_name || profile.data?.name, email);
  const avatarUrl = profile.data?.avatar_url ?? null;
  const today = format(new Date(), 'EEEE, d MMMM', { locale: pl });

  const chips = [
    pendingInvitations > 0 && {
      key: 'inv',
      Icon: Bell,
      tint: '#be185d',
      text: `${pendingInvitations} ${plural(pendingInvitations, 'zaproszenie', 'zaproszenia', 'zaproszeń')}`,
    },
    unreadMessages > 0 && {
      key: 'msg',
      Icon: MessageCircle,
      tint: '#1d4ed8',
      text: `${unreadMessages} ${plural(unreadMessages, 'wiadomość', 'wiadomości', 'wiadomości')}`,
      onPress: () => router.push('/(app)/messenger'),
    },
    ministryCount > 0 && {
      key: 'min',
      Icon: Calendar,
      tint: '#6d28d9',
      text: `${ministryCount} ${plural(ministryCount, 'służba', 'służby', 'służb')}`,
    },
    tasksCount > 0 && {
      key: 'task',
      Icon: CheckSquare,
      tint: '#0f766e',
      text: `${tasksCount} ${plural(tasksCount, 'zadanie', 'zadania', 'zadań')}`,
    },
    prayersCount > 0 && {
      key: 'pray',
      Icon: Heart,
      tint: '#c2410c',
      text: `${prayersCount} ${plural(prayersCount, 'modlitwa', 'modlitwy', 'modlitw')}`,
      onPress: () => router.push('/(app)/prayers'),
    },
  ].filter(Boolean) as {
    key: string;
    Icon: typeof Bell;
    tint: string;
    text: string;
    onPress?: () => void;
  }[];

  return (
    <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 12,
              color: '#78716c',
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              fontFamily: 'Inter_600SemiBold',
            }}
          >
            {today}
          </Text>
          <Text
            numberOfLines={2}
            style={{
              marginTop: 4,
              fontSize: 27,
              lineHeight: 32,
              color: '#0c0a09',
              letterSpacing: -0.8,
              fontFamily: 'Inter_700Bold',
            }}
          >
            {greeting()}
            {name ? `, ${name}` : ''}
          </Text>
        </View>

        <Pressable
          onPress={() => router.push('/(app)/notifications')}
          accessibilityLabel={unreadCount ? `Powiadomienia, ${unreadCount} nieprzeczytanych` : 'Powiadomienia'}
          hitSlop={6}
          className="active:opacity-70"
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: '#ffffff',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Bell size={19} color="#1c1917" strokeWidth={2.1} />
          {unreadCount > 0 ? (
            <View
              style={{
                position: 'absolute',
                top: -2,
                right: -2,
                minWidth: 19,
                height: 19,
                paddingHorizontal: 5,
                borderRadius: 10,
                borderWidth: 2,
                borderColor: '#f6f5f3',
                backgroundColor: '#ec4899',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 10, color: '#ffffff', fontFamily: 'Inter_700Bold' }}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          ) : null}
        </Pressable>

        <Pressable
          onPress={() => router.push('/(app)/account')}
          accessibilityLabel="Twoje konto"
          hitSlop={6}
          className="active:opacity-70"
          style={{ }}
        >
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#e7e5e4' }}
              contentFit="cover"
            />
          ) : (
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                backgroundColor: '#1c1917',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#ffffff', fontSize: 15, fontFamily: 'Inter_700Bold' }}>
                {(name || email || '?').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </Pressable>
      </View>

      {chips.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
          {chips.map((c) => (
            <Chip key={c.key} Icon={c.Icon} text={c.text} tint={c.tint} onPress={c.onPress} />
          ))}
        </View>
      ) : null}
    </View>
  );
};
