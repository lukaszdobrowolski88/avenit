import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, MessageSquare } from 'lucide-react-native';
import { B } from '../../../components/ui/brand';
import { supabase } from '../../../lib/supabase';
import { F } from './bits';
import { memberDisplayName, useMembersByEmails } from '../../messenger/api';
import { openMessageInConversation } from '../../messenger/threads';

// Ekran zadania: „Z wiadomości” — zadanie utworzone z wiadomości czatu (board_items.source_message_id,
// migracja 114), jak web (SourceMessageLink). Stuknięcie otwiera rozmowę na tej wiadomości. Nadawcę
// i fragment widać, gdy jestem w tej rozmowie (odczyt messages — tylko moje rozmowy), inaczej sama karta.
export const SourceMessageCard = ({ messageId, conversationId }: { messageId: string; conversationId: string }) => {
  const router = useRouter();
  const q = useQuery({
    queryKey: ['task-source-message', messageId],
    queryFn: async () => {
      const { data } = await supabase
        .from('messages')
        .select('id, thread_root_id, sender_email, content, deleted_at')
        .eq('id', messageId)
        .maybeSingle();
      const m = data as {
        sender_email?: string;
        content?: string | null;
        deleted_at?: string | null;
        thread_root_id?: string | null;
      } | null;
      return m && !m.deleted_at
        ? { sender: String(m.sender_email ?? ''), content: String(m.content ?? ''), threadRootId: m.thread_root_id ?? null }
        : null;
    },
    staleTime: 60_000,
  });
  const members = useMembersByEmails(q.data?.sender ? [q.data.sender] : []).data ?? {};
  const sender = q.data?.sender ? memberDisplayName(members, q.data.sender) : null;
  const text = (q.data?.content ?? '').replace(/\s+/g, ' ').trim();

  return (
    <Pressable
      onPress={() => openMessageInConversation(router, conversationId, messageId, q.data?.threadRootId)}
      accessibilityRole="link"
      accessibilityLabel={sender ? `Z wiadomości od ${sender}. Otwórz rozmowę` : 'Z wiadomości. Otwórz rozmowę'}
      className="active:opacity-70"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 22, backgroundColor: B.card, padding: 16 }}
    >
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: B.paper2, alignItems: 'center', justifyContent: 'center' }}>
        <MessageSquare size={17} color={B.ink} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 14, color: B.ink, fontFamily: F.bold }}>
          {sender ? `Z wiadomości od ${sender}` : 'Z wiadomości'}
        </Text>
        <Text numberOfLines={2} style={{ marginTop: 2, fontSize: 13, lineHeight: 18, color: B.ink3, fontFamily: F.medium }}>
          {text || 'Otwórz rozmowę na tej wiadomości'}
        </Text>
      </View>
      <ChevronRight size={18} color={B.ink4} />
    </Pressable>
  );
};
