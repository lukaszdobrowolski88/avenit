import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabase';

// Definicja kanałów służb - mapowanie ministry_key na tabelę z członkami
const MINISTRY_CHANNELS = [
  { key: 'worship_team', name: 'Zespół Uwielbienia', table: 'worship_team', emailField: 'email' },
  { key: 'media_team', name: 'Media Team', table: 'media_team', emailField: 'email' },
  { key: 'atmosfera_team', name: 'Atmosfera Team', table: 'atmosfera_members', emailField: 'email' },
  { key: 'kids_ministry', name: 'Małe SchWro', table: 'kids_teachers', emailField: 'email' },
  { key: 'home_groups', name: 'Liderzy Grup Domowych', table: 'home_group_leaders', emailField: 'email' },
];

export default function useMinistryChannels(userEmail) {
  const initializedRef = useRef(false);

  // Inicjalizacja kanałów służb dla użytkownika
  const initializeMinistryChannels = useCallback(async () => {
    if (!userEmail || initializedRef.current) return;
    initializedRef.current = true;

    try {
      // Sprawdź do których służb należy użytkownik
      const membershipChecks = await Promise.all(
        MINISTRY_CHANNELS.map(async (ministry) => {
          try {
            const { data, error } = await supabase
              .from(ministry.table)
              .select('id')
              .eq(ministry.emailField, userEmail)
              .limit(1);

            if (error) {
              console.warn(`Error checking ${ministry.table}:`, error.message);
              return { ministry, isMember: false };
            }

            return { ministry, isMember: data && data.length > 0 };
          } catch (err) {
            console.warn(`Error checking ministry ${ministry.key}:`, err);
            return { ministry, isMember: false };
          }
        })
      );

      // Filtruj tylko służby, do których użytkownik należy
      const userMinistries = membershipChecks
        .filter(check => check.isMember)
        .map(check => check.ministry);

      if (userMinistries.length === 0) {
        return;
      }

      // Dla każdej służby użytkownika - sprawdź/utwórz kanał i dodaj użytkownika
      for (const ministry of userMinistries) {
        await ensureMinistryChannel(ministry, userEmail);
      }
    } catch (error) {
      console.error('Error initializing ministry channels:', error);
    }
  }, [userEmail]);

  // Upewnij się, że kanał służby istnieje i WSZYSCY członkowie służby są uczestnikami
  const ensureMinistryChannel = async (ministry, email) => {
    try {
      // Sprawdź czy kanał już istnieje
      let { data: existingConv } = await supabase
        .from('conversations')
        .select('id')
        .eq('type', 'ministry')
        .eq('ministry_key', ministry.key)
        .maybeSingle();

      let conversationId;

      if (existingConv) {
        conversationId = existingConv.id;
      } else {
        // Utwórz nowy kanał służby
        const { data: newConv, error: createError } = await supabase
          .from('conversations')
          .insert({
            type: 'ministry',
            name: ministry.name,
            ministry_key: ministry.key,
            created_by: email
          })
          .select('id')
          .single();

        if (createError) {
          console.error(`Error creating ministry channel ${ministry.key}:`, createError);
          return;
        }

        conversationId = newConv.id;
      }

      // Pobierz WSZYSTKICH członków służby z tabeli
      const { data: allMembers, error: membersError } = await supabase
        .from(ministry.table)
        .select(ministry.emailField);

      if (membersError) {
        console.warn(`Error fetching members from ${ministry.table}:`, membersError.message);
        return;
      }

      const allMemberEmails = (allMembers || [])
        .map(m => m[ministry.emailField])
        .filter(Boolean);

      if (allMemberEmails.length === 0) return;

      // Pobierz obecnych uczestników kanału
      const { data: currentParticipants } = await supabase
        .from('conversation_participants')
        .select('user_email')
        .eq('conversation_id', conversationId);

      const currentEmails = new Set((currentParticipants || []).map(p => p.user_email));

      // Znajdź członków, którzy nie są jeszcze w kanale
      const newMembers = allMemberEmails.filter(memberEmail => !currentEmails.has(memberEmail));

      if (newMembers.length > 0) {
        // Dodaj wszystkich brakujących członków
        const { error: insertError } = await supabase
          .from('conversation_participants')
          .insert(
            newMembers.map(memberEmail => ({
              conversation_id: conversationId,
              user_email: memberEmail,
              role: 'member'
            }))
          );

        if (insertError) {
          console.error(`Error adding members to ${ministry.key}:`, insertError);
        }
      }
    } catch (error) {
      console.error(`Error ensuring ministry channel ${ministry.key}:`, error);
    }
  };

  // Synchronizuj wszystkich członków służby z kanałem
  const syncMinistryMembers = async (ministryKey) => {
    const ministry = MINISTRY_CHANNELS.find(m => m.key === ministryKey);
    if (!ministry) return;

    try {
      // Pobierz wszystkich członków służby
      const { data: members } = await supabase
        .from(ministry.table)
        .select(ministry.emailField);

      if (!members || members.length === 0) return;

      // Pobierz konwersację
      const { data: conv } = await supabase
        .from('conversations')
        .select('id')
        .eq('type', 'ministry')
        .eq('ministry_key', ministryKey)
        .maybeSingle();

      if (!conv) return;

      // Pobierz obecnych uczestników
      const { data: currentParticipants } = await supabase
        .from('conversation_participants')
        .select('user_email')
        .eq('conversation_id', conv.id);

      const currentEmails = new Set((currentParticipants || []).map(p => p.user_email));
      const memberEmails = members.map(m => m[ministry.emailField]).filter(Boolean);

      // Dodaj brakujących członków
      const newMembers = memberEmails.filter(email => !currentEmails.has(email));

      if (newMembers.length > 0) {
        await supabase
          .from('conversation_participants')
          .insert(
            newMembers.map(email => ({
              conversation_id: conv.id,
              user_email: email,
              role: 'member'
            }))
          );
      }
    } catch (error) {
      console.error(`Error syncing ministry members for ${ministryKey}:`, error);
    }
  };

  useEffect(() => {
    initializeMinistryChannels();
  }, [initializeMinistryChannels]);

  return {
    initializeMinistryChannels,
    syncMinistryMembers
  };
}
