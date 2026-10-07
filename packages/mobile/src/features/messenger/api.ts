import { Alert } from "react-native";
import { playSendSound } from "../../lib/sounds";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { friendlyError } from "../../lib/errors";
import { toast } from "../../lib/toast";
import {
  normEmail,
  sameEmail,
  emailPattern,
  summarizeMessages,
  conversationsMissingLast,
  readSince,
  readMarkTimestamp,
  sortConversations,
  applyIncomingMessage,
  type ConversationFilter,
} from "./logic";

// Kolejność zapisu wymuszona przez serwer (packages/api/src/dataapi/komunikator.js), jak web:
//  1) rozmowa (created_by = zalogowany), 2) skład — twórca jako 'admin', cały w JEDNYM zapisie
//  (pierwszy skład dodaje tylko twórca pustej rozmowy), 3) dopiero potem wiadomości (pisze
//  tylko uczestnik; w kanale „tylko administratorzy” — administrator rozmowy).
// Zapisy, które mają dotrzeć do innych przez realtime, idą z `.select()`.

// Porównanie e-maili i wzorzec ILIKE — wspólne z webem (logic.ts ↔ chatLogic.js).
export { normEmail, sameEmail, emailPattern };
export type { ConversationFilter };

// Czy mogę pisać w rozmowie (kanał „tylko administratorzy”: tylko administratorzy rozmowy).
export const canPostIn = (
  c: { posting_policy?: string | null; my_role?: string | null } | null | undefined,
): boolean => {
  if (!c) return false;
  return (c.posting_policy || "everyone") !== "admins" || c.my_role === "admin";
};

// Błąd zapisu w czacie po ludzku (hooki listy rozmów nie mają własnej obsługi błędów).
const alertError = (title: string, fallback: string) => (e: unknown) =>
  Alert.alert(title, friendlyError(e, fallback));

