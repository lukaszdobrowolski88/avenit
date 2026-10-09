import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { plural } from '../../lib/domain';
import { taskFromNotificationData } from '../../lib/deep-links';

export type NotificationType = 'message' | 'mention' | 'task' | 'event' | 'system';

export interface NotificationRow {
  id: string;
  user_email: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  data: Record<string, unknown> | null;
  read: boolean;
  created_at: string;
}

export const useNotifications = (userEmail: string | null) =>
  useQuery({
    queryKey: ['notifications', userEmail],
    queryFn: async (): Promise<NotificationRow[]> => {
      if (!userEmail) return [];
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_email', userEmail)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
    enabled: !!userEmail,
  });

export const useUnreadNotificationsCount = (userEmail: string | null) =>
  useQuery({
    queryKey: ['notifications', 'unread', userEmail],
    queryFn: async (): Promise<number> => {
      if (!userEmail) return 0;
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_email', userEmail)
        .eq('read', false);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!userEmail,
  });

export const useMarkAllRead = (userEmail: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!userEmail) return;
      const { error } = await (supabase.from('notifications') as any)
        .update({ read: true })
        .eq('user_email', userEmail)
        .eq('read', false);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
};

export const useMarkRead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from('notifications') as any)
        .update({ read: true })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
};

export const TYPE_META: Record<
  NotificationType,
  { tint: string; bg: string; label: string }
> = {
  message: { tint: '#2A2312', bg: '#ECE8DE', label: 'Wiadomość' },
  mention: { tint: '#6B6557', bg: '#ECE8DE', label: 'Wzmianka' },
  task: { tint: '#8A6606', bg: '#FFF1C2', label: 'Zadanie' },
  event: { tint: '#8A6606', bg: '#FFF1C2', label: 'Wydarzenie' },
  system: { tint: '#6B6557', bg: '#E3DDD0', label: 'System' },
};

// Grupowanie listy:
//  • wiadomości z jednej rozmowy (także @wzmianki z czatu — mają conversation_id) → JEDNA pozycja
//    jak w komunikatorach: ostatnia wiadomość, „N wiadomości”;
//  • powiadomienia o jednym zadaniu (przypisanie 'task', @wzmianka w komentarzu 'mention' bez
//    conversation_id) → JEDNA pozycja zadania, „N powiadomień”; otwiera ekran zadania.
//    Wcześniej wzmianka z zadania wpadała do grupy „wiadomości” po samym linku;
//  • reszta bez zmian.
export interface NotificationItem extends NotificationRow {
  ids: string[];        // wszystkie powiadomienia w grupie (do oznaczenia jako przeczytane)
  unreadIds: string[];
  count: number;
  // Rodzaj pozycji: rozmowa, zadanie albo pojedyncze powiadomienie.
  kind: 'chat' | 'task' | 'single';
  // Zadanie, którego dotyczy pozycja (otwierane przez /(app)/tasks/[id]).
  taskId: string | null;
  taskBoardId: string | null;
  // Podpis liczby w grupie, np. „3 wiadomości” / „2 powiadomienia”; null = bez podpisu.
  countLabel: string | null;
}

const taskLinkOf = (task: { itemId: string; boardId: string | null }, link: string | null): string | null => {
  if (!task.boardId && link) return link;
  return `/projekty?board=${encodeURIComponent(task.boardId ?? '')}&item=${encodeURIComponent(task.itemId)}`;
};

const countLabelFor = (kind: NotificationItem['kind'], count: number): string | null => {
  if (count < 2) return null;
  if (kind === 'chat') return `${count} ${plural(count, 'wiadomość', 'wiadomości', 'wiadomości')}`;
  return `${count} ${plural(count, 'powiadomienie', 'powiadomienia', 'powiadomień')}`;
};

export const groupNotifications = (rows: NotificationRow[]): NotificationItem[] => {
  const out: NotificationItem[] = [];
  const byKey = new Map<string, NotificationItem>();
  for (const n of rows) {
    const data = (n.data ?? null) as Record<string, unknown> | null;
    const conv = typeof data?.conversation_id === 'string' ? data.conversation_id : null;
    // Zadanie: item_id w danych albo link z ?item= (powiadomienia automatyzacji, starsze wpisy).
    const task = n.type === 'message' ? null : taskFromNotificationData(data, n.link);
    const isChat = !task && (n.type === 'message' || (n.type === 'mention' && !!conv)) && !!(conv || n.link);
    const key = task ? `task:${task.itemId}` : isChat ? `msg:${conv || n.link}` : null;
    const g = key ? byKey.get(key) : undefined;
    if (g) {
      g.ids.push(n.id);
      if (!n.read) g.unreadIds.push(n.id);
      g.count += 1;
      g.countLabel = countLabelFor(g.kind, g.count);
      if (!n.read) g.read = false;
      continue;
    }
    // Lista przychodzi od najnowszych — pierwszy wiersz grupy = ostatnie zdarzenie.
    const kind: NotificationItem['kind'] = task ? 'task' : isChat ? 'chat' : 'single';
    const item: NotificationItem = {
      ...n,
      // Zadanie: link z id tablicy (ekran listy otwiera pozycję po linku → ekran zadania z boardId);
      // ścieżka modułu z ?item= nie niesie tablicy.
      link: task ? taskLinkOf(task, n.link) : n.link,
      ids: [n.id],
      unreadIds: n.read ? [] : [n.id],
      count: 1,
      kind,
      taskId: task?.itemId ?? null,
      taskBoardId: task?.boardId ?? null,
      countLabel: null,
    };
    out.push(item);
    if (key) byKey.set(key, item);
  }
  return out;
};
