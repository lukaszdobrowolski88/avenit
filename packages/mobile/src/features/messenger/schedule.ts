import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import {
  chatTimeLabelPl,
  fromWarsawYmdHm,
  isValidChatTime,
  reminderPresets,
  schedulePresets,
  warsawYmdHm,
  type ChatPreset,
} from "@avenit/shared/src/lib/chatSchedule.js";
import type { MessageAttachment } from "./api";

// Komunikator: zaplanowane wiadomości i „Przypomnij mi” (fn chat-scheduled / chat-reminders, jak web).
// Terminy w czasie polskim (shared/lib/chatSchedule.js) — zapis w UTC.

export { chatTimeLabelPl, fromWarsawYmdHm, isValidChatTime, reminderPresets, schedulePresets, warsawYmdHm };
export type { ChatPreset };

type FnError = { message?: string; status?: number; context?: any } | null;

const NOT_YET = "Ta funkcja będzie dostępna po aktualizacji serwera.";

const fnError = (error: FnError, fallback: string): Error => {
  if (error?.status === 404 && (!error.context || error.context?.error === "Not Found")) {
    return Object.assign(new Error(NOT_YET), { code: "NOT_AVAILABLE" });
  }
  const code = error?.context?.code as string | undefined;
  const human = typeof error?.context?.error === "string" ? error.context.error : null;
  if (human && error?.status !== 500) return Object.assign(new Error(human), { code, status: error?.status });
  return Object.assign(new Error(fallback), { status: error?.status, code });
};

const call = async <T>(name: string, body: Record<string, unknown>, fallback: string): Promise<T> => {
  const { data, error } = await supabase.functions.invoke(name, { body, silent: true } as any);
  if (error) throw fnError(error as FnError, fallback);
  return (data ?? {}) as T;
};

// Etykiety gotowych terminów.
export const PRESET_LABELS: Record<string, string> = {
  today18: "Dziś 18:00",
  tomorrow8: "Jutro 8:00",
  tomorrow18: "Jutro 18:00",
  in1h: "Za 1 godzinę",
  in3h: "Za 3 godziny",
  tomorrow9: "Jutro 9:00",
  monday9: "W poniedziałek 9:00",
};

// „dziś 18:00” → „Dziś 18:00” (początek zdania).
export const whenLabel = (at: string | Date) => {
  const s = chatTimeLabelPl(at);
  return s.charAt(0).toUpperCase() + s.slice(1);
};

// ── Zaplanowane ─────────────────────────────────────────────────────────────
export interface ScheduledMessage {
  id: string;
  conversation_id: string;
  sender_email: string;
  content: string;
  attachments: MessageAttachment[] | null;
  mentions: string[] | null;
  reply_to_id: string | null;
  send_at: string;
  status: "pending" | "sent" | "cancelled" | "failed";
  error: string | null;
}

export const scheduledKey = (cid: string) => ["scheduledMessages", cid] as const;

const sortBySendAt = (list: ScheduledMessage[]) =>
  [...list].sort((a, b) => new Date(a.send_at).getTime() - new Date(b.send_at).getTime());

// Lista trzyma w pamięci tylko oczekujące i nieudane (wysłana/anulowana znika).
const putLocal = (qc: ReturnType<typeof useQueryClient>, row: ScheduledMessage | null | undefined) => {
  if (!row?.id) return;
  qc.setQueryData<ScheduledMessage[]>(scheduledKey(row.conversation_id), (prev: ScheduledMessage[] | undefined) => {
    const rest = (prev ?? []).filter((s: ScheduledMessage) => s.id !== row.id);
    return row.status === "pending" || row.status === "failed" ? sortBySendAt([...rest, row]) : rest;
  });
};

