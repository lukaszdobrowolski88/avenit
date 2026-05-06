import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StatusBar,
  Text,
  TextInput,
  View,
} from "react-native";
import { Link } from "expo-router";
import {
  Archive,
  ArchiveRestore,
  Hash,
  MessageCircle,
  Search,
  Star,
  Users as UsersIcon,
  VolumeX,
  X,
} from "lucide-react-native";
import { formatRelative } from "../../../src/lib/domain";
import { PageHeader } from "../../../src/components/ui/PageHeader";
import {
  useConversations,
  useToggleStarred,
  useToggleArchived,
  useMembersByEmails,
  memberDisplayName,
  memberInitials,
  memberPhotoUrl,
  MINISTRY_CHANNEL_META,
  type ConversationFilter,
  type ConversationListItem,
  type MemberLite, type MemberMap,
} from "../../../src/features/messenger/api";
import { useRealtimeConversations } from "../../../src/features/messenger/hooks/useRealtimeMessages";
import { useAuthSession } from "../../../src/lib/auth";
import { usePresence, type PresenceStatus } from "../../../src/lib/presence";
import { PresenceDot } from "../../../src/features/messenger/components/PresenceDot";

const FILTERS: { key: ConversationFilter; label: string }[] = [
  { key: "all", label: "Wszystkie" },
  { key: "ministry", label: "Służby" },
  { key: "direct", label: "Prywatne" },
  { key: "starred", label: "Ulubione" },
  { key: "archived", label: "Archiwum" },
];

const ConversationAvatar = ({
  conv,
  members,
  myEmail,
  peerStatus,
}: {
  conv: ConversationListItem;
  members: MemberMap;
  myEmail: string | null;
  peerStatus?: PresenceStatus;
}) => {
  if (conv.type === "ministry") {
    const meta = conv.ministry_key ? MINISTRY_CHANNEL_META[conv.ministry_key] : null;
    return (
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          backgroundColor: meta?.bg ?? "#fce7f3",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Hash size={20} color={meta?.tint ?? "#ec4899"} strokeWidth={2.4} />
      </View>
    );
  }
  if (conv.type === "group") {
    return (
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: "#fef3f2",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <UsersIcon size={20} color="#ec4899" />
      </View>
    );
  }
  // Direct: avatar drugiego uczestnika (preferuj peer_email — zawsze drugi uczestnik,
  // nawet gdy ostatnio pisałem ja).
  const otherEmail =
    conv.peer_email ??
    (conv.last_message?.sender_email && conv.last_message.sender_email !== myEmail
      ? conv.last_message.sender_email
      : null);
  const photo = otherEmail ? memberPhotoUrl(members, otherEmail) : null;
  const initials = otherEmail
    ? memberInitials(members, otherEmail)
    : (conv.name ?? "?").charAt(0).toUpperCase();
  return (
    <View>
      {photo ? (
        <Image source={{ uri: photo }} style={{ width: 44, height: 44, borderRadius: 22 }} />
      ) : (
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: "#fef3f2",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#be185d", fontFamily: "Inter_700Bold", fontSize: 14 }}>
            {initials}
          </Text>
        </View>
      )}
      {peerStatus ? <PresenceDot status={peerStatus} size={12} /> : null}
    </View>
  );
};

