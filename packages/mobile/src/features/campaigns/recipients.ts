import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import {
  EMPTY_SOURCE,
  MINISTRY_DEFINITIONS,
  type GroupWithMembers,
  type RecipientUser,
  type RecipientsSource,
} from './recipientsLogic';

// Źródła odbiorców — te same zapytania co useRecipientsSource na webie (src/modules/shared/recipients.js).
// Opt-out: push → push_user_preferences (enabled=false); SMS → sms_user_preferences
// (enabled=false LUB marketing_consent=false).

export type OptOutSource = 'push_user_preferences' | 'sms_user_preferences';

const asList = (d: unknown) => ((d ?? []) as any[]);

const fetchSource = async (optOutSource: OptOutSource): Promise<RecipientsSource> => {
  const [usersRes, hgRes, hgmRes, campusesRes] = await Promise.all([
    supabase.from('app_users').select('email, full_name, avatar_url, campus_id, role, phone'),
    supabase.from('home_groups').select('id, name'),
    supabase.from('home_group_members').select('id, full_name, email, group_id, phone'),
    supabase.from('campuses').select('id, name, is_active'),
  ]);
  // Bez listy użytkowników nie ma czego liczyć — pokaż błąd zamiast „0 odbiorców”.
  if (usersRes.error) throw usersRes.error;

  const hgm = asList(hgmRes.data);
  const homeGroups: GroupWithMembers[] = asList(hgRes.data).map((g) => ({
    id: String(g.id),
    name: String(g.name ?? 'Grupa'),
    members: hgm
      .filter((m) => String(m.group_id) === String(g.id))
      .map((m) => ({ email: m.email ?? null, full_name: m.full_name ?? null, phone: m.phone ?? null })),
  }));

  // Telefon z home_group_members dla użytkowników bez telefonu w app_users (jak web).
  const users = asList(usersRes.data);
  const phoneByEmail = new Map<string, string>();
  users.forEach((u) => {
    if (u.email && u.phone) phoneByEmail.set(u.email, u.phone);
  });
  hgm.forEach((m) => {
    if (m.email && m.phone && !phoneByEmail.has(m.email)) phoneByEmail.set(m.email, m.phone);
  });

  const ministries: GroupWithMembers[] = await Promise.all(
    MINISTRY_DEFINITIONS.map(async (m) => {
      try {
        const { data } = await supabase.from(m.table).select(`${m.emailField}, ${m.nameField}`);
        return {
          id: m.key,
          key: m.key,
          name: m.name,
          members: asList(data)
            .map((r) => ({ email: r[m.emailField] ?? null, full_name: r[m.nameField] ?? null, phone: null }))
            .filter((r) => r.email),
        };
      } catch {
        return { id: m.key, key: m.key, name: m.name, members: [] };
      }
    }),
  );

  let unsubscribed: string[] = [];
  if (optOutSource === 'push_user_preferences') {
    const { data } = await supabase.from('push_user_preferences').select('user_email').eq('enabled', false);
    unsubscribed = asList(data).map((u) => u.user_email);
  } else {
    const { data } = await supabase.from('sms_user_preferences').select('user_email, enabled, marketing_consent');
    unsubscribed = asList(data)
      .filter((u) => u.enabled === false || u.marketing_consent === false)
      .map((u) => u.user_email);
  }

  const allUsers: RecipientUser[] = users.map((u) => ({
    email: u.email ?? null,
    full_name: u.full_name ?? null,
    avatar_url: u.avatar_url ?? null,
    campus_id: u.campus_id ?? null,
    role: u.role ?? null,
    phone: u.phone || phoneByEmail.get(u.email) || null,
  }));

  return {
    allUsers,
    ministries: ministries.filter((m) => m.members.length > 0),
    homeGroups,
    campuses: asList(campusesRes.data)
      .filter((c) => c.is_active !== false)
      .map((c) => ({ id: c.id, name: String(c.name ?? 'Kampus') })),
    unsubscribed,
  };
};

export const useRecipientsSource = (optOutSource: OptOutSource) => {
  const query = useQuery({
    queryKey: ['campaigns', 'recipients-source', optOutSource],
    queryFn: () => fetchSource(optOutSource),
    staleTime: 60_000,
  });
  const source: RecipientsSource = query.data ?? EMPTY_SOURCE;
  return { source, loading: query.isLoading, error: query.error, refetch: query.refetch };
};
