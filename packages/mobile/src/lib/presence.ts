import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { supabase } from './supabase';

export type PresenceStatus = 'online' | 'away' | 'offline';

interface PresenceEntry {
  status: PresenceStatus;
  last_seen: string | null;
}

const presenceCache = new Map<string, PresenceEntry>();
const listeners = new Set<(map: Map<string, PresenceEntry>) => void>();

const notify = () => {
  for (const l of listeners) l(new Map(presenceCache));
};

export const updatePresence = async (
  userEmail: string,
  status: PresenceStatus = 'online',
): Promise<void> => {
  const now = new Date().toISOString();
  const { error } = await (supabase.from('user_presence') as any).upsert(
    {
      user_email: userEmail,
      status,
      last_seen: now,
      updated_at: now,
    },
    { onConflict: 'user_email' },
  );
  if (error) {
    if ((error as any).code !== '42P01' && (error as any).code !== '42501') {
      if (__DEV__) console.warn('[presence] update failed:', error.message);
    }
    return;
  }
  presenceCache.set(userEmail, { status, last_seen: now });
  notify();
};

export const useMyPresence = (userEmail: string | null) => {
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!userEmail) return;
    updatePresence(userEmail, 'online');
    heartbeatRef.current = setInterval(() => {
      if (AppState.currentState === 'active') {
        updatePresence(userEmail, 'online');
      }
    }, 30_000);

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') updatePresence(userEmail, 'online');
      else updatePresence(userEmail, 'away');
    });

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      sub.remove();
      updatePresence(userEmail, 'offline');
    };
  }, [userEmail]);
};

export const usePresence = (userEmails: string[]) => {
  const [, setVersion] = useState(0);
  const emailsKey = userEmails.slice().sort().join(',');

  const getStatus = useCallback((email: string): PresenceStatus => {
    const p = presenceCache.get(email);
    if (!p || !p.last_seen) return 'offline';
    const ageMs = Date.now() - new Date(p.last_seen).getTime();
    if (ageMs > 120_000) return 'offline';
    if (ageMs > 45_000 && p.status === 'online') return 'away';
    return p.status;
  }, []);

  const getLastSeen = useCallback(
    (email: string): string | null => presenceCache.get(email)?.last_seen ?? null,
    [],
  );

  useEffect(() => {
    if (userEmails.length === 0) return;
    let cancelled = false;
    const fetchInitial = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session || cancelled) return;
        const { data, error } = await supabase
          .from('user_presence')
          .select('user_email, status, last_seen')
          .in('user_email', userEmails);
        if (error) {
          if ((error as any).code === '42P01' || (error as any).code === '42501') return;
          throw error;
        }
        for (const p of (data ?? []) as Array<{
          user_email: string;
          status: PresenceStatus;
          last_seen: string | null;
        }>) {
          presenceCache.set(p.user_email, {
            status: p.status,
            last_seen: p.last_seen,
          });
        }
        for (const e of userEmails) {
          if (!presenceCache.has(e)) {
            presenceCache.set(e, { status: 'offline', last_seen: null });
          }
        }
        notify();
      } catch (err) {
        if (__DEV__) console.warn('[presence] fetch failed', err);
      }
    };

    const listener = () => setVersion((v) => v + 1);
    listeners.add(listener);

    fetchInitial();

    const channelName = `presence-changes:${emailsKey.slice(0, 32)}`;
    for (const c of supabase.getChannels()) {
      if (c.topic === `realtime:${channelName}`) supabase.removeChannel(c);
    }
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_presence' },
        (payload) => {
          const r = (payload.new ?? payload.old) as
            | { user_email?: string; status?: PresenceStatus; last_seen?: string | null }
            | undefined;
          if (!r?.user_email) return;
          if (!userEmails.includes(r.user_email)) return;
          presenceCache.set(r.user_email, {
            status: (r.status ?? 'offline') as PresenceStatus,
            last_seen: r.last_seen ?? null,
          });
          notify();
        },
      )
      .subscribe();

    const tick = setInterval(() => setVersion((v) => v + 1), 30_000);

    return () => {
      cancelled = true;
      listeners.delete(listener);
      supabase.removeChannel(channel);
      clearInterval(tick);
    };
  }, [emailsKey]);

  return { getStatus, getLastSeen };
};

export const PRESENCE_COLORS: Record<PresenceStatus, string> = {
  online: '#22c55e',
  away: '#eab308',
  offline: '#94a3b8',
};

export const PRESENCE_LABELS: Record<PresenceStatus, string> = {
  online: 'Online',
  away: 'Zaraz wracam',
  offline: 'Offline',
};
