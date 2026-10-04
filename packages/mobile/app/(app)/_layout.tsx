import { Tabs, Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { Calendar, Home, LayoutGrid, MessageCircle } from 'lucide-react-native';
import { useAuthSession } from '../../src/lib/auth';
import { usePermissions } from '../../src/lib/permissions';
import { useT } from '../../src/i18n';
import { FloatingTabBar } from '../../src/components/navigation/FloatingTabBar';
import { AccountTabIcon } from '../../src/components/navigation/AccountTabIcon';

const stroke = (focused: boolean) => (focused ? 2.4 : 1.8);

export default function AppLayout() {
  const { session, loading } = useAuthSession();
  const t = useT();
  // Zakładki według uprawnień jak na webie. Do pierwszego wczytania pokazujemy
  // Kalendarz i Czat (ma je prawie każdy), żeby pasek nie migał przy starcie.
  const perms = usePermissions();
  const tabHref = (moduleKey: string) =>
    !perms.ready || perms.moduleVisible(moduleKey) ? undefined : null;

  if (loading) {
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
  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs tabBar={(props) => <FloatingTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name="dashboard"
        options={{
          title: t('Start'),
          tabBarIcon: ({ color, focused }) => (
            <Home color={color} size={24} strokeWidth={stroke(focused)} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: t('Kalendarz'),
          href: tabHref('calendar'),
          tabBarIcon: ({ color, focused }) => (
            <Calendar color={color} size={24} strokeWidth={stroke(focused)} />
          ),
        }}
      />
      <Tabs.Screen
        name="messenger"
        options={{
          title: t('Czat'),
          href: tabHref('komunikator'),
          tabBarIcon: ({ color, focused }) => (
            <MessageCircle color={color} size={24} strokeWidth={stroke(focused)} />
          ),
        }}
      />
      <Tabs.Screen
        name="modules"
        options={{
          title: t('Moduły'),
          tabBarIcon: ({ color, focused }) => (
            <LayoutGrid color={color} size={24} strokeWidth={stroke(focused)} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: t('Konto'),
          tabBarIcon: ({ color, focused }) => <AccountTabIcon color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen name="programs" options={{ href: null }} />
      <Tabs.Screen name="songs" options={{ href: null }} />
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
      <Tabs.Screen name="attendance" options={{ href: null }} />
      <Tabs.Screen name="approvals" options={{ href: null }} />
      <Tabs.Screen name="custom" options={{ href: null }} />
      <Tabs.Screen name="rooms" options={{ href: null }} />
      <Tabs.Screen name="finance" options={{ href: null }} />
    </Tabs>
  );
}
