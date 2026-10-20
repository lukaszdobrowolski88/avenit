import { useEffect } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { sameEmail } from "./logic";
import type { MessageRow } from "./api";

// „Ważne — potwierdź przeczytanie” (migracja 115) — jak web (hooks/useMessageAcks.js).
// Potwierdzenia czytamy z message_acks (uczestnicy rozmowy), zapisuje wyłącznie serwer (fn chat-ack):
// „Rozumiem”, lista dla nadawcy/administratora, przypomnienie niepotwierdzonym (raz na 6 h).

export const isImportantMessage = (m: MessageRow | null | undefined): boolean =>
  !!m && (m as any).requires_ack === true && !m.deleted_at && m.message_type !== "system";

export interface AckPerson {
  email: string;
  name: string;
  acked_at?: string | null;
}
export interface AckStatus {
  message_id: string;
  total: number;
  acked_count: number;
  acked: AckPerson[];
  pending: AckPerson[];
  last_reminded_at: string | null;
  next_remind_at: string | null;
}
export interface AckRemindResult {
  ok: boolean;
  sent: number;
  pending: number;
  skipped_quiet: number;
  next_remind_at?: string | null;
}

/** Błąd fn z kodem serwera (np. ACK_REMIND_TOO_SOON) i terminem kolejnego przypomnienia. */
export class AckError extends Error {
  status?: number;
  code?: string;
  nextRemindAt?: string | null;
}

export async function chatAck<T = any>(action: "ack" | "status" | "remind" | "pending", body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("chat-ack", { body: { action, ...body }, silent: true } as any);
  if (error) {
    const e = new AckError((error as any).message || "Nie udało się zapisać. Spróbuj ponownie.");
    e.status = (error as any).status;
    e.code = (error as any).context?.code;
    e.nextRemindAt = (error as any).context?.next_remind_at ?? null;
    throw e;
  }
  return data as T;
}

const ackKey = (conversationId: string) => ["messageAcks", conversationId];

export interface AckState {
  emails: string[];
  mine: boolean;
}

// Potwierdzenia wczytanych ważnych wiadomości wątku: messageId → { emails, mine }.
export const useMessageAcks = (conversationId: string, userEmail: string | null, messages: MessageRow[], ready = true) => {
  const qc = useQueryClient();
  const ids = messages.filter(isImportantMessage).map((m) => m.id);
  const idsKey = ids.join(",");

  // Realtime: cudze „Rozumiem” na żywo (serwer wysyła tylko uczestnikom rozmowy).
  useEffect(() => {
    if (!conversationId) return undefined;
    const channel = supabase
      .channel(`message-acks-${conversationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "message_acks" }, () => {
        qc.invalidateQueries({ queryKey: ackKey(conversationId) });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, qc]);

  return useQuery({
    queryKey: [...ackKey(conversationId), userEmail, idsKey],
    enabled: !!conversationId && ready && ids.length > 0,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<Record<string, AckState>> => {
      if (!ids.length) return {};
      const { data, error } = await supabase.from("message_acks").select("message_id, user_email").in("message_id", ids);
      if (error) return {};
      const out: Record<string, AckState> = {};
      for (const id of ids) out[id] = { emails: [], mine: false };
      for (const r of (data ?? []) as Array<{ message_id: string; user_email: string }>) {
        const o = (out[r.message_id] ??= { emails: [], mine: false });
        o.emails.push(r.user_email);
        if (sameEmail(r.user_email, userEmail)) o.mine = true;
      }
      return out;
    },
  });
};

// „Rozumiem” — od razu w cache wątku (bez czekania na realtime) i odświeżenie plakietek listy.
export const useAckMessage = (conversationId: string, userEmail: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (messageId: string) => {
      await chatAck("ack", { message_id: messageId });
      return messageId;
    },
    onSuccess: (messageId) => {
      qc.setQueriesData<Record<string, AckState>>({ queryKey: ackKey(conversationId) }, (prev) => {
        if (!prev || !userEmail) return prev;
        const cur = prev[messageId] ?? { emails: [], mine: false };
        if (cur.mine) return prev;
        return { ...prev, [messageId]: { emails: [...cur.emails, userEmail.toLowerCase()], mine: true } };
      });
      qc.invalidateQueries({ queryKey: ["pendingAcks"] });
    },
  });
};

export const useAckStatus = (messageId: string | null, refreshKey = 0) =>
  useQuery({
    queryKey: ["ackStatus", messageId, refreshKey],
    enabled: !!messageId,
    placeholderData: keepPreviousData,
    queryFn: () => chatAck<AckStatus>("status", { message_id: messageId }),
  });

export const useRemindAck = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => chatAck<AckRemindResult>("remind", { message_id: messageId }),
    onSettled: (_d, _e, messageId) => {
      qc.invalidateQueries({ queryKey: ["ackStatus", messageId] });
    },
  });
};

// Plakietka „Ważne” na liście rozmów: rozmowa → liczba ważnych wiadomości bez mojego „Rozumiem”.
export const usePendingAcks = (userEmail: string | null) => {
  const qc = useQueryClient();
  useEffect(() => {
    if (!userEmail) return undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => qc.invalidateQueries({ queryKey: ["pendingAcks"] }), 600);
    };
    const channel = supabase
      .channel("pending-acks")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (payload: any) => {
        const row = payload?.new;
        if (row?.requires_ack === true && !sameEmail(row.sender_email, userEmail)) refresh();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_acks" }, (payload: any) => {
        if (sameEmail(payload?.new?.user_email, userEmail)) refresh();
      })
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [qc, userEmail]);
  return useQuery({
    queryKey: ["pendingAcks", userEmail],
    enabled: !!userEmail,
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, number>> => {
      try {
        const out = await chatAck<{ counts?: Record<string, number> }>("pending");
        return out?.counts ?? {};
      } catch {
        return {}; // serwer bez migracji 115 — bez plakietek
      }
    },
  });
};
