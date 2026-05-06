import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";

export interface ConversationListItem {
  id: string;
  type: "direct" | "group" | "ministry";
  name: string | null;
  ministry_key: string | null;
  avatar_url: string | null;
  updated_at: string;
  last_read_at: string | null;
  starred?: boolean;
  archived?: boolean;
  muted?: boolean;
  unread_count?: number;
  participants_count?: number;
  /** Dla type='direct' — email drugiego uczestnika (nie mój). */
  peer_email?: string | null;
  last_message?: {
    content: string | null;
    created_at: string;
    sender_email: string;
  } | null;
}

export interface MemberLite {
  email: string;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
  memberId: number | null;
}

const memberCache = new Map<string, MemberLite>();

const displayLabel = (m: MemberLite | undefined, email: string): string => {
  if (!m) return email;
  const parts = [m.firstName, m.lastName].filter(Boolean) as string[];
  if (parts.length > 0) return parts.join(" ");
  return email;
};

const initialsOf = (m: MemberLite | undefined, email: string): string => {
  if (m && (m.firstName || m.lastName)) {
    const f = m.firstName?.charAt(0).toUpperCase() ?? "";
    const l = m.lastName?.charAt(0).toUpperCase() ?? "";
    return (f + l).slice(0, 2) || email.charAt(0).toUpperCase();
  }
  return email.charAt(0).toUpperCase();
};

export type MemberMap = Record<string, MemberLite>;

const safeGet = (emails: MemberMap | undefined, email: string): MemberLite | undefined => {
  if (!emails) return undefined;
  // Po hydratacji z AsyncStorage może być plain object — działa tak samo jak Record.
  return (emails as any)[email];
};

export const memberDisplayName = (emails: MemberMap | undefined, email: string): string =>
  displayLabel(safeGet(emails, email), email);

export const memberInitials = (emails: MemberMap | undefined, email: string): string =>
  initialsOf(safeGet(emails, email), email);

export const memberPhotoUrl = (
  emails: MemberMap | undefined,
  email: string,
): string | null => safeGet(emails, email)?.photoUrl ?? null;

/**
 * Pobiera członków po ich emailach. Wynik jako Record email → MemberLite,
 * żeby był serializowalny przez AsyncStorage persister.
 */
export const useMembersByEmails = (emails: string[]) => {
  const uniqEmails = Array.from(new Set(emails.filter(Boolean)));
  return useQuery({
    // v2 — bump po dodaniu fallbacku do app_users (wymusza refetch przy persistowanym cache).
    queryKey: ["membersByEmails", "v2", uniqEmails.slice().sort().join(",")],
    queryFn: async (): Promise<MemberMap> => {
      if (uniqEmails.length === 0) return {};
      // Retry dla "pustych" wpisów (firstName=null, lastName=null) — może w międzyczasie pojawiły
      // się dane w app_users.
      const missing = uniqEmails.filter((e) => {
        const cached = memberCache.get(e);
        if (!cached) return true;
        return !cached.firstName && !cached.lastName;
      });
      if (missing.length > 0) {
        // Najpierw members (mają photo_url + first_name/last_name).
        const { data: membersRows, error: mErr } = await supabase
          .from("members")
          .select("id, email, first_name, last_name, photo_url")
          .in("email", missing);
        if (mErr) throw mErr;
        for (const row of (membersRows ?? []) as any[]) {
          if (row.email) {
            memberCache.set(row.email, {
              email: row.email,
              firstName: row.first_name ?? null,
              lastName: row.last_name ?? null,
              photoUrl: row.photo_url ?? null,
              memberId: row.id ?? null,
            });
          }
        }
        // Dla brakujących — fallback na app_users (full_name → split na first/last).
        const stillMissing = missing.filter((e) => !memberCache.has(e));
        if (stillMissing.length > 0) {
          const { data: usersRows } = await supabase
            .from("app_users")
            .select("email, full_name, avatar_url")
            .in("email", stillMissing);
          for (const row of (usersRows ?? []) as any[]) {
            if (!row.email) continue;
            const full = (row.full_name ?? "").trim();
            const parts = full.split(/\s+/).filter(Boolean);
            const firstName = parts[0] ?? null;
            const lastName = parts.length > 1 ? parts.slice(1).join(" ") : null;
            memberCache.set(row.email, {
              email: row.email,
              firstName,
              lastName,
              photoUrl: row.avatar_url ?? null,
              memberId: null,
            });
          }
        }
        // Cache miss-and-not-found jako null entries (zapobiega ponownym requestom).
        for (const e of missing) {
          if (!memberCache.has(e)) {
            memberCache.set(e, {
              email: e,
              firstName: null,
              lastName: null,
              photoUrl: null,
              memberId: null,
            });
          }
        }
      }
      const out: MemberMap = {};
      for (const e of uniqEmails) {
        const m = memberCache.get(e);
        if (m) out[e] = m;
      }
      return out;
    },
    staleTime: 5 * 60 * 1000,
    enabled: uniqEmails.length > 0,
  });
};

