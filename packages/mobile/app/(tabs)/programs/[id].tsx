import { ScrollView, View, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { pl } from 'date-fns/locale';
import { ThemedText } from '../../../src/components/ThemedText';
import { Card } from '../../../src/components/Card';
import { AvatarCircle } from '../../../src/components/AvatarCircle';
import { useTheme } from '../../../src/contexts/ThemeContext';
import { supabase } from '../../../src/lib/supabase';

export default function ProgramDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();

  const { data: program } = useQuery({
    queryKey: ['program', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('programs')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: assignments } = useQuery({
    queryKey: ['program-assignments', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('schedule_assignments')
        .select('*, app_users(first_name, last_name), team_roles(name)')
        .eq('program_id', id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  if (!program) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background.primary }]}>
        <ThemedText variant="muted">Ładowanie...</ThemedText>
      </View>
    );
  }

  const date = program.date ? parseISO(program.date) : null;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background.primary }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <Card>
        <ThemedText size="xl" weight="bold" style={styles.title}>
          {program.title || 'Program'}
        </ThemedText>
        {date && (
          <View style={styles.dateRow}>
            <Ionicons name="calendar-outline" size={16} color={theme.colors.accent.primary} />
            <ThemedText variant="secondary" size="sm" style={styles.dateText}>
              {format(date, 'EEEE, d MMMM yyyy', { locale: pl })}
            </ThemedText>
          </View>
        )}
        {program.description && (
          <ThemedText variant="secondary" size="sm" style={styles.description}>
            {program.description}
          </ThemedText>
        )}
      </Card>

      {/* Zespół */}
      {assignments && assignments.length > 0 && (
        <Card>
          <View style={styles.sectionHeader}>
            <Ionicons name="people" size={20} color={theme.colors.accent.primary} />
            <ThemedText size="lg" weight="semibold" style={styles.sectionTitle}>
              Zespół
            </ThemedText>
          </View>
          {assignments.map((a: any, i: number) => (
            <View
              key={a.id || i}
              style={[
                styles.memberRow,
                i > 0 && { borderTopWidth: 1, borderTopColor: theme.colors.border.light },
              ]}
            >
              <AvatarCircle
                name={`${a.app_users?.first_name || ''} ${a.app_users?.last_name || ''}`}
                size={36}
              />
              <View style={styles.memberInfo}>
                <ThemedText size="sm" weight="medium">
                  {a.app_users?.first_name} {a.app_users?.last_name}
                </ThemedText>
                {a.team_roles?.name && (
                  <ThemedText variant="muted" size="xs">
                    {a.team_roles.name}
                  </ThemedText>
                )}
              </View>
            </View>
          ))}
        </Card>
      )}

      {/* Elementy programu (JSON) */}
      {program.elements && Array.isArray(program.elements) && program.elements.length > 0 && (
        <Card>
          <View style={styles.sectionHeader}>
            <Ionicons name="list" size={20} color={theme.colors.accent.primary} />
            <ThemedText size="lg" weight="semibold" style={styles.sectionTitle}>
              Elementy
            </ThemedText>
          </View>
          {program.elements.map((el: any, i: number) => (
            <View key={i} style={styles.elementRow}>
              <View style={[styles.elementDot, { backgroundColor: theme.colors.accent.primary }]} />
              <ThemedText size="sm">{el.title || el.name || el}</ThemedText>
            </View>
          ))}
        </Card>
      )}
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
  title: { marginBottom: 8 },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  dateText: {},
  description: {
    marginTop: 8,
    lineHeight: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: { marginLeft: 8 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  memberInfo: { flex: 1 },
  elementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  elementDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
