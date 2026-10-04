import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { Bell } from 'lucide-react-native';
import { useMyProfile } from '../../account/api';
import { useUnreadNotificationsCount } from '../../notifications/api';
import { D, F } from '../theme';

interface Props {
  email: string | null | undefined;
  tasksCount?: number;
  ministryCount?: number;
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

// Druga (czarna) linia nagłówka: najważniejsza rzecz na dziś, w kolejności pilności.
const headline = ({ pendingInvitations = 0, unreadMessages = 0, tasksCount = 0, ministryCount = 0 }: Props) => {
  if (pendingInvitations > 0) {
    return `${pendingInvitations} ${plural(pendingInvitations, 'zaproszenie czeka', 'zaproszenia czekają', 'zaproszeń czeka')} na odpowiedź`;
  }
  if (unreadMessages > 0) {
    return `${unreadMessages} ${plural(unreadMessages, 'nowa wiadomość', 'nowe wiadomości', 'nowych wiadomości')}`;
  }
  if (tasksCount > 0) return `${tasksCount} ${plural(tasksCount, 'zadanie', 'zadania', 'zadań')} do zrobienia`;
  if (ministryCount > 0) {
    return `${ministryCount} ${plural(ministryCount, 'służba', 'służby', 'służb')} przed Tobą`;
  }
  return 'Nic pilnego na dziś';
};

export const Greeting = (props: Props) => {
  const { email } = props;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useMyProfile(email ?? null);
  const unread = useUnreadNotificationsCount(email ?? null);
  const unreadCount = unread.data ?? 0;

  const name = firstName(profile.data?.full_name || profile.data?.name, email);
  const avatarUrl = profile.data?.avatar_url ?? null;
  const today = format(new Date(), 'EEEE, d MMMM', { locale: pl });

  return (
    <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 26 }}>
      {/* Pasek jak na grafikach marki: logo po lewej, akcje po prawej. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Image
          source={require('../../../../assets/brand/logo-slod.png')}
          style={{ width: 84, height: 22 }}
          contentFit="contain"
          accessibilityLabel="avenit"
        />
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => router.push('/(app)/notifications')}
          accessibilityLabel={unreadCount ? `Powiadomienia, ${unreadCount} nieprzeczytanych` : 'Powiadomienia'}
          hitSlop={6}
          className="active:opacity-70"
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: D.card,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Bell size={20} color={D.ink} strokeWidth={1.9} />
          {unreadCount > 0 ? (
            <View
              style={{
                position: 'absolute',
                top: 8,
                right: 9,
                width: 11,
                height: 11,
                borderRadius: 6,
                borderWidth: 2,
                borderColor: D.card,
                backgroundColor: D.accent,
              }}
            />
          ) : null}
        </Pressable>
        <Pressable
          onPress={() => router.push('/(app)/account')}
          accessibilityLabel="Twoje konto"
          hitSlop={6}
          className="active:opacity-70"
        >
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: D.hair }}
              contentFit="cover"
            />
          ) : (
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: D.accent,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: D.ink, fontSize: 16, fontFamily: F.bold }}>
                {(name || email || '?').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* Nagłówek jak „Cały kościół. / Jedna aplikacja.”: etykieta z datą, pogrubione
          powitanie i cienka linia z tym, co dziś najważniejsze — kropka w kurkumie. */}
      <Text
        style={{
          marginTop: 30,
          fontSize: 12,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
          color: D.gold,
          fontFamily: F.semibold,
        }}
      >
        {today}
      </Text>
      <Text
        style={{ marginTop: 10, fontSize: 34, lineHeight: 39, letterSpacing: -1.3, color: D.ink, fontFamily: F.bold }}
      >
        {greeting()}
        {name ? `, ${name}` : ''}
      </Text>
      <Text style={{ fontSize: 34, lineHeight: 39, letterSpacing: -1.3, color: D.ink, fontFamily: F.light }}>
        {headline(props)}
        <Text style={{ color: D.accent, fontFamily: F.bold }}>.</Text>
      </Text>
    </View>
  );
};
