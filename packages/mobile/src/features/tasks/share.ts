import { supabase, tenantWebBase } from '../../lib/supabase';
import { taskFromLink } from '../../lib/deep-links';
import { taskItemLink } from '@avenit/shared/src/lib/taskLinks.js';
import type { TaskTarget } from './navigation';

// „Wyślij do czatu” — jak web (Komunikator/components/ShareToChatModal.jsx): zwykła wiadomość
// tekstowa (komentarz) + „Zadanie: nazwa” + PEŁNY link do zadania (taskItemLink, ta sama reguła
// co powiadomienia). Bez metadanych — web pokazuje to jako tekst z linkiem; apka rozpoznaje
// link do zadania własnego tenanta i otwiera ekran zadania (taskFromChatLink).

type BoardLike = { id?: string | number | null; module_key?: string | null; source_kind?: string | null };

// Pełny adres zadania na webie tenanta (link działa też poza aplikacją).
export const absoluteTaskUrl = (board: BoardLike, itemId: string | number, paths: Record<string, string>): string =>
  `${tenantWebBase()}${taskItemLink(board, itemId, paths)}`;

const HEAD = 'Zadanie: ';

// Treść wiadomości: (komentarz) + „Zadanie: nazwa” + link — identycznie jak shareMessageText na webie.
export const shareMessageText = ({ name, url, note = '' }: { name?: string | null; url: string; note?: string }): string => {
  const head = `${HEAD}${String(name || '').trim() || 'Bez nazwy'}`;
  return [String(note || '').trim(), head, url].filter(Boolean).join('\n');
};

// Wysyłka = zwykły insert do messages (push/wzmianki robi serwer — push-hooks, jak przy każdej wiadomości).
export const sendTaskToChat = async (input: {
  conversationId: string;
  senderEmail: string;
  content: string;
}): Promise<void> => {
  const { error } = await (supabase.from('messages') as any)
    .insert({
      conversation_id: input.conversationId,
      sender_email: input.senderEmail,
      content: input.content,
      attachments: [],
    })
    .select()
    .single();
  if (error) throw error;
};

const hostOf = (url: string): string | null => {
  const m = /^https?:\/\/([^/?#:]+)/i.exec(url);
  return m ? m[1].toLowerCase() : null;
};

// Link z czatu → zadanie, ale tylko gdy prowadzi do weba TEGO tenanta (albo jest ścieżką bez hosta).
// Obcy adres z ?item= to nie nasze zadanie — zostaje zwykłym linkiem.
export const taskFromChatLink = (url: string | null | undefined): TaskTarget | null => {
  if (!url || !/[?&]item=/.test(url)) return null;
  const host = hostOf(url);
  if (host) {
    const own = hostOf(tenantWebBase());
    if (!own || host !== own) return null;
  } else if (!url.startsWith('/')) {
    return null;
  }
  const path = url.replace(/^https?:\/\/[^/?#]+/i, '') || '/';
  return taskFromLink(path);
};

// Nagłówek „Zadanie: …” w językach weba (tr na webie: EN „Task: ”, UK „Завдання: ”).
const HEADS = [HEAD, 'Task: ', 'Завдання: '];

// Nazwa zadania z treści wiadomości wysłanej przez „Wyślij do czatu” (linia „Zadanie: …”).
export const taskNameFromMessage = (content: string | null | undefined): string | null => {
  for (const line of String(content ?? '').split('\n')) {
    const head = HEADS.find((h) => line.startsWith(h));
    if (head) return line.slice(head.length).trim() || null;
  }
  return null;
};