export interface ConversationListItem {
  id: string;
  type: "direct" | "group" | "ministry" | "announcement";
  name: string | null;
  ministry_key: string | null;
  avatar_url: string | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at: string;
  last_message_at?: string | null;
  last_read_at: string | null;
  starred?: boolean;
  archived?: boolean;
  muted?: boolean;
  pinned?: boolean;
  posting_policy?: "everyone" | "admins";
  /** Moja rola w rozmowie ('admin' | 'member'). */
  my_role?: string | null;
  description?: string | null;
  unread_count?: number;
  participants_count?: number;
  /** Dla type='direct' — email drugiego uczestnika (nie mój). */
  peer_email?: string | null;
  last_message?: {
    id?: string;
    conversation_id?: string;
    content: string | null;
    created_at: string;
    sender_email: string;
    message_type?: string | null;
    attachments?: MessageAttachment[] | null;
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
 * Imiona i zdjęcia osób po e-mailach. Wynik jako Record email → MemberLite (serializowalny przez
 * AsyncStorage persister). Zdjęcie — jak w webie — z konta (app_users.avatar_url; tabela members
 * zdjęć nie ma). Imię: kartoteka członków (gdy rola ją widzi), inaczej pełna nazwa z konta.
 * Dopasowanie bez względu na wielkość liter (wiersze uczestników bywają zapisane inaczej niż konto).
 */
export const useMembersByEmails = (emails: string[]) => {
  const uniqEmails = Array.from(new Set(emails.filter(Boolean)));
  return useQuery({
    // v3 — zdjęcia z app_users dla wszystkich (wymusza refetch przy persistowanym cache).
    queryKey: ["membersByEmails", "v3", uniqEmails.slice().sort().join(",")],
    queryFn: async (): Promise<MemberMap> => {
      if (uniqEmails.length === 0) return {};
      const missing = uniqEmails.filter((e) => !memberCache.has(normEmail(e)));
      if (missing.length > 0) {
        const variants = Array.from(new Set(missing.flatMap((e) => [e, normEmail(e)])));
        // Zwykły członek nie ma dostępu do `members` (403) — wtedy same dane z kont.
        const [membersRes, usersRes] = await Promise.all([
          supabase.from("members").select("id, email, first_name, last_name").in("email", variants),
          supabase.from("app_users").select("email, full_name, avatar_url").in("email", variants),
        ]);
        const membersBy = new Map<string, any>();
        for (const row of (((membersRes as any).data ?? []) as any[])) {
          if (row.email && !membersBy.has(normEmail(row.email))) membersBy.set(normEmail(row.email), row);
        }
        const usersBy = new Map<string, any>();
        for (const row of (((usersRes as any).data ?? []) as any[])) {
          if (row.email && !usersBy.has(normEmail(row.email))) usersBy.set(normEmail(row.email), row);
        }
        for (const e of missing) {
          const k = normEmail(e);
          const m = membersBy.get(k);
          const u = usersBy.get(k);
          let firstName: string | null = m?.first_name ?? null;
          let lastName: string | null = m?.last_name ?? null;
          if (!firstName && !lastName && u?.full_name) {
            const parts = String(u.full_name).trim().split(/\s+/).filter(Boolean);
            firstName = parts[0] ?? null;
            lastName = parts.length > 1 ? parts.slice(1).join(" ") : null;
          }
          memberCache.set(k, {
            email: e,
            firstName,
            lastName,
            photoUrl: u?.avatar_url ?? null,
            memberId: m?.id ?? null,
          });
        }
      }
      const out: MemberMap = {};
      for (const e of uniqEmails) {
        const m = memberCache.get(normEmail(e));
        if (m) out[e] = m;
      }
      return out;
    },
    staleTime: 5 * 60 * 1000,
    enabled: uniqEmails.length > 0,
  });
};

// Kanały służb — klucze jak w bazie (conversations.ministry_key) i nazwy jak w webie
// (messageHelpers.ministryKeyToName). Ikona kanału neutralna (marka: bez tęczy kolorów).
const MINISTRY_TILE = { tint: "#2A2312", bg: "#ECE8DE" };
export const MINISTRY_CHANNEL_META: Record<string, { label: string; tint: string; bg: string }> = {
  worship_team: { label: "Zespół Uwielbienia", ...MINISTRY_TILE },
  media_team: { label: "Media Team", ...MINISTRY_TILE },
  atmosfera_team: { label: "Atmosfera Team", ...MINISTRY_TILE },
  kids_ministry: { label: "Małe Avenit", ...MINISTRY_TILE },
  home_groups: { label: "Liderzy Grup Domowych", ...MINISTRY_TILE },
  youth_ministry: { label: "Młodzieżówka", ...MINISTRY_TILE },
  prayer_team: { label: "Grupa Modlitewna", ...MINISTRY_TILE },
  welcome_team: { label: "Zespół Powitalny", ...MINISTRY_TILE },
  small_groups: { label: "Grupy Domowe", ...MINISTRY_TILE },
  admin_team: { label: "Administracja", ...MINISTRY_TILE },
};

// Nazwa rozmowy na liście i w nagłówku — jak w webie: kanał służby po nazwie służby,
// rozmowa 1:1 po drugiej osobie, reszta po nazwie.
export const conversationTitle = (
  c: { type?: string | null; name?: string | null; ministry_key?: string | null; peer_email?: string | null },
  members: MemberMap,
): string => {
  if (c.type === "ministry") {
    return (c.ministry_key ? MINISTRY_CHANNEL_META[c.ministry_key]?.label : null) || c.name || c.ministry_key || "Kanał służby";
  }
  if (c.type === "direct") return c.peer_email ? memberDisplayName(members, c.peer_email) : c.name || "Rozmowa";
  return c.name || (c.type === "announcement" ? "Kanał ogłoszeń" : "Grupa");
};

export interface MessageAttachment {
  url: string;
  name: string;
  type: string;
  /** Rozmiar pliku w bajtach (starsze nagrania z telefonu: długość w ms — patrz voiceDurationMs). */
  size?: number;
  /** Głosówka: długość w sekundach (jak web). */
  duration?: number;
  isVoiceMessage?: boolean;
}

export type MessageType = "text" | "poll" | "prayer" | "event" | "system";

export interface PollOption { id: string; text: string }
export interface PollMetadata {
  question: string;
  options: PollOption[];
  multiple?: boolean;
  closes_at?: string | null;
}
export interface PrayerMetadata { title: string }
export interface EventMetadata {
  event_id?: string;
  title: string;
  date?: string;
  time?: string;
  location?: string;
  max_participants?: number;
  description?: string;
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
  // Komunikator „WhatsApp" (migracja 064): bogate typy + metadane + wzmianki (@).
  message_type?: MessageType;
  metadata?: Record<string, any> | null;
  mentions?: string[] | null;
  /** Przekazana wiadomość — id oryginału (jak web). */
  forwarded_from?: string | null;
}

// Jak web (MessageBubble): edytować można własną wiadomość tekstową z treścią — bez limitu
// czasu; ankiet, wydarzeń i próśb o modlitwę nie edytujemy.
export const canEditMessage = (msg: MessageRow, userEmail: string | null): boolean => {
  if (!userEmail || !sameEmail(msg.sender_email, userEmail)) return false;
  if (msg.deleted_at) return false;
  if (msg.message_type && msg.message_type !== "text") return false;
  return !!msg.content;
};

// Ostatnie wiadomości listy: jedna paczka najnowszych (lekkie kolumny); gdy paczka jest pełna,
// rozmowom bez wiadomości w paczce dociągamy ostatnią osobno (zwykle zero zapytań). Jak web.
const RECENT_LIMIT = 800;
const LAST_MSG_COLS = "id, conversation_id, content, sender_email, created_at, message_type, attachments";

const fetchRecentMessages = async (ids: string[]): Promise<any[]> => {
  const { data, error } = await supabase
    .from("messages")
    .select(LAST_MSG_COLS)
    .in("conversation_id", ids)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(RECENT_LIMIT);
  if (error) throw error;
  const rows = (data ?? []) as any[];
  const missing = conversationsMissingLast(rows, ids, RECENT_LIMIT);
  if (!missing.length) return rows;
  const extra = await Promise.all(
    missing.map((id) =>
      supabase
        .from("messages")
        .select(LAST_MSG_COLS)
        .eq("conversation_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1),
    ),
  );
  return rows.concat(...extra.map((r: any) => (r.data ?? []) as any[]));
};

export const conversationsKey = (userEmail: string | null) => ["conversations", userEmail] as const;

export const useConversations = (userEmail: string | null) =>
  useQuery({
    queryKey: conversationsKey(userEmail),
    queryFn: async (): Promise<ConversationListItem[]> => {
      if (!userEmail) return [];
      // Rozmowy, w których jestem (z moimi ustawieniami: ulubione/archiwum/wyciszenie/przypięcie).
      // ilike — wiersz uczestnika bywa zapisany inną wielkością liter (np. z tabeli zespołu).
      const { data: parts, error: partsErr } = await supabase
        .from("conversation_participants")
        .select("conversation_id, last_read_at, joined_at, starred, archived, muted, pinned, role")
        .ilike("user_email", emailPattern(userEmail));
      if (partsErr) throw partsErr;
      const mine = (parts ?? []) as any[];
      const ids = mine.map((p) => String(p.conversation_id));
      if (ids.length === 0) return [];
      const myByConv = new Map<string, any>(mine.map((p) => [String(p.conversation_id), p]));

      const { data: convs, error: convErr } = await supabase
        .from("conversations")
        .select("id, type, name, ministry_key, avatar_url, created_by, created_at, updated_at, last_message_at, description, posting_policy")
        .in("id", ids);
      if (convErr) throw convErr;

      // Ostatnia wiadomość i licznik nieprzeczytanych — ta sama logika co web (logic.ts):
      // cudze wiadomości nowsze niż moje „przeczytane” (last_read_at, bez niego — dołączenie).
      const messages = await fetchRecentMessages(ids);
      const sinceByConv = new Map<string, unknown>(mine.map((p) => [String(p.conversation_id), readSince(p)]));
      const { last, unread } = summarizeMessages(messages, userEmail, sinceByConv);

      // Liczba uczestników + dla rozmowy 1:1 e-mail drugiej osoby.
      const { data: allParts, error: allPartsErr } = await supabase
        .from("conversation_participants")
        .select("conversation_id, user_email")
        .in("conversation_id", ids);
      if (allPartsErr) throw allPartsErr;
      const partsCountByConv = new Map<string, number>();
      const peerByConv = new Map<string, string>();
      for (const r of (allParts ?? []) as any[]) {
        const cid = String(r.conversation_id);
        partsCountByConv.set(cid, (partsCountByConv.get(cid) ?? 0) + 1);
        if (r.user_email && !sameEmail(r.user_email, userEmail) && !peerByConv.has(cid)) {
          peerByConv.set(cid, r.user_email);
        }
      }

      const result: ConversationListItem[] = ((convs ?? []) as any[]).map((c) => {
        const cid = String(c.id);
        const me = myByConv.get(cid) ?? {};
        return {
          id: cid,
          type: c.type,
          name: c.name,
          ministry_key: c.ministry_key,
          avatar_url: c.avatar_url,
          created_by: c.created_by ?? null,
          created_at: c.created_at ?? null,
          updated_at: c.updated_at,
          last_message_at: c.last_message_at ?? null,
          last_read_at: me.last_read_at ?? null,
          starred: !!me.starred,
          archived: !!me.archived,
          muted: !!me.muted,
          pinned: !!me.pinned,
          posting_policy: (c.posting_policy as "everyone" | "admins") ?? "everyone",
          my_role: me.role ?? null,
          description: c.description ?? null,
          unread_count: unread[cid] ?? 0,
          participants_count: partsCountByConv.get(cid) ?? 0,
          peer_email: c.type === "direct" ? peerByConv.get(cid) ?? null : null,
          last_message: last[cid] ?? null,
        };
      });
      // Jak web: przypięte na górze, potem od najświeższej wiadomości.
      return result.sort(sortConversations);
    },
    enabled: !!userEmail,
  });

// Nowa wiadomość (wysłana albo z realtime) na liście rozmów od razu — bez czekania na pobranie.
export const applyMessageToConversations = (
  qc: ReturnType<typeof useQueryClient>,
  userEmail: string | null,
  msg: Partial<MessageRow> | null | undefined,
  openId: string | null = null,
) => {
  if (!userEmail || !msg?.conversation_id) return;
  qc.setQueryData<ConversationListItem[]>(conversationsKey(userEmail), (prev: ConversationListItem[] | undefined) =>
    applyIncomingMessage(prev, msg as any, userEmail, { openId }) as ConversationListItem[] | undefined,
  );
};

export const useMessages = (conversationId: string) =>
  useQuery({
    queryKey: ["messages", conversationId],
    // Wątek zawsze świeży przy wejściu (np. z powiadomienia) — cache pokazujemy od razu,
    // ale dociągamy nowe wiadomości, zamiast ufać danym sprzed kilku minut.
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async (): Promise<MessageRow[]> => {
      // Pobierz NAJNOWSZE 200 (desc + limit), potem odwróć do rosnącej kolejności
      // do wyświetlania — inaczej w rozmowach >200 wiadomości widać samą starą historię,
      // a świeżo wysłana wiadomość znika po refetchu.
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return ((data ?? []) as MessageRow[]).reverse();
    },
    enabled: !!conversationId,
  });

export interface SendMessageInput {
  content: string;
  attachments?: MessageAttachment[];
  replyToId?: string | null;
  // Bogate typy (spec §2) + wzmianki (@, spec §3). 4. argument wstecznie zgodny.
  messageType?: MessageType;
  metadata?: Record<string, any>;
  mentions?: string[];
}

// Dopisz wiadomość do cache wątku bez duplikatów (wysłana albo z realtime).
const appendToThread = (qc: ReturnType<typeof useQueryClient>, conversationId: string, row: MessageRow) =>
  qc.setQueryData<MessageRow[]>(["messages", conversationId], (prev: MessageRow[] | undefined) => {
    if (!prev) return [row];
    if (prev.some((m: MessageRow) => m.id === row.id)) return prev;
    return [...prev, row];
  });

export const useSendMessage = (conversationId: string, senderEmail: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SendMessageInput | string): Promise<MessageRow | null> => {
      if (!senderEmail) throw new Error("Twoja sesja wygasła. Zaloguj się ponownie.");
      if (!conversationId) throw new Error("Nie wybrano rozmowy.");
      const data: SendMessageInput =
        typeof input === "string" ? { content: input } : input;
      // .select() — wiersz wraca od razu (pokazujemy go bez czekania), a serwer rozsyła go
      // uczestnikom przez realtime. Błąd (np. kanał „tylko administratorzy”) rzucamy dalej.
      const { data: row, error } = await (supabase.from("messages") as any)
        .insert({
          conversation_id: conversationId,
          sender_email: senderEmail,
          content: data.content,
          attachments: data.attachments ?? [],
          reply_to_id: data.replyToId ?? null,
          message_type: data.messageType ?? "text",
          metadata: data.metadata ?? {},
          mentions: data.mentions ?? [],
        })
        .select()
        .single();
      if (error) throw error;
      return (row as MessageRow) ?? null;
    },
    onSuccess: (row) => {
      playSendSound();
      if (row?.id) {
        appendToThread(qc, conversationId, row);
        // Lista rozmów od razu: rozmowa na górę z „Ty: …” (pełne odświeżenie poniżej).
        applyMessageToConversations(qc, senderEmail, row, conversationId);
      } else qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
};

// Edycja własnej wiadomości. Serwer zawęża zapis do autora (lub administratora rozmowy);
// pusty wynik = brak prawa do tej wiadomości.
export const useEditMessage = (conversationId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }): Promise<MessageRow> => {
      const { data, error } = await (supabase.from("messages") as any)
        .update({ content, edited_at: new Date().toISOString() })
        .eq("id", id)
        .select();
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as MessageRow | undefined;
      if (!row) throw new Error("Możesz edytować tylko własne wiadomości.");
      return row;
    },
    onSuccess: (row) => {
      qc.setQueryData<MessageRow[]>(["messages", conversationId], (prev: MessageRow[] | undefined) =>
        prev ? prev.map((m: MessageRow) => (m.id === row.id ? { ...m, ...row } : m)) : prev,
      );
    },
  });
};

