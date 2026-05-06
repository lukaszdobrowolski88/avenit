import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Share,
  StatusBar,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { isSameDay } from "date-fns";
import {
  useMessages,
  useSendMessage,
  useEditMessage,
  useDeleteMessage,
  useConversationDetails,
  useMembersByEmails,
  useToggleMuted,
  useReactions,
  useToggleReaction,
  usePinnedMessages,
  useTogglePin,
  useForwardMessage,
  useReadReceipts,
  markConversationRead,
  markMessagesAsRead,
  canEditMessage,
  type MessageAttachment,
  type MessageRow,
} from "../../../src/features/messenger/api";
import { usePresence } from "../../../src/lib/presence";
import {
  pickImageFromLibrary,
  takePhoto,
  uploadAttachment,
  uploadVoiceMessage,
} from "../../../src/features/messenger/attachments";
import { useRealtimeMessages } from "../../../src/features/messenger/hooks/useRealtimeMessages";
import { MessageBubble } from "../../../src/features/messenger/components/MessageBubble";
import { ComposerBar } from "../../../src/features/messenger/components/ComposerBar";
import { ConversationHeader } from "../../../src/features/messenger/components/ConversationHeader";
import { DateSeparator } from "../../../src/features/messenger/components/DateSeparator";
import { MessageActionsSheet } from "../../../src/features/messenger/components/MessageActionsSheet";
import { ForwardMessageModal } from "../../../src/features/messenger/components/ForwardMessageModal";
import { SearchModal } from "../../../src/features/messenger/components/SearchModal";
import { PinnedPanel } from "../../../src/features/messenger/components/PinnedPanel";
import { MediaGalleryModal } from "../../../src/features/messenger/components/MediaGalleryModal";
import { useAuthSession } from "../../../src/lib/auth";

type FeedItem =
  | { kind: "msg"; msg: MessageRow; showSender: boolean }
  | { kind: "date"; key: string; date: string };

