import { ScrollView, View, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '../../../src/components/ThemedText';
import { useTheme } from '../../../src/contexts/ThemeContext';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface MenuItem {
  icon: IoniconsName;
  label: string;
  href: string;
  color?: string;
}

export default function MoreScreen() {
  const { theme } = useTheme();

  const menuItems: MenuItem[] = [
    { icon: 'calendar', label: 'Kalendarz', href: '/(tabs)/more/calendar' },
    { icon: 'people', label: 'Członkowie', href: '/(tabs)/more/members' },
    { icon: 'happy', label: 'Małe SCH TOMY', href: '/(tabs)/more/kids' },
    { icon: 'person-circle', label: 'Profil', href: '/(tabs)/more/profile' },
    { icon: 'settings', label: 'Ustawienia', href: '/(tabs)/more/settings' },
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background.primary }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {menuItems.map((item, i) => (
        <TouchableOpacity
          key={item.href}
          style={[
            styles.menuItem,
            { backgroundColor: theme.colors.card.background, borderColor: theme.colors.card.border },
            i === 0 && styles.firstItem,
            i === menuItems.length - 1 && styles.lastItem,
          ]}
          onPress={() => router.push(item.href as any)}
          activeOpacity={0.6}
        >
          <View style={[styles.iconContainer, { backgroundColor: theme.colors.accent.primaryLightest }]}>
            <Ionicons name={item.icon} size={22} color={theme.colors.accent.primary} />
          </View>
          <ThemedText size="base" weight="medium" style={styles.menuLabel}>
            {item.label}
          </ThemedText>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.text.muted} />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: 16,
    gap: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderBottomWidth: 0,
  },
  firstItem: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  lastItem: {
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    borderBottomWidth: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  menuLabel: {
    flex: 1,
  },
});
