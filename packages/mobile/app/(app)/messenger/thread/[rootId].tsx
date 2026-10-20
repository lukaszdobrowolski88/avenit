import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Share,
  StatusBar,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, ChevronLeft } from "lucide-react-native";
import { goBack } from "../../../../src/lib/navigation";
import {
  canEditMessage,
  canPostIn,
  conversationTitle,
  extractMentions,
  memberDisplayName,
  memberPhotoUrl,
  sameEmail,
  useConversationDetails,
  useMembersByEmails,
  type MessageAttachment,
  type MessageRow,
} from "../../../../src/features/messenger/api";
import {
  isFollowing,
  patchThreadReply,
  replyCountLabel,
  useRealtimeThread,
  useSendThreadReply,
  useSetThreadFollow,
  useThread,
  useThreadFollowers,
} from "../../../../src/features/messenger/threads";
import { pickDocument, pickImageFromLibrary, takePhoto, uploadAttachment, uploadDocument } from "../../../../src/features/messenger/attachments";
import { MessageBubble } from "../../../../src/features/messenger/components/MessageBubble";
import { ComposerBar, type MentionCandidate } from "../../../../src/features/messenger/components/ComposerBar";
import { chatErrorTitle } from "../../../../src/features/messenger/plus";
import { supabase } from "../../../../src/lib/supabase";
import { useAuthSession } from "../../../../src/lib/auth";
import { usePermissions } from "../../../../src/lib/permissions";
import { friendlyError } from "../../../../src/lib/errors";
import { toast } from "../../../../src/lib/toast";
import { B } from "../../../../src/components/ui/brand";

type Item = { kind: "root"; msg: MessageRow } | { kind: "divider"; count: number } | { kind: "reply"; msg: MessageRow; showSender: boolean };

