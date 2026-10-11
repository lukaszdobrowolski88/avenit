// Spotkania online — dane (te same funkcje serwera co web: meeting-get / respond / create /
// update / cancel). Realtime tabeli meetings odświeża kartę spotkania (termin, odpowiedzi).
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type { Meeting, MeetingResponse } from "./logic";

async function fn<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body, silent: true } as never);
  if (error) {
    const ctx = (error as { context?: { error?: string; code?: string } }).context;
    const err = new Error(ctx?.error || (error as { message?: string }).message || "Nie udało się zapisać spotkania.") as Error & { code?: string; status?: number };
    err.code = ctx?.code;
    err.status = (error as { status?: number }).status;
    throw err;
  }
  return data as T;
}

export function useMeeting(conversationId: string | null | undefined, enabled = true) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["meeting", conversationId ?? ""],
    enabled: !!conversationId && enabled,
    queryFn: async () => (await fn<{ meeting: Meeting }>("meeting-get", { conversation_id: conversationId })).meeting,
  });
  useEffect(() => {
    if (!conversationId || !enabled) return;
    const name = `meeting:${conversationId}`;
    for (const c of supabase.getChannels()) if (c.topic === `realtime:${name}`) supabase.removeChannel(c);
    const channel = supabase
      .channel(name)
      .on("postgres_changes", { event: "*", schema: "public", table: "meetings" }, (payload) => {
        const row = payload.new as { conversation_id?: string } | null;
        if (String(row?.conversation_id) !== String(conversationId)) return;
        qc.invalidateQueries({ queryKey: ["meeting", conversationId] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, enabled, qc]);
  return q;
}

export function useRespondMeeting(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ meetingId, response }: { meetingId: string; response: Exclude<MeetingResponse, "pending"> }) =>
      (await fn<{ meeting: Meeting }>("meeting-respond", { meeting_id: meetingId, response })).meeting,
    onSuccess: (m) => qc.setQueryData(["meeting", conversationId], m),
  });
}

export function useCancelMeeting(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (meetingId: string) => (await fn<{ meeting: Meeting }>("meeting-cancel", { meeting_id: meetingId })).meeting,
    onSuccess: (m) => qc.setQueryData(["meeting", conversationId], m),
  });
}

export interface MeetingPayload {
  title: string;
  description: string;
  starts_at: string;
  duration_min: number;
  kind: "audio" | "video";
  guests_auto_admit: boolean;
  members: string[];
  guests: { email: string; name?: string }[];
}

export async function saveMeeting(payload: MeetingPayload, meetingId?: string): Promise<Meeting> {
  const res = meetingId
    ? await fn<{ meeting: Meeting }>("meeting-update", { meeting_id: meetingId, ...payload })
    : await fn<{ meeting: Meeting }>("meeting-create", payload as unknown as Record<string, unknown>);
  return res.meeting;
}
