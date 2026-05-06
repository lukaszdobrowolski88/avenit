import { useState } from 'react';
import { FlatList, View, RefreshControl, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO, startOfMonth, endOfMonth, addMonths } from 'date-fns';
import { pl } from 'date-fns/locale';
import { ThemedText } from '../../../src/components/ThemedText';
import { Card } from '../../../src/components/Card';
import { EmptyState } from '../../../src/components/EmptyState';
import { useTheme } from '../../../src/contexts/ThemeContext';
import { supabase } from '../../../src/lib/supabase';

export default function CalendarScreen() {
  const { theme } = useTheme();
  const [refreshing, setRefreshing] = useState(false);

  const { data: events, isLoading, refetch } = useQuery({
    queryKey: ['events'],
    queryFn: async () => {
      const now = new Date();
      const start = startOfMonth(now).toISOString();
      const end = endOfMonth(addMonths(now, 2)).toISOString();

      const { data, error } = await supabase
        .from('events')
        .select('id, title, description, start_date, end_date, type')
        .gte('start_date', start)
        .lte('start_date', end)
        .order('start_date', { ascending: true });

      if (error) throw error;
      return data || [];
    },
  });

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  // Grupuj wydarzenia po dniu
  const grouped = (events || []).reduce((acc: Record<string, any[]>, event: any) => {
    const day = event.start_date?.split('T')[0] || 'unknown';
    if (!acc[day]) acc[day] = [];
    acc[day].push(event);
    return acc;
  }, {});

  const sections = Object.entries(grouped).map(([date, items]) => ({ date, items }));

  function renderSection({ item: section }: { item: { date: string; items: any[] } }) {
    const date = parseISO(section.date);

    return (
      <View style={styles.section}>
        <View style={styles.dateHeader}>
          <ThemedText size="sm" weight="bold" style={{ color: theme.colors.accent.primary }}>
            {format(date, 'EEEE', { locale: pl })}
          </ThemedText>
          <ThemedText variant="muted" size="xs">
            {format(date, 'd MMMM', { locale: pl })}
          </ThemedText>
        </View>
        {section.items.map((event: any) => (
          <Card key={event.id} style={styles.eventCard}>
            <ThemedText size="sm" weight="semibold">{event.title}</ThemedText>
            {event.start_date && (
              <ThemedText variant="muted" size="xs" style={{ marginTop: 2 }}>
                {format(new Date(event.start_date), 'HH:mm')}
                {event.end_date && ` - ${format(new Date(event.end_date), 'HH:mm')}`}
              </ThemedText>
            )}
            {event.description && (
              <ThemedText variant="secondary" size="xs" numberOfLines={2} style={{ marginTop: 4 }}>
                {event.description}
              </ThemedText>
            )}
          </Card>
        ))}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background.primary }]}>
      <FlatList
        data={sections}
        keyExtractor={item => item.date}
        renderItem={renderSection}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent.primary} />
        }
        ListEmptyComponent={
          isLoading ? null : (
            <EmptyState
              icon={<Ionicons name="calendar-outline" size={48} color={theme.colors.text.muted} />}
              title="Brak wydarzeń"
              description="Nie ma nadchodzących wydarzeń"
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
    gap: 16,
  },
  section: {
    gap: 8,
  },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 4,
  },
  eventCard: {
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
});
