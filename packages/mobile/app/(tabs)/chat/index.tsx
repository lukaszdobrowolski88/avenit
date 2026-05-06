import { useState } from 'react';
import { FlatList, View, TouchableOpacity, RefreshControl, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNow } from 'date-fns';
import { pl } from 'date-fns/locale';
import { ThemedText } from '../../../src/components/ThemedText';
import { AvatarCircle } from '../../../src/components/AvatarCircle';
import { EmptyState } from '../../../src/components/EmptyState';
import { useTheme } from '../../../src/contexts/ThemeContext';
import { useAuth } from '../../../src/contexts/AuthContext';
import { supabase } from '../../../src/lib/supabase';

export default function ChatListScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const { data: conversations, isLoading, refetch } = useQuery({
    queryKey: ['conversations', user?.id],
    queryFn: async () => {
      // Pobierz konwersacje użytkownika
      const { data: participations } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', user!.id);

      if (!participations || participations.length === 0) return [];

      const ids = participations.map(p => p.conversation_id);

      const { data, error } = await supabase
        .from('conversations')
        .select(`
          id, name, type, updated_at,
          conversation_participants(user_id, app_users(first_name, last_name)),
          messages(content, created_at, sender_id)
        `)
        .in('id', ids)
        .order('updated_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
    refetchInterval: 15_000,
  });

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  function getConversationName(conv: any): string {
    if (conv.name) return conv.name;
    // Dla DM - pokaż nazwę drugiej osoby
    const otherParticipant = conv.conversation_participants?.find(
      (p: any) => p.user_id !== user?.id
    );
    if (otherParticipant?.app_users) {
      return `${otherParticipant.app_users.first_name || ''} ${otherParticipant.app_users.last_name || ''}`.trim();
    }
    return 'Konwersacja';
  }

  function getLastMessage(conv: any): string {
    const messages = conv.messages;
    if (!messages || messages.length === 0) return 'Brak wiadomości';
    // messages are ordered by created_at desc in supabase
    const last = messages[messages.length - 1];
    return last?.content || '';
  }

  function getLastTime(conv: any): string {
    const messages = conv.messages;
    if (!messages || messages.length === 0) return '';
    const last = messages[messages.length - 1];
    if (!last?.created_at) return '';
    try {
      return formatDistanceToNow(new Date(last.created_at), { addSuffix: true, locale: pl });
    } catch {
      return '';
    }
  }

  function renderConversation({ item }: { item: any }) {
    const name = getConversationName(item);

    return (
      <TouchableOpacity
        style={[styles.conversationRow, { borderBottomColor: theme.colors.border.light }]}
        onPress={() => router.push(`/(tabs)/chat/${item.id}`)}
        activeOpacity={0.6}
      >
        <AvatarCircle name={name} size={48} />
        <View style={styles.conversationInfo}>
          <View style={styles.conversationHeader}>
            <ThemedText size="base" weight="semibold" numberOfLines={1} style={styles.conversationName}>
              {name}
            </ThemedText>
            <ThemedText variant="muted" size="xs">
              {getLastTime(item)}
            </ThemedText>
          </View>
          <ThemedText variant="muted" size="sm" numberOfLines={1}>
            {getLastMessage(item)}
          </ThemedText>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background.primary }]}>
      <FlatList
        data={conversations}
        keyExtractor={item => String(item.id)}
        renderItem={renderConversation}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent.primary} />
        }
        ListEmptyComponent={
          isLoading ? null : (
            <EmptyState
              icon={<Ionicons name="chatbubbles-outline" size={48} color={theme.colors.text.muted} />}
              title="Brak konwersacji"
              description="Rozpocznij nową rozmowę"
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
  conversationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
  },
  conversationInfo: {
    flex: 1,
    gap: 4,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  conversationName: {
    flex: 1,
    marginRight: 8,
  },
});
