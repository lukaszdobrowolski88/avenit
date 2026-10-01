import { Tabs, Redirect } from 'expo-router';
import { ActivityIndicator, Platform, View } from 'react-native';
import { Calendar, Home, MessageCircle, Music, ListChecks, User } from 'lucide-react-native';
import { useAuthSession, isStaffUser } from '../../src/lib/auth';
import { useT } from '../../src/i18n';

// Eksportowany — żeby ekrany detail (np. wątek czatu) mogły same przywrócić styl po ukryciu.
export const APP_TAB_BAR_STYLE = {
  position: 'absolute' as const,
  borderTopWidth: 0,
  backgroundColor: 'rgba(255,255,255,0.96)',
  height: Platform.OS === 'ios' ? 88 : 70,
  paddingTop: 8,
  paddingBottom: Platform.OS === 'ios' ? 28 : 10,
  shadowColor: '#0f172a',
  shadowOffset: { width: 0, height: -4 },
  shadowOpacity: 0.06,
  shadowRadius: 16,
  elevation: 12,
};

export default function AppLayout() {
  const { session, user, loading } = useAuthSession();
  const t = useT();
  // Pieśni to treść „służbowa" — zwykły członek jej nie widzi (ukrywamy zakładkę,
  // by nie trafiał na pustą listę). Liderzy/koordynatorzy/admin widzą normalnie.
  const staff = isStaffUser(user);

  if (loading) {
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
  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#ec4899',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: -0.2,
          marginTop: -2,
        },
        tabBarItemStyle: {
          paddingVertical: 6,
        },
        tabBarStyle: APP_TAB_BAR_STYLE,
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: t('Start'),
          tabBarIcon: ({ color, focused }) => (
            <Home color={color} size={focused ? 24 : 22} strokeWidth={focused ? 2.6 : 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="programs"
        options={{
          title: t('Programy'),
          tabBarIcon: ({ color, focused }) => (
            <ListChecks color={color} size={focused ? 24 : 22} strokeWidth={focused ? 2.6 : 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="songs"
        options={{
          title: t('Pieśni'),
          // Ukryta dla zwykłego członka (href:null) — widoczna od roli lidera wzwyż.
          href: staff ? undefined : null,
          tabBarIcon: ({ color, focused }) => (
            <Music color={color} size={focused ? 24 : 22} strokeWidth={focused ? 2.6 : 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: t('Kalendarz'),
          tabBarIcon: ({ color, focused }) => (
            <Calendar color={color} size={focused ? 24 : 22} strokeWidth={focused ? 2.6 : 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="messenger"
        options={{
          title: t('Czat'),
          tabBarIcon: ({ color, focused }) => (
            <MessageCircle color={color} size={focused ? 24 : 22} strokeWidth={focused ? 2.6 : 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: t('Konto'),
          tabBarIcon: ({ color, focused }) => (
            <User color={color} size={focused ? 24 : 22} strokeWidth={focused ? 2.6 : 2} />
          ),
        }}
      />
      <Tabs.Screen name="prayers" options={{ href: null }} />
      <Tabs.Screen name="giving" options={{ href: null }} />
      <Tabs.Screen name="rsvp" options={{ href: null }} />
      <Tabs.Screen name="sermons" options={{ href: null }} />
      <Tabs.Screen name="members" options={{ href: null }} />
      <Tabs.Screen name="materials" options={{ href: null }} />
      <Tabs.Screen name="teachings" options={{ href: null }} />
      <Tabs.Screen name="forms" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="teams" options={{ href: null }} />
      <Tabs.Screen name="home-groups" options={{ href: null }} />
      <Tabs.Screen name="serve" options={{ href: null }} />
      <Tabs.Screen name="work" options={{ href: null }} />
      <Tabs.Screen name="setlist" options={{ href: null }} />
    </Tabs>
  );
}
