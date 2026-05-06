import { useState } from 'react';
import { FlatList, View, TouchableOpacity, RefreshControl, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { pl } from 'date-fns/locale';
import { ThemedText } from '../../../src/components/ThemedText';
import { Card } from '../../../src/components/Card';
import { EmptyState } from '../../../src/components/EmptyState';
import { useTheme } from '../../../src/contexts/ThemeContext';
import { supabase } from '../../../src/lib/supabase';

export default function ProgramsListScreen() {
  const { theme } = useTheme();
  const [refreshing, setRefreshing] = useState(false);

  const { data: programs, isLoading, refetch } = useQuery({
    queryKey: ['programs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('programs')
        .select('id, title, date, description')
        .gte('date', new Date().toISOString().split('T')[0])
        .order('date', { ascending: true })
        .limit(50);

      if (error) throw error;
      return data || [];
    },
  });

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  function renderProgram({ item }: { item: any }) {
    const date = item.date ? parseISO(item.date) : null;

    return (
      <TouchableOpacity
        onPress={() => router.push(`/(tabs)/programs/${item.id}`)}
        activeOpacity={0.7}
      >
        <Card style={styles.programCard}>
          <View style={styles.programRow}>
            {date && (
              <View style={[styles.dateBox, { backgroundColor: theme.colors.accent.primaryLightest }]}>
                <ThemedText size="xs" weight="bold" style={{ color: theme.colors.accent.primaryDark }}>
                  {format(date, 'dd', { locale: pl })}
                </ThemedText>
                <ThemedText size="xs" style={{ color: theme.colors.accent.primaryDark }}>
                  {format(date, 'MMM', { locale: pl })}
                </ThemedText>
              </View>
            )}
            <View style={styles.programInfo}>
              <ThemedText size="base" weight="semibold" numberOfLines={1}>
                {item.title || 'Program'}
              </ThemedText>
              {date && (
                <ThemedText variant="muted" size="xs">
                  {format(date, 'EEEE, d MMMM yyyy', { locale: pl })}
                </ThemedText>
              )}
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.text.muted} />
          </View>
        </Card>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background.primary }]}>
      <FlatList
        data={programs}
        keyExtractor={item => String(item.id)}
        renderItem={renderProgram}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent.primary} />
        }
        ListEmptyComponent={
          isLoading ? null : (
            <EmptyState
              icon={<Ionicons name="musical-notes-outline" size={48} color={theme.colors.text.muted} />}
              title="Brak programów"
              description="Nie ma nadchodzących programów"
            />
          )
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: {
    padding: 16,
    gap: 12,
  },
  programCard: {
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  programRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dateBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  programInfo: {
    flex: 1,
    gap: 2,
  },
});
