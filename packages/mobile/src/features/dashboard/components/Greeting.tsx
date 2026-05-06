import { Pressable, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { Bell, Calendar, CheckSquare, Heart } from 'lucide-react-native';

interface Props {
  email: string | null | undefined;
  tasksCount?: number;
  ministryCount?: number;
  prayersCount?: number;
  pendingInvitations?: number;
}

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Dzień dobry';
  if (h < 18) return 'Witaj';
  return 'Dobry wieczór';
};

const firstNameFromEmail = (email: string | null | undefined): string => {
  if (!email) return 'Użytkowniku';
  const local = email.split('@')[0] ?? '';
  const first = local.split('.')[0] ?? local;
  return first.charAt(0).toUpperCase() + first.slice(1);
};

const StatPill = ({
  Icon,
  count,
  label,
}: {
  Icon: typeof CheckSquare;
  count: number;
  label: string;
}) => (
  <View
    className="flex-row items-center gap-1.5 px-3 py-1.5"
    style={{
      borderRadius: 999,
      backgroundColor: '#fafaf9',
      borderWidth: 1,
      borderColor: '#eef0f3',
    }}
  >
    <Icon size={12} color="#57534e" strokeWidth={2.4} />
    <Text className="text-[12px]" style={{ color: '#1c1917', fontFamily: 'Inter_700Bold' }}>
      {count}{' '}
      <Text style={{ color: '#78716c', fontFamily: 'Inter_400Regular' }}>{label}</Text>
    </Text>
  </View>
);

export const Greeting = ({
  email,
  tasksCount = 0,
  ministryCount = 0,
  prayersCount = 0,
  pendingInvitations = 0,
}: Props) => {
  const name = firstNameFromEmail(email);
  const initial = name.charAt(0).toUpperCase();

  return (
    <View className="px-5 pt-12 pb-3">
      <View className="flex-row items-start justify-between">
        <View className="flex-row items-center gap-3 flex-1">
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: '#1c1917',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text className="text-base font-bold text-white">{initial}</Text>
          </View>
          <View className="flex-1">
            <Text
              className="text-[13px]"
              style={{
                color: '#78716c',
                letterSpacing: -0.1,
                fontFamily: 'Inter_500Medium',
              }}
            >
              {greeting()}
            </Text>
            <Text
              className="text-[24px] mt-0.5"
              style={{
                color: '#0c0a09',
                letterSpacing: -0.7,
                fontFamily: 'Inter_700Bold',
              }}
              numberOfLines={1}
            >
              {name}
            </Text>
          </View>
        </View>
        <Link href="/(app)/notifications" asChild>
          <Pressable
            className="active:opacity-60"
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
            <Bell size={18} color="#1c1917" strokeWidth={2} />
          </Pressable>
        </Link>
      </View>

      {(tasksCount > 0 ||
        ministryCount > 0 ||
        prayersCount > 0 ||
        pendingInvitations > 0) && (
        <View className="flex-row flex-wrap gap-2 mt-4">
          {pendingInvitations > 0 && (
            <StatPill
              Icon={Bell}
              count={pendingInvitations}
              label={pendingInvitations === 1 ? 'zaproszenie' : 'zaproszeń'}
            />
          )}
          {tasksCount > 0 && (
            <StatPill
              Icon={CheckSquare}
              count={tasksCount}
              label={tasksCount === 1 ? 'zadanie' : 'zadań'}
            />
          )}
          {ministryCount > 0 && (
            <StatPill
              Icon={Calendar}
              count={ministryCount}
              label={ministryCount === 1 ? 'służba' : 'służb'}
            />
          )}
          {prayersCount > 0 && (
            <StatPill
              Icon={Heart}
              count={prayersCount}
              label={prayersCount === 1 ? 'modlitwa' : 'modlitw'}
            />
          )}
        </View>
      )}
    </View>
  );
};
