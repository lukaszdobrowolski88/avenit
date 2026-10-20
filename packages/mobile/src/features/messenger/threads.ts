import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { playSendSound } from "../../lib/sounds";
import type { MessageAttachment, MessageRow } from "./api";
import { sameEmail } from "./logic";

// Wątki w Komunikatorze (migracja 112) — jak web (src/modules/Komunikator/threads):
// odpowiedź = messages.thread_root_id; liczniki (thread_reply_count / thread_last_reply_at) liczy
// serwer na wiadomości głównej; obserwujący (message_thread_followers) dostają pushe o odpowiedziach.
// Serwer pilnuje zasad pisania jak w rozmowie (uczestnik, kanał „tylko administratorzy”).

const ts = (v: string | null | undefined) => {
  const n = v ? new Date(v).getTime() : 0;
  return Number.isFinite(n) ? n : 0;
};

export const replyCountOf = (m: Partial<MessageRow> | null | undefined) => Math.max(0, Number(m?.thread_reply_count) || 0);
export const hasThread = (m: Partial<MessageRow> | null | undefined) => replyCountOf(m) > 0;

// Czy wiadomość może zacząć wątek (jak web canStartThread).
export const canStartThread = (m: Partial<MessageRow> | null | undefined) =>
  !!m?.id && !m.deleted_at && !m.thread_root_id && m.message_type !== "system" && m.message_type !== "call";

// „1 odpowiedź” / „N odpowiedzi” (po polsku 2–4 i 5+ brzmi tak samo).
export const replyCountLabel = (n: number) => (n === 1 ? "1 odpowiedź" : `${n} odpowiedzi`);

// Ostatni odpowiadający per wiadomość główna (najnowsi pierwsi, bez powtórzeń).
export function repliersByRoot(
  rows: { thread_root_id?: string | null; sender_email?: string | null; created_at?: string | null }[] = [],
  limit = 3,
): Record<string, string[]> {
  const sorted = rows.filter((r) => r?.thread_root_id && r.sender_email).sort((a, b) => ts(b.created_at) - ts(a.created_at));
  const out: Record<string, string[]> = {};
  for (const r of sorted) {
    const key = String(r.thread_root_id);
    const list = out[key] ?? (out[key] = []);
    if (list.length >= limit || list.some((e) => sameEmail(e, r.sender_email))) continue;
    list.push(String(r.sender_email));
  }
  return out;
}

export function addReply(list: MessageRow[] = [], row: MessageRow | null | undefined): MessageRow[] {
  if (!row?.id || row.deleted_at || list.some((m) => m.id === row.id)) return list;
  return [...list, row].sort((a, b) => ts(a.created_at) - ts(b.created_at));
}

export function applyReplyUpdate(list: MessageRow[] = [], row: Partial<MessageRow> | null | undefined): MessageRow[] {
  if (!row?.id) return list;
  if (row.deleted_at) return list.filter((m) => m.id !== row.id);
  let hit = false;
  const next = list.map((m) => {
    if (m.id !== row.id) return m;
    hit = true;
    return { ...m, ...row } as MessageRow;
  });
  return hit ? next : list;
}

export interface FollowerRow { root_id: string; user_email: string; following: boolean | null }
export const isFollowing = (rows: FollowerRow[] | undefined, me: string | null | undefined) => {
  const mine = (rows ?? []).find((r) => sameEmail(r.user_email, me));
  return !!mine && mine.following !== false;
};

// Link z powiadomienia: /komunikator?conversation=<id>&thread=<id> → id wątku (albo null).
export const threadFromLink = (link: string | null | undefined): string | null => {
  const m = String(link ?? "").match(/[?&]thread=([0-9a-fA-F-]{8,64})(?:&|#|$)/);
  return m ? m[1] : null;
};

// Rozmowa otwarta na wiadomości (skok przez parametr messageId, jak przypomnienie). Odpowiedź
// w wątku: skok do wiadomości głównej, a nad rozmową ekran wątku („wstecz” wraca do rozmowy).
export const openMessageInConversation = (
  router: { push: (href: never) => void },
  conversationId: string,
  messageId: string,
  threadRootId?: string | null,
) => {
  router.push({
    pathname: "/(app)/messenger/[conversationId]",
    params: { conversationId, messageId: threadRootId || messageId },
  } as never);
  if (threadRootId) {
    router.push({ pathname: "/(app)/messenger/thread/[rootId]", params: { rootId: threadRootId, conversationId } } as never);
  }
};

// ── Zapytania ───────────────────────────────────────────────────────────
export const threadKey = (rootId: string) => ["thread", rootId] as const;
const followersKey = (rootId: string) => ["threadFollowers", rootId] as const;
const REPLIES_LIMIT = 500;

export interface ThreadData { root: MessageRow | null; replies: MessageRow[] }

export const useThread = (conversationId: string, rootId: string) =>
  useQuery({
    queryKey: threadKey(rootId),
    enabled: !!rootId,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async (): Promise<ThreadData> => {
      const [rootRes, repliesRes] = await Promise.all([
        supabase.from("messages").select("*").eq("id", rootId).maybeSingle(),
        supabase
          .from("messages")
          .select("*")
          .eq("thread_root_id", rootId)
          .is("deleted_at", null)
          .order("created_at", { ascending: true })
          .limit(REPLIES_LIMIT),
      ]);
      if (rootRes.error) throw rootRes.error;
      if (repliesRes.error) throw repliesRes.error;
      const root = (rootRes.data as MessageRow | null) ?? null;
      // Wątek z innej rozmowy (zły link) — jak brak wątku.
      if (root && conversationId && String(root.conversation_id) !== String(conversationId)) return { root: null, replies: [] };
      return { root, replies: (repliesRes.data ?? []) as MessageRow[] };
    },
  });

export const useThreadFollowers = (rootId: string) =>
  useQuery({
    queryKey: followersKey(rootId),
    enabled: !!rootId,
    queryFn: async (): Promise<FollowerRow[]> => {
      const { data, error } = await supabase
        .from("message_thread_followers")
        .select("root_id, user_email, following")
        .eq("root_id", rootId);
      if (error) return [];
      return (data ?? []) as FollowerRow[];
    },
  });

const setMyFollow = (qc: ReturnType<typeof useQueryClient>, rootId: string, me: string, following: boolean) =>
  qc.setQueryData<FollowerRow[]>(followersKey(rootId), (prev: FollowerRow[] | undefined) => [
    ...(prev ?? []).filter((f) => !sameEmail(f.user_email, me)),
    { root_id: rootId, user_email: me, following },
  ]);

export interface ThreadReplyInput { content: string; attachments?: MessageAttachment[]; mentions?: string[] }

export const useSendThreadReply = (conversationId: string, rootId: string, me: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ThreadReplyInput): Promise<MessageRow | null> => {
      if (!me) throw new Error("Twoja sesja wygasła. Zaloguj się ponownie.");
      const { data, error } = await (supabase.from("messages") as any)
        .insert({
          conversation_id: conversationId,
          thread_root_id: rootId,
          sender_email: me,
          content: input.content,
          attachments: input.attachments ?? [],
          mentions: input.mentions ?? [],
        })
        .select()
        .single();
      if (error) throw error;
      return (data as MessageRow) ?? null;
    },
    onSuccess: (row) => {
      playSendSound();
      if (!me) return;
      if (row?.id) {
        qc.setQueryData<ThreadData>(threadKey(rootId), (prev: ThreadData | undefined) =>
          prev ? { ...prev, replies: addReply(prev.replies, row) } : prev,
        );
      } else qc.invalidateQueries({ queryKey: threadKey(rootId) });
      // Odpowiadający obserwuje wątek (trigger) — przełącznik od razu.
      setMyFollow(qc, rootId, me, true);
    },
  });
};

