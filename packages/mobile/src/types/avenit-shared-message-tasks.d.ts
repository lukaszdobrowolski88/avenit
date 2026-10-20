// Typy dla wspólnej logiki „Utwórz zadanie” z wiadomości i „Zapisane” (@avenit/shared to czyste JS).
declare module '@avenit/shared/src/lib/messageTasks.js' {
  export const TASK_NAME_MAX: number;
  export const MINISTRY_CHANNEL_MODULES: Record<string, string>;
  export function messageTaskName(content: string | null | undefined, max?: number): string;
  export function conversationModuleKey(
    conv: { type?: string | null; ministry_key?: string | null } | null | undefined,
  ): string | null;
  export function messageLinkPath(conversationId: string | number, messageId?: string | number | null, threadRootId?: string | number | null): string;
  export function parseMessageLink(link: string | null | undefined): { conversationId: string; messageId: string | null; threadRootId: string | null } | null;
  export function messageTaskDescription(input: { content?: string | null; fromLine?: string | null; url?: string | null }): string;

  export interface MessageTaskRow {
    id: string;
    boardId: string;
    board: { id: string | number; name?: string | null; module_key?: string | null; source_kind?: string | null; is_template?: boolean | null };
    name: string;
    status: { id: string; title: string; color: string | null } | null;
    done: boolean;
    createdAt: string | null;
  }
  export function tasksByMessage(
    items: Array<Record<string, any>>,
    boards?: Array<Record<string, any>>,
    columns?: Array<Record<string, any>>,
  ): Map<string, MessageTaskRow[]>;
  export function savedMessageRows<S extends { message_id: string; created_at?: string | null }, M extends { id: string; deleted_at?: string | null }>(
    saved: S[],
    messages: M[],
  ): Array<{ saved: S; message: M }>;
}
