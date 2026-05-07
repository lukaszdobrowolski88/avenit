// Wspólna logika segmentowania odbiorców (używana przez Mailing, PushCampaigns, SmsCampaigns).
// Resolwuje listę emaili (i opcjonalnie phone) z definicji segmentów
// (all/campus/ministry/home_group/role/custom_email/custom_phone).
//
// Wydzielone z src/modules/Mailing/hooks/useRecipients.js — push, mailing i SMS dzielą tę samą
// logikę, ale opt-out source różni się: 'email_unsubscribes' (mailing), 'push_user_preferences'
// (push, enabled=false), 'sms_user_preferences' (sms, enabled=false LUB marketing_consent=false).

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

/**
 * Normalizacja numeru telefonu do formatu E.164 polski (48xxxxxxxxx).
 * Współdzielone z supabase/functions/_shared/sms.ts (kopia, bo Vite vs Deno bez bundlera).
 */
export function normalizePhone(raw) {
  if (!raw) return null;
  let p = String(raw).replace(/[\s\-()+]/g, '');
  if (p.startsWith('00')) p = p.slice(2);
  if (p.length === 9 && /^\d{9}$/.test(p)) p = '48' + p;
  if (!/^48\d{9}$/.test(p)) return null;
  return p;
}

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
 * @param {('email_unsubscribes'|'push_user_preferences'|'sms_user_preferences'|null)} opts.optOutSource
 *        Skąd pobierać listę wykluczonych: dla mailingu 'email_unsubscribes',
 *        dla pushy 'push_user_preferences' (enabled=false), dla SMS 'sms_user_preferences'
 *        (enabled=false LUB marketing_consent=false), dla niczego null.
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
        supabase.from('app_users').select('email, full_name, avatar_url, campus_id, role, phone'),
        supabase.from('home_groups').select('id, name'),
        supabase.from('home_group_members').select('id, full_name, email, group_id, phone'),
        supabase.from('campuses').select('id, name, is_active'),
      ]);

      const homeGroupsWithMembers = (hgRes.data || []).map(g => ({
        ...g,
        members: (hgmRes.data || []).filter(m => m.group_id === g.id)
                    .map(m => ({ email: m.email, full_name: m.full_name, phone: m.phone })),
      }));

      // Phone fallback z home_group_members dla użytkowników bez phone w app_users.
      const phoneByEmail = new Map();
      (usersRes.data || []).forEach(u => { if (u.email && u.phone) phoneByEmail.set(u.email, u.phone); });
      (hgmRes.data || []).forEach(m => {
        if (m.email && m.phone && !phoneByEmail.has(m.email)) phoneByEmail.set(m.email, m.phone);
      });

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
      } else if (optOutSource === 'sms_user_preferences') {
        const { data } = await supabase
          .from('sms_user_preferences')
          .select('user_email, enabled, marketing_consent');
        optedOut = (data || [])
          .filter(u => u.enabled === false || u.marketing_consent === false)
          .map(u => u.user_email);
      }

      // Augment users z phone fallback z home_group_members.
      const usersWithPhone = (usersRes.data || []).map(u => ({
        ...u,
        phone: u.phone || phoneByEmail.get(u.email) || null,
      }));

      setAllUsers(usersWithPhone);
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
   * Segmenty `custom_phone` zwracają wpisy z `email=null, phone=normalized`.
   */
  const resolveSegments = useCallback((segments) => {
    const includeByKey = new Map(); // key = email lub phone fallback
    const excludeKeys = new Set();

    const keyOf = (u) => u.email || `phone:${u.phone}`;
    const enrichWithPhone = (u) => {
      if (u.phone || !u.email) return u;
      const found = allUsers.find(x => x.email === u.email);
      return found?.phone ? { ...u, phone: found.phone } : u;
    };

    const collect = (segment, target) => {
      const isExclude = target instanceof Set;
      const add = (rawUser) => {
        const u = enrichWithPhone(rawUser);
        const k = keyOf(u);
        if (!k) return;
        if (isExclude) target.add(k);
        else target.set(k, u);
      };
      switch (segment.type) {
        case 'all':
          allUsers.forEach(add);
          break;
        case 'campus':
          allUsers.filter(u => String(u.campus_id) === String(segment.id)).forEach(add);
          break;
        case 'ministry': {
          const m = ministries.find(x => x.id === segment.id || x.key === segment.id);
          (m?.members || []).forEach(add);
          break;
        }
        case 'home_group': {
          const g = homeGroups.find(x => x.id === segment.id);
          (g?.members || []).forEach(add);
          break;
        }
        case 'role':
          allUsers.filter(u => u.role === segment.id).forEach(add);
          break;
        case 'custom_email': {
          const list = segment.emails || (segment.id ? [segment.id] : []);
          list.forEach(email => {
            const u = allUsers.find(x => x.email === email) || { email, full_name: email };
            add(u);
          });
          break;
        }
        case 'custom_phone': {
          (segment.phones || []).forEach(raw => {
            const norm = normalizePhone(raw);
            if (!norm) return;
            const u = allUsers.find(x => x.phone && normalizePhone(x.phone) === norm)
                   || { email: null, phone: norm, full_name: null };
            add(u);
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
        tmp.forEach(k => excludeKeys.add(k));
      } else {
        collect(s, includeByKey);
      }
    });

    const result = [];
    includeByKey.forEach((user, key) => {
      if (excludeKeys.has(key)) return;
      if (user.email && unsubscribed.includes(user.email)) return;
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
