import { useState, useEffect, useRef } from 'react';
import {
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { ThemedText } from '../../../src/components/ThemedText';
import { AvatarCircle } from '../../../src/components/AvatarCircle';
import { useTheme } from '../../../src/contexts/ThemeContext';
import { useAuth } from '../../../src/contexts/AuthContext';
import { supabase } from '../../../src/lib/supabase';

export default function ChatRoomScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const flatListRef = useRef<FlatList>(null);

  // Pobierz info o konwersacji
  const { data: conversation } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: async () => {
      const { data } = await supabase
        .from('conversations')
        .select('*, conversation_participants(user_id, app_users(first_name, last_name))')
        .eq('id', conversationId)
        .single();
      return data;
    },
    enabled: !!conversationId,
  });

  // Ustaw tytuł
  useEffect(() => {
    if (conversation) {
      const name = conversation.name || conversation.conversation_participants
        ?.filter((p: any) => p.user_id !== user?.id)
        .map((p: any) => `${p.app_users?.first_name || ''} ${p.app_users?.last_name || ''}`.trim())
        .join(', ') || 'Czat';

      navigation.setOptions({ title: name });
    }
  }, [conversation]);

  // Pobierz wiadomości
  const { data: messages } = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async () => {
      const { data } = await supabase
        .from('messages')
        .select('*, app_users:sender_id(first_name, last_name)')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(100);
      return data || [];
    },
    enabled: !!conversationId,
    refetchInterval: 5_000,
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`chat:${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  // Wyślij wiadomość
  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      const { error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user!.id,
          content,
        });
      if (error) throw error;

      // Aktualizuj updated_at konwersacji
      await supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setMessage('');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
  });

  function handleSend() {
    const text = message.trim();
    if (!text) return;
    sendMutation.mutate(text);
  }

  function renderMessage({ item, index }: { item: any; index: number }) {
    const isMe = item.sender_id === user?.id;
    const senderName = isMe
      ? 'Ty'
      : `${item.app_users?.first_name || ''} ${item.app_users?.last_name || ''}`.trim();

    const time = item.created_at
      ? format(new Date(item.created_at), 'HH:mm')
      : '';

    return (
      <View style={[styles.messageContainer, isMe ? styles.messageRight : styles.messageLeft]}>
        {!isMe && (
          <AvatarCircle name={senderName} size={28} />
        )}
        <View style={[
          styles.messageBubble,
          isMe
            ? { backgroundColor: theme.colors.accent.primary }
            : { backgroundColor: theme.colors.card.background, borderWidth: 1, borderColor: theme.colors.border.default },
        ]}>
          {!isMe && (
            <ThemedText size="xs" weight="semibold" style={{ color: theme.colors.accent.primary, marginBottom: 2 }}>
              {senderName}
            </ThemedText>
          )}
          <ThemedText
            size="sm"
            style={{ color: isMe ? '#ffffff' : theme.colors.text.primary, lineHeight: 20 }}
          >
            {item.content}
          </ThemedText>
          <ThemedText
            size="xs"
            style={{
              color: isMe ? 'rgba(255,255,255,0.7)' : theme.colors.text.muted,
              textAlign: 'right',
              marginTop: 4,
            }}
          >
            {time}
          </ThemedText>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.colors.background.primary }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => String(item.id)}
        renderItem={renderMessage}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        showsVerticalScrollIndicator={false}
      />

      {/* Input */}
      <View style={[styles.inputBar, { backgroundColor: theme.colors.background.secondary, borderTopColor: theme.colors.border.default }]}>
        <TextInput
          style={[
            styles.textInput,
            {
              backgroundColor: theme.colors.input.background,
              borderColor: theme.colors.input.border,
              color: theme.colors.text.primary,
            },
          ]}
          placeholder="Wiadomość..."
          placeholderTextColor={theme.colors.input.placeholder}
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={5000}
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={!message.trim() || sendMutation.isPending}
          style={[styles.sendButton, { backgroundColor: theme.colors.accent.primary, opacity: message.trim() ? 1 : 0.4 }]}
        >
          <Ionicons name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  messagesList: {
    padding: 16,
    gap: 8,
  },
  messageContainer: {
    flexDirection: 'row',
    gap: 8,
    maxWidth: '80%',
  },
  messageLeft: {
    alignSelf: 'flex-start',
  },
  messageRight: {
    alignSelf: 'flex-end',
  },
  messageBubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxWidth: '100%',
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
  textInput: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    maxHeight: 100,
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