export type ConversationFilter =
  | "all"
  | "ministry"
  | "direct"
  | "starred"
  | "archived";

export const MINISTRY_CHANNEL_META: Record<
  string,
  { label: string; tint: string; bg: string }
> = {
  worship: { label: "Worship", tint: "#a855f7", bg: "#f3e8ff" },
  media: { label: "Media", tint: "#f97316", bg: "#ffedd5" },
  atmosfera: { label: "Atmosfera", tint: "#14b8a6", bg: "#ccfbf1" },
  kids: { label: "Dzieci", tint: "#eab308", bg: "#fef3c7" },
  groups: { label: "Grupy domowe", tint: "#3b82f6", bg: "#dbeafe" },
  mlodziezowka: { label: "Młodzieżówka", tint: "#f43f5e", bg: "#ffe4e6" },
};

export interface MessageAttachment {
  url: string;
  name: string;
  type: string;
  size?: number;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_email: string;
  content: string;
  attachments: MessageAttachment[] | null;
  reply_to_id: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

export const EDIT_WINDOW_MINUTES = 5;

export const canEditMessage = (msg: MessageRow, userEmail: string | null): boolean => {
  if (!userEmail || msg.sender_email !== userEmail) return false;
  if (msg.deleted_at) return false;
  const ageMs = Date.now() - new Date(msg.created_at).getTime();
  return ageMs <= EDIT_WINDOW_MINUTES * 60 * 1000;
};

export const useConversations = (userEmail: string | null) =>
  useQuery({
    queryKey: ["conversations", userEmail],
    queryFn: async (): Promise<ConversationListItem[]> => {
      if (!userEmail) return [];
      // Konwersacje, w których jestem uczestnikiem (z metadata: starred/archived/muted).
      const { data: parts, error: partsErr } = await supabase
        .from("conversation_participants")
        .select("conversation_id, last_read_at, starred, archived, muted")
        .eq("user_email", userEmail);
      if (partsErr) throw partsErr;
      const ids = (parts ?? []).map((p: any) => p.conversation_id);
      const lastReadByConv = new Map<string, string | null>(
        (parts ?? []).map((p: any) => [p.conversation_id, p.last_read_at ?? null]),
      );
      const flagsByConv = new Map<
        string,
        { starred: boolean; archived: boolean; muted: boolean }
      >(
        (parts ?? []).map((p: any) => [
          p.conversation_id,
          {
            starred: !!p.starred,
            archived: !!p.archived,
            muted: !!p.muted,
          },
        ]),
      );
      if (ids.length === 0) return [];

      const { data: convs, error: convErr } = await supabase
        .from("conversations")
        .select("id, type, name, ministry_key, avatar_url, updated_at")
        .in("id", ids)
        .order("updated_at", { ascending: false });
      if (convErr) throw convErr;

      // Ostatnie wiadomości — jeden round-trip per konwersacja byłby za drogi; pobierz wszystkie najnowsze przez RPC byłoby idealne,
      // ale dla MVP pobieramy je tylko dla widocznych (do 50).
      const visible = (convs ?? []).slice(0, 50);
      const visibleIds = visible.map((c: any) => c.id);
      const { data: messages, error: msgsErr } = await supabase
        .from("messages")
        .select("conversation_id, content, created_at, sender_email")
        .in("conversation_id", visibleIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (msgsErr) throw msgsErr;

      const lastByConv = new Map<string, any>();
      const allMessagesByConv = new Map<string, any[]>();
      for (const m of messages ?? []) {
        const cid = (m as any).conversation_id;
        if (!lastByConv.has(cid)) lastByConv.set(cid, m);
        const arr = allMessagesByConv.get(cid) ?? [];
        arr.push(m);
        allMessagesByConv.set(cid, arr);
      }

      // Unread count = wiadomości nowsze niż last_read_at, NIE od mnie.
      const unreadByConv = new Map<string, number>();
      for (const c of visible as any[]) {
        const cid = c.id;
        const lastRead = lastReadByConv.get(cid);
        const lastReadMs = lastRead ? new Date(lastRead).getTime() : 0;
        const all = allMessagesByConv.get(cid) ?? [];
        const count = all.filter(
          (m: any) =>
            m.sender_email !== userEmail &&
            new Date(m.created_at).getTime() > lastReadMs,
        ).length;
        unreadByConv.set(cid, count);
      }

      // Liczba uczestników per konwersacja + dla direct - email drugiego uczestnika.
      const { data: allParts } = await supabase
        .from("conversation_participants")
        .select("conversation_id, user_email")
        .in("conversation_id", visibleIds);
      const partsCountByConv = new Map<string, number>();
      const peerByConv = new Map<string, string>();
      for (const r of (allParts ?? []) as any[]) {
        partsCountByConv.set(
          r.conversation_id,
          (partsCountByConv.get(r.conversation_id) ?? 0) + 1,
        );
        // Pierwszy znaleziony uczestnik różny od mnie — to "peer" dla direct.
        if (r.user_email && r.user_email !== userEmail && !peerByConv.has(r.conversation_id)) {
          peerByConv.set(r.conversation_id, r.user_email);
        }
      }

      return visible.map((c: any) => {
        const flags = flagsByConv.get(c.id) ?? {
          starred: false,
          archived: false,
          muted: false,
        };
        return {
          id: c.id,
          type: c.type,
          name: c.name,
          ministry_key: c.ministry_key,
          avatar_url: c.avatar_url,
          updated_at: c.updated_at,
          last_read_at: lastReadByConv.get(c.id) ?? null,
          starred: flags.starred,
          archived: flags.archived,
          muted: flags.muted,
          unread_count: unreadByConv.get(c.id) ?? 0,
          participants_count: partsCountByConv.get(c.id) ?? 0,
          peer_email: c.type === "direct" ? peerByConv.get(c.id) ?? null : null,
          last_message: lastByConv.get(c.id) ?? null,
        };
      });
    },
    enabled: !!userEmail,
  });

export const useMessages = (conversationId: string) =>
  useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async (): Promise<MessageRow[]> => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as MessageRow[];
    },
    enabled: !!conversationId,
  });

