import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { getActiveConversation } from "../../../lib/sounds";
import {
  applyMessageToConversations,
  conversationsKey,
  patchConversationLocally,
  removeConversationLocally,
  scheduleConversationsRefetch,
  type ConversationListItem,
  type MessageRow,
} from "../api";
import { sameEmail } from "../logic";

/**
 * Realtime dla pojedynczej konwersacji:
 * - INSERT → dopisuje wiadomość do listy
 * - UPDATE → podmienia (edycja, soft-delete)
 * Listę rozmów aktualizuje osobny hook (useRealtimeConversations) — tu bez jej pobierania.
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
          // Cytaty/przypięte spoza wczytanej paczki.
          qc.invalidateQueries({ queryKey: ["messagesById", conversationId] });
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

// Pola mojego wiersza uczestnika, które lista pokazuje (zmiana z innego urządzenia też).
const MY_ROW_FIELDS = ["last_read_at", "muted", "muted_until", "archived", "pinned", "starred"] as const;
// Pola rozmowy na liście.
const CONV_FIELDS = ["name", "description", "posting_policy", "avatar_url", "ministry_key", "type", "last_message_at", "updated_at"] as const;

/**
 * Realtime dla listy rozmów (K11 — lżejsza lista): zdarzenia nanosimy lokalnie (nowa wiadomość
 * podnosi rozmowę, zmienia podgląd i licznik; moje ustawienia, nazwa rozmowy), a pełne pobranie
 * listy — tylko gdy lokalnie się nie da (nowa rozmowa, usunięta ostatnia wiadomość, zmiana
 * składu z moim udziałem) i zbiorczo, z opóźnieniem. Serwer wysyła zdarzenia tylko uczestnikom.
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
    const list = () => qc.getQueryData<ConversationListItem[]>(conversationsKey(userEmail));
    const has = (cid: unknown) => !!list()?.some((c: ConversationListItem) => c.id === String(cid));

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const msg = payload.new as MessageRow | null;
          if (!msg?.conversation_id) return;
          if (has(msg.conversation_id)) applyMessageToConversations(qc, userEmail, msg, getActiveConversation());
          // Rozmowa, której nie ma na liście (np. ktoś właśnie do mnie napisał pierwszy raz).
          else scheduleConversationsRefetch(qc, userEmail);
        },
      )
      // Edycja / usunięcie wiadomości — ważne tylko, gdy to ostatnia wiadomość rozmowy na liście.
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          const row = payload.new as MessageRow | null;
          if (!row?.id || !row.conversation_id) return;
          const conv = list()?.find((c: ConversationListItem) => c.id === String(row.conversation_id));
          if (!conv || conv.last_message?.id !== row.id) return;
          if (row.deleted_at) scheduleConversationsRefetch(qc, userEmail);
          else
            patchConversationLocally(qc, userEmail, conv.id, (c) => ({
              last_message: c.last_message ? { ...c.last_message, content: row.content } : c.last_message,
            }));
        },
      )
      // Dodanie do rozmowy / usunięcie ze składu / moje ustawienia z innego urządzenia.
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversation_participants" },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, any> | null;
          const cid = row?.conversation_id != null ? String(row.conversation_id) : null;
          if (!row || !cid || !row.user_email) {
            scheduleConversationsRefetch(qc, userEmail);
            return;
          }
          if (!sameEmail(row.user_email, userEmail)) {
            // Cudzy wiersz — zmienia się tylko liczba uczestników; bez pobierania listy.
            if (payload.eventType === "INSERT" || payload.eventType === "DELETE") {
              patchConversationLocally(qc, userEmail, cid, (c) => ({
                participants_count: Math.max(0, (c.participants_count ?? 0) + (payload.eventType === "INSERT" ? 1 : -1)),
              }));
            }
            return;
          }
          if (payload.eventType === "DELETE") {
            removeConversationLocally(qc, userEmail, cid);
            return;
          }
          if (payload.eventType === "UPDATE" && has(cid) && payload.new) {
            const n = payload.new as Record<string, any>;
            const patch: Record<string, any> = {};
            for (const f of MY_ROW_FIELDS) if (f in n) patch[f] = f === "muted_until" || f === "last_read_at" ? n[f] ?? null : !!n[f];
            if ("role" in n) patch.my_role = n.role ?? null;
            patchConversationLocally(qc, userEmail, cid, (c) => {
              // Przeczytane na innym urządzeniu — licznik zeruje się, gdy znacznik objął ostatnią wiadomość.
              const read = patch.last_read_at && c.last_message?.created_at && new Date(patch.last_read_at) >= new Date(c.last_message.created_at);
              return read ? { ...patch, unread_count: 0 } : patch;
            });
            return;
          }
          scheduleConversationsRefetch(qc, userEmail);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        (payload) => {
          qc.invalidateQueries({ queryKey: ["conversation"] });
          const row = (payload.new ?? payload.old) as Record<string, any> | null;
          const cid = row?.id != null ? String(row.id) : null;
          if (!cid) return;
          if (payload.eventType === "DELETE") {
            removeConversationLocally(qc, userEmail, cid);
            return;
          }
          if (payload.eventType === "UPDATE" && payload.new && has(cid)) {
            const n = payload.new as Record<string, any>;
            const patch: Record<string, any> = {};
            for (const f of CONV_FIELDS) if (f in n) patch[f] = n[f];
            patchConversationLocally(qc, userEmail, cid, patch);
          }
          // INSERT — skład dochodzi osobnym zdarzeniem (conversation_participants).
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userEmail, qc]);
};