// Usunięcie (miękkie) własnej wiadomości — znika u wszystkich przez realtime.
export const useDeleteMessage = (conversationId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await (supabase.from("messages") as any)
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .select("id, conversation_id, deleted_at");
      if (error) throw error;
      if (!data || (Array.isArray(data) && data.length === 0)) {
        throw new Error("Możesz usuwać tylko własne wiadomości.");
      }
      return id;
    },
    onSuccess: (id) => {
      qc.setQueryData<MessageRow[]>(["messages", conversationId], (prev: MessageRow[] | undefined) =>
        prev ? prev.filter((m: MessageRow) => m.id !== id) : prev,
      );
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
};

// „Przeczytane” — zapis w tle (bez komunikatów, jak web); błąd tylko w konsoli dewelopera.
// latestCreatedAt — data ostatniej wiadomości w wątku: znacznik nie może być wcześniejszy (zegar
// telefonu bywa spóźniony względem serwera — wtedy ostatnia wiadomość wisiała jako nieprzeczytana).
export const markConversationRead = async (
  conversationId: string,
  userEmail: string,
  latestCreatedAt?: string | null,
): Promise<void> => {
  const { error } = await (supabase.from("conversation_participants") as any)
    .update({ last_read_at: readMarkTimestamp(latestCreatedAt) })
    .eq("conversation_id", conversationId)
    .ilike("user_email", emailPattern(userEmail));
  if (error && __DEV__) console.warn("[messenger] markConversationRead failed:", error.message);
};