export interface SendMessageInput {
  content: string;
  attachments?: MessageAttachment[];
  replyToId?: string | null;
}

export const useSendMessage = (conversationId: string, senderEmail: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SendMessageInput | string) => {
      if (!senderEmail) throw new Error("Brak zalogowanego użytkownika");
      const data =
        typeof input === "string"
          ? { content: input, attachments: undefined, replyToId: undefined }
          : input;
      const { error } = await (supabase.from("messages") as any).insert({
        conversation_id: conversationId,
        sender_email: senderEmail,
        content: data.content,
        attachments: data.attachments ?? [],
        reply_to_id: data.replyToId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
};

export const useEditMessage = (conversationId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const { error } = await (supabase.from("messages") as any)
        .update({ content, edited_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
    },
  });
};

export const useDeleteMessage = (conversationId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("messages") as any)
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
    },
  });
};

export const markConversationRead = async (
  conversationId: string,
  userEmail: string,
): Promise<void> => {
  await (supabase.from("conversation_participants") as any)
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("user_email", userEmail);
};

export const useToggleStarred = (userEmail: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, starred }: { conversationId: string; starred: boolean }) => {
      if (!userEmail) throw new Error("Brak zalogowanego");
      const { error } = await (supabase.from("conversation_participants") as any)
        .update({ starred })
        .eq("conversation_id", conversationId)
        .eq("user_email", userEmail);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
};

