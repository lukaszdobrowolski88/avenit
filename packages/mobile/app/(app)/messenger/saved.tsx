import { useMemo } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StatusBar, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Bookmark, BookmarkMinus, CloudOff, Image as ImageIcon, Mic, Paperclip } from 'lucide-react-native';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { B, Monogram } from '../../../src/components/ui/brand';
import { FONT as F } from '../../../src/lib/fonts';
import { useAuthSession } from '../../../src/lib/auth';
import { friendlyError, showError } from '../../../src/lib/errors';
import { toast } from '../../../src/lib/toast';
import {
  conversationTitle,
  memberDisplayName,
  memberPhotoUrl,
  useConversations,
  useMembersByEmails,
  type ConversationListItem,
} from '../../../src/features/messenger/api';
import { attachmentsOf, formatListTime, isImageAttachment, isVoiceAttachment } from '../../../src/features/messenger/logic';
import { useSavedMessages, useToggleSaved, type SavedListItem } from '../../../src/features/messenger/messageTasks';
import { openMessageInConversation } from '../../../src/features/messenger/threads';
import { PullToRefresh } from '../../../src/components/ui/PullToRefresh';

// „Zapisane” — moje zapisane wiadomości ze wszystkich rozmów (saved_messages, migracja 114), jak web
// (SavedMessagesPanel): nadawca, rozmowa, data, treść albo rodzaj załącznika; stuknięcie → rozmowa
// na tej wiadomości. Wiadomości z rozmów, w których już nie jestem, i usunięte — niewidoczne.

const attachmentLine = (m: SavedListItem['message']): { label: string; kind: 'image' | 'voice' | 'file' } | null => {
  const atts = attachmentsOf(m as any);
  if (!atts.length) return null;
  if (atts.some(isVoiceAttachment)) return { label: 'Wiadomość głosowa', kind: 'voice' };
  if (atts.every(isImageAttachment)) return { label: atts.length > 1 ? `Zdjęcia: ${atts.length}` : 'Zdjęcie', kind: 'image' };
  return { label: atts.length > 1 ? `Załączniki: ${atts.length}` : String(atts[0]?.name || 'Załącznik'), kind: 'file' };
};

export default function SavedMessagesScreen() {
  const router = useRouter();
  const { user } = useAuthSession();
  const myEmail = user?.email ?? null;
  const q = useSavedMessages(myEmail);
  const toggle = useToggleSaved(myEmail);
  const convs = useConversations(myEmail);
  const convById = useMemo(() => {
    const map = new Map<string, ConversationListItem>();
    for (const c of convs.data ?? []) map.set(String(c.id), c);
    return map;
  }, [convs.data]);
  const rows = q.data ?? [];
  const emails = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(r.message.sender_email);
    for (const c of convs.data ?? []) if (c.peer_email) set.add(c.peer_email);
    return Array.from(set);
  }, [rows, convs.data]);
  const members = useMembersByEmails(emails).data ?? {};

  const remove = (r: SavedListItem) =>
    toggle.mutate(
      { messageId: r.message.id, saved: true },
      {
        onSuccess: () => toast.success('Usunięto z zapisanych'),
        onError: (e) => showError('Nie udało się usunąć z zapisanych', e, 'Spróbuj ponownie.'),
      },
    );

  let body;
  if (q.isLoading) body = <ActivityIndicator color={B.ink} style={{ marginTop: 48 }} />;
  else if (q.isError && !q.data) {
    body = (
      <EmptyState
        Icon={CloudOff}
        title="Nie udało się wczytać zapisanych wiadomości"
        hint={friendlyError(q.error, 'Sprawdź połączenie i spróbuj ponownie.')}
        actionLabel="Spróbuj ponownie"
        onAction={() => q.refetch()}
      />
    );
  } else if (!rows.length) {
    body = (
      <EmptyState
        Icon={Bookmark}
        title="Brak zapisanych wiadomości"
        hint="Przytrzymaj wiadomość w rozmowie i wybierz „Zapisz”, żeby szybko do niej wrócić."
      />
    );
  } else {
    body = (
      <FlatList
        data={rows}
        keyExtractor={(r) => r.saved.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120, gap: 10 }}
        refreshControl={<PullToRefresh onRefresh={() => q.refetch()} tintColor={B.ink} />}
        renderItem={({ item: r }) => {
          const m = r.message;
          const conv = convById.get(String(m.conversation_id));
          const sender = memberDisplayName(members, m.sender_email);
          const photo = memberPhotoUrl(members, m.sender_email);
          const text = String(m.content ?? '').replace(/\s+/g, ' ').trim();
          const att = attachmentLine(m);
          const AttIcon = att?.kind === 'image' ? ImageIcon : att?.kind === 'voice' ? Mic : Paperclip;
          return (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', borderRadius: 22, backgroundColor: B.card }}>
              <Pressable
                onPress={() =>
                  openMessageInConversation(router, String(m.conversation_id), String(m.id), m.thread_root_id ?? null)
                }
                accessibilityRole="button"
                accessibilityLabel={`Wiadomość od ${sender}${conv ? ` w ${conversationTitle(conv, members)}` : ''}`}
                className="active:opacity-70"
                style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14 }}
              >
                {photo ? (
                  <Image source={{ uri: photo }} style={{ width: 36, height: 36, borderRadius: 18 }} />
                ) : (
                  <Monogram name={sender} size={36} />
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                    <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: B.ink, fontFamily: F.bold }}>
                      {sender}
                    </Text>
                    <Text style={{ fontSize: 12, color: B.ink4, fontFamily: F.medium }}>{formatListTime(m.created_at)}</Text>
                  </View>
                  <Text numberOfLines={1} style={{ marginTop: 1, fontSize: 12, color: B.ink3, fontFamily: F.semibold }}>
                    {conv ? conversationTitle(conv, members) : 'Rozmowa'}
                  </Text>
                  {text ? (
                    <Text numberOfLines={3} style={{ marginTop: 6, fontSize: 14, lineHeight: 20, color: B.ink2, fontFamily: F.medium }}>
                      {text}
                    </Text>
                  ) : null}
                  {att ? (
                    <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <AttIcon size={13} color={B.ink3} />
                      <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, color: B.ink3, fontFamily: F.semibold }}>
                        {att.label}
                      </Text>
                    </View>
                  ) : null}
                  {r.saved.note ? (
                    <Text style={{ marginTop: 6, fontSize: 12, color: B.ink4, fontFamily: F.medium, fontStyle: 'italic' }}>{r.saved.note}</Text>
                  ) : null}
                </View>
              </Pressable>
              <Pressable
                onPress={() => remove(r)}
                accessibilityRole="button"
                accessibilityLabel="Usuń z zapisanych"
                hitSlop={8}
                className="active:opacity-60"
                style={{ width: 44, height: 44, marginTop: 6, marginRight: 4, alignItems: 'center', justifyContent: 'center' }}
              >
                <BookmarkMinus size={18} color={B.ink3} />
              </Pressable>
            </View>
          );
        }}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: B.paper }}>
      <StatusBar barStyle="dark-content" />
      <PageHeader title="Zapisane" subtitle="Twoje zapisane wiadomości" Icon={Bookmark} showBack />
      <View style={{ flex: 1 }}>{body}</View>
    </View>
  );
}
