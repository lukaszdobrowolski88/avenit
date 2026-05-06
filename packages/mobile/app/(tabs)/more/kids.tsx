import { useState } from 'react';
import { FlatList, View, TouchableOpacity, RefreshControl, Alert, StyleSheet } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import * as Haptics from 'expo-haptics';
import { ThemedText } from '../../../src/components/ThemedText';
import { Card } from '../../../src/components/Card';
import { AvatarCircle } from '../../../src/components/AvatarCircle';
import { AccentButton } from '../../../src/components/AccentButton';
import { EmptyState } from '../../../src/components/EmptyState';
import { useTheme } from '../../../src/contexts/ThemeContext';
import { useAuth } from '../../../src/contexts/AuthContext';
import { supabase } from '../../../src/lib/supabase';

export default function KidsScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'checkin' | 'groups'>('checkin');

  // Aktywna sesja check-in
  const { data: activeSession } = useQuery({
    queryKey: ['kids-active-session'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase
        .from('checkin_sessions')
        .select('*')
        .eq('date', today)
        .eq('is_active', true)
        .maybeSingle();
      return data;
    },
  });

  // Dzieci (students)
  const { data: students, isLoading, refetch } = useQuery({
    queryKey: ['kids-students'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kids_students')
        .select('*, kids_groups(name), parent_contacts(name, phone)')
        .order('first_name', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Grupy
  const { data: groups } = useQuery({
    queryKey: ['kids-groups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kids_groups')
        .select('*, kids_students(count)')
        .order('name', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Check-in mutation
  const checkinMutation = useMutation({
    mutationFn: async (studentId: string) => {
      if (!activeSession) {
        // Utwórz sesję
        const { data: session, error: sessionError } = await supabase
          .from('checkin_sessions')
          .insert({
            date: new Date().toISOString().split('T')[0],
            is_active: true,
            created_by: user!.id,
          })
          .select()
          .single();

        if (sessionError) throw sessionError;

        const { error } = await supabase
          .from('checkins')
          .insert({
            session_id: session.id,
            student_id: studentId,
            checked_in_by: user!.id,
            checked_in_at: new Date().toISOString(),
          });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('checkins')
          .insert({
            session_id: activeSession.id,
            student_id: studentId,
            checked_in_by: user!.id,
            checked_in_at: new Date().toISOString(),
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kids'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: any) => {
      Alert.alert('Błąd', err.message || 'Nie udało się zameldować dziecka');
    },
  });

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  function handleCheckin(student: any) {
    const name = `${student.first_name || ''} ${student.last_name || ''}`.trim();
    Alert.alert(
      'Check-in',
      `Zameldować ${name}?`,
      [
        { text: 'Anuluj', style: 'cancel' },
        { text: 'Zamelduj', onPress: () => checkinMutation.mutate(student.id) },
      ]
    );
  }

  function renderStudent({ item }: { item: any }) {
    const name = `${item.first_name || ''} ${item.last_name || ''}`.trim();

    return (
      <View style={[styles.studentRow, { borderBottomColor: theme.colors.border.light }]}>
        <AvatarCircle name={name} size={40} />
        <View style={styles.studentInfo}>
          <ThemedText size="sm" weight="medium">{name}</ThemedText>
          {item.kids_groups?.name && (
            <ThemedText variant="muted" size="xs">{item.kids_groups.name}</ThemedText>
          )}
        </View>
        <TouchableOpacity
          style={[styles.checkinButton, { backgroundColor: theme.colors.accent.primaryLightest }]}
          onPress={() => handleCheckin(item)}
        >
          <Ionicons name="checkmark-circle" size={20} color={theme.colors.accent.primary} />
        </TouchableOpacity>
      </View>
    );
  }

  function renderGroup({ item }: { item: any }) {
    return (
      <Card style={styles.groupCard}>
        <View style={styles.groupHeader}>
          <View style={[styles.groupIcon, { backgroundColor: theme.colors.accent.primaryLightest }]}>
            <Ionicons name="people" size={20} color={theme.colors.accent.primary} />
          </View>
          <View style={styles.groupInfo}>
            <ThemedText size="base" weight="semibold">{item.name}</ThemedText>
            <ThemedText variant="muted" size="xs">
              {item.kids_students?.[0]?.count || 0} dzieci
            </ThemedText>
          </View>
        </View>
      </Card>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background.primary }]}>
      {/* Tab selector */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, tab === 'checkin' && { borderBottomColor: theme.colors.accent.primary, borderBottomWidth: 2 }]}
          onPress={() => setTab('checkin')}
        >
          <ThemedText
            size="sm"
            weight={tab === 'checkin' ? 'bold' : 'normal'}
            style={{ color: tab === 'checkin' ? theme.colors.accent.primary : theme.colors.text.muted }}
          >
            Check-in
          </ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'groups' && { borderBottomColor: theme.colors.accent.primary, borderBottomWidth: 2 }]}
          onPress={() => setTab('groups')}
        >
          <ThemedText
            size="sm"
            weight={tab === 'groups' ? 'bold' : 'normal'}
            style={{ color: tab === 'groups' ? theme.colors.accent.primary : theme.colors.text.muted }}
          >
            Grupy
          </ThemedText>
        </TouchableOpacity>
      </View>

      {tab === 'checkin' ? (
        <FlatList
          data={students}
          keyExtractor={item => String(item.id)}
          renderItem={renderStudent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent.primary} />
          }
          ListEmptyComponent={
            isLoading ? null : (
              <EmptyState
                icon={<Ionicons name="happy-outline" size={48} color={theme.colors.text.muted} />}
                title="Brak dzieci"
                description="Dodaj dzieci w aplikacji webowej"
              />
            )
          }
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          data={groups}
          keyExtractor={item => String(item.id)}
          renderItem={renderGroup}
          contentContainerStyle={styles.groupsList}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon={<Ionicons name="people-outline" size={48} color={theme.colors.text.muted} />}
              title="Brak grup"
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
  },
  studentInfo: { flex: 1, gap: 2 },
  checkinButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupsList: {
    padding: 16,
    gap: 12,
  },
  groupCard: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  groupIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupInfo: { flex: 1, gap: 2 },
});