// Licznik nieprzeczytanych tej rozmowy na liście — od razu na zero (zapis idzie w tle).
export const clearUnreadLocally = (
  qc: ReturnType<typeof useQueryClient>,
  userEmail: string | null,
  conversationId: string,
) => {
  if (!userEmail) return;
  qc.setQueryData<ConversationListItem[]>(conversationsKey(userEmail), (prev: ConversationListItem[] | undefined) =>
    prev?.map((c: ConversationListItem) =>
      c.id === conversationId && (c.unread_count ?? 0) > 0 ? { ...c, unread_count: 0 } : c,
    ),
  );
};

// Zmiana MOJEGO wiersza uczestnika (ulubione, archiwum, wyciszenie, przypięcie). Pusty
// wynik = nie jestem już uczestnikiem tej rozmowy.
const updateMyParticipation = async (
  conversationId: string,
  userEmail: string | null,
  patch: Record<string, unknown>,
) => {
  if (!userEmail) throw new Error("Twoja sesja wygasła. Zaloguj się ponownie.");
  const { data, error } = await (supabase.from("conversation_participants") as any)
    .update(patch)
    .eq("conversation_id", conversationId)
    .ilike("user_email", emailPattern(userEmail))
    .select("conversation_id, user_email");
  if (error) throw error;
  if (!data || (Array.isArray(data) && data.length === 0)) {
    throw new Error("Nie jesteś już uczestnikiem tej rozmowy.");
  }
};

