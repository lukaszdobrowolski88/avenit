import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type { MessageAttachment } from "./api";

// Media / pliki / linki / głosówki rozmowy (fn chat-media) — jak web (hooks/useConversationFiles.js):
// filtruje serwer, paczkami od najnowszych z kursorem; tylko uczestnik rozmowy.
export type FilesKind = "media" | "files" | "links" | "voice";

export interface ConversationFileItem {
  key: string;
  message_id: string;
  /** Odpowiedź w wątku (112) — id wiadomości głównej; galeria obejmuje całą rozmowę. */
  thread_root_id?: string | null;
  sender_email: string;
  sender_name: string;
  created_at: string;
  /** media / files / voice */
  attachment?: MessageAttachment & { isVoiceMessage?: boolean; duration?: number };
  /** links */
  url?: string;
  domain?: string;
  title?: string | null;
  site_name?: string | null;
}

const PAGE = 40;

export const useConversationFiles = (conversationId: string, kind: FilesKind, enabled: boolean) =>
  useInfiniteQuery({
    queryKey: ["conversationFiles", conversationId, kind],
    initialPageParam: null as string | null,
    enabled: enabled && !!conversationId,
    // Każde otwarcie okna = świeże dane (cache tylko na czas przełączania zakładek).
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
    queryFn: async ({ pageParam }: { pageParam: string | null }): Promise<{ items: ConversationFileItem[]; next: string | null }> => {
      const { data, error } = await supabase.functions.invoke("chat-media", {
        body: { conversation_id: conversationId, kind, cursor: pageParam ?? undefined, limit: PAGE },
        silent: true,
      } as any);
      if (error) throw error;
      const d = (data ?? {}) as { items?: ConversationFileItem[]; next?: string | null };
      return { items: Array.isArray(d.items) ? d.items : [], next: d.next ?? null };
    },
    getNextPageParam: (last: { next: string | null }) => last.next,
  });
