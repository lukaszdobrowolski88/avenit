import type { Router } from 'expo-router';
import { openTask as openTaskScreen, taskFromNotificationData } from '../../lib/deep-links';

// Wejście w ekran zadania (app/(app)/tasks/[id].tsx). Jedna implementacja trasy i rozpoznawania
// zadań z powiadomień/linków — src/lib/deep-links.ts (openTask, taskFromNotificationData);
// tu tylko wygodne opakowania dla ekranów zadań, Kalendarza i pulpitu.

export interface TaskTarget {
  itemId: string;
  boardId: string | null;
}

export const openTask = (router: Router, target: TaskTarget) => openTaskScreen(router, target.itemId, target.boardId);

// Wiersz `notifications` ({ type, link, data: { item_id, board_id } }) albo dane pusha
// ({ type, item_id, board_id, link } płasko) → zadanie; wzmianka z czatu → null.
export const taskTargetFromNotification = (
  n: { link?: unknown; data?: unknown; item_id?: unknown; board_id?: unknown } | null | undefined,
): TaskTarget | null => {
  if (!n) return null;
  const nested = n.data && typeof n.data === 'object' ? (n.data as Record<string, unknown>) : null;
  const data = nested ?? (n as Record<string, unknown>);
  const link = typeof n.link === 'string' ? n.link : null;
  return taskFromNotificationData(data, link);
};

// Otwiera zadanie z powiadomienia; false = to nie zadanie (wywołujący robi swoje).
export const openTaskFromNotification = (router: Router, n: Parameters<typeof taskTargetFromNotification>[0]): boolean => {
  const target = taskTargetFromNotification(n);
  if (!target) return false;
  openTask(router, target);
  return true;
};