export const useToggleStarred = (userEmail: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, starred }: { conversationId: string; starred: boolean }) =>
      updateMyParticipation(conversationId, userEmail, { starred }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: alertError("Nie udało się", "Nie udało się zmienić ulubionych. Spróbuj ponownie."),
  });
};

export const useToggleArchived = (userEmail: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, archived }: { conversationId: string; archived: boolean }) =>
      updateMyParticipation(conversationId, userEmail, { archived }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success(vars.archived ? "Rozmowa przeniesiona do archiwum" : "Rozmowa przywrócona z archiwum");
    },
    onError: alertError("Nie udało się", "Nie udało się zmienić archiwum. Spróbuj ponownie."),
  });
};

export const useToggleMuted = (userEmail: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, muted }: { conversationId: string; muted: boolean }) =>
      updateMyParticipation(conversationId, userEmail, { muted }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversation", vars.conversationId] });
      toast.success(vars.muted ? "Powiadomienia z tej rozmowy wyciszone" : "Powiadomienia z tej rozmowy włączone");
    },
    onError: alertError("Nie udało się", "Nie udało się zmienić powiadomień. Spróbuj ponownie."),
  });
};

export interface ConversationDetails {
  id: string;
  type: "direct" | "group" | "ministry" | "announcement";
  name: string | null;
  ministry_key: string | null;
  avatar_url: string | null;
  participant_emails: string[];
  /** Skład z rolami (administrator / członek) — okno „Szczegóły rozmowy”. */
  participants: { email: string; role: string | null }[];
  my_muted: boolean;
  my_starred: boolean;
  // Kanały ogłoszeń (spec §5): kto może pisać + moja rola w rozmowie.
  posting_policy: "everyone" | "admins";
  my_role: string | null;
  /** Czy jestem uczestnikiem (kanał służby bywa widoczny przed dołączeniem). */
  is_participant: boolean;
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
        .select("id, type, name, ministry_key, avatar_url, posting_policy")
        .eq("id", conversationId)
        .maybeSingle();
      if (error) throw error;
      if (!conv) return null;
      const { data: parts, error: partsErr } = await supabase
        .from("conversation_participants")
        .select("user_email, muted, starred, role")
        .eq("conversation_id", conversationId);
      if (partsErr) throw partsErr;
      const participants = (parts ?? []) as Array<{
        user_email: string;
        muted: boolean | null;
        starred: boolean | null;
        role: string | null;
      }>;
      const me = participants.find((p) => sameEmail(p.user_email, userEmail));
      return {
        id: (conv as any).id,
        type: (conv as any).type,
        name: (conv as any).name,
        ministry_key: (conv as any).ministry_key,
        avatar_url: (conv as any).avatar_url,
        participant_emails: participants.map((p) => p.user_email),
        participants: participants.map((p) => ({ email: p.user_email, role: p.role ?? null })),
        my_muted: !!me?.muted,
        my_starred: !!me?.starred,
        posting_policy: ((conv as any).posting_policy as "everyone" | "admins") ?? "everyone",
        my_role: me?.role ?? null,
        is_participant: !!me,
      };
    },
    enabled: !!conversationId,
  });

/**
 * Wykryj @wzmianki w treści → e-maile uczestników (spec §3). Dopasowanie po
 * wyświetlanej nazwie i imieniu (case-insensitive). Zapisywane do messages.mentions;
 * trigger DB tworzy wspomnianym powiadomienie 'mention' + push niezależnie od obecności.
 */