export const useScheduledMessages = (conversationId: string, enabled = true) => {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: scheduledKey(conversationId),
    enabled: !!conversationId && enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<ScheduledMessage[]> => {
      try {
        const out = await call<{ scheduled?: ScheduledMessage[] }>(
          "chat-scheduled",
          { action: "list", conversation_id: conversationId },
          "Nie udało się wczytać zaplanowanych wiadomości.",
        );
        return sortBySendAt(out.scheduled ?? []);
      } catch {
        return []; // starszy serwer — bez listy
      }
    },
  });
  // Realtime (serwer wysyła tylko nadawcy; filtr po rozmowie — shim nie filtruje).
  useEffect(() => {
    if (!conversationId || !enabled) return;
    const channel = supabase
      .channel(`scheduled_messages:${conversationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "scheduled_messages" }, (payload: any) => {
        const row = payload?.new as ScheduledMessage | undefined;
        if (!row?.id || String(row.conversation_id) !== String(conversationId)) return;
        putLocal(qc, row);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, enabled, qc]);
  return query;
};

export interface ScheduleInput {
  content: string;
  attachments?: MessageAttachment[];
  mentions?: string[];
  replyToId?: string | null;
  sendAt: string;
}

export const useCreateScheduled = (conversationId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ScheduleInput) => {
      const out = await call<{ scheduled: ScheduledMessage }>(
        "chat-scheduled",
        {
          action: "create",
          conversation_id: conversationId,
          content: input.content,
          attachments: input.attachments ?? [],
          mentions: input.mentions ?? [],
          reply_to_id: input.replyToId ?? null,
          send_at: input.sendAt,
        },
        "Nie udało się zaplanować wiadomości. Spróbuj ponownie.",
      );
      return out.scheduled;
    },
    onSuccess: (row) => putLocal(qc, row),
  });
};

export const useUpdateScheduled = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, content, sendAt }: { id: string; content?: string; sendAt?: string }) => {
      const out = await call<{ scheduled: ScheduledMessage }>(
        "chat-scheduled",
        { action: "update", id, ...(content !== undefined ? { content } : {}), ...(sendAt ? { send_at: sendAt } : {}) },
        "Nie udało się zapisać zmian. Spróbuj ponownie.",
      );
      return out.scheduled;
    },
    onSuccess: (row) => putLocal(qc, row),
  });
};

export const useCancelScheduled = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const out = await call<{ scheduled: ScheduledMessage }>(
        "chat-scheduled",
        { action: "cancel", id },
        "Nie udało się anulować wysyłki. Spróbuj ponownie.",
      );
      return out.scheduled;
    },
    onSuccess: (row) => putLocal(qc, row),
  });
};

export const useSendScheduledNow = (conversationId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      call<{ scheduled: ScheduledMessage; message?: unknown }>(
        "chat-scheduled",
        { action: "send_now", id },
        "Nie udało się wysłać wiadomości. Spróbuj ponownie.",
      ),
    onSuccess: (out) => {
      putLocal(qc, out.scheduled);
      void qc.invalidateQueries({ queryKey: ["messages", conversationId] });
    },
    // Odmowa (np. nie jestem już w rozmowie) — wiersz staje się „nieudany” z powodem.
    onError: () => void qc.invalidateQueries({ queryKey: scheduledKey(conversationId) }),
  });
};

// ── Przypomnienia ───────────────────────────────────────────────────────────
export interface ReminderItem {
  id: string;
  message_id: string;
  conversation_id: string;
  remind_at: string;
  available: boolean;
  conversation_title: string | null;
  conversation_type: string | null;
  sender_email: string | null;
  sender_name: string | null;
  preview: string | null;
}

export const remindersKey = ["myReminders"] as const;

export const useMyReminders = () => {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: remindersKey,
    queryFn: async (): Promise<ReminderItem[]> => {
      const out = await call<{ reminders?: ReminderItem[] }>(
        "chat-reminders",
        { action: "list" },
        "Nie udało się wczytać przypomnień.",
      );
      return out.reminders ?? [];
    },
  });
  useEffect(() => {
    const channel = supabase
      .channel("message_reminders:mine")
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reminders" }, () => {
        void qc.invalidateQueries({ queryKey: remindersKey });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
  return query;
};

export const useCreateReminder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId, remindAt }: { messageId: string; remindAt: string }) =>
      call<{ reminder: unknown }>(
        "chat-reminders",
        { action: "create", message_id: messageId, remind_at: remindAt },
        "Nie udało się ustawić przypomnienia. Spróbuj ponownie.",
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: remindersKey }),
  });
};

export const useCancelReminder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      call<{ reminder: unknown }>("chat-reminders", { action: "cancel", id }, "Nie udało się usunąć przypomnienia. Spróbuj ponownie."),
    onMutate: (id: string) => {
      qc.setQueryData<ReminderItem[]>(remindersKey, (prev: ReminderItem[] | undefined) =>
        (prev ?? []).filter((r: ReminderItem) => r.id !== id),
      );
    },
    onError: () => void qc.invalidateQueries({ queryKey: remindersKey }),
  });
};
