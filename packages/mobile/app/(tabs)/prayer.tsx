import { useState } from 'react';
import {
  FlatList,
  View,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatDistanceToNow } from 'date-fns';
import { pl } from 'date-fns/locale';
import * as Haptics from 'expo-haptics';
import { ThemedText } from '../../src/components/ThemedText';
import { Card } from '../../src/components/Card';
import { AvatarCircle } from '../../src/components/AvatarCircle';
import { EmptyState } from '../../src/components/EmptyState';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useAuth } from '../../src/contexts/AuthContext';
import { supabase } from '../../src/lib/supabase';

export default function PrayerWallScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newPrayer, setNewPrayer] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const { data: prayers, isLoading, refetch } = useQuery({
    queryKey: ['prayers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('prayer_requests')
        .select('*, app_users:user_id(first_name, last_name), prayer_interactions(user_id)')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  const addPrayerMutation = useMutation({
    mutationFn: async (content: string) => {
      const { error } = await supabase
        .from('prayer_requests')
        .insert({ content, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prayers'] });
      setNewPrayer('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const prayMutation = useMutation({
    mutationFn: async (prayerId: string) => {
      // Toggle - sprawdź czy już się modlisz
      const { data: existing } = await supabase
        .from('prayer_interactions')
        .select('id')
        .eq('prayer_request_id', prayerId)
        .eq('user_id', user!.id)
        .maybeSingle();

      if (existing) {
        await supabase.from('prayer_interactions').delete().eq('id', existing.id);
      } else {
        await supabase.from('prayer_interactions').insert({
          prayer_request_id: prayerId,
          user_id: user!.id,
          type: 'praying',
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prayers'] });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
  });

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  function renderPrayer({ item }: { item: any }) {
    const name = `${item.app_users?.first_name || ''} ${item.app_users?.last_name || ''}`.trim() || 'Anonim';
    const prayingCount = item.prayer_interactions?.length || 0;
    const amPraying = item.prayer_interactions?.some((i: any) => i.user_id === user?.id);
    const timeAgo = item.created_at
      ? formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: pl })
      : '';

    return (
      <Card style={styles.prayerCard}>
        <View style={styles.prayerHeader}>
          <AvatarCircle name={name} size={32} />
          <View style={styles.prayerMeta}>
            <ThemedText size="sm" weight="medium">{name}</ThemedText>
            <ThemedText variant="muted" size="xs">{timeAgo}</ThemedText>
          </View>
        </View>
        <ThemedText size="sm" style={styles.prayerContent}>
          {item.content}
        </ThemedText>
        <TouchableOpacity
          style={[
            styles.prayButton,
            amPraying
              ? { backgroundColor: theme.colors.accent.primaryLightest }
              : { backgroundColor: theme.colors.background.tertiary },
          ]}
          onPress={() => prayMutation.mutate(item.id)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={amPraying ? 'heart' : 'heart-outline'}
            size={16}
            color={amPraying ? theme.colors.accent.primary : theme.colors.text.muted}
          />
          <ThemedText
            size="xs"
            weight="medium"
            style={{ color: amPraying ? theme.colors.accent.primary : theme.colors.text.muted }}
          >
            Modlę się {prayingCount > 0 ? `(${prayingCount})` : ''}
          </ThemedText>
        </TouchableOpacity>
      </Card>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: theme.colors.background.primary }]}>
      <View style={styles.headerBar}>
        <ThemedText size="xl" weight="bold">Ściana Modlitwy</ThemedText>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <FlatList
          data={prayers}
          keyExtractor={item => String(item.id)}
          renderItem={renderPrayer}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent.primary} />
          }
          ListEmptyComponent={
            isLoading ? null : (
              <EmptyState
                icon={<Ionicons name="heart-outline" size={48} color={theme.colors.text.muted} />}
                title="Brak próśb modlitewnych"
                description="Dodaj pierwszą prośbę modlitewną"
              />
            )
          }
          showsVerticalScrollIndicator={false}
        />

        {/* Input do nowej modlitwy */}
        <View style={[styles.inputBar, { backgroundColor: theme.colors.background.secondary, borderTopColor: theme.colors.border.default }]}>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.colors.input.background,
                borderColor: theme.colors.input.border,
                color: theme.colors.text.primary,
              },
            ]}
            placeholder="Podziel się prośbą modlitewną..."
            placeholderTextColor={theme.colors.input.placeholder}
            value={newPrayer}
            onChangeText={setNewPrayer}
            multiline
          />
          <TouchableOpacity
            onPress={() => newPrayer.trim() && addPrayerMutation.mutate(newPrayer.trim())}
            disabled={!newPrayer.trim() || addPrayerMutation.isPending}
            style={[styles.sendButton, { backgroundColor: theme.colors.accent.primary, opacity: newPrayer.trim() ? 1 : 0.4 }]}
          >
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  headerBar: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  list: {
    padding: 16,
    gap: 12,
  },
  prayerCard: {},
  prayerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  prayerMeta: { flex: 1 },
  prayerContent: {
    lineHeight: 20,
    marginBottom: 12,
  },
  prayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    paddingBottom: 28,
    borderTopWidth: 1,
    gap: 8,
  },
  input: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 80,
    fontFamily: 'Inter',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
