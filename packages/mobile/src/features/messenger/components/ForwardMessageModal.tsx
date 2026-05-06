import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Check, Hash, Search, Users as UsersIcon, X } from "lucide-react-native";
import {
  useConversations,
  useMembersByEmails,
  memberDisplayName,
  memberInitials,
  memberPhotoUrl,
  MINISTRY_CHANNEL_META,
  type ConversationListItem,
  type MemberMap,
} from "../api";

interface Props {
  visible: boolean;
  onClose: () => void;
  onConfirm: (conversationIds: string[]) => Promise<void> | void;
  myEmail: string | null;
  /** ID konwersacji źródłowej, żeby ukryć z listy. */
  sourceConversationId?: string;
}

const Avatar = ({
  conv,
  members,
  myEmail,
}: {
  conv: ConversationListItem;
  members: MemberMap;
  myEmail: string | null;
}) => {
  if (conv.type === "ministry") {
    const meta = conv.ministry_key ? MINISTRY_CHANNEL_META[conv.ministry_key] : null;
    return (
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          backgroundColor: meta?.bg ?? "#fce7f3",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Hash size={16} color={meta?.tint ?? "#ec4899"} strokeWidth={2.4} />
      </View>
    );
  }
  if (conv.type === "group") {
    return (
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: "#fef3f2",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <UsersIcon size={16} color="#ec4899" />
      </View>
    );
  }
  const lastEmail = conv.last_message?.sender_email ?? null;
  const otherEmail = lastEmail && lastEmail !== myEmail ? lastEmail : null;
  const photo = otherEmail ? memberPhotoUrl(members, otherEmail) : null;
  const initials = otherEmail
    ? memberInitials(members, otherEmail)
    : (conv.name ?? "?").charAt(0).toUpperCase();
  if (photo) {
    return <Image source={{ uri: photo }} style={{ width: 36, height: 36, borderRadius: 18 }} />;
  }
  return (
    <View
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: "#fef3f2",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: "#be185d", fontFamily: "Inter_700Bold", fontSize: 12 }}>
        {initials}
      </Text>
    </View>
  );
};

export const ForwardMessageModal = ({
  visible,
  onClose,
  onConfirm,
  myEmail,
  sourceConversationId,
}: Props) => {
  const { data, isLoading } = useConversations(myEmail);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const lookupEmails = useMemo(() => {
    const set = new Set<string>();
    for (const c of data ?? []) {
      if (c.last_message?.sender_email) set.add(c.last_message.sender_email);
    }
    return Array.from(set);
  }, [data]);
  const membersQuery = useMembersByEmails(lookupEmails);
  const members = membersQuery.data ?? {};

  const filtered = useMemo(() => {
    const list = (data ?? []).filter(
      (c) => !c.archived && c.id !== sourceConversationId,
    );
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter((c) => {
      const ministry = c.ministry_key
        ? MINISTRY_CHANNEL_META[c.ministry_key]?.label ?? ""
        : "";
      return [c.name ?? "", ministry, c.last_message?.content ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [data, search, sourceConversationId]);

  const toggle = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      await onConfirm(Array.from(selected));
      setSelected(new Set());
      setSearch("");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => {
    if (busy) return;
    setSelected(new Set());
    setSearch("");
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
      presentationStyle="pageSheet"
    >
      <View style={{ flex: 1, backgroundColor: "#ffffff" }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingTop: 16,
            paddingBottom: 12,
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: "#eef0f3",
            gap: 10,
          }}
        >
          <Pressable onPress={handleClose} hitSlop={10}>
            <X size={22} color="#1c1917" />
          </Pressable>
          <Text
            style={{
              flex: 1,
              fontSize: 16,
              color: "#0c0a09",
              fontFamily: "Inter_700Bold",
              letterSpacing: -0.3,
            }}
          >
            Przekaż do…
          </Text>
          <Pressable
            onPress={handleConfirm}
            disabled={selected.size === 0 || busy}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 10,
              backgroundColor: selected.size > 0 ? "#ec4899" : "#fafaf9",
              opacity: busy ? 0.5 : 1,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                color: selected.size > 0 ? "#ffffff" : "#a8a29e",
                fontFamily: "Inter_700Bold",
              }}
            >
              {busy ? "Wysyłam…" : `Przekaż${selected.size ? ` (${selected.size})` : ""}`}
            </Text>
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingHorizontal: 14,
              height: 42,
              borderRadius: 14,
              backgroundColor: "#fafaf9",
              borderWidth: 1,
              borderColor: "#eef0f3",
            }}
          >
            <Search size={16} color="#a8a29e" />
            <TextInput
              style={{
                flex: 1,
                fontSize: 14,
                color: "#0c0a09",
                fontFamily: "Inter_500Medium",
              }}
              placeholder="Szukaj rozmowy…"
              placeholderTextColor="#a8a29e"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
            />
          </View>
        </View>

        {isLoading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color="#ec4899" />
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(it) => it.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
            ItemSeparatorComponent={() => (
              <View style={{ height: 1, backgroundColor: "#f5f5f4" }} />
            )}
            ListEmptyComponent={
              <Text
                style={{
                  textAlign: "center",
                  marginTop: 48,
                  color: "#78716c",
                  fontFamily: "Inter_500Medium",
                }}
              >
                Brak rozmów.
              </Text>
            }
            renderItem={({ item }) => {
              const isMinistry = item.type === "ministry";
              const meta =
                isMinistry && item.ministry_key
                  ? MINISTRY_CHANNEL_META[item.ministry_key]
                  : null;
              const last = item.last_message;
              const title =
                item.name ||
                (isMinistry ? meta?.label ?? item.ministry_key : null) ||
                (last?.sender_email && last.sender_email !== myEmail
                  ? memberDisplayName(members, last.sender_email)
                  : "Rozmowa");
              const isSelected = selected.has(item.id);
              return (
                <Pressable
                  onPress={() => toggle(item.id)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingVertical: 12,
                  }}
                >
                  <Avatar conv={item} members={members} myEmail={myEmail} />
                  <Text
                    numberOfLines={1}
                    style={{
                      flex: 1,
                      fontSize: 15,
                      color: "#0c0a09",
                      letterSpacing: -0.2,
                      fontFamily: "Inter_600SemiBold",
                    }}
                  >
                    {title}
                  </Text>
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      borderWidth: 2,
                      borderColor: isSelected ? "#ec4899" : "#cbd5e1",
                      backgroundColor: isSelected ? "#ec4899" : "transparent",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {isSelected ? <Check size={14} color="#ffffff" strokeWidth={3} /> : null}
                  </View>
                </Pressable>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
};