export const extractMentions = (text: string, members: MemberMap): string[] => {
  if (!text || !text.includes("@")) return [];
  const lower = text.toLowerCase();
  const out = new Set<string>();
  for (const email of Object.keys(members)) {
    const name = memberDisplayName(members, email);
    const first = (members[email]?.firstName || name.split(" ")[0] || "").trim();
    for (const cand of [name, first].filter(Boolean)) {
      if (lower.includes("@" + cand.toLowerCase())) {
        out.add(email);
        break;
      }
    }
  }
  return Array.from(out);
};

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
        // Reakcje to dodatek — brak tabeli (42P01) LUB brak grantu (403) nie może
        // wywalać rozmowy. Wracamy z pustym zestawem.
        return {};
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
          if (sameEmail(r.user_email, userEmail)) g.hasUserReacted = true;
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
      if (!userEmail) throw new Error("Twoja sesja wygasła. Zaloguj się ponownie.");
      // Sprawdź, czy ta sama reakcja już istnieje.
      const { data: existing, error: fErr } = await supabase
        .from("message_reactions")
        .select("id")
        .eq("message_id", messageId)
        .ilike("user_email", emailPattern(userEmail))
        .eq("emoji", emoji)
        .maybeSingle();
      if (fErr && (fErr as any).code !== "PGRST116") throw fErr;
      const existingId = (existing as { id?: string } | null)?.id;
      if (existingId) {
        // Pełny wiersz w RETURNING — web aktualizuje reakcje z realtime po id/emoji/osobie.
        const { error } = await (supabase.from("message_reactions") as any)
          .delete()
          .eq("id", existingId)
          .select("id, message_id, emoji, user_email");
        if (error) throw error;
      } else {
        const { error } = await (supabase.from("message_reactions") as any)
          .insert({ message_id: messageId, user_email: userEmail, emoji })
          .select("id, message_id, emoji, user_email");
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reactions", conversationId] });
    },
    onError: alertError("Nie udało się", "Nie udało się zapisać reakcji. Spróbuj ponownie."),
  });
};

// =====================================================================
// Ankiety (poll) i prośby o modlitwę (prayer) — spec §2
// =====================================================================

/** Record<messageId, Record<optionId, { count, mine }>> — agregacja głosów. */
export const usePollVotes = (conversationId: string, userEmail: string | null) =>
  useQuery({
    queryKey: ["pollVotes", conversationId, userEmail],
    queryFn: async (): Promise<Record<string, Record<string, { count: number; mine: boolean }>>> => {
      if (!conversationId) return {};
      const { data: msgs } = await supabase
        .from("messages")
        .select("id")
        .eq("conversation_id", conversationId)
        .eq("message_type", "poll");
      const ids = (msgs ?? []).map((m: any) => m.id);
      if (ids.length === 0) return {};
      const { data, error } = await supabase
        .from("poll_votes")
        .select("message_id, option_id, user_email")
        .in("message_id", ids);
      if (error) return {};
      const out: Record<string, Record<string, { count: number; mine: boolean }>> = {};
      for (const v of (data ?? []) as any[]) {
        const m = (out[v.message_id] ??= {});
        const o = (m[v.option_id] ??= { count: 0, mine: false });
        o.count += 1;
        if (sameEmail(v.user_email, userEmail)) o.mine = true;
      }
      return out;
    },
    enabled: !!conversationId,
  });

export const useTogglePollVote = (conversationId: string, userEmail: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      messageId,
      optionId,
      multiple,
    }: {
      messageId: string;
      optionId: string;
      multiple?: boolean;
    }) => {
      if (!userEmail) throw new Error("Twoja sesja wygasła. Zaloguj się ponownie.");
      const mine = emailPattern(userEmail);
      const { data: existing, error: fErr } = await supabase
        .from("poll_votes")
        .select("id")
        .eq("message_id", messageId)
        .eq("option_id", optionId)
        .ilike("user_email", mine)
        .maybeSingle();
      if (fErr && (fErr as any).code !== "PGRST116") throw fErr;
      if ((existing as { id?: string } | null)?.id) {
        // Ponowny klik w wybraną opcję = wycofanie głosu (spec §2).
        const { error } = await (supabase.from("poll_votes") as any)
          .delete()
          .eq("id", (existing as any).id)
          .select("id, message_id, option_id, user_email");
        if (error) throw error;
        return;
      }
      // Jednokrotny wybór → usuń wcześniejsze głosy usera w tej ankiecie.
      if (!multiple) {
        const { error } = await (supabase.from("poll_votes") as any)
          .delete()
          .eq("message_id", messageId)
          .ilike("user_email", mine)
          .select("id, message_id, option_id, user_email");
        if (error) throw error;
      }
      const { error } = await (supabase.from("poll_votes") as any)
        .insert({ message_id: messageId, option_id: optionId, user_email: userEmail })
        .select("id, message_id, option_id, user_email");
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pollVotes", conversationId] }),
    onError: (e) => {
      qc.invalidateQueries({ queryKey: ["pollVotes", conversationId] });
      Alert.alert("Nie udało się zagłosować", friendlyError(e, "Spróbuj ponownie."));
    },
  });
};