export const useToggleArchived = (userEmail: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      conversationId,
      archived,
    }: {
      conversationId: string;
      archived: boolean;
    }) => {
      if (!userEmail) throw new Error("Brak zalogowanego");
      const { error } = await (supabase.from("conversation_participants") as any)
        .update({ archived })
        .eq("conversation_id", conversationId)
        .eq("user_email", userEmail);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
};

export const useToggleMuted = (userEmail: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      conversationId,
      muted,
    }: {
      conversationId: string;
      muted: boolean;
    }) => {
      if (!userEmail) throw new Error("Brak zalogowanego");
      const { error } = await (supabase.from("conversation_participants") as any)
        .update({ muted })
        .eq("conversation_id", conversationId)
        .eq("user_email", userEmail);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversation", vars.conversationId] });
    },
  });
};

export interface ConversationDetails {
  id: string;
  type: "direct" | "group" | "ministry";
  name: string | null;
  ministry_key: string | null;
  avatar_url: string | null;
  participant_emails: string[];
  my_muted: boolean;
  my_starred: boolean;
}

export const useConversationDetails = (
  conversationId: string,
  userEmail: string | null,
) =>
  useQuery({
    queryKey: ["conversation", conversationId, userEmail],
    queryFn: async (): Promise<ConversationDetails | null> => {
      if (!conversationId) return null;
      const { data: conv, error } = await supabase
        .from("conversations")
        .select("id, type, name, ministry_key, avatar_url")
        .eq("id", conversationId)
        .maybeSingle();
      if (error) throw error;
      if (!conv) return null;
      const { data: parts } = await supabase
        .from("conversation_participants")
        .select("user_email, muted, starred")
        .eq("conversation_id", conversationId);
      const participants = (parts ?? []) as Array<{
        user_email: string;
        muted: boolean | null;
        starred: boolean | null;
      }>;
      const me = participants.find((p) => p.user_email === userEmail);
      return {
        id: (conv as any).id,
        type: (conv as any).type,
        name: (conv as any).name,
        ministry_key: (conv as any).ministry_key,
        avatar_url: (conv as any).avatar_url,
        participant_emails: participants.map((p) => p.user_email),
        my_muted: !!me?.muted,
        my_starred: !!me?.starred,
      };
    },
    enabled: !!conversationId,
  });

// =====================================================================
// Reactions
// =====================================================================

export const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

export interface ReactionRow {
  id: string;
  message_id: string;
  emoji: string;
  user_email: string;
}

export interface ReactionAggregate {
  emoji: string;
  count: number;
  users: string[];
  hasUserReacted: boolean;
}

/**
 * Reakcje dla wszystkich wiadomości w konwersacji — przy ~200 msg×6 emoji to wciąż <1k wierszy.
 * Wynik jako Record<messageId, ReactionAggregate[]> — od razu zagregowane do renderowania.
 */
