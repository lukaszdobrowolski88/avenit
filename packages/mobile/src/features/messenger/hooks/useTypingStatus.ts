import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { emailPattern, sameEmail } from "../logic";

// „pisze…” — ta sama tabela i zasady co web (src/modules/Komunikator/hooks/useTypingStatus.js):
// wiersz typing_status (conversation_id, user_email, started_at) zakładany przy pisaniu, kasowany
// po 3 s bez pisania albo po wysłaniu. U odbiorcy wpis wygasa sam po kilku sekundach — także gdy
// zegar telefonu nadawcy się spóźnia (liczymy od chwili, w której zdarzenie dotarło).
const SHOW_MS = 6000;
const IDLE_MS = 3000;

export const typingLabel = (names: string[]): string => {
  if (names.length === 0) return "";
  if (names.length === 1) return `${names[0]} pisze…`;
  if (names.length === 2) return `${names[0]} i ${names[1]} piszą…`;
  return `${names[0]} i inni piszą…`;
};

export const useTypingStatus = (conversationId: string, userEmail: string | null, canWrite: boolean) => {
  const [typing, setTyping] = useState<Record<string, number>>({});
  const isTypingRef = useRef(false);
  const lastSentRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopTyping = useCallback(async () => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (!isTypingRef.current) return;
    isTypingRef.current = false;
    if (!conversationId || !userEmail || !canWrite) return;
    await (supabase.from("typing_status") as any)
      .delete()
      .eq("conversation_id", conversationId)
      .ilike("user_email", emailPattern(userEmail))
      .select("conversation_id, user_email")
      .then(() => undefined, () => undefined);
  }, [conversationId, userEmail, canWrite]);

  // Wołane przy każdej zmianie tekstu: pierwszy znak zakłada wpis (przy dłuższym pisaniu
  // odświeżany co kilka sekund, żeby nie wygasł u odbiorcy), cisza przez 3 s go kasuje.
  const startTyping = useCallback(() => {
    if (!conversationId || !userEmail || !canWrite) return;
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      void stopTyping();
    }, IDLE_MS);
    const now = Date.now();
    if (isTypingRef.current && now - lastSentRef.current < SHOW_MS - 2000) return;
    isTypingRef.current = true;
    lastSentRef.current = now;
    (supabase.from("typing_status") as any)
      .upsert(
        { conversation_id: conversationId, user_email: userEmail, started_at: new Date().toISOString() },
        { onConflict: "conversation_id,user_email" },
      )
      .select("conversation_id, user_email")
      .then(() => undefined, () => undefined);
  }, [conversationId, userEmail, canWrite, stopTyping]);

  useEffect(() => {
    if (!conversationId) return;
    setTyping({});
    let alive = true;
    // Kto pisze w chwili wejścia (najlepsze przybliżenie — dalej decydują zdarzenia na żywo).
    supabase
      .from("typing_status")
      .select("user_email, started_at")
      .eq("conversation_id", conversationId)
      .gt("started_at", new Date(Date.now() - 10_000).toISOString())
      .then(({ data }: { data: any }) => {
        if (!alive) return;
        const now = Date.now();
        const next: Record<string, number> = {};
        for (const r of (data ?? []) as any[]) {
          if (r.user_email && !sameEmail(r.user_email, userEmail)) next[r.user_email] = now;
        }
        setTyping(next);
      }, () => undefined);

    const channelName = `typing:${conversationId}`;
    for (const c of supabase.getChannels()) {
      if (c.topic === `realtime:${channelName}`) supabase.removeChannel(c);
    }
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "typing_status" }, (payload: any) => {
        const row = (payload.new ?? payload.old) as { conversation_id?: string; user_email?: string } | null;
        // Filtr kanału nie jest stosowany po stronie serwera — tylko ta rozmowa i nie ja.
        if (!row?.user_email || String(row.conversation_id) !== String(conversationId)) return;
        if (sameEmail(row.user_email, userEmail)) return;
        const email = row.user_email;
        setTyping((prev) => {
          if (payload.eventType === "DELETE") {
            if (!(email in prev)) return prev;
            const { [email]: _gone, ...rest } = prev;
            return rest;
          }
          return { ...prev, [email]: Date.now() };
        });
      })
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [conversationId, userEmail]);

  // Wygaszanie wpisów (gdy ktoś zamknął aplikację w trakcie pisania) — tylko gdy ktoś „pisze”.
  const anyone = Object.keys(typing).length > 0;
  useEffect(() => {
    if (!anyone) return;
    const t = setInterval(() => {
      const now = Date.now();
      setTyping((prev) => {
        const next = Object.fromEntries(Object.entries(prev).filter(([, at]) => now - at < SHOW_MS));
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [anyone]);

  // Wyjście z rozmowy — skasuj swój wpis.
  useEffect(() => () => {
    void stopTyping();
  }, [stopTyping]);

  return { typingEmails: Object.keys(typing), startTyping, stopTyping };
};
