import { useEffect, useState } from 'react';
import { ScrollView, View, RefreshControl, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedView } from '../../src/components/ThemedView';
import { ThemedText } from '../../src/components/ThemedText';
import { Card } from '../../src/components/Card';
import { useAuth } from '../../src/contexts/AuthContext';
import { useTheme } from '../../src/contexts/ThemeContext';
import { supabase, getCachedUser } from '../../src/lib/supabase';

function useUserProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['user-profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('app_users')
        .select('first_name, last_name, role, campus_id')
        .eq('auth_user_id', user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });
}

function useUpcomingAssignments() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['upcoming-assignments', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('schedule_assignments')
        .select('*, programs(date, title)')
        .eq('user_id', user!.id)
        .gte('programs.date', new Date().toISOString().split('T')[0])
        .order('programs(date)', { ascending: true })
        .limit(5);
      return data || [];
    },
    enabled: !!user?.id,
  });
}

function useUnreadMessages() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['unread-count', user?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .not('read_by', 'cs', `{${user!.id}}`);
      return count || 0;
    },
    enabled: !!user?.id,
    refetchInterval: 30_000,
  });
}

export default function DashboardScreen() {
  const { theme } = useTheme();
  const { data: profile } = useUserProfile();
  const { data: assignments, isLoading: assignmentsLoading, refetch: refetchAssignments } = useUpcomingAssignments();
  const { data: unreadCount } = useUnreadMessages();
  const [refreshing, setRefreshing] = useState(false);

  const greeting = getGreeting();
  const firstName = profile?.first_name || 'Użytkowniku';

  async function onRefresh() {
    setRefreshing(true);
    await refetchAssignments();
    setRefreshing(false);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <ThemedText variant="muted" size="sm">{greeting}</ThemedText>
            <ThemedText size="2xl" weight="bold">{firstName}</ThemedText>
          </View>
          {unreadCount && unreadCount > 0 ? (
            <View style={[styles.badge, { backgroundColor: theme.colors.accent.primary }]}>
              <ThemedText size="xs" weight="bold" style={{ color: '#fff' }}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </ThemedText>
            </View>
          ) : null}
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.accent.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* Nadchodzące służby */}
          <Card>
            <View style={styles.cardHeader}>
              <Ionicons name="calendar" size={20} color={theme.colors.accent.primary} />
              <ThemedText size="lg" weight="semibold" style={styles.cardTitle}>
                Nadchodzące służby
              </ThemedText>
            </View>
            {assignmentsLoading ? (
              <ThemedText variant="muted" size="sm">Ładowanie...</ThemedText>
            ) : assignments && assignments.length > 0 ? (
              assignments.map((assignment: any, i: number) => (
                <View key={assignment.id || i} style={[styles.assignmentRow, i > 0 && { borderTopWidth: 1, borderTopColor: theme.colors.border.light }]}>
                  <ThemedText size="sm" weight="medium">
                    {assignment.programs?.title || 'Program'}
                  </ThemedText>
                  <ThemedText variant="muted" size="xs">
                    {assignment.programs?.date || ''}
                  </ThemedText>
                </View>
              ))
            ) : (
              <ThemedText variant="muted" size="sm">
                Brak nadchodzących służb
              </ThemedText>
            )}
          </Card>

          {/* Szybkie akcje */}
          <Card>
            <View style={styles.cardHeader}>
              <Ionicons name="flash" size={20} color={theme.colors.accent.primary} />
              <ThemedText size="lg" weight="semibold" style={styles.cardTitle}>
                Szybkie akcje
              </ThemedText>
            </View>
            <View style={styles.quickActions}>
              <QuickAction
                icon="chatbubble"
                label="Nowa wiadomość"
                color={theme.colors.accent.primary}
                bgColor={theme.colors.accent.primaryLightest}
              />
              <QuickAction
                icon="heart"
                label="Dodaj modlitwę"
                color={theme.colors.accent.secondary}
                bgColor={theme.colors.accent.secondaryLightest}
              />
              <QuickAction
                icon="people"
                label="Członkowie"
                color={theme.colors.accent.primaryDark}
                bgColor={theme.colors.accent.primaryLightest}
              />
            </View>
          </Card>

          {/* Rola użytkownika */}
          {profile?.role && (
            <Card>
              <View style={styles.cardHeader}>
                <Ionicons name="shield-checkmark" size={20} color={theme.colors.accent.primary} />
                <ThemedText size="lg" weight="semibold" style={styles.cardTitle}>
                  Twoja rola
                </ThemedText>
              </View>
              <View style={[styles.roleBadge, { backgroundColor: theme.colors.accent.primaryLightest }]}>
                <ThemedText size="sm" weight="medium" style={{ color: theme.colors.accent.primaryDark }}>
                  {formatRole(profile.role)}
                </ThemedText>
              </View>
            </Card>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function QuickAction({ icon, label, color, bgColor }: { icon: string; label: string; color: string; bgColor: string }) {
  return (
    <View style={styles.quickAction}>
      <View style={[styles.quickActionIcon, { backgroundColor: bgColor }]}>
        <Ionicons name={icon as any} size={22} color={color} />
      </View>
      <ThemedText size="xs" variant="secondary" style={styles.quickActionLabel}>
        {label}
      </ThemedText>
    </View>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Dzień dobry';
  if (hour < 18) return 'Cześć';
  return 'Dobry wieczór';
}

function formatRole(role: string): string {
  const roles: Record<string, string> = {
    superadmin: 'Super Admin',
    rada_starszych: 'Rada Starszych',
    koordynator: 'Koordynator',
    lider: 'Lider',
    czlonek: 'Członek',
  };
  return roles[role] || role;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  badge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  scrollView: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    marginLeft: 8,
  },
  assignmentRow: {
    paddingVertical: 10,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  quickAction: {
    alignItems: 'center',
    gap: 6,
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionLabel: {
    textAlign: 'center',
    maxWidth: 70,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
});
