import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

// Widżety pulpitu, które web ma, a mobile nie miał (PersonalDashboard.jsx): nadchodzące
// wydarzenia, urodziny, dawanie w miesiącu, frekwencja, RSVP. Każdy to osobne zapytanie
// włączane uprawnieniem (enabled) — 403 jednego widżetu nie psuje reszty pulpitu.
// Zapytania jak w widżetach weba (src/modules/Dashboard/widgets/*).

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export interface UpcomingEvent {
  id: string;
  title: string;
  category: string | null;
  date: string;
  time: string | null;
  location: string | null;
}

export const useUpcomingEvents = (enabled: boolean) =>
  useQuery({
    queryKey: ['dashboard', 'upcoming-events'],
    enabled,
    retry: false,
    queryFn: async (): Promise<UpcomingEvent[]> => {
      const { data, error } = await supabase
        .from('events')
        .select('id, title, category, date, time, location')
        .gte('date', ymd(new Date()))
        .order('date', { ascending: true })
        .limit(12);
      if (error) return [];
      return ((data ?? []) as any[])
        .map((e) => ({
          id: String(e.id),
          title: e.title ?? 'Wydarzenie',
          category: e.category ?? null,
          date: String(e.date).slice(0, 10),
          time: e.time ? String(e.time).slice(0, 5) : null,
          location: e.location ?? null,
        }))
        .sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))
        .slice(0, 5);
    },
  });

export interface Birthday {
  id: string;
  name: string;
  daysUntil: number;
  turning: number | null;
}

// Następne urodziny (dni do) — liczone w lokalnej strefie, 29 lutego → 28 w roku nieprzestępnym.
const nextBirthdayIn = (birth: string, today: Date) => {
  const [y, m, d] = birth.slice(0, 10).split('-').map(Number);
  if (!m || !d) return null;
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const at = (year: number) => {
    const day = m === 2 && d === 29 && new Date(year, 1, 29).getMonth() !== 1 ? 28 : d;
    return new Date(year, m - 1, day);
  };
  let next = at(base.getFullYear());
  if (next < base) next = at(base.getFullYear() + 1);
  const days = Math.round((next.getTime() - base.getTime()) / 86_400_000);
  return { days, turning: y ? next.getFullYear() - y : null };
};

export const useBirthdays = (enabled: boolean) =>
  useQuery({
    queryKey: ['dashboard', 'birthdays'],
    enabled,
    retry: false,
    queryFn: async (): Promise<Birthday[]> => {
      const { data, error } = await supabase
        .from('members')
        .select('id, first_name, last_name, birth_date')
        .not('birth_date', 'is', null);
      if (error) return [];
      const today = new Date();
      const out: Birthday[] = [];
      for (const m of (data ?? []) as any[]) {
        const nb = m.birth_date ? nextBirthdayIn(String(m.birth_date), today) : null;
        if (!nb || nb.days > 14) continue;
        out.push({
          id: String(m.id),
          name: [m.first_name, m.last_name].filter(Boolean).join(' ') || 'Członek',
          daysUntil: nb.days,
          turning: nb.turning,
        });
      }
      return out.sort((a, b) => a.daysUntil - b.daysUntil).slice(0, 8);
    },
  });

export interface GivingSummary {
  month: number;
  year: number;
  monthCount: number;
}

export const useGivingSummary = (enabled: boolean) =>
  useQuery({
    queryKey: ['dashboard', 'giving-summary'],
    enabled,
    retry: false,
    queryFn: async (): Promise<GivingSummary | null> => {
      const now = new Date();
      const { data, error } = await supabase
        .from('donations')
        .select('amount, donation_date, status')
        .gte('donation_date', `${now.getFullYear()}-01-01`)
        .eq('status', 'completed');
      if (error) return null;
      let month = 0;
      let year = 0;
      let monthCount = 0;
      for (const d of (data ?? []) as any[]) {
        const amt = Number(d.amount) || 0;
        year += amt;
        if (d.donation_date && new Date(d.donation_date).getMonth() === now.getMonth()) {
          month += amt;
          monthCount += 1;
        }
      }
      return { month, year, monthCount };
    },
  });

export interface AttendancePoint {
  id: string;
  title: string | null;
  date: string | null;
  headcount: number;
}

export const useAttendanceRecent = (enabled: boolean) =>
  useQuery({
    queryKey: ['dashboard', 'attendance'],
    enabled,
    retry: false,
    queryFn: async (): Promise<AttendancePoint[]> => {
      const { data, error } = await supabase
        .from('attendance_sessions')
        .select('id, title, session_date, headcount')
        .order('session_date', { ascending: false })
        .limit(8);
      if (error) return [];
      return ((data ?? []) as any[])
        .map((s) => ({
          id: String(s.id),
          title: s.title ?? null,
          date: s.session_date ? String(s.session_date).slice(0, 10) : null,
          headcount: Number(s.headcount) || 0,
        }))
        .reverse();
    },
  });

export interface RsvpCampaignSummary {
  id: string;
  title: string;
  eventDate: string | null;
  yes: number;
  pending: number;
}

export const useRsvpSummary = (enabled: boolean) =>
  useQuery({
    queryKey: ['dashboard', 'rsvp-summary'],
    enabled,
    retry: false,
    queryFn: async (): Promise<RsvpCampaignSummary[]> => {
      const { data, error } = await supabase
        .from('rsvp_campaigns')
        .select('id, title, event_date')
        .eq('status', 'sent')
        .gte('event_date', ymd(new Date()))
        .order('event_date', { ascending: true })
        .limit(3);
      if (error || !data?.length) return [];
      const ids = (data as any[]).map((c) => c.id);
      const counts = new Map<string, { yes: number; pending: number }>();
      const { data: invs } = await supabase
        .from('rsvp_invitations')
        .select('campaign_id, status')
        .in('campaign_id', ids);
      for (const i of (invs ?? []) as any[]) {
        const c = counts.get(String(i.campaign_id)) ?? { yes: 0, pending: 0 };
        if (i.status === 'yes') c.yes += 1;
        if (i.status === 'pending') c.pending += 1;
        counts.set(String(i.campaign_id), c);
      }
      return (data as any[]).map((c) => ({
        id: String(c.id),
        title: c.title ?? 'Zaproszenie',
        eventDate: c.event_date ? String(c.event_date).slice(0, 10) : null,
        yes: counts.get(String(c.id))?.yes ?? 0,
        pending: counts.get(String(c.id))?.pending ?? 0,
      }));
    },
  });
