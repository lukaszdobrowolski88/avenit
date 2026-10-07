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
import { useQueryClient } from "@tanstack/react-query";
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
  usePollVotes,
  useTogglePollVote,
  usePrayerResponses,
  useTogglePrayerResponse,
  deliveryStatusFor,
  extractMentions,
  canPostIn,
  sameEmail,
  type MessageAttachment,
  type MessageRow,
  type ReadReceiptRow,
  type PollMetadata,
  type EventMetadata,
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
import { PollComposerModal } from "../../../src/features/messenger/components/PollComposerModal";
import { EventShareModal } from "../../../src/features/messenger/components/EventShareModal";
import { ConversationHeader } from "../../../src/features/messenger/components/ConversationHeader";
import { DateSeparator } from "../../../src/features/messenger/components/DateSeparator";
import { MessageActionsSheet } from "../../../src/features/messenger/components/MessageActionsSheet";
import { ForwardMessageModal } from "../../../src/features/messenger/components/ForwardMessageModal";
import { SearchModal } from "../../../src/features/messenger/components/SearchModal";
import { PinnedPanel } from "../../../src/features/messenger/components/PinnedPanel";
import { MediaGalleryModal } from "../../../src/features/messenger/components/MediaGalleryModal";
import { useAuthSession } from "../../../src/lib/auth";
import { usePermissions } from "../../../src/lib/permissions";
import { friendlyError } from "../../../src/lib/errors";
import { toast } from "../../../src/lib/toast";

