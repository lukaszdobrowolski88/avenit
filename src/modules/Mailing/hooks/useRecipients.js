import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';

// Definicja służb - mapowanie na tabele w bazie danych
const MINISTRY_DEFINITIONS = [
  { key: 'worship_team', name: 'Zespół Uwielbienia', table: 'worship_team', emailField: 'email', nameField: 'full_name' },
  { key: 'media_team', name: 'Media Team', table: 'media_team', emailField: 'email', nameField: 'full_name' },
  { key: 'atmosfera_team', name: 'Atmosfera Team', table: 'atmosfera_members', emailField: 'email', nameField: 'full_name' },
  { key: 'kids_ministry', name: 'Małe SchWro', table: 'kids_teachers', emailField: 'email', nameField: 'full_name' },
];

export function useRecipients() {
  const [allUsers, setAllUsers] = useState([]);
  const [ministries, setMinistries] = useState([]);
  const [homeGroups, setHomeGroups] = useState([]);
  const [unsubscribed, setUnsubscribed] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      // Pobierz użytkowników
      const { data: usersData, error: usersError } = await supabase
        .from('app_users')
        .select('email, full_name, avatar_url');

      if (usersError) {
        console.error('Error fetching users:', usersError);
      }

      // Pobierz grupy domowe z ich członkami
      const { data: homeGroupsData, error: homeGroupsError } = await supabase
        .from('home_groups')
        .select('id, name');

      if (homeGroupsError) {
        console.error('Error fetching home groups:', homeGroupsError);
      }

      // Pobierz członków grup domowych
      const { data: homeGroupMembersData } = await supabase
        .from('home_group_members')
        .select('id, full_name, email, group_id');

      // Mapuj członków do grup
      const homeGroupsWithMembers = (homeGroupsData || []).map(group => ({
        ...group,
        members: (homeGroupMembersData || [])
          .filter(m => m.group_id === group.id)
          .map(m => ({ email: m.email, full_name: m.full_name }))
      }));

      // Pobierz członków każdej służby
      const ministriesWithMembers = await Promise.all(
        MINISTRY_DEFINITIONS.map(async (ministry) => {
          try {
            const { data: membersData, error } = await supabase
              .from(ministry.table)
              .select(`${ministry.emailField}, ${ministry.nameField}`);

            if (error) {
              console.warn(`Error fetching ${ministry.table}:`, error.message);
              return {
                id: ministry.key,
                key: ministry.key,
                name: ministry.name,
                members: []
              };
            }

            return {
              id: ministry.key,
              key: ministry.key,
              name: ministry.name,
              members: (membersData || []).map(m => ({
                email: m[ministry.emailField],
                full_name: m[ministry.nameField]
              })).filter(m => m.email)
            };
          } catch (err) {
            console.warn(`Error fetching ministry ${ministry.key}:`, err);
            return {
              id: ministry.key,
              key: ministry.key,
              name: ministry.name,
              members: []
            };
          }
        })
      );

      // Pobierz wypisanych (może nie istnieć jeszcze tabela)
      let unsubscribedEmails = [];
      try {
        const { data: unsubscribedData } = await supabase
          .from('email_unsubscribes')
          .select('email');
        unsubscribedEmails = (unsubscribedData || []).map(u => u.email);
      } catch (err) {
        // Tabela może jeszcze nie istnieć
        console.warn('email_unsubscribes table not available yet');
      }

      setAllUsers(usersData || []);
      setMinistries(ministriesWithMembers.filter(m => m.members.length > 0));
      setHomeGroups(homeGroupsWithMembers);
      setUnsubscribed(unsubscribedEmails);
    } catch (err) {
      console.error('Error fetching recipients data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Pobierz odbiorców według segmentów
  const getRecipientsBySegments = useCallback((segments) => {
    const recipientEmails = new Set();
    const recipients = [];

    segments.forEach(segment => {
      let segmentRecipients = [];

      switch (segment.type) {
        case 'all':
          segmentRecipients = allUsers;
          break;

        case 'ministry':
          const ministry = ministries.find(m => m.id === segment.id || m.key === segment.id);
          if (ministry) {
            segmentRecipients = ministry.members || [];
          }
          break;

        case 'home_group':
          const group = homeGroups.find(g => g.id === segment.id);
          if (group) {
            segmentRecipients = group.members || [];
          }
          break;

        case 'custom':
          if (segment.emails) {
            segmentRecipients = segment.emails.map(email => {
              const user = allUsers.find(u => u.email === email);
              return user || { email, full_name: email };
            });
          }
          break;

        default:
          break;
      }

      // Dodaj unikalne, nie-wypisane osoby
      segmentRecipients.forEach(user => {
        if (user?.email && !recipientEmails.has(user.email) && !unsubscribed.includes(user.email)) {
          recipientEmails.add(user.email);
          recipients.push(user);
        }
      });
    });

    return recipients;
  }, [allUsers, ministries, homeGroups, unsubscribed]);

  // Pobierz liczbę odbiorców dla segmentu
  const getSegmentCount = useCallback((segmentType, segmentId) => {
    switch (segmentType) {
      case 'all':
        return allUsers.filter(u => !unsubscribed.includes(u.email)).length;

      case 'ministry':
        const ministry = ministries.find(m => m.id === segmentId || m.key === segmentId);
        return ministry?.members?.filter(m =>
          m.email && !unsubscribed.includes(m.email)
        ).length || 0;

      case 'home_group':
        const group = homeGroups.find(g => g.id === segmentId);
        return group?.members?.filter(m =>
          m.email && !unsubscribed.includes(m.email)
        ).length || 0;

      default:
        return 0;
    }
  }, [allUsers, ministries, homeGroups, unsubscribed]);

  // Wyszukaj użytkowników
  const searchUsers = useCallback((query) => {
    if (!query || query.length < 2) return [];

    const lowerQuery = query.toLowerCase();
    return allUsers
      .filter(user =>
        !unsubscribed.includes(user.email) &&
        (user.email?.toLowerCase().includes(lowerQuery) ||
         user.full_name?.toLowerCase().includes(lowerQuery))
      )
      .slice(0, 20);
  }, [allUsers, unsubscribed]);

  return {
    allUsers,
    ministries,
    homeGroups,
    unsubscribed,
    loading,
    fetchData,
    getRecipientsBySegments,
    getSegmentCount,
    searchUsers,
    totalActive: allUsers.filter(u => !unsubscribed.includes(u.email)).length,
    totalUnsubscribed: unsubscribed.length
  };
}

// Zapisz segmenty kampanii do bazy
export async function saveSegments(campaignId, segments) {
  try {
    // Usuń stare segmenty
    await supabase
      .from('email_recipient_segments')
      .delete()
      .eq('campaign_id', campaignId);

    if (segments.length === 0) return;

    // Dodaj nowe segmenty
    // Dla służb (ministry) id jest stringiem (key), nie UUID - zapisujemy go w segment_name
    const segmentsToInsert = segments.map(segment => {
      // Sprawdź czy id jest poprawnym UUID
      const isValidUUID = segment.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment.id);

      return {
        campaign_id: campaignId,
        segment_type: segment.type,
        segment_id: isValidUUID ? segment.id : null,
        segment_name: segment.name || segment.id || null // Dla służb zapisujemy key w segment_name
      };
    });

    const { error } = await supabase
      .from('email_recipient_segments')
      .insert(segmentsToInsert);

    if (error) throw error;
  } catch (err) {
    console.error('Error saving segments:', err);
    throw err;
  }
}