/** Record<messageId, { count, mine }> — odpowiedzi „🙏 Modlę się". */
export const usePrayerResponses = (conversationId: string, userEmail: string | null) =>
  useQuery({
    queryKey: ["prayerResponses", conversationId, userEmail],
    queryFn: async (): Promise<Record<string, { count: number; mine: boolean }>> => {
      if (!conversationId) return {};
      const { data: msgs } = await supabase
        .from("messages")
        .select("id")
        .eq("conversation_id", conversationId)
        .eq("message_type", "prayer");
      const ids = (msgs ?? []).map((m: any) => m.id);
      if (ids.length === 0) return {};
      const { data, error } = await supabase
        .from("prayer_responses")
        .select("message_id, user_email")
        .in("message_id", ids);
      if (error) return {};
      const out: Record<string, { count: number; mine: boolean }> = {};
      for (const r of (data ?? []) as any[]) {
        const o = (out[r.message_id] ??= { count: 0, mine: false });
        o.count += 1;
        if (sameEmail(r.user_email, userEmail)) o.mine = true;
      }
      return out;
    },
    enabled: !!conversationId,
  });

export const useTogglePrayerResponse = (conversationId: string, userEmail: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId, responding }: { messageId: string; responding: boolean }) => {
      if (!userEmail) throw new Error("Twoja sesja wygasła. Zaloguj się ponownie.");
      if (responding) {
        const { error } = await (supabase.from("prayer_responses") as any)
          .delete()
          .eq("message_id", messageId)
          .ilike("user_email", emailPattern(userEmail))
          .select("id, message_id, user_email");
        if (error) throw error;
      } else {
        const { error } = await (supabase.from("prayer_responses") as any)
          .insert({ message_id: messageId, user_email: userEmail })
          .select("id, message_id, user_email");
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prayerResponses", conversationId] }),
    onError: alertError("Nie udało się", "Nie udało się zapisać „Modlę się”. Spróbuj ponownie."),
  });
};

/** Przypięcie/odpięcie rozmowy (conversation_participants.pinned, per user) — spec §6. */
export const useTogglePinConversation = (userEmail: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, pinned }: { conversationId: string; pinned: boolean }) =>
      updateMyParticipation(conversationId, userEmail, { pinned }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations"] }),
    onError: alertError("Nie udało się", "Nie udało się przypiąć rozmowy. Spróbuj ponownie."),
  });
};

// Nadchodzące wydarzenia do udostępnienia w czacie (spec §2 — snapshot + event_id).
export interface ShareableEvent {
  id: string;
  title: string;
  date: string | null;
  time: string | null;
  location: string | null;
  description: string | null;
  max_participants: number | null;
}