export default function MessengerScreen() {
  const { user } = useAuthSession();
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const [search, setSearch] = useState("");
  const { data, isLoading, isError, error, refetch, isRefetching } = useConversations(
    user?.email ?? null,
  );
  const toggleStar = useToggleStarred(user?.email ?? null);
  const toggleArchive = useToggleArchived(user?.email ?? null);
  useRealtimeConversations(user?.email ?? null);

  // Lookup memberów po peer_email (drugi uczestnik direct) + sender_email z ostatnich wiadomości.
  const lookupEmails = useMemo(() => {
    const set = new Set<string>();
    for (const c of data ?? []) {
      if (c.peer_email) set.add(c.peer_email);
      if (c.last_message?.sender_email) set.add(c.last_message.sender_email);
    }
    return Array.from(set);
  }, [data]);
  const membersQuery = useMembersByEmails(lookupEmails);
  const members = membersQuery.data ?? {};

  // Presence dla rozmówców z direct.
  const peerEmails = useMemo(() => {
    const set = new Set<string>();
    for (const c of data ?? []) {
      if (c.type === "direct" && c.peer_email) set.add(c.peer_email);
    }
    return Array.from(set);
  }, [data]);
  const { getStatus } = usePresence(peerEmails);

  const filtered = useMemo(() => {
    const list = (data ?? []).filter((c) => {
      if (filter === "archived") return !!c.archived;
      if (c.archived) return false;
      if (filter === "all") return true;
      if (filter === "starred") return !!c.starred;
      if (filter === "ministry") return c.type === "ministry";
      if (filter === "direct") return c.type === "direct" || c.type === "group";
      return true;
    });
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter((c) => {
      const ministry =
        c.ministry_key ? MINISTRY_CHANNEL_META[c.ministry_key]?.label ?? "" : "";
      const senderName = c.last_message?.sender_email
        ? memberDisplayName(members, c.last_message.sender_email).toLowerCase()
        : "";
      const haystack = [
        c.name ?? "",
        ministry,
        c.last_message?.content ?? "",
        senderName,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [data, filter, search, members]);

  const totalUnread = (data ?? []).reduce((sum, c) => sum + (c.unread_count ?? 0), 0);

  // Sekcje (PRYWATNE / GRUPY / KANAŁY) — używane gdy nie filtrujemy po typie.
  const sections = useMemo(() => {
    const direct: ConversationListItem[] = [];
    const groups: ConversationListItem[] = [];
    const ministry: ConversationListItem[] = [];
    for (const c of filtered) {
      if (c.type === "direct") direct.push(c);
      else if (c.type === "group") groups.push(c);
      else ministry.push(c);
    }
    const out: { title: string; data: ConversationListItem[] }[] = [];
    if (direct.length) out.push({ title: "PRYWATNE", data: direct });
    if (groups.length) out.push({ title: "GRUPY", data: groups });
    if (ministry.length) out.push({ title: "KANAŁY", data: ministry });
    return out;
  }, [filtered]);

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: "#ffffff" }}>
        <PageHeader
          title="Wiadomości"
          subtitle={
            totalUnread > 0 ? `${totalUnread} nieprzeczytanych` : "Komunikator zboru"
          }
          Icon={MessageCircle}
        />

        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
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
              placeholder="Szukaj rozmów…"
              placeholderTextColor="#a8a29e"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
            />
            {search ? (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <X size={14} color="#a8a29e" />
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={{ height: 44 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingBottom: 8,
              gap: 6,
              alignItems: "center",
            }}
          >
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <Pressable
                  key={f.key}
                  onPress={() => setFilter(f.key)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 7,
                    borderRadius: 999,
                    backgroundColor: active ? "#0c0a09" : "#fafaf9",
                    borderWidth: 1,
                    borderColor: active ? "#0c0a09" : "#eef0f3",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      color: active ? "#ffffff" : "#1c1917",
                      fontFamily: "Inter_600SemiBold",
                    }}
                  >
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {isLoading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color="#ec4899" />
          </View>
        ) : isError ? (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 24,
            }}
          >
            <Text
              style={{
                textAlign: "center",
                color: "#e11d48",
                fontFamily: "Inter_500Medium",
              }}
            >
              {(error as Error)?.message ?? "Błąd"}
            </Text>
          </View>
        ) : (
          <SectionList
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 4,
              paddingBottom: 120,
            }}
            sections={sections}
            keyExtractor={(item) => item.id}
            stickySectionHeadersEnabled={false}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#ec4899" />
            }
            ItemSeparatorComponent={() => (
              <View style={{ height: 1, backgroundColor: "#f5f5f4" }} />
            )}
            renderSectionHeader={({ section: { title } }) => (
              <Text
                style={{
                  fontSize: 11,
                  color: "#78716c",
                  letterSpacing: 1.4,
                  fontFamily: "Inter_700Bold",
                  marginTop: 14,
                  marginBottom: 6,
                }}
              >
                {title}
              </Text>
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
                {search ? "Brak wyników." : "Brak konwersacji."}
              </Text>
            }
            renderItem={({ item }) => {
              const isMinistry = item.type === "ministry";
              const ministry =
                isMinistry && item.ministry_key
                  ? MINISTRY_CHANNEL_META[item.ministry_key]
                  : null;
              const last = item.last_message;
              const unread = (item.unread_count ?? 0) > 0;
              const title =
                item.name || (isMinistry ? ministry?.label ?? item.ministry_key : null);
              const displayTitle =
                title ||
                (item.peer_email
                  ? memberDisplayName(members, item.peer_email)
                  : last?.sender_email && last.sender_email !== user?.email
                  ? memberDisplayName(members, last.sender_email)
                  : "Rozmowa");
              const lastSenderName = last?.sender_email
                ? last.sender_email === user?.email
                  ? "Ty"
                  : memberDisplayName(members, last.sender_email).split(" ")[0]
                : null;
              return (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 12,
                  }}
                >
                  <Link
                    href={{
                      pathname: "/(app)/messenger/[conversationId]",
                      params: { conversationId: item.id },
                    }}
                    asChild
                  >
                    <Pressable
                      style={{
                        flex: 1,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <ConversationAvatar
                        conv={item}
                        members={members}
                        myEmail={user?.email ?? null}
                        peerStatus={
                          item.type === "direct" && item.peer_email
                            ? getStatus(item.peer_email)
                            : undefined
                        }
                      />
                      <View style={{ flex: 1 }}>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <Text
                            numberOfLines={1}
                            style={{
                              flex: 1,
                              fontSize: 15,
                              color: "#0c0a09",
                              letterSpacing: -0.2,
                              fontFamily: unread ? "Inter_700Bold" : "Inter_500Medium",
                            }}
                          >
                            {displayTitle}
                          </Text>
                          {item.muted ? <VolumeX size={12} color="#a8a29e" /> : null}
                          {last ? (
                            <Text
                              style={{
                                fontSize: 11,
                                color: unread ? "#be185d" : "#a8a29e",
                                fontFamily: unread
                                  ? "Inter_700Bold"
                                  : "Inter_500Medium",
                              }}
                            >
                              {formatRelative(last.created_at)}
                            </Text>
                          ) : null}
                        </View>
                        {last ? (
                          <Text
                            numberOfLines={1}
                            style={{
                              fontSize: 13,
                              marginTop: 2,
                              color: unread ? "#1c1917" : "#78716c",
                              fontFamily: unread
                                ? "Inter_500Medium"
                                : "Inter_400Regular",
                            }}
                          >
                            {lastSenderName ? `${lastSenderName}: ` : ""}
                            {last.content || "(załącznik)"}
                          </Text>
                        ) : (
                          <Text
                            numberOfLines={1}
                            style={{
                              fontSize: 13,
                              marginTop: 2,
                              color: "#a8a29e",
                              fontStyle: "italic",
                              fontFamily: "Inter_400Regular",
                            }}
                          >
                            Brak wiadomości
                          </Text>
                        )}
                      </View>
                      {unread ? (
                        <View
                          style={{
                            minWidth: 22,
                            height: 22,
                            borderRadius: 11,
                            paddingHorizontal: 6,
                            backgroundColor: "#ec4899",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 11,
                              color: "#ffffff",
                              fontFamily: "Inter_700Bold",
                            }}
                          >
                            {(item.unread_count ?? 0) > 99 ? "99+" : item.unread_count}
                          </Text>
                        </View>
                      ) : null}
                    </Pressable>
                  </Link>
                  <Pressable
                    hitSlop={10}
                    onPress={() =>
                      toggleStar.mutate({
                        conversationId: item.id,
                        starred: !item.starred,
                      })
                    }
                    style={{ marginLeft: 6, padding: 6 }}
                  >
                    <Star
                      size={18}
                      color={item.starred ? "#f59e0b" : "#cbd5e1"}
                      fill={item.starred ? "#f59e0b" : "none"}
                    />
                  </Pressable>
                  <Pressable
                    hitSlop={10}
                    onPress={() =>
                      toggleArchive.mutate({
                        conversationId: item.id,
                        archived: !item.archived,
                      })
                    }
                    style={{ marginLeft: 2, padding: 6 }}
                  >
                    {item.archived ? (
                      <ArchiveRestore size={18} color="#0ea5e9" />
                    ) : (
                      <Archive size={18} color="#cbd5e1" />
                    )}
                  </Pressable>
                </View>
              );
            }}
          />
        )}
      </View>
    </>
  );
}
