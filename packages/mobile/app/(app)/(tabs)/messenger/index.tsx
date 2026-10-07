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
import { Link, useRouter } from "expo-router";
import {
  Archive,
  ArchiveRestore,
  BellOff,
  Pin,
  Hash,
  House,
  Megaphone,
  MessageCircle,
  Search,
  SquarePen,
  Star,
  Users as UsersIcon,
  X,
  CloudOff,
  SearchX,
  CheckCheck,
} from "lucide-react-native";
import { PageHeader } from "../../../../src/components/ui/PageHeader";
import { EmptyState } from "../../../../src/components/ui/EmptyState";
import { usePermissions } from "../../../../src/lib/permissions";
import { friendlyError } from "../../../../src/lib/errors";
import {
  useConversations,
  useToggleStarred,
  useToggleArchived,
  useTogglePinConversation,
  useSetMute,
  useMembersByEmails,
  memberDisplayName,
  memberInitials,
  memberPhotoUrl,
  conversationTitle,
  MINISTRY_CHANNEL_META,
  type ConversationListItem,
  type MemberMap,
} from "../../../../src/features/messenger/api";
import {
  CONVERSATION_FILTERS,
  FILTER_LABELS,
  formatListTime,
  groupIntoSections,
  isHomeGroupChannel,
  isMutedNow,
  lastMessagePreview,
  matchesFilter,
  mutedUntilLabel,
  normEmail,
  type ConversationFilter,
} from "../../../../src/features/messenger/logic";
import { useRealtimeConversations } from "../../../../src/features/messenger/hooks/useRealtimeMessages";
import { useDrafts } from "../../../../src/features/messenger/drafts";
import { useMyBlocks } from "../../../../src/features/messenger/plus";
import { MuteSheet } from "../../../../src/features/messenger/components/MuteSheet";
import { useAuthSession } from "../../../../src/lib/auth";
import { usePresence, type PresenceStatus } from "../../../../src/lib/presence";
import { PresenceDot } from "../../../../src/features/messenger/components/PresenceDot";