export default function ConversationScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const { user } = useAuthSession();
  const cid = String(conversationId ?? "");

  // Composer siedzi nad tabbarem — padding równy jego wysokości z (app)/_layout.tsx.
  const composerBottomPad = Platform.OS === "ios" ? 88 : 70;

  const messagesQuery = useMessages(cid);
  const detailsQuery = useConversationDetails(cid, user?.email ?? null);
  const sendMutation = useSendMessage(cid, user?.email ?? null);
  const editMutation = useEditMessage(cid);
  const deleteMutation = useDeleteMessage(cid);
  const muteMutation = useToggleMuted(user?.email ?? null);
  const reactionsQuery = useReactions(cid, user?.email ?? null);
  const reactionMutation = useToggleReaction(cid, user?.email ?? null);
  const pinnedQuery = usePinnedMessages(cid);
  const pinMutation = useTogglePin(cid, user?.email ?? null);
  const forwardMutation = useForwardMessage(user?.email ?? null);
  const readReceiptsQuery = useReadReceipts(cid);
  useRealtimeMessages(cid);

  const memberEmails = useMemo(() => {
    const set = new Set<string>();
    for (const m of messagesQuery.data ?? []) set.add(m.sender_email);
    for (const e of detailsQuery.data?.participant_emails ?? []) set.add(e);
    return Array.from(set);
  }, [messagesQuery.data, detailsQuery.data?.participant_emails]);
  const membersQuery = useMembersByEmails(memberEmails);
  const members = membersQuery.data ?? {};

  // Presence dla wszystkich uczestników (pomijając mnie).
  const presenceEmails = useMemo(
    () => memberEmails.filter((e) => e !== user?.email),
    [memberEmails, user?.email],
  );
  const { getStatus } = usePresence(presenceEmails);

  // W rozmowie 1:1 pokaż status drugiej osoby w nagłówku.
  const peerEmail = useMemo(() => {
    if (detailsQuery.data?.type !== "direct") return null;
    return (
      detailsQuery.data.participant_emails.find((e) => e !== user?.email) ?? null
    );
  }, [detailsQuery.data, user?.email]);
  const peerStatus = peerEmail ? getStatus(peerEmail) : undefined;

  const [text, setText] = useState("");
  const [pendingAttachment, setPendingAttachment] = useState<MessageAttachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [replyTo, setReplyTo] = useState<MessageRow | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<MessageRow | null>(null);
  const [forwardTarget, setForwardTarget] = useState<MessageRow | null>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const [galleryVisible, setGalleryVisible] = useState(false);
  const listRef = useRef<FlatList<FeedItem>>(null);

  const messageById = useMemo(() => {
    const map = new Map<string, MessageRow>();
    for (const m of messagesQuery.data ?? []) map.set(m.id, m);
    return map;
  }, [messagesQuery.data]);

  const pinnedIds = useMemo(() => {
    const set = new Set<string>();
    for (const p of pinnedQuery.data ?? []) set.add(p.message_id);
    return set;
  }, [pinnedQuery.data]);

  // Złóż feed: date separators + grupowanie wiadomości po nadawcy (showSender = pierwsza w "burst").
  const feed = useMemo<FeedItem[]>(() => {
    const out: FeedItem[] = [];
    const msgs = messagesQuery.data ?? [];
    let prevDate: Date | null = null;
    let prevSender: string | null = null;
    let prevTime: number = 0;
    for (const m of msgs) {
      const d = new Date(m.created_at);
      if (!prevDate || !isSameDay(prevDate, d)) {
        out.push({ kind: "date", key: `d-${m.id}`, date: m.created_at });
        prevSender = null;
      }
      // showSender, gdy zmienia się sender lub upłynęło >5 min od poprzedniej.
      const isNewBurst =
        prevSender !== m.sender_email || d.getTime() - prevTime > 5 * 60 * 1000;
      out.push({ kind: "msg", msg: m, showSender: isNewBurst });
      prevDate = d;
      prevSender = m.sender_email;
      prevTime = d.getTime();
    }
    return out;
  }, [messagesQuery.data]);

  useEffect(() => {
    if (cid && user?.email) {
      markConversationRead(cid, user.email).catch(() => undefined);
      // Per-message read receipts — tylko cudze wiadomości.
      const ids = (messagesQuery.data ?? [])
        .filter((m) => m.sender_email !== user.email)
        .map((m) => m.id);
      if (ids.length > 0) {
        markMessagesAsRead(ids, user.email).catch(() => undefined);
      }
    }
  }, [cid, user?.email, messagesQuery.data?.length]);

  useEffect(() => {
    if (feed.length === 0) return;
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [feed.length]);

  const handlePickImage = async () => {
    if (uploading) return;
    setUploading(true);
    try {
      const asset = await pickImageFromLibrary();
      if (!asset) return;
      const att = await uploadAttachment(cid, asset);
      setPendingAttachment(att);
    } catch (e: any) {
      Alert.alert("Błąd uploadu", e?.message ?? "Nie udało się wysłać zdjęcia.");
    } finally {
      setUploading(false);
    }
  };

  const handleSendVoice = async (uri: string, mime: string, durationMs: number) => {
    try {
      const att = await uploadVoiceMessage(cid, uri, mime, durationMs);
      await sendMutation.mutateAsync({
        content: "",
        attachments: [att],
        replyToId: replyTo?.id ?? null,
      });
      setReplyTo(null);
    } catch (e: any) {
      Alert.alert("Błąd wysyłki", e?.message ?? "Nie udało się wysłać wiadomości głosowej.");
      throw e;
    }
  };

  const handleTakePhoto = async () => {
    if (uploading) return;
    setUploading(true);
    try {
      const asset = await takePhoto();
      if (!asset) return;
      const att = await uploadAttachment(cid, asset);
      setPendingAttachment(att);
    } catch (e: any) {
      Alert.alert("Błąd", e?.message ?? "Nie udało się zrobić zdjęcia.");
    } finally {
      setUploading(false);
    }
  };

  const resetComposer = () => {
    setText("");
    setPendingAttachment(null);
    setReplyTo(null);
    setEditingId(null);
  };

  const handleSend = async () => {
    if (editingId) {
      const t = text.trim();
      if (!t) return;
      try {
        await editMutation.mutateAsync({ id: editingId, content: t });
        resetComposer();
      } catch (e: any) {
        Alert.alert("Błąd edycji", e?.message ?? "Nie udało się edytować.");
      }
      return;
    }

    const t = text.trim();
    if (!t && !pendingAttachment) return;
    const snapshot = { text: t, att: pendingAttachment, reply: replyTo };
    resetComposer();
    try {
      await sendMutation.mutateAsync({
        content: snapshot.text,
        attachments: snapshot.att ? [snapshot.att] : undefined,
        replyToId: snapshot.reply?.id ?? null,
      });
    } catch (e: any) {
      setText(snapshot.text);
      setPendingAttachment(snapshot.att);
      setReplyTo(snapshot.reply);
      Alert.alert("Błąd wysyłki", e?.message ?? "Nie udało się wysłać.");
    }
  };

  const handleCopyMessage = async (msg: MessageRow) => {
    if (!msg.content) {
      Alert.alert("Brak treści", "Ta wiadomość nie zawiera tekstu do skopiowania.");
      return;
    }
    try {
      await Share.share({ message: msg.content });
    } catch {
      // user closed share sheet
    }
  };

  const handleTogglePin = (msg: MessageRow) => {
    pinMutation.mutate(
      { messageId: msg.id, pinned: pinnedIds.has(msg.id) },
      {
        onError: (e: any) =>
          Alert.alert("Błąd", e?.message ?? "Nie udało się zmienić przypięcia."),
      },
    );
  };

  const handleForward = (msg: MessageRow) => {
    setForwardTarget(msg);
  };

  const handleConfirmForward = async (conversationIds: string[]) => {
    const target = forwardTarget;
    if (!target) return;
    try {
      await forwardMutation.mutateAsync({
        conversationIds,
        content: target.content,
        attachments: target.attachments ?? [],
      });
      setForwardTarget(null);
      Alert.alert("Przekazano", `Wiadomość przekazana do ${conversationIds.length} rozmów.`);
    } catch (e: any) {
      Alert.alert("Błąd", e?.message ?? "Nie udało się przekazać wiadomości.");
    }
  };

  const handleLongPress = (msg: MessageRow) => {
    setActionTarget(msg);
  };

  const handleDeleteMessage = (msg: MessageRow) => {
    Alert.alert("Usunąć wiadomość?", "Tej operacji nie można cofnąć.", [
      { text: "Anuluj", style: "cancel" },
      {
        text: "Usuń",
        style: "destructive",
        onPress: () => {
          deleteMutation.mutate(msg.id);
        },
      },
    ]);
  };

  const handleToggleMute = () => {
    if (!detailsQuery.data) return;
    muteMutation.mutate({
      conversationId: cid,
      muted: !detailsQuery.data.my_muted,
    });
  };

  const handleJumpToMessage = (msg: MessageRow) => {
    const idx = feed.findIndex((it) => it.kind === "msg" && it.msg.id === msg.id);
    if (idx >= 0) {
      setTimeout(() => {
        listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.3 });
      }, 80);
    }
  };

  const handleToggleReactionFromBubble = (msgId: string, emoji: string) => {
    reactionMutation.mutate({ messageId: msgId, emoji });
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
        style={{ flex: 1, backgroundColor: "#ffffff" }}
      >
        <ConversationHeader
          details={detailsQuery.data ?? null}
          members={members}
          myEmail={user?.email ?? null}
          onToggleMute={handleToggleMute}
          muteBusy={muteMutation.isPending}
          onSearch={() => setSearchVisible(true)}
          onOpenGallery={() => setGalleryVisible(true)}
          peerStatus={peerStatus}
        />

        <PinnedPanel
          pinned={pinnedQuery.data ?? []}
          messageById={messageById}
          members={members}
          onJump={handleJumpToMessage}
          onUnpin={(m) => handleTogglePin(m)}
        />

        {messagesQuery.isLoading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color="#ec4899" />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
            data={feed}
            keyExtractor={(it) => (it.kind === "msg" ? it.msg.id : it.key)}
            onScrollToIndexFailed={(info) => {
              const wait = new Promise((r) => setTimeout(r, 200));
              wait.then(() => {
                listRef.current?.scrollToIndex({
                  index: info.index,
                  animated: true,
                  viewPosition: 0.3,
                });
              });
            }}
            ListEmptyComponent={
              <View style={{ alignItems: "center", paddingVertical: 48 }}>
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 18,
                    backgroundColor: "#fef3f2",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 12,
                  }}
                />
                <Text
                  style={{
                    fontSize: 14,
                    color: "#78716c",
                    fontFamily: "Inter_500Medium",
                  }}
                >
                  Brak wiadomości. Napisz pierwszą!
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              if (item.kind === "date") {
                return <DateSeparator date={item.date} />;
              }
              const m = item.msg;
              const mine = m.sender_email === user?.email;
              const receipts = readReceiptsQuery.data?.[m.id] ?? [];
              const readByCount = mine
                ? receipts.filter((r) => r.user_email !== m.sender_email).length
                : 0;
              return (
                <MessageBubble
                  message={m}
                  mine={mine}
                  members={members}
                  showSender={item.showSender}
                  replyTo={m.reply_to_id ? messageById.get(m.reply_to_id) ?? null : null}
                  reactions={reactionsQuery.data?.[m.id]}
                  pinned={pinnedIds.has(m.id)}
                  readByCount={readByCount}
                  senderStatus={mine ? undefined : getStatus(m.sender_email)}
                  onLongPress={() => handleLongPress(m)}
                  onToggleReaction={(emoji) => handleToggleReactionFromBubble(m.id, emoji)}
                />
              );
            }}
          />
        )}

        <View style={{ paddingBottom: composerBottomPad, backgroundColor: "#ffffff" }}>
          <ComposerBar
            text={text}
            onChangeText={setText}
            onSend={handleSend}
            sending={sendMutation.isPending || editMutation.isPending}
            pendingAttachment={pendingAttachment}
            onClearAttachment={() => setPendingAttachment(null)}
            onPickImage={handlePickImage}
            onTakePhoto={handleTakePhoto}
            uploading={uploading}
            replyTo={replyTo}
            onClearReply={() => setReplyTo(null)}
            editing={!!editingId}
            members={members}
            onSendVoice={handleSendVoice}
          />
        </View>
      </KeyboardAvoidingView>

      <MessageActionsSheet
        visible={!!actionTarget}
        onClose={() => setActionTarget(null)}
        mine={actionTarget?.sender_email === user?.email}
        canEdit={actionTarget ? canEditMessage(actionTarget, user?.email ?? null) : false}
        isPinned={actionTarget ? pinnedIds.has(actionTarget.id) : false}
        onPickReaction={(emoji) => {
          if (actionTarget) {
            reactionMutation.mutate({ messageId: actionTarget.id, emoji });
          }
        }}
        onReply={() => {
          if (actionTarget) {
            setReplyTo(actionTarget);
            setEditingId(null);
          }
        }}
        onForward={() => {
          if (actionTarget) handleForward(actionTarget);
        }}
        onCopy={() => {
          if (actionTarget) handleCopyMessage(actionTarget);
        }}
        onTogglePin={() => {
          if (actionTarget) handleTogglePin(actionTarget);
        }}
        onEdit={() => {
          if (actionTarget) {
            setEditingId(actionTarget.id);
            setText(actionTarget.content);
            setReplyTo(null);
            setPendingAttachment(null);
          }
        }}
        onDelete={() => {
          if (actionTarget) handleDeleteMessage(actionTarget);
        }}
      />

      <ForwardMessageModal
        visible={!!forwardTarget}
        onClose={() => setForwardTarget(null)}
        onConfirm={handleConfirmForward}
        myEmail={user?.email ?? null}
        sourceConversationId={cid}
      />

      <SearchModal
        visible={searchVisible}
        onClose={() => setSearchVisible(false)}
        conversationId={cid}
        members={members}
        onJump={handleJumpToMessage}
      />

      <MediaGalleryModal
        visible={galleryVisible}
        onClose={() => setGalleryVisible(false)}
        conversationId={cid}
      />
    </>
  );
}
