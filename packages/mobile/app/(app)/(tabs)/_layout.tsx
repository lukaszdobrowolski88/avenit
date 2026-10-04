import { Tabs } from 'expo-router';

// Pięć zakładek głównych. Pasek rysuje nakładka w (app)/_layout (FloatingTabBar), żeby był
// widoczny także nad ekranami ze wspólnego stosu — tu bez własnego paska.
// `history`: wstecz z zakładki wraca do poprzednio oglądanej, nie zawsze na Start.
export default function TabsLayout() {
  return (
    <Tabs tabBar={() => null} backBehavior="history" screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="dashboard" />
      <Tabs.Screen name="calendar" />
      <Tabs.Screen name="messenger" />
      <Tabs.Screen name="modules" />
      <Tabs.Screen name="account" />
    </Tabs>
  );
}