export const useReactions = (conversationId: string, userEmail: string | null) =>
  useQuery({
    queryKey: ["reactions", conversationId, userEmail],
    queryFn: async (): Promise<Record<string, ReactionAggregate[]>> => {
      if (!conversationId) return {};
      // Najpierw lista message_id z konwersacji (tylko nieusunięte).
      const { data: msgs, error: mErr } = await supabase
        .from("messages")
        .select("id")
        .eq("conversation_id", conversationId)
        .is("deleted_at", null);
      if (mErr) throw mErr;
      const ids = (msgs ?? []).map((m: any) => m.id);
      if (ids.length === 0) return {};
      const { data, error } = await supabase
        .from("message_reactions")
        .select("id, message_id, emoji, user_email")
        .in("message_id", ids);
      if (error) {
        // Tabela może nie istnieć (świeży backend) — wracamy z pustym zestawem.
        if ((error as any).code === "42P01") return {};
        throw error;
      }
      const byMessage: Record<string, ReactionRow[]> = {};
      for (const r of (data ?? []) as ReactionRow[]) {
        (byMessage[r.message_id] ??= []).push(r);
      }
      const out: Record<string, ReactionAggregate[]> = {};
      for (const [mid, rows] of Object.entries(byMessage)) {
        const grouped: Record<string, ReactionAggregate> = {};
        for (const r of rows) {
          const g = (grouped[r.emoji] ??= {
            emoji: r.emoji,
            count: 0,
            users: [],
            hasUserReacted: false,
          });
          g.count += 1;
          g.users.push(r.user_email);
          if (r.user_email === userEmail) g.hasUserReacted = true;
        }
        out[mid] = Object.values(grouped);
      }
      return out;
    },
    enabled: !!conversationId,
  });

export const useToggleReaction = (
  conversationId: string,
  userEmail: string | null,
) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      if (!userEmail) throw new Error("Brak zalogowanego");
      // Sprawdź, czy ta sama reakcja już istnieje.
      const { data: existing, error: fErr } = await supabase
        .from("message_reactions")
        .select("id")
        .eq("message_id", messageId)
        .eq("user_email", userEmail)
        .eq("emoji", emoji)
        .maybeSingle();
      if (fErr && (fErr as any).code !== "PGRST116") throw fErr;
      const existingId = (existing as { id?: string } | null)?.id;
      if (existingId) {
        const { error } = await supabase
          .from("message_reactions")
          .delete()
          .eq("id", existingId);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from("message_reactions") as any).insert({
          message_id: messageId,
          user_email: userEmail,
          emoji,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reactions", conversationId] });
    },
  });
};

// =====================================================================
// Pinned messages
// =====================================================================

export interface PinnedRow {
  id: string;
  message_id: string;
  conversation_id: string;
  pinned_by: string;
  pinned_at: string;
}

export const usePinnedMessages = (conversationId: string) =>
  useQuery({
    queryKey: ["pinned", conversationId],
    queryFn: async (): Promise<PinnedRow[]> => {
      if (!conversationId) return [];
      const { data, error } = await supabase
        .from("pinned_messages")
        .select("id, message_id, conversation_id, pinned_by, pinned_at")
        .eq("conversation_id", conversationId)
        .order("pinned_at", { ascending: false });
      if (error) {
        if ((error as any).code === "42P01") return [];
        throw error;
      }
      return (data ?? []) as PinnedRow[];
    },
    enabled: !!conversationId,
  });

export const useTogglePin = (
  conversationId: string,
  userEmail: string | null,
) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      messageId,
      pinned,
    }: {
      messageId: string;
      pinned: boolean;
    }) => {
      if (!userEmail) throw new Error("Brak zalogowanego");
      if (pinned) {
        const { error } = await supabase
          .from("pinned_messages")
          .delete()
          .eq("message_id", messageId)
          .eq("conversation_id", conversationId);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from("pinned_messages") as any).insert({
          message_id: messageId,
          conversation_id: conversationId,
          pinned_by: userEmail,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pinned", conversationId] });
    },
  });
};

// =====================================================================
// In-conversation message search
// =====================================================================

export const useSearchMessages = (
  conversationId: string,
  query: string,
  enabled: boolean,
) =>
  useQuery({
    queryKey: ["messageSearch", conversationId, query.trim().toLowerCase()],
    queryFn: async (): Promise<MessageRow[]> => {
      const q = query.trim();
      if (!conversationId || q.length < 2) return [];
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .is("deleted_at", null)
        .ilike("content", `%${q}%`)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as MessageRow[];
    },
    enabled: enabled && !!conversationId && query.trim().length >= 2,
  });