// Wątek (jak w Slacku): wiadomość główna, odpowiedzi i własne pole pisania. Odpowiedzi nie trafiają
// na główną oś rozmowy; powiadomienia o nich dostają obserwujący (przełącznik w nagłówku).
export default function ThreadScreen() {
  const { rootId: rootParam, conversationId: convParam } = useLocalSearchParams<{ rootId: string; conversationId?: string }>();
  const rootId = String(rootParam ?? "");
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { user } = useAuthSession();
  const myEmail = user?.email ?? null;
  const perms = usePermissions();
  const canEditOwn = perms.can("res:messages:update");

  const threadQuery = useThread(String(convParam ?? ""), rootId);
  const root = threadQuery.data?.root ?? null;
  const replies = useMemo(() => threadQuery.data?.replies ?? [], [threadQuery.data?.replies]);
  // Rozmowa z wiadomości głównej (link z powiadomienia może nie mieć conversationId).
  const cid = String(root?.conversation_id ?? convParam ?? "");
  const detailsQuery = useConversationDetails(cid, myEmail);
  const details = detailsQuery.data;
  const followersQuery = useThreadFollowers(rootId);
  const following = isFollowing(followersQuery.data, myEmail);
  const sendMutation = useSendThreadReply(cid, rootId, myEmail);
  const followMutation = useSetThreadFollow(rootId, myEmail);
  useRealtimeThread(cid, rootId);

  const memberEmails = useMemo(() => {
    const set = new Set<string>();
    if (root) set.add(root.sender_email);
    for (const m of replies) set.add(m.sender_email);
    for (const e of details?.participant_emails ?? []) set.add(e);
    return Array.from(set);
  }, [root, replies, details?.participant_emails]);
  const members = useMembersByEmails(memberEmails).data ?? {};

  const [text, setText] = useState("");
  const [pendingAttachment, setPendingAttachment] = useState<MessageAttachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const listRef = useRef<FlatList<Item>>(null);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => setKeyboardOpen(true));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const composerBottomPad = keyboardOpen ? 6 : Platform.OS === "ios" ? 88 : 70;

  // Nowa odpowiedź — na dół listy.
  const lastId = replies[replies.length - 1]?.id;
  useEffect(() => {
    if (!lastId) return;
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [lastId]);

  const items = useMemo<Item[]>(() => {
    if (!root) return [];
    const out: Item[] = [{ kind: "root", msg: root }, { kind: "divider", count: replies.length }];
    let prev: string | null = null;
    for (const m of replies) {
      out.push({ kind: "reply", msg: m, showSender: prev !== m.sender_email });
      prev = m.sender_email;
    }
    return out;
  }, [root, replies]);

  const canPost = !!details && details.is_participant && canPostIn(details) && !!root && !root.deleted_at;
  const readOnlyText = !details
    ? detailsQuery.isError
      ? friendlyError(detailsQuery.error, "Nie udało się wczytać rozmowy.")
      : ""
    : !details.is_participant
      ? "Nie jesteś uczestnikiem tej rozmowy."
      : root?.deleted_at
        ? "Ta wiadomość została usunięta."
        : "W tym kanale piszą tylko administratorzy.";
  const isConvAdmin = details?.my_role === "admin";
  const canMentionAll = !!details && details.type !== "direct" && (isConvAdmin || (details.type === "ministry" && perms.isAdmin));
  const mentionCandidates = useMemo<MentionCandidate[]>(
    () =>
      details && details.type !== "direct"
        ? (details.participant_emails ?? [])
            .filter((e: string) => !sameEmail(e, myEmail))
            .map((e: string) => ({ email: e, name: memberDisplayName(members, e), photoUrl: memberPhotoUrl(members, e) }))
            .sort((a: MentionCandidate, b: MentionCandidate) => a.name.localeCompare(b.name, "pl"))
        : [],
    [details, members, myEmail],
  );

  const pick = async (kind: "library" | "camera" | "file") => {
    if (uploading || !cid) return;
    setUploading(true);
    try {
      if (kind === "file") {
        const asset = await pickDocument();
        if (asset) setPendingAttachment(await uploadDocument(cid, asset));
      } else {
        const asset = kind === "camera" ? await takePhoto() : await pickImageFromLibrary();
        if (asset) setPendingAttachment(await uploadAttachment(cid, asset));
      }
    } catch (e) {
      Alert.alert("Nie udało się dodać pliku", friendlyError(e, "Spróbuj ponownie."));
    } finally {
      setUploading(false);
    }
  };

  const handleSend = async () => {
    const t = text.trim();
    if (editingId) {
      if (!t || savingEdit) return;
      setSavingEdit(true);
      try {
        const { data, error } = await (supabase.from("messages") as any)
          .update({ content: t, edited_at: new Date().toISOString() })
          .eq("id", editingId)
          .select();
        if (error) throw error;
        const row = (Array.isArray(data) ? data[0] : data) as MessageRow | undefined;
        if (!row) throw new Error("Możesz edytować tylko własne wiadomości.");
        patchThreadReply(qc, rootId, row);
        setEditingId(null);
        setText("");
      } catch (e) {
        Alert.alert("Nie udało się zapisać zmian", friendlyError(e, "Spróbuj ponownie."));
      } finally {
        setSavingEdit(false);
      }
      return;
    }
    if ((!t && !pendingAttachment) || sendMutation.isPending) return;
    try {
      await sendMutation.mutateAsync({
        content: t,
        attachments: pendingAttachment ? [pendingAttachment] : undefined,
        mentions: extractMentions(t, members, { allowAll: canMentionAll, exclude: myEmail }),
      });
      setText("");
      setPendingAttachment(null);
    } catch (e) {
      Alert.alert(chatErrorTitle(e, "Nie udało się wysłać"), friendlyError(e, "Nie udało się wysłać odpowiedzi. Spróbuj ponownie."));
    }
  };

  const deleteReply = (m: MessageRow) => {
    Alert.alert("Usunąć tę odpowiedź?", "Zniknie u wszystkich uczestników rozmowy. Tego nie można cofnąć.", [
      { text: "Anuluj", style: "cancel" },
      {
        text: "Usuń",
        style: "destructive",
        onPress: async () => {
          try {
            const { data, error } = await (supabase.from("messages") as any)
              .update({ deleted_at: new Date().toISOString() })
              .eq("id", m.id)
              .select("id, conversation_id, deleted_at");
            if (error) throw error;
            if (!data || (Array.isArray(data) && !data.length)) throw new Error("Możesz usuwać tylko własne wiadomości.");
            patchThreadReply(qc, rootId, { id: m.id, deleted_at: new Date().toISOString() });
            toast.success("Odpowiedź usunięta");
          } catch (e) {
            Alert.alert("Nie udało się usunąć", friendlyError(e, "Spróbuj ponownie."));
          }
        },
      },
    ]);
  };

  // Przytrzymanie: udostępnij tekst; własna odpowiedź — edytuj / usuń.
  const openActions = (m: MessageRow, isRoot: boolean) => {
    const mine = sameEmail(m.sender_email, myEmail);
    const buttons: { text: string; style?: "cancel" | "destructive"; onPress?: () => void }[] = [];
    if (m.content) buttons.push({ text: "Udostępnij tekst", onPress: () => void Share.share({ message: m.content }).catch(() => undefined) });
    if (!isRoot && mine && canEditOwn && canEditMessage(m, myEmail)) {
      buttons.push({ text: "Edytuj", onPress: () => { setEditingId(m.id); setText(m.content); setPendingAttachment(null); } });
    }
    if (!isRoot && mine && canEditOwn) buttons.push({ text: "Usuń", style: "destructive", onPress: () => deleteReply(m) });
    if (!buttons.length) return;
    buttons.push({ text: "Anuluj", style: "cancel" });
    Alert.alert("Wiadomość", undefined, buttons);
  };

  const toggleFollow = () => {
    if (followMutation.isPending) return;
    const next = !following;
    followMutation.mutate(next, {
      onSuccess: () => toast.success(next ? "Obserwujesz ten wątek" : "Nie obserwujesz już tego wątku"),
      onError: (e) => Alert.alert("Nie udało się", friendlyError(e, "Nie udało się zmienić obserwowania wątku.")),
    });
  };

  const place = details ? conversationTitle({ ...details, peer_email: details.type === "direct" ? details.participant_emails.find((e) => !sameEmail(e, myEmail)) ?? null : null }, members) : "";

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: B.paper }}>
        <View
          style={{
            paddingTop: insets.top + 6,
            paddingBottom: 10,
            paddingHorizontal: 8,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            backgroundColor: B.paper,
            borderBottomWidth: 1,
            borderBottomColor: B.line,
          }}
        >
          <Pressable
            onPress={() => goBack(router)}
            accessibilityRole="button"
            accessibilityLabel="Wróć"
            hitSlop={8}
            className="active:opacity-60"
            style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
          >
            <ChevronLeft size={22} color={B.ink} />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 16, color: B.ink, fontFamily: "Manrope_700Bold" }}>Wątek</Text>
            {place ? (
              <Text numberOfLines={1} style={{ fontSize: 12, color: B.ink4, fontFamily: "Manrope_500Medium" }}>
                {place}
              </Text>
            ) : null}
          </View>
          {root && details?.is_participant ? (
            <Pressable
              onPress={toggleFollow}
              accessibilityRole="switch"
              accessibilityState={{ checked: following, busy: followMutation.isPending }}
              accessibilityLabel={following ? "Obserwujesz wątek — dotknij, aby przestać" : "Obserwuj wątek"}
              className="active:opacity-70"
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 999,
                backgroundColor: following ? B.ink : B.card,
                borderWidth: 1,
                borderColor: following ? B.ink : "#E6E1D5",
              }}
            >
              {following ? <Bell size={14} color={B.onDark} /> : <BellOff size={14} color={B.ink} />}
              <Text style={{ fontSize: 12, color: following ? B.onDark : B.ink, fontFamily: "Manrope_700Bold" }}>
                {following ? "Obserwujesz" : "Obserwuj"}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {threadQuery.isLoading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={B.ink} />
          </View>
        ) : !root ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
            <Text style={{ fontSize: 14, color: B.ink3, fontFamily: "Manrope_500Medium", textAlign: "center", lineHeight: 20 }}>
              {threadQuery.isError
                ? friendlyError(threadQuery.error, "Nie udało się wczytać wątku. Spróbuj ponownie.")
                : "Nie znaleziono tego wątku — wiadomość mogła zostać usunięta."}
            </Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10 }}
            data={items}
            keyExtractor={(it) => (it.kind === "divider" ? "divider" : `${it.kind}-${it.msg.id}`)}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              if (item.kind === "divider") {
                return (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 12 }}>
                    <Text style={{ fontSize: 12, color: B.ink4, fontFamily: "Manrope_700Bold" }}>
                      {item.count ? replyCountLabel(item.count) : "Jeszcze nikt nie odpowiedział"}
                    </Text>
                    <View style={{ flex: 1, height: 1, backgroundColor: B.line }} />
                  </View>
                );
              }
              const m = item.msg;
              const mine = sameEmail(m.sender_email, myEmail);
              return (
                <MessageBubble
                  message={m}
                  mine={mine}
                  members={members}
                  showSender={item.kind === "root" ? true : item.showSender}
                  currentUserEmail={myEmail}
                  onLongPress={() => openActions(m, item.kind === "root")}
                />
              );
            }}
            ListFooterComponent={
              !replies.length && canPost ? (
                <Text style={{ textAlign: "center", fontSize: 12, color: B.ink4, fontFamily: "Manrope_500Medium", marginTop: 4 }}>
                  Odpowiedz jako pierwszy(a) — autor wiadomości dostanie powiadomienie.
                </Text>
              ) : null
            }
          />
        )}

        <View style={{ paddingBottom: composerBottomPad, backgroundColor: B.paper }}>
          <ComposerBar
            text={text}
            onChangeText={setText}
            onSend={handleSend}
            sending={sendMutation.isPending || savingEdit}
            pendingAttachment={pendingAttachment}
            onClearAttachment={() => setPendingAttachment(null)}
            onPickImage={() => void pick("library")}
            onTakePhoto={() => void pick("camera")}
            onPickFile={() => void pick("file")}
            uploading={uploading}
            replyTo={null}
            onClearReply={() => undefined}
            editing={!!editingId}
            members={members}
            canPost={canPost}
            readOnlyText={root ? readOnlyText : ""}
            mentionCandidates={mentionCandidates}
            canMentionAll={canMentionAll}
          />
        </View>
      </KeyboardAvoidingView>
    </>
  );
}