export const useSetThreadFollow = (rootId: string, me: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (following: boolean) => {
      if (!me) throw new Error("Twoja sesja wygasła. Zaloguj się ponownie.");
      const { error } = await (supabase.from("message_thread_followers") as any)
        .upsert({ root_id: rootId, user_email: me, following }, { onConflict: "root_id,user_email" })
        .select("root_id, user_email, following");
      if (error) throw error;
      return following;
    },
    onSuccess: (following) => {
      if (me) setMyFollow(qc, rootId, me, following);
    },
  });
};

// Edycja / usunięcie odpowiedzi — cache wątku (lista rozmowy ich nie zawiera).
export const patchThreadReply = (qc: ReturnType<typeof useQueryClient>, rootId: string, row: Partial<MessageRow>) =>
  qc.setQueryData<ThreadData>(threadKey(rootId), (prev: ThreadData | undefined) => {
    if (!prev) return prev;
    if (row.id === rootId) return { ...prev, root: prev.root ? ({ ...prev.root, ...row } as MessageRow) : prev.root };
    return { ...prev, replies: applyReplyUpdate(prev.replies, row) };
  });

// Awatary pod „N odpowiedzi”: ostatni odpowiadający w wątkach wczytanych wiadomości.
export const useThreadRepliers = (messages: MessageRow[]) => {
  const key = useMemo(
    () => messages.filter(hasThread).map((m) => `${m.id}:${m.thread_reply_count}`).sort().join(","),
    [messages],
  );
  return useQuery({
    queryKey: ["threadRepliers", key],
    enabled: key.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, string[]>> => {
      const ids = key.split(",").map((k) => k.split(":")[0]);
      const { data, error } = await supabase
        .from("messages")
        .select("thread_root_id, sender_email, created_at")
        .in("thread_root_id", ids)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(600);
      if (error) return {};
      return repliersByRoot((data ?? []) as any[]);
    },
  });
};

// Na żywo: odpowiedzi wątku, liczniki wiadomości głównej, obserwujący. Shim realtime ignoruje
// `filter` — odrzucamy cudze zdarzenia po kliencie (jak useRealtimeMessages).
export const useRealtimeThread = (conversationId: string, rootId: string) => {
  const qc = useQueryClient();
  useEffect(() => {
    if (!rootId) return;
    const channelName = `thread:${rootId}`;
    for (const c of supabase.getChannels()) if (c.topic === `realtime:${channelName}`) supabase.removeChannel(c);
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (payload) => {
        const row = (payload.new ?? payload.old) as MessageRow | null;
        if (!row?.id) return;
        if (row.conversation_id && String(row.conversation_id) !== String(conversationId)) return;
        if (row.id === rootId) {
          patchThreadReply(qc, rootId, row);
          return;
        }
        if (String(row.thread_root_id ?? "") !== String(rootId)) {
          // Usunięcie z wąskim zestawem pól (bez thread_root_id) — zdejmij, jeśli to nasza odpowiedź.
          if (row.deleted_at) patchThreadReply(qc, rootId, { id: row.id, deleted_at: row.deleted_at });
          return;
        }
        if (payload.eventType === "INSERT") {
          qc.setQueryData<ThreadData>(threadKey(rootId), (prev: ThreadData | undefined) =>
            prev ? { ...prev, replies: addReply(prev.replies, row) } : prev,
          );
        } else patchThreadReply(qc, rootId, row);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "message_thread_followers" }, (payload) => {
        const row = (payload.new ?? payload.old) as { root_id?: string } | null;
        if (row?.root_id && String(row.root_id) === String(rootId)) qc.invalidateQueries({ queryKey: followersKey(rootId) });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, rootId, qc]);
};