export const useUpcomingEvents = () =>
  useQuery({
    queryKey: ["shareableEvents"],
    queryFn: async (): Promise<ShareableEvent[]> => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("events")
        .select("id, title, date, time, location, description, max_participants")
        .gte("date", today)
        .order("date", { ascending: true })
        .limit(50);
      if (error) throw error;
      return ((data ?? []) as any[])
        .filter((e) => e.title)
        .map((e) => ({
          id: String(e.id),
          title: e.title,
          date: e.date ?? null,
          time: e.time ? String(e.time).slice(0, 5) : null,
          location: e.location ?? null,
          description: e.description ?? null,
          max_participants: e.max_participants ?? null,
        }));
    },
  });

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
        // Brak tabeli (42P01) lub brak grantu (403) — panel przypiętych po prostu pusty.
        return [];
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
      if (!userEmail) throw new Error("Twoja sesja wygasła. Zaloguj się ponownie.");
      // .select() — przypięcie widzą od razu pozostali uczestnicy (realtime).
      if (pinned) {
        const { error } = await (supabase.from("pinned_messages") as any)
          .delete()
          .eq("message_id", messageId)
          .eq("conversation_id", conversationId)
          .select("id, message_id, conversation_id");
        if (error) throw error;
      } else {
        const { error } = await (supabase.from("pinned_messages") as any)
          .insert({ message_id: messageId, conversation_id: conversationId, pinned_by: userEmail })
          .select("id, message_id, conversation_id");
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
  read_at: string | null;
  delivered_at?: string | null;
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
        .select("message_id, user_email, read_at, delivered_at")
        .in("message_id", ids);
      if (error) {
        // Brak tabeli (42P01) lub brak grantu (403) — bez potwierdzeń odczytu.
        return {};
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
  const now = new Date().toISOString();
  const rows = messageIds.map((id) => ({
    message_id: id,
    user_email: userEmail,
    read_at: now,
    delivered_at: now,
  }));
  // ignoreDuplicates:false — przeczytanie MUSI nadpisać ewentualny wiersz „tylko doręczone".
  // .select() — nadawca widzi „przeczytane” na żywo (realtime z wierszami).
  const { error } = await (supabase.from("message_read_receipts") as any)
    .upsert(rows, { onConflict: "message_id,user_email", ignoreDuplicates: false })
    .select("message_id, user_email, read_at, delivered_at");
  if (error && (error as any).code !== "42P01") {
    if (__DEV__) console.warn("[messenger] markMessagesAsRead failed:", error.message);
  }
};

/** Oznacz cudze wiadomości jako DORĘCZONE (ptaszki) — nie nadpisuje „przeczytane". */
export const markMessagesDelivered = async (
  messageIds: string[],
  userEmail: string,
): Promise<void> => {
  if (messageIds.length === 0) return;
  const now = new Date().toISOString();
  const rows = messageIds.map((id) => ({
    message_id: id,
    user_email: userEmail,
    delivered_at: now,
    read_at: null,
  }));
  const { error } = await (supabase.from("message_read_receipts") as any)
    .upsert(rows, { onConflict: "message_id,user_email", ignoreDuplicates: true })
    .select("message_id, user_email, read_at, delivered_at");
  if (error && (error as any).code !== "42P01") {
    if (__DEV__) console.warn("[messenger] markMessagesDelivered failed:", error.message);
  }
};

export type DeliveryStatus = "sent" | "delivered" | "read";

/** Status własnej wiadomości z wierszy innych niż nadawca (spec §4): read > delivered > sent. */
export const deliveryStatusFor = (
  receipts: ReadReceiptRow[] | undefined,
  senderEmail: string,
): DeliveryStatus => {
  const others = (receipts ?? []).filter((r) => !sameEmail(r.user_email, senderEmail));
  if (others.some((r) => r.read_at)) return "read";
  if (others.some((r) => r.delivered_at)) return "delivered";
  return "sent";
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

export interface ForwardResult {
  sent: number;
  total: number;
}

export const useForwardMessage = (senderEmail: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      conversationIds,
      content,
      attachments,
      forwardedFrom,
    }: {
      conversationIds: string[];
      content: string;
      attachments?: MessageAttachment[];
      /** id oryginału — odbiorcy widzą „Przekazana wiadomość” (jak web). */
      forwardedFrom?: string | null;
    }): Promise<ForwardResult> => {
      if (!senderEmail) throw new Error("Twoja sesja wygasła. Zaloguj się ponownie.");
      if (conversationIds.length === 0) return { sent: 0, total: 0 };
      // Osobno do każdej rozmowy: serwer odrzuca wiadomość w kanale „tylko administratorzy”
      // albo w rozmowie, w której nie jestem — zbiorczy insert przepadał wtedy w całości.
      let firstError: unknown = null;
      let sent = 0;
      for (const cid of conversationIds) {
        const { error } = await (supabase.from("messages") as any)
          .insert({
            conversation_id: cid,
            sender_email: senderEmail,
            content,
            attachments: attachments ?? [],
            forwarded_from: forwardedFrom ?? null,
          })
          .select("id");
        if (error) firstError = firstError ?? error;
        else sent += 1;
      }
      // Nic nie poszło → błąd (z powodem z serwera). Część poszła → wynik, ekran powie ile.
      if (sent === 0) throw firstError ?? new Error("Nie udało się przekazać wiadomości.");
      return { sent, total: conversationIds.length };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
};

// =====================================================================
// Opuszczenie / usunięcie rozmowy (jak web: GroupSettingsModal / ConversationHeader)
// =====================================================================

// Opuść rozmowę — usunięcie MOJEGO wiersza uczestnika (serwer: mój wiersz albo administrator).
export const useLeaveConversation = (userEmail: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!userEmail) throw new Error("Twoja sesja wygasła. Zaloguj się ponownie.");
      const { data, error } = await (supabase.from("conversation_participants") as any)
        .delete()
        .eq("conversation_id", conversationId)
        .ilike("user_email", emailPattern(userEmail))
        .select("conversation_id, user_email");
      if (error) throw error;
      if (!data || (Array.isArray(data) && data.length === 0)) {
        throw new Error("Nie jesteś już uczestnikiem tej rozmowy.");
      }
      return conversationId;
    },
    onSuccess: (conversationId) => {
      qc.setQueryData<ConversationListItem[]>(conversationsKey(userEmail), (prev: ConversationListItem[] | undefined) =>
        prev?.filter((c: ConversationListItem) => c.id !== conversationId),
      );
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
};

// Usuń rozmowę dla obu stron (rozmowa 1:1; serwer pozwala administratorowi rozmowy).
export const useDeleteConversation = (userEmail: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { data, error } = await (supabase.from("conversations") as any)
        .delete()
        .eq("id", conversationId)
        .select("id");
      if (error) throw error;
      if (!data || (Array.isArray(data) && data.length === 0)) {
        throw new Error("Rozmowę może usunąć tylko jej administrator.");
      }
      return conversationId;
    },
    onSuccess: (conversationId) => {
      qc.setQueryData<ConversationListItem[]>(conversationsKey(userEmail), (prev: ConversationListItem[] | undefined) =>
        prev?.filter((c: ConversationListItem) => c.id !== conversationId),
      );
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
};
