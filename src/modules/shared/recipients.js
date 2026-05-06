// Wspólna logika segmentowania odbiorców (używana przez Mailing i PushCampaigns).
// Resolwuje listę emaili z definicji segmentów (all/campus/ministry/home_group/role/custom_email).
//
// Wydzielone z src/modules/Mailing/hooks/useRecipients.js — push i mailing dzielą tę samą
// logikę, ale push dodatkowo czyta `push_user_preferences` (opt-out) zamiast `email_unsubscribes`.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

const MINISTRY_DEFINITIONS = [
  { key: 'worship_team',  name: 'Zespół Uwielbienia', table: 'worship_team',     emailField: 'email', nameField: 'full_name' },
  { key: 'media_team',    name: 'Media Team',         table: 'media_team',       emailField: 'email', nameField: 'full_name' },
  { key: 'atmosfera_team',name: 'Atmosfera Team',     table: 'atmosfera_members',emailField: 'email', nameField: 'full_name' },
  { key: 'kids_ministry', name: 'Małe SCH TOMY',      table: 'kids_teachers',    emailField: 'email', nameField: 'full_name' },
];

export const ROLE_OPTIONS = [
  { id: 'superadmin', name: 'Super Admin' },
  { id: 'admin', name: 'Admin' },
  { id: 'rada_starszych', name: 'Rada Starszych' },
  { id: 'koordynator', name: 'Koordynator' },
  { id: 'lider', name: 'Lider' },
  { id: 'czlonek', name: 'Członek' },
];

/**
 * Hook do pobierania źródeł odbiorców i resolvowania segmentów.
 *
 * @param {Object} opts
 * @param {('email_unsubscribes'|'push_user_preferences'|null)} opts.optOutSource
 *        Skąd pobierać listę wykluczonych: dla mailingu 'email_unsubscribes',
 *        dla pushy 'push_user_preferences' (enabled=false), dla niczego null.
 */
export function useRecipientsSource({ optOutSource = null } = {}) {
  const [allUsers, setAllUsers] = useState([]);
  const [ministries, setMinistries] = useState([]);
  const [homeGroups, setHomeGroups] = useState([]);
  const [campuses, setCampuses] = useState([]);
  const [unsubscribed, setUnsubscribed] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      const [usersRes, hgRes, hgmRes, campusesRes] = await Promise.all([
        supabase.from('app_users').select('email, full_name, avatar_url, campus_id, role'),
        supabase.from('home_groups').select('id, name'),
        supabase.from('home_group_members').select('id, full_name, email, group_id'),
        supabase.from('campuses').select('id, name, is_active'),
      ]);

      const homeGroupsWithMembers = (hgRes.data || []).map(g => ({
        ...g,
        members: (hgmRes.data || []).filter(m => m.group_id === g.id)
                    .map(m => ({ email: m.email, full_name: m.full_name })),
      }));

      const ministriesWithMembers = await Promise.all(
        MINISTRY_DEFINITIONS.map(async (m) => {
          try {
            const { data } = await supabase
              .from(m.table)
              .select(`${m.emailField}, ${m.nameField}`);
            return {
              id: m.key,
              key: m.key,
              name: m.name,
              members: (data || [])
                .map(r => ({ email: r[m.emailField], full_name: r[m.nameField] }))
                .filter(r => r.email),
            };
          } catch {
            return { id: m.key, key: m.key, name: m.name, members: [] };
          }
        })
      );

      let optedOut = [];
      if (optOutSource === 'email_unsubscribes') {
        const { data } = await supabase.from('email_unsubscribes').select('email');
        optedOut = (data || []).map(u => u.email);
      } else if (optOutSource === 'push_user_preferences') {
        const { data } = await supabase
          .from('push_user_preferences')
          .select('user_email')
          .eq('enabled', false);
        optedOut = (data || []).map(u => u.user_email);
      }

      setAllUsers(usersRes.data || []);
      setMinistries(ministriesWithMembers.filter(m => m.members.length > 0));
      setHomeGroups(homeGroupsWithMembers);
      setCampuses((campusesRes.data || []).filter(c => c.is_active !== false));
      setUnsubscribed(optedOut);
    } catch (err) {
      console.error('Recipients source error:', err);
    } finally {
      setLoading(false);
    }
  }, [optOutSource]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /**
   * Rozwiązuje segmenty do listy unikalnych odbiorców.
   * Obsługuje exclude (zbiór odejmowany na końcu).
   */
  const resolveSegments = useCallback((segments) => {
    const includeEmails = new Map();
    const excludeEmails = new Set();

    const collect = (segment, target) => {
      switch (segment.type) {
        case 'all':
          allUsers.forEach(u => target.set?.(u.email, u) ?? target.add?.(u.email));
          break;
        case 'campus': {
          allUsers.filter(u => String(u.campus_id) === String(segment.id))
            .forEach(u => target.set?.(u.email, u) ?? target.add?.(u.email));
          break;
        }
        case 'ministry': {
          const m = ministries.find(x => x.id === segment.id || x.key === segment.id);
          (m?.members || []).forEach(u => target.set?.(u.email, u) ?? target.add?.(u.email));
          break;
        }
        case 'home_group': {
          const g = homeGroups.find(x => x.id === segment.id);
          (g?.members || []).forEach(u => target.set?.(u.email, u) ?? target.add?.(u.email));
          break;
        }
        case 'role': {
          allUsers.filter(u => u.role === segment.id)
            .forEach(u => target.set?.(u.email, u) ?? target.add?.(u.email));
          break;
        }
        case 'custom_email': {
          const list = segment.emails || (segment.id ? [segment.id] : []);
          list.forEach(email => {
            const u = allUsers.find(x => x.email === email) || { email, full_name: email };
            target.set?.(email, u) ?? target.add?.(email);
          });
          break;
        }
        default:
          break;
      }
    };

    segments.forEach(s => {
      if (s.exclude) {
        const tmp = new Set();
        collect(s, tmp);
        tmp.forEach(e => excludeEmails.add(e));
      } else {
        collect(s, includeEmails);
      }
    });

    const result = [];
    includeEmails.forEach((user, email) => {
      if (!email) return;
      if (excludeEmails.has(email)) return;
      if (unsubscribed.includes(email)) return;
      result.push(user);
    });
    return result;
  }, [allUsers, ministries, homeGroups, unsubscribed]);

  const getSegmentCount = useCallback((type, id) => {
    return resolveSegments([{ type, id }]).length;
  }, [resolveSegments]);

  const searchUsers = useCallback((query) => {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    return allUsers
      .filter(u => !unsubscribed.includes(u.email))
      .filter(u =>
        u.email?.toLowerCase().includes(q) ||
        u.full_name?.toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [allUsers, unsubscribed]);

  return {
    allUsers,
    ministries,
    homeGroups,
    campuses,
    unsubscribed,
    loading,
    fetchData,
    resolveSegments,
    getSegmentCount,
    searchUsers,
    totalActive: allUsers.filter(u => !unsubscribed.includes(u.email)).length,
  };
}