// =====================================================================
// Forward message
// =====================================================================

// =====================================================================
// Read receipts (per-user)
// =====================================================================

export interface ReadReceiptRow {
  message_id: string;
  user_email: string;
  read_at: string;
}

/**
 * Mapa messageId → listy odbiorców, którzy już zobaczyli wiadomość.
 * Używane do pokazania ikonki "✓✓" na własnych bąbelkach.
 */
export const useReadReceipts = (conversationId: string) =>
  useQuery({
    queryKey: ["readReceipts", conversationId],
    queryFn: async (): Promise<Record<string, ReadReceiptRow[]>> => {
      if (!conversationId) return {};
      const { data: msgs, error: mErr } = await supabase
        .from("messages")
        .select("id")
        .eq("conversation_id", conversationId)
        .is("deleted_at", null);
      if (mErr) throw mErr;
      const ids = (msgs ?? []).map((m: any) => m.id);
      if (ids.length === 0) return {};
      const { data, error } = await supabase
        .from("message_read_receipts")
        .select("message_id, user_email, read_at")
        .in("message_id", ids);
      if (error) {
        if ((error as any).code === "42P01") return {};
        throw error;
      }
      const out: Record<string, ReadReceiptRow[]> = {};
      for (const r of (data ?? []) as ReadReceiptRow[]) {
        (out[r.message_id] ??= []).push(r);
      }
      return out;
    },
    enabled: !!conversationId,
  });

export const markMessagesAsRead = async (
  messageIds: string[],
  userEmail: string,
): Promise<void> => {
  if (messageIds.length === 0) return;
  const rows = messageIds.map((id) => ({
    message_id: id,
    user_email: userEmail,
    read_at: new Date().toISOString(),
  }));
  const { error } = await (supabase.from("message_read_receipts") as any).upsert(
    rows,
    { onConflict: "message_id,user_email", ignoreDuplicates: true },
  );
  if (error && (error as any).code !== "42P01") {
    if (__DEV__) console.warn("[messenger] markMessagesAsRead failed:", error.message);
  }
};

// =====================================================================
// Conversation media (attachments aggregated)
// =====================================================================

export interface MediaItem {
  url: string;
  name: string;
  type: string;
  size?: number;
  messageId: string;
  senderEmail: string;
  createdAt: string;
}

export const useConversationMedia = (conversationId: string, enabled: boolean) =>
  useQuery({
    queryKey: ["conversationMedia", conversationId],
    queryFn: async (): Promise<MediaItem[]> => {
      if (!conversationId) return [];
      const { data, error } = await supabase
        .from("messages")
        .select("id, attachments, sender_email, created_at")
        .eq("conversation_id", conversationId)
        .is("deleted_at", null)
        .not("attachments", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const out: MediaItem[] = [];
      for (const m of (data ?? []) as Array<{
        id: string;
        attachments: MessageAttachment[] | null;
        sender_email: string;
        created_at: string;
      }>) {
        if (!Array.isArray(m.attachments)) continue;
        for (const a of m.attachments) {
          if (!a?.url) continue;
          out.push({
            ...a,
            messageId: m.id,
            senderEmail: m.sender_email,
            createdAt: m.created_at,
          });
        }
      }
      return out;
    },
    enabled: enabled && !!conversationId,
  });

export const useForwardMessage = (senderEmail: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      conversationIds,
      content,
      attachments,
    }: {
      conversationIds: string[];
      content: string;
      attachments?: MessageAttachment[];
    }) => {
      if (!senderEmail) throw new Error("Brak zalogowanego");
      if (conversationIds.length === 0) return;
      const rows = conversationIds.map((cid) => ({
        conversation_id: cid,
        sender_email: senderEmail,
        content,
        attachments: attachments ?? [],
      }));
      const { error } = await (supabase.from("messages") as any).insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
};
