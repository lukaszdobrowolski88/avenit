// Rozmowy audio/wideo w mobilce — dane i dołączanie. Do czasu natywnych rozmów (Expo SDK 56
// + LiveKit) połączenie odbywa się w przeglądarce telefonu: zalogowany link (web-ticket) do
// rozmowy z ?join=audio|video — web od razu dołącza do trwającej albo ją rozpoczyna.
import { useEffect } from "react";
import { Alert } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { openOnWeb } from "../modules/useModules";
import { isLiveCall, webCallPath } from "./logic";

export interface LiveCallRow {
  id: string;
  conversation_id: string;
  kind: "audio" | "video";
  status: string;
  is_group: boolean;
  started_at: string | null;
  started_by_email: string | null;
}

// Czy serwer ma włączone połączenia (klucze LiveKit). Bez nich przyciski są ukryte.
export function useCallsEnabled(): boolean {
  const q = useQuery({
    queryKey: ["call-config"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("call-config", { body: {}, silent: true } as never);
      if (error) return { enabled: false };
      return { enabled: !!(data as { enabled?: boolean } | null)?.enabled };
    },
    staleTime: 10 * 60_000,
  });
  return !!q.data?.enabled;
}

// Trwające połączenie w rozmowie (dzwoni albo trwa) — baner „Trwa połączenie — Dołącz”
// i karta wiadomości. Realtime tabeli calls + odświeżenie co 30 s, gdy coś trwa.
export function useLiveCall(conversationId: string | null | undefined) {
  const qc = useQueryClient();
  const key = ["live-call", conversationId ?? ""];
  const q = useQuery({
    queryKey: key,
    enabled: !!conversationId,
    queryFn: async (): Promise<LiveCallRow | null> => {
      const { data, error } = await supabase
        .from("calls")
        .select("id, conversation_id, kind, status, is_group, started_at, started_by_email")
        .eq("conversation_id", conversationId as string)
        .in("status", ["ringing", "active"])
        .order("started_at", { ascending: false })
        .limit(1);
      if (error) return null;
      const row = (data as LiveCallRow[] | null)?.[0] ?? null;
      return row && isLiveCall(row) ? row : null;
    },
    refetchInterval: (query) => (query.state.data ? 30_000 : false),
  });

  useEffect(() => {
    if (!conversationId) return;
    const name = `calls:${conversationId}`;
    for (const c of supabase.getChannels()) if (c.topic === `realtime:${name}`) supabase.removeChannel(c);
    const channel = supabase
      .channel(name)
      .on("postgres_changes", { event: "*", schema: "public", table: "calls" }, (payload) => {
        const row = (payload.new ?? null) as LiveCallRow | null;
        // Shim ignoruje filtr kanału — zdarzenia innych rozmów odrzucamy tutaj.
        if (!row || String(row.conversation_id) !== String(conversationId)) return;
        qc.invalidateQueries({ queryKey: ["live-call", conversationId] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, qc]);

  return q.data ?? null;
}

// Dołącz / zadzwoń: rozmowa w przeglądarce telefonu (zalogowana jednorazowym biletem).
export async function joinCallOnWeb(conversationId: string, kind: "audio" | "video") {
  await openOnWeb(webCallPath(conversationId, kind));
}

// Wybór rodzaju połączenia (jeden przycisk w nagłówku — mało miejsca).
export function chooseCallKind(conversationId: string) {
  Alert.alert("Zadzwoń", "Połączenie otworzy się w przeglądarce telefonu.", [
    { text: "Połączenie głosowe", onPress: () => void joinCallOnWeb(conversationId, "audio") },
    { text: "Połączenie wideo", onPress: () => void joinCallOnWeb(conversationId, "video") },
    { text: "Anuluj", style: "cancel" },
  ]);
}
