import * as Notifications from 'expo-notifications';
import type { QueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { unreadConversationsBadge } from '../features/messenger/logic';

// Plakietka na ikonie aplikacji = liczba rozmów z nieprzeczytanymi wiadomościami (bez archiwum).
//  • push wiadomości niesie `badge` liczony przez serwer (apka zamknięta / w tle),
//  • apka na wierzchu: liczba z serwera po powrocie (fn chat-badge) i z listy rozmów przy każdej
//    zmianie (nowa wiadomość, przeczytanie rozmowy),
//  • wylogowanie — zero.
// Android: liczbę na ikonie pokazuje launcher z powiadomień (kanał „default” ma plakietkę domyślnie);
// setBadgeCountAsync działa tam tylko na części launcherów — błąd bez znaczenia.

// Bez pamiętania „ostatniej wartości”: push sam zmienia plakietkę (aps.badge) za plecami apki.
export async function setAppBadge(count: number): Promise<void> {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  try {
    await Notifications.setBadgeCountAsync(n);
  } catch {
    // brak uprawnień do plakietki / moduł niedostępny
  }
}

export const clearAppBadge = () => setAppBadge(0);

/** Liczba z serwera (fn chat-badge); bez niej (starszy serwer, brak sieci) — z listy rozmów w pamięci. */
export async function syncAppBadge(qc: QueryClient, userEmail: string | null | undefined): Promise<void> {
  if (!userEmail) return;
  try {
    const { data, error } = await supabase.functions.invoke('chat-badge', { body: {} });
    const n = (data as { count?: unknown } | null)?.count;
    if (!error && typeof n === 'number') {
      await setAppBadge(n);
      return;
    }
  } catch {
    // niżej — z pamięci
  }
  const list = qc.getQueryData<{ archived?: boolean | null; unread_count?: number | null }[]>(['conversations', userEmail]);
  if (list) await setAppBadge(unreadConversationsBadge(list));
}

/**
 * Plakietka za listą rozmów: każda zmiana danych ['conversations', email] (pobranie, realtime,
 * przeczytanie) przelicza liczbę. Zwraca funkcję odpinającą.
 */
export function watchConversationsBadge(qc: QueryClient, userEmail: string): () => void {
  return qc.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated') return;
    const key = event.query.queryKey as unknown[];
    if (key[0] !== 'conversations' || key[1] !== userEmail) return;
    const list = event.query.state.data as { archived?: boolean | null; unread_count?: number | null }[] | undefined;
    if (Array.isArray(list)) setAppBadge(unreadConversationsBadge(list));
  });
}
