import { ScrollView, View, StyleSheet, Alert } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ThemedView } from '../../../src/components/ThemedView';
import { ThemedText } from '../../../src/components/ThemedText';
import { Card } from '../../../src/components/Card';
import { AvatarCircle } from '../../../src/components/AvatarCircle';
import { AccentButton } from '../../../src/components/AccentButton';
import { useTheme } from '../../../src/contexts/ThemeContext';
import { useAuth } from '../../../src/contexts/AuthContext';
import { supabase } from '../../../src/lib/supabase';

export default function ProfileScreen() {
  const { theme } = useTheme();
  const { user, signOut } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('app_users')
        .select('first_name, last_name, role, email, phone, campus_id, campuses(name)')
        .eq('auth_user_id', user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  function handleLogout() {
    Alert.alert(
      'Wyloguj',
      'Czy na pewno chcesz się wylogować?',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Wyloguj',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  }

  const name = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : '';
  const roleLabels: Record<string, string> = {
    superadmin: 'Super Admin',
    rada_starszych: 'Rada Starszych',
    koordynator: 'Koordynator',
    lider: 'Lider',
    czlonek: 'Członek',
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background.primary }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Profil header */}
      <Card style={styles.profileCard}>
        <View style={styles.profileHeader}>
          <AvatarCircle name={name} size={72} />
          <ThemedText size="xl" weight="bold" style={styles.profileName}>{name}</ThemedText>
          {profile?.role && (
            <View style={[styles.roleBadge, { backgroundColor: theme.colors.accent.primaryLightest }]}>
              <ThemedText size="xs" weight="semibold" style={{ color: theme.colors.accent.primaryDark }}>
                {roleLabels[profile.role] || profile.role}
              </ThemedText>
            </View>
          )}
        </View>
      </Card>

      {/* Dane kontaktowe */}
      <Card>
        <ThemedText size="sm" weight="semibold" style={styles.sectionTitle}>
          Dane kontaktowe
        </ThemedText>
        {user?.email && (
          <View style={styles.infoRow}>
            <Ionicons name="mail-outline" size={18} color={theme.colors.text.muted} />
            <ThemedText variant="secondary" size="sm">{user.email}</ThemedText>
          </View>
        )}
        {profile?.phone && (
          <View style={styles.infoRow}>
            <Ionicons name="call-outline" size={18} color={theme.colors.text.muted} />
            <ThemedText variant="secondary" size="sm">{profile.phone}</ThemedText>
          </View>
        )}
        {profile?.campuses?.name && (
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={18} color={theme.colors.text.muted} />
            <ThemedText variant="secondary" size="sm">{profile.campuses.name}</ThemedText>
          </View>
        )}
      </Card>

      {/* Wyloguj */}
      <AccentButton
        title="Wyloguj się"
        onPress={handleLogout}
        variant="outline"
        size="lg"
        style={styles.logoutButton}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 32,
  },
  profileCard: {
    alignItems: 'center',
  },
  profileHeader: {
    alignItems: 'center',
    gap: 8,
  },
  profileName: {
    marginTop: 8,
  },
  roleBadge: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 20,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  logoutButton: {
    marginTop: 8,
  },
});
