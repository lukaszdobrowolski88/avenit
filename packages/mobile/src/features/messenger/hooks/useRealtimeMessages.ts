import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import type { MessageRow } from "../api";

/**
 * Realtime dla pojedynczej konwersacji:
 * - INSERT → dopisuje wiadomość do listy
 * - UPDATE → podmienia (edycja, soft-delete)
 * Invaliduje też listę konwersacji, żeby ostatnia wiadomość się odświeżyła.
 */
export const useRealtimeMessages = (conversationId: string) => {
  const qc = useQueryClient();
  useEffect(() => {
    if (!conversationId) return;
    const channelName = `messages:${conversationId}`;
    // Posprzątaj ewentualnego "ducha" po Fast Refreshu / poprzednim mountcie.
    for (const c of supabase.getChannels()) {
      if (c.topic === `realtime:${channelName}`) {
        supabase.removeChannel(c);
      }
    }
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const msg = payload.new as MessageRow;
          // Shim realtime IGNORUJE `filter` (conversation_id=eq.X) i dostarcza INSERT-y
          // ze WSZYSTKICH konwersacji przez wspólne WS. Bez tego guardu wiadomość z innej
          // rozmowy trafiłaby do otwartego wątku (przeciek treści) — filtrujemy po kliencie.
          if (String(msg?.conversation_id) !== String(conversationId)) return;
          // Wiadomość usunięta, zanim dotarła — nie pokazuj.
          if (msg.deleted_at) return;
          qc.setQueryData<MessageRow[]>(["messages", conversationId], (prev: MessageRow[] | undefined) => {
            if (!prev) return [msg];
            if (prev.some((m: MessageRow) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          qc.invalidateQueries({ queryKey: ["conversations"] });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updated = payload.new as MessageRow;
          // Jak wyżej: filtr jest ignorowany przez shim, więc odrzucamy zdarzenia z
          // innych konwersacji (tu tylko podmieniamy istniejące wiersze, ale guard
          // chroni przed zbędną pracą i ewentualnym wstrzyknięciem obcego wiersza).
          if (String(updated?.conversation_id) !== String(conversationId)) return;
          qc.setQueryData<MessageRow[]>(["messages", conversationId], (prev: MessageRow[] | undefined) => {
            if (!prev) return prev;
            // Soft-deleted (deleted_at is set) — usuwamy z listy.
            if (updated.deleted_at) {
              return prev.filter((m: MessageRow) => m.id !== updated.id);
            }
            return prev.map((m: MessageRow) => (m.id === updated.id ? { ...m, ...updated } : m));
          });
          qc.invalidateQueries({ queryKey: ["conversations"] });
        },
      )
      // Reakcje — bez filtra (RLS i tak ogranicza), invaliduj cache po zmianach.
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reactions" },
        () => {
          qc.invalidateQueries({ queryKey: ["reactions", conversationId] });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pinned_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["pinned", conversationId] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_read_receipts" },
        () => {
          qc.invalidateQueries({ queryKey: ["readReceipts", conversationId] });
        },
      )
      // Ankiety/modlitwy — serwer emituje zmiany generycznie (/api/db → emitChange);
      // filtr i tak ignorowany przez shim, więc po prostu invaliduj agregaty.
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "poll_votes" },
        () => {
          qc.invalidateQueries({ queryKey: ["pollVotes", conversationId] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "prayer_responses" },
        () => {
          qc.invalidateQueries({ queryKey: ["prayerResponses", conversationId] });
        },
      )
      // Skład / role / ustawienia rozmowy (np. kanał „tylko administratorzy”) — odśwież nagłówek
      // i prawo pisania.
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversation_participants" },
        (payload) => {
          const row = (payload.new ?? payload.old) as { conversation_id?: string } | null;
          if (row?.conversation_id && String(row.conversation_id) !== String(conversationId)) return;
          qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        (payload) => {
          const row = (payload.new ?? payload.old) as { id?: string } | null;
          if (row?.id && String(row.id) !== String(conversationId)) return;
          qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, qc]);
};

/**
 * Realtime dla listy konwersacji + presence — wystarczy nasłuchiwać INSERT na messages
 * (dla każdej konwersacji w której jestem) i invalidować cache.
 * Subskrypcja "głobalna" — bez filtra, bo RLS i tak ogranicza do widzialnych wierszy.
 */
export const useRealtimeConversations = (userEmail: string | null) => {
  const qc = useQueryClient();
  useEffect(() => {
    if (!userEmail) return;
    const channelName = `messages-list:${userEmail}`;
    for (const c of supabase.getChannels()) {
      if (c.topic === `realtime:${channelName}`) {
        supabase.removeChannel(c);
      }
    }
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        () => {
          qc.invalidateQueries({ queryKey: ["conversations", userEmail] });
        },
      )
      // Dodanie do rozmowy (ktoś założył ze mną rozmowę/grupę), usunięcie ze składu,
      // zmiana nazwy lub usunięcie rozmowy — serwer wysyła te zmiany tylko uczestnikom.
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversation_participants" },
        () => {
          qc.invalidateQueries({ queryKey: ["conversations", userEmail] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => {
          qc.invalidateQueries({ queryKey: ["conversations", userEmail] });
          qc.invalidateQueries({ queryKey: ["conversation"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userEmail, qc]);
};