// Krótki cytat wiadomości do potwierdzeń („Usunąć wiadomość „…”?”).
const excerpt = (text: string | null | undefined, max = 60) => {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

type FeedItem =
  | { kind: "msg"; msg: MessageRow; showSender: boolean }
  | { kind: "date"; key: string; date: string };

export default function ConversationScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const { user } = useAuthSession();
  const qc = useQueryClient();
  const cid = String(conversationId ?? "");
  const perms = usePermissions();
  // Co rola pozwala zapisać — jak web (KomunikatorModule.perms). Serwer i tak pilnuje zakresu.
  const canManageOwn = perms.can("res:conversation_participants:update"); // przeczytane, wyciszenie
  const canEditOwn = perms.can("res:messages:update"); // edycja i usuwanie własnych wiadomości

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
  const pollVotesQuery = usePollVotes(cid, user?.email ?? null);
  const prayerQuery = usePrayerResponses(cid, user?.email ?? null);
  const pollVoteMutation = useTogglePollVote(cid, user?.email ?? null);
  const prayerMutation = useTogglePrayerResponse(cid, user?.email ?? null);
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
    () => memberEmails.filter((e) => !sameEmail(e, user?.email)),
    [memberEmails, user?.email],
  );
  const { getStatus } = usePresence(presenceEmails);

  // W rozmowie 1:1 pokaż status drugiej osoby w nagłówku.
  const peerEmail = useMemo(() => {
    if (detailsQuery.data?.type !== "direct") return null;
    return (
      detailsQuery.data.participant_emails.find((e: string) => !sameEmail(e, user?.email)) ?? null
    );
  }, [detailsQuery.data, user?.email]);
  const peerStatus = peerEmail ? getStatus(peerEmail) : undefined;

  const [text, setText] = useState("");
  const [pendingAttachment, setPendingAttachment] = useState<MessageAttachment | null>(null);
  const [pollOpen, setPollOpen] = useState(false);
  const [eventShareOpen, setEventShareOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [replyTo, setReplyTo] = useState<MessageRow | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<MessageRow | null>(null);
  const [forwardTarget, setForwardTarget] = useState<MessageRow | null>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const [galleryVisible, setGalleryVisible] = useState(false);
  const listRef = useRef<FlatList<FeedItem>>(null);

  // Inna rozmowa w tym samym ekranie (powiadomienie, link) — szkic, załącznik i odpowiedź
  // nie mogą „przejść” do innej rozmowy.
  useEffect(() => {
    setText("");
    setPendingAttachment(null);
    setReplyTo(null);
    setEditingId(null);
    setActionTarget(null);
    setForwardTarget(null);
  }, [cid]);

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
    if (cid && user?.email && detailsQuery.data?.is_participant) {
      // „Przeczytane” — tylko gdy rola może zmieniać swój wiersz uczestnika (inaczej 403).
      if (canManageOwn) {
        markConversationRead(cid, user.email)
          // Po oznaczeniu jako przeczytane odśwież listę rozmów, żeby zniknął badge nieprzeczytanych.
          .then(() => qc.invalidateQueries({ queryKey: ["conversations"] }))
          .catch(() => undefined);
      }
      // Per-message read receipts — tylko cudze wiadomości.
      const ids = (messagesQuery.data ?? [])
        .filter((m: MessageRow) => !sameEmail(m.sender_email, user.email))
        .map((m: MessageRow) => m.id);
      if (ids.length > 0) {
        markMessagesAsRead(ids, user.email).catch(() => undefined);
      }
    }
  }, [cid, user?.email, messagesQuery.data?.length, detailsQuery.data?.is_participant, canManageOwn]);

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
    } catch (e) {
      Alert.alert("Nie udało się dodać zdjęcia", friendlyError(e, "Spróbuj ponownie."));
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
    } catch (e) {
      Alert.alert(
        "Nie udało się wysłać",
        friendlyError(e, "Nie udało się wysłać wiadomości głosowej. Spróbuj ponownie."),
      );
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
    } catch (e) {
      Alert.alert("Nie udało się dodać zdjęcia", friendlyError(e, "Spróbuj ponownie."));
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

  const details = detailsQuery.data;
  // Prawo pisania: uczestnik rozmowy, a w kanale „tylko administratorzy” — administrator.
  // Do czasu wczytania rozmowy pole jest schowane (bez mignięcia u nie-adminów).
  const canPost = !!details && details.is_participant && canPostIn(details);
  const readOnlyText = !details
    ? detailsQuery.isError
      ? friendlyError(detailsQuery.error, "Nie udało się wczytać rozmowy.")
      : ""
    : !details.is_participant
      ? "Nie jesteś uczestnikiem tej rozmowy."
      : "W tym kanale piszą tylko administratorzy.";
  const isConvAdmin = details?.my_role === "admin";
  // Przypinanie wiadomości — jak web: administrator rozmowy z prawem do przypięć.
  const canPin = isConvAdmin && perms.can("res:pinned_messages:create");
  const sending = sendMutation.isPending || editMutation.isPending;

  // Ankieta: okno zamyka się dopiero po wysłaniu (przy błędzie treść zostaje).
  const handleCreatePoll = async (question: string, metadata: PollMetadata) => {
    if (sendMutation.isPending) return false;
    try {
      await sendMutation.mutateAsync({ content: question, messageType: "poll", metadata });
      setPollOpen(false);
      return true;
    } catch (e) {
      Alert.alert("Nie udało się utworzyć ankiety", friendlyError(e, "Spróbuj ponownie."));
      return false;
    }
  };

  const handleShareEvent = async (title: string, metadata: EventMetadata) => {
    if (sendMutation.isPending) return;
    try {
      await sendMutation.mutateAsync({ content: title, messageType: "event", metadata });
      setEventShareOpen(false);
    } catch (e) {
      Alert.alert("Nie udało się udostępnić wydarzenia", friendlyError(e, "Spróbuj ponownie."));
    }
  };

  // Wysyłka: tekst i załącznik zostają w polu do potwierdzenia przez serwer — przy błędzie
  // (np. „W tym kanale piszą tylko administratorzy”, brak sieci) nic nie ginie.
  const handleSend = async () => {
    if (sending) return;
    if (editingId) {
      const t = text.trim();
      if (!t) return;
      try {
        await editMutation.mutateAsync({ id: editingId, content: t });
        resetComposer();
      } catch (e) {
        Alert.alert(
          "Nie udało się zapisać zmian",
          friendlyError(e, "Nie udało się zapisać zmian w wiadomości. Spróbuj ponownie."),
        );
      }
      return;
    }

    const t = text.trim();
    if (!t && !pendingAttachment) return;
    try {
      await sendMutation.mutateAsync({
        content: t,
        attachments: pendingAttachment ? [pendingAttachment] : undefined,
        replyToId: replyTo?.id ?? null,
        mentions: extractMentions(t, members),
      });
      resetComposer();
    } catch (e) {
      Alert.alert(
        "Nie udało się wysłać",
        friendlyError(e, "Nie udało się wysłać wiadomości. Spróbuj ponownie."),
      );
    }
  };

  const handleCopyMessage = async (msg: MessageRow) => {
    if (!msg.content) {
      Alert.alert("Brak tekstu", "Ta wiadomość nie zawiera tekstu do udostępnienia.");
      return;
    }
    try {
      await Share.share({ message: msg.content });
    } catch {
      // user closed share sheet
    }
  };

  const handleTogglePin = (msg: MessageRow) => {
    if (pinMutation.isPending) return;
    pinMutation.mutate(
      { messageId: msg.id, pinned: pinnedIds.has(msg.id) },
      {
        onError: (e) =>
          Alert.alert(
            "Nie udało się",
            friendlyError(e, "Nie udało się zmienić przypięcia wiadomości. Spróbuj ponownie."),
          ),
      },
    );
  };

  const handleForward = (msg: MessageRow) => {
    setForwardTarget(msg);
  };

  // Przekazanie: każda rozmowa osobno; okno zamyka się, gdy choć jedna wysyłka się udała.
  const handleConfirmForward = async (conversationIds: string[]) => {
    const target = forwardTarget;
    if (!target) return false;
    try {
      const { sent, total } = await forwardMutation.mutateAsync({
        conversationIds,
        content: target.content,
        attachments: target.attachments ?? [],
      });
      setForwardTarget(null);
      if (sent < total) {
        Alert.alert(
          "Przekazano częściowo",
          `Przekazano do ${sent} z ${total} rozmów. Do pozostałych nie udało się wysłać.`,
        );
      } else {
        toast.success(sent === 1 ? "Wiadomość przekazana" : `Wiadomość przekazana do ${sent} rozmów`);
      }
      return true;
    } catch (e) {
      Alert.alert("Nie udało się przekazać", friendlyError(e, "Spróbuj ponownie."));
      return false;
    }
  };

  const handleLongPress = (msg: MessageRow) => {
    setActionTarget(msg);
  };

  const handleDeleteMessage = (msg: MessageRow) => {
    const quote = excerpt(msg.content);
    Alert.alert(
      quote ? `Usunąć wiadomość „${quote}”?` : "Usunąć tę wiadomość?",
      "Zniknie u wszystkich uczestników rozmowy. Tego nie można cofnąć.",
      [
        { text: "Anuluj", style: "cancel" },
        {
          text: "Usuń",
          style: "destructive",
          onPress: () => {
            if (deleteMutation.isPending) return;
            deleteMutation.mutate(msg.id, {
              onSuccess: () => toast.success("Wiadomość usunięta"),
              onError: (e) =>
                Alert.alert(
                  "Nie udało się usunąć",
                  friendlyError(e, "Nie udało się usunąć wiadomości. Spróbuj ponownie."),
                ),
            });
          },
        },
      ],
    );
  };

  // Błędy wyciszenia pokazuje sam hook (useToggleMuted).
  const handleToggleMute = () => {
    if (!detailsQuery.data || muteMutation.isPending) return;
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
        style={{ flex: 1, backgroundColor: "#F6F4EE" }}
      >
        <ConversationHeader
          details={detailsQuery.data ?? null}
          members={members}
          myEmail={user?.email ?? null}
          onToggleMute={canManageOwn && details?.is_participant ? handleToggleMute : undefined}
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
          onUnpin={canPin ? (m) => handleTogglePin(m) : undefined}
        />

        {messagesQuery.isLoading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color="#2A2312" />
          </View>
        ) : messagesQuery.isError && !messagesQuery.data ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
            <Text style={{ fontSize: 14, color: "#6B6557", fontFamily: "Manrope_500Medium", textAlign: "center", lineHeight: 20 }}>
              {friendlyError(messagesQuery.error, "Nie udało się wczytać wiadomości. Spróbuj ponownie.")}
            </Text>
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
                <Text
                  style={{
                    fontSize: 14,
                    color: "#6B6557",
                    fontFamily: "Manrope_500Medium",
                  }}
                >
                  {canPost ? "Brak wiadomości. Napisz pierwszą." : "Brak wiadomości."}
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              if (item.kind === "date") {
                return <DateSeparator date={item.date} />;
              }
              const m = item.msg;
              const mine = sameEmail(m.sender_email, user?.email);
              const receipts = readReceiptsQuery.data?.[m.id] ?? [];
              const readByCount = mine
                ? receipts.filter((r: ReadReceiptRow) => !sameEmail(r.user_email, m.sender_email)).length
                : 0;
              const prayer = prayerQuery.data?.[m.id];
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
                  currentUserEmail={user?.email ?? null}
                  deliveryStatus={mine ? deliveryStatusFor(receipts, m.sender_email) : undefined}
                  pollVotes={pollVotesQuery.data?.[m.id]}
                  onVote={(optionId) => {
                    // Blokada podwójnego głosu (błędy pokazuje hook).
                    if (pollVoteMutation.isPending) return;
                    pollVoteMutation.mutate({
                      messageId: m.id,
                      optionId,
                      multiple: !!(m.metadata as PollMetadata | null)?.multiple,
                    });
                  }}
                  prayerCount={prayer?.count ?? 0}
                  prayerMine={!!prayer?.mine}
                  onPray={() => {
                    if (prayerMutation.isPending) return;
                    prayerMutation.mutate({ messageId: m.id, responding: !!prayer?.mine });
                  }}
                  senderStatus={mine ? undefined : getStatus(m.sender_email)}
                  onLongPress={() => handleLongPress(m)}
                  onToggleReaction={(emoji) => handleToggleReactionFromBubble(m.id, emoji)}
                />
              );
            }}
          />
        )}

        <View style={{ paddingBottom: composerBottomPad, backgroundColor: "#F6F4EE" }}>
          <ComposerBar
            text={text}
            onChangeText={setText}
            onSend={handleSend}
            sending={sending}
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
            canPost={canPost}
            readOnlyText={readOnlyText}
            onCreatePoll={() => setPollOpen(true)}
            onShareEvent={() => setEventShareOpen(true)}
          />
        </View>
      </KeyboardAvoidingView>

      <PollComposerModal
        visible={pollOpen}
        onClose={() => setPollOpen(false)}
        onCreate={handleCreatePoll}
      />

      <EventShareModal
        visible={eventShareOpen}
        onClose={() => setEventShareOpen(false)}
        onShare={handleShareEvent}
        busy={sendMutation.isPending}
      />

      <MessageActionsSheet
        visible={!!actionTarget}
        onClose={() => setActionTarget(null)}
        mine={sameEmail(actionTarget?.sender_email, user?.email)}
        canEdit={canEditOwn && !!actionTarget && canEditMessage(actionTarget, user?.email ?? null)}
        canDelete={canEditOwn}
        canPin={canPin}
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
        canReply={canPost}
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