// Kafelek ikony rozmowy (grupa, kanał) — neutralny papier ze słodem, jak web w motywie Avenit.
const Tile = ({ children, round }: { children: React.ReactNode; round?: boolean }) => (
  <View
    style={{
      width: 44,
      height: 44,
      borderRadius: round ? 22 : 12,
      backgroundColor: "#ECE8DE",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    {children}
  </View>
);

const ConversationAvatar = ({
  conv,
  members,
  peerStatus,
}: {
  conv: ConversationListItem;
  members: MemberMap;
  peerStatus?: PresenceStatus;
}) => {
  if (conv.type === "ministry") {
    if (isHomeGroupChannel(conv)) {
      return (
        <Tile>
          <House size={20} color="#2A2312" strokeWidth={2.2} />
        </Tile>
      );
    }
    const meta = conv.ministry_key ? MINISTRY_CHANNEL_META[conv.ministry_key] : null;
    return (
      <Tile>
        <Hash size={20} color={meta?.tint ?? "#2A2312"} strokeWidth={2.4} />
      </Tile>
    );
  }
  if (conv.type === "announcement") {
    return (
      <Tile>
        <Megaphone size={20} color="#2A2312" />
      </Tile>
    );
  }
  if (conv.type === "group") {
    return (
      <Tile round>
        <UsersIcon size={20} color="#2A2312" />
      </Tile>
    );
  }
  // Rozmowa 1:1: zdjęcie drugiej osoby (konto), inaczej inicjały — jak web.
  const otherEmail = conv.peer_email ?? null;
  const photo = otherEmail ? memberPhotoUrl(members, otherEmail) : null;
  const initials = otherEmail ? memberInitials(members, otherEmail) : (conv.name ?? "?").charAt(0).toUpperCase();
  return (
    <View>
      {photo ? (
        <Image source={{ uri: photo }} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#ECE8DE" }} />
      ) : (
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: "#FFF1C2",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#8A6606", fontFamily: "Manrope_700Bold", fontSize: 14 }}>{initials}</Text>
        </View>
      )}
      {peerStatus ? <PresenceDot status={peerStatus} size={12} /> : null}
    </View>
  );
};

export default function MessengerScreen() {
  const router = useRouter();
  const { user } = useAuthSession();
  const myEmail = user?.email ?? null;
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const [search, setSearch] = useState("");
  const { data, isLoading, isError, error, refetch, isRefetching } = useConversations(myEmail);
  const toggleStar = useToggleStarred(myEmail);
  const toggleArchive = useToggleArchived(myEmail);
  const togglePin = useTogglePinConversation(myEmail);
  const setMute = useSetMute(myEmail);
  const [muteTarget, setMuteTarget] = useState<ConversationListItem | null>(null);
  useRealtimeConversations(myEmail);
  // Szkice (K11) i zablokowane osoby (K10) — tylko do podglądu na liście.
  const drafts = useDrafts(myEmail);
  const blocked = useMyBlocks(myEmail).data;
  const blockedSet = useMemo(() => new Set(blocked ?? []), [blocked]);
  // Jak serwer: gwiazdka/przypięcie/archiwum to zapis własnego wiersza uczestnika,
  // nowa rozmowa — utworzenie rozmowy i uczestników. Bez uprawnień nie kusimy przyciskiem.
  const perms = usePermissions();
  const canManage = perms.can("res:conversation_participants:update");
  const canCreate =
    perms.can("res:conversations:create") && perms.can("res:conversation_participants:create");

  // Imiona i zdjęcia: druga osoba rozmowy 1:1 + nadawcy ostatnich wiadomości.
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

  // Obecność rozmówców z rozmów 1:1.
  const peerEmails = useMemo(() => {
    const set = new Set<string>();
    for (const c of data ?? []) if (c.type === "direct" && c.peer_email) set.add(c.peer_email);
    return Array.from(set);
  }, [data]);
  const { getStatus } = usePresence(peerEmails);

  const previewOf = (c: ConversationListItem) =>
    c.last_message
      ? lastMessagePreview(c.last_message, {
          myEmail,
          convType: c.type,
          senderName: memberDisplayName(members, c.last_message.sender_email),
        }) || "Wiadomość"
      : "";

  // Jak web: filtr (zarchiwizowane tylko w „Archiwum”); szukanie obejmuje wszystkie rozmowy.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((c: ConversationListItem) => {
      if (!q) return matchesFilter(c, filter, myEmail);
      if (filter !== "all" && !matchesFilter(c, filter, myEmail)) return false;
      return [conversationTitle(c, members), c.name ?? "", c.last_message?.content ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [data, filter, search, members, myEmail]);

  const totalUnread = (data ?? []).reduce(
    (sum: number, c: ConversationListItem) => sum + (c.archived ? 0 : c.unread_count ?? 0),
    0,
  );

  // Sekcje jak w webie: Przypięte, Ogłoszenia, Prywatne, Grupy, Kanały (służby i grupy domowe).
  const sections = useMemo(
    () => groupIntoSections<ConversationListItem>(filtered).map((s) => ({ key: s.key, title: s.title, data: s.items })),
    [filtered],
  );

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: "#F6F4EE" }}>
        <PageHeader
          title="Komunikator"
          subtitle={totalUnread > 0 ? `Nieprzeczytane: ${totalUnread}` : "Wiadomości wspólnoty"}
          Icon={MessageCircle}
          right={
            canCreate ? (
              <Pressable
                onPress={() => router.push("/(app)/messenger/new")}
                accessibilityRole="button"
                accessibilityLabel="Nowa rozmowa"
                hitSlop={8}
                className="active:opacity-70"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: "#2A2312",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <SquarePen size={18} color="#ffffff" strokeWidth={2.2} />
              </Pressable>
            ) : null
          }
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
              backgroundColor: "#F1EEE6",
              borderWidth: 1,
              borderColor: "#E6E1D5",
            }}
          >
            <Search size={16} color="#6E685A" />
            <TextInput
              style={{ flex: 1, fontSize: 14, color: "#2A2312", fontFamily: "Manrope_500Medium" }}
              placeholder="Szukaj rozmów…"
              placeholderTextColor="#6E685A"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              accessibilityLabel="Szukaj rozmów"
            />
            {search ? (
              <Pressable onPress={() => setSearch("")} hitSlop={8} accessibilityLabel="Wyczyść wyszukiwanie">
                <X size={14} color="#6E685A" />
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={{ height: 44 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8, gap: 6, alignItems: "center" }}
          >
            {CONVERSATION_FILTERS.map((key) => {
              const active = filter === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setFilter(key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 7,
                    borderRadius: 999,
                    backgroundColor: active ? "#2A2312" : "#F1EEE6",
                    borderWidth: 1,
                    borderColor: active ? "#2A2312" : "#E6E1D5",
                  }}
                >
                  <Text
                    style={{ fontSize: 13, color: active ? "#ffffff" : "#2A2312", fontFamily: "Manrope_600SemiBold" }}
                  >
                    {FILTER_LABELS[key]}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {isLoading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color="#2A2312" />
          </View>
        ) : isError && !data ? (
          <EmptyState
            Icon={CloudOff}
            title="Nie udało się wczytać rozmów"
            hint={friendlyError(error)}
            actionLabel="Spróbuj ponownie"
            onAction={() => refetch()}
            style={{ marginTop: 24 }}
          />
        ) : (
          <SectionList
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 120 }}
            sections={sections}
            keyExtractor={(item) => item.id}
            stickySectionHeadersEnabled={false}
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#2A2312" />}
            ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: "#ECE8DE" }} />}
            renderSectionHeader={({ section: { title } }) => (
              <Text
                style={{
                  fontSize: 11,
                  color: "#6B6557",
                  letterSpacing: 1.4,
                  textTransform: "uppercase",
                  fontFamily: "Manrope_700Bold",
                  marginTop: 14,
                  marginBottom: 6,
                }}
              >
                {title}
              </Text>
            )}
            ListEmptyComponent={
              search.trim() ? (
                <EmptyState
                  Icon={SearchX}
                  title={`Nic nie znaleziono dla „${search.trim()}”`}
                  hint="Sprawdź pisownię albo wpisz imię osoby lub nazwę grupy."
                  style={{ marginTop: 24 }}
                />
              ) : filter === "unread" ? (
                <EmptyState
                  Icon={CheckCheck}
                  title="Wszystko przeczytane"
                  hint="Nie masz nieprzeczytanych wiadomości."
                  actionLabel="Pokaż wszystkie"
                  onAction={() => setFilter("all")}
                  style={{ marginTop: 24 }}
                />
              ) : filter !== "all" ? (
                <EmptyState
                  Icon={filter === "archived" ? Archive : Star}
                  title={filter === "archived" ? "Brak archiwum" : "Brak ulubionych"}
                  hint={
                    filter === "archived"
                      ? "Zarchiwizowane rozmowy pojawią się tutaj."
                      : "Oznacz rozmowę gwiazdką, by ją tu zobaczyć."
                  }
                  actionLabel="Pokaż wszystkie"
                  onAction={() => setFilter("all")}
                  style={{ marginTop: 24 }}
                />
              ) : (
                <EmptyState
                  Icon={MessageCircle}
                  title="Brak rozmów"
                  hint={
                    canCreate
                      ? "Napisz do kogoś ze wspólnoty albo załóż grupę."
                      : "Gdy ktoś do Ciebie napisze albo doda Cię do grupy, rozmowa pojawi się tutaj."
                  }
                  actionLabel={canCreate ? "Nowa rozmowa" : undefined}
                  onAction={canCreate ? () => router.push("/(app)/messenger/new") : undefined}
                  style={{ marginTop: 24 }}
                />
              )
            }
            renderItem={({ item }) => {
              const last = item.last_message;
              const unreadCount = item.unread_count ?? 0;
              const unread = unreadCount > 0;
              const title = conversationTitle(item, members);
              const muted = isMutedNow(item);
              const mutedUntil = muted ? mutedUntilLabel(item.muted_until) : "";
              const draft = drafts[item.id];
              const peerBlocked = item.type === "direct" && !!item.peer_email && blockedSet.has(normEmail(item.peer_email));
              return (
                <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12 }}>
                  <Link
                    push
                    href={{ pathname: "/(app)/messenger/[conversationId]", params: { conversationId: item.id } }}
                    asChild
                  >
                    <Pressable
                      onLongPress={canManage ? () => setMuteTarget(item) : undefined}
                      delayLongPress={400}
                      accessibilityRole="button"
                      accessibilityLabel={[
                        title,
                        unread ? `nieprzeczytane: ${unreadCount}` : null,
                        muted ? `wyciszona${mutedUntil ? ` ${mutedUntil}` : ""}` : null,
                        draft ? "masz niewysłany szkic" : null,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                      accessibilityHint={canManage ? "Przytrzymaj, aby wyciszyć powiadomienia" : undefined}
                      className="active:opacity-70"
                      style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12 }}
                    >
                      <ConversationAvatar
                        conv={item}
                        members={members}
                        peerStatus={item.type === "direct" && item.peer_email ? getStatus(item.peer_email) : undefined}
                      />
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Text
                            numberOfLines={1}
                            style={{
                              flex: 1,
                              fontSize: 15,
                              color: "#2A2312",
                              letterSpacing: -0.2,
                              fontFamily: unread ? "Manrope_700Bold" : "Manrope_500Medium",
                            }}
                          >
                            {title}
                          </Text>
                          {muted ? (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                              <BellOff size={12} color="#6E685A" />
                              {mutedUntil ? (
                                <Text style={{ fontSize: 10, color: "#6E685A", fontFamily: "Manrope_600SemiBold" }}>
                                  {mutedUntil}
                                </Text>
                              ) : null}
                            </View>
                          ) : null}
                          {last ? (
                            <Text
                              style={{
                                fontSize: 11,
                                color: unread ? "#2A2312" : "#6E685A",
                                fontFamily: unread ? "Manrope_700Bold" : "Manrope_500Medium",
                              }}
                            >
                              {formatListTime(last.created_at)}
                            </Text>
                          ) : null}
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
                          {draft && !unread ? (
                            <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, color: "#6B6557", fontFamily: "Manrope_400Regular" }}>
                              <Text style={{ color: "#8A6606", fontFamily: "Manrope_700Bold" }}>Szkic: </Text>
                              {draft.replace(/\s+/g, " ")}
                            </Text>
                          ) : (
                            <Text
                              numberOfLines={1}
                              style={{
                                flex: 1,
                                fontSize: 13,
                                color: last ? (unread ? "#2A2312" : "#6B6557") : "#6E685A",
                                fontStyle: last && !peerBlocked ? "normal" : "italic",
                                fontFamily: unread ? "Manrope_500Medium" : "Manrope_400Regular",
                              }}
                            >
                              {peerBlocked ? "Osoba zablokowana" : last ? previewOf(item) : "Brak wiadomości"}
                            </Text>
                          )}
                          {unread ? (
                            <View
                              style={{
                                minWidth: 20,
                                height: 20,
                                borderRadius: 10,
                                paddingHorizontal: 6,
                                backgroundColor: "#2A2312",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Text style={{ fontSize: 11, color: "#ffffff", fontFamily: "Manrope_700Bold" }}>
                                {unreadCount > 99 ? "99+" : unreadCount}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    </Pressable>
                  </Link>
                  {canManage ? (
                    <>
                      <Pressable
                        hitSlop={10}
                        onPress={() => togglePin.mutate({ conversationId: item.id, pinned: !item.pinned })}
                        accessibilityRole="button"
                        accessibilityState={{ selected: !!item.pinned }}
                        accessibilityLabel={item.pinned ? "Odepnij rozmowę" : "Przypnij rozmowę"}
                        style={{ marginLeft: 6, padding: 6 }}
                      >
                        <Pin size={18} color={item.pinned ? "#8A6606" : "#6E685A"} fill={item.pinned ? "#8A6606" : "none"} />
                      </Pressable>
                      <Pressable
                        hitSlop={10}
                        onPress={() => toggleStar.mutate({ conversationId: item.id, starred: !item.starred })}
                        accessibilityRole="button"
                        accessibilityState={{ selected: !!item.starred }}
                        accessibilityLabel={item.starred ? "Usuń z ulubionych" : "Dodaj do ulubionych"}
                        style={{ marginLeft: 2, padding: 6 }}
                      >
                        <Star size={18} color={item.starred ? "#8A6606" : "#6E685A"} fill={item.starred ? "#FFBE0B" : "none"} />
                      </Pressable>
                      <Pressable
                        hitSlop={10}
                        onPress={() => toggleArchive.mutate({ conversationId: item.id, archived: !item.archived })}
                        accessibilityRole="button"
                        accessibilityLabel={item.archived ? "Przywróć z archiwum" : "Przenieś do archiwum"}
                        style={{ marginLeft: 2, padding: 6 }}
                      >
                        {item.archived ? <ArchiveRestore size={18} color="#6B6557" /> : <Archive size={18} color="#6E685A" />}
                      </Pressable>
                    </>
                  ) : null}
                </View>
              );
            }}
          />
        )}
      </View>

      <MuteSheet
        visible={!!muteTarget}
        onClose={() => setMuteTarget(null)}
        muted={muteTarget ? isMutedNow(muteTarget) : false}
        mutedUntil={muteTarget?.muted_until ?? null}
        title={muteTarget ? conversationTitle(muteTarget, members) : undefined}
        onPick={(choice) => {
          const target = muteTarget;
          if (!target || setMute.isPending) return;
          setMute.mutate({ conversationId: target.id, choice });
        }}
      />
    </>
  );
}
