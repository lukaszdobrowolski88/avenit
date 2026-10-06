import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { normEmail, emailPattern } from '../utils/chatLogic';

// Definicja kanałów służb - mapowanie ministry_key na tabelę z członkami
// (ta sama mapa jest na serwerze: packages/api/src/dataapi/komunikator.js → MINISTRY_TABLES).
const MINISTRY_CHANNELS = [
  { key: 'worship_team', name: 'Zespół Uwielbienia', table: 'worship_team', emailField: 'email' },
  { key: 'media_team', name: 'Media Team', table: 'media_team', emailField: 'email' },
  { key: 'atmosfera_team', name: 'Atmosfera Team', table: 'atmosfera_members', emailField: 'email' },
  { key: 'kids_ministry', name: 'Małe Avenit', table: 'kids_teachers', emailField: 'email' },
  { key: 'home_groups', name: 'Liderzy Grup Domowych', table: 'home_group_leaders', emailField: 'email' },
];

// Synchronizacja kanałów służb działa w tle przy wejściu do Komunikatora. Zasady serwera:
//  - kanał (conversations.type='ministry') widać przed dołączeniem, więc można go znaleźć;
//  - nowy kanał: najpierw rozmowa, potem cały skład (pusta rozmowa przyjmuje pierwszy skład);
//  - istniejący kanał: członek zespołu może dopisać brakujących członków TEGO zespołu (rola 'member').
// Wszystkie zapisy są „ciche” (.silent()) — to nie jest akcja użytkownika, więc błąd nie powinien
// wyskakiwać jako komunikat; najwyżej kanał pojawi się przy następnym wejściu.
export default function useMinistryChannels(userEmail, { onSynced } = {}) {
  const initializedRef = useRef(false);
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;

  // Upewnij się, że kanał służby istnieje i WSZYSCY członkowie służby są uczestnikami.
  // Zwraca true, gdy coś zmieniono (nowy kanał albo nowi uczestnicy).
  const ensureMinistryChannel = async (ministry) => {
    try {
      // Najstarszy kanał tej służby (gdyby kiedyś powstał duplikat, nie twórz kolejnego).
      const { data: existingRows, error: findError } = await supabase
        .from('conversations')
        .select('id')
        .eq('type', 'ministry')
        .eq('ministry_key', ministry.key)
        .order('created_at', { ascending: true })
        .limit(1);

      if (findError) {
        console.warn(`Nie udało się sprawdzić kanału ${ministry.key}:`, findError.message);
        return false;
      }

      let conversationId = existingRows?.[0]?.id || null;
      let changed = false;

      if (!conversationId) {
        const { data: newConv, error: createError } = await supabase
          .from('conversations')
          .insert({
            type: 'ministry',
            name: ministry.name,
            ministry_key: ministry.key,
            created_by: userEmail
          })
          .select('id')
          .single()
          .silent();

        if (createError) {
          console.warn(`Nie udało się utworzyć kanału ${ministry.key}:`, createError.message);
          return false;
        }
        conversationId = newConv.id;
        changed = true;
      }

      // Wszyscy członkowie służby z tabeli zespołu
      const { data: allMembers, error: membersError } = await supabase
        .from(ministry.table)
        .select(ministry.emailField);

      if (membersError) {
        console.warn(`Nie udało się pobrać członków ${ministry.table}:`, membersError.message);
        return changed;
      }

      // Unikalne e-maile (bez względu na wielkość liter)
      const byKey = new Map();
      for (const m of allMembers || []) {
        const email = m?.[ministry.emailField];
        if (email && !byKey.has(normEmail(email))) byKey.set(normEmail(email), email);
      }
      if (byKey.size === 0) return changed;

      // Obecni uczestnicy kanału (widoczni dla uczestnika; dla nowego/obcego kanału — pusta lista)
      const { data: currentParticipants } = await supabase
        .from('conversation_participants')
        .select('user_email')
        .eq('conversation_id', conversationId);

      const currentKeys = new Set((currentParticipants || []).map(p => normEmail(p.user_email)));
      const newMembers = [...byKey.entries()].filter(([k]) => !currentKeys.has(k)).map(([, e]) => e);
      if (newMembers.length === 0) return changed;

      // Serwer pomija duplikaty (upsert), więc dopisanie osób, których nie widzimy, jest bezpieczne.
      const { error: insertError } = await supabase
        .from('conversation_participants')
        .insert(newMembers.map(memberEmail => ({
          conversation_id: conversationId,
          user_email: memberEmail,
          role: 'member'
        })))
        .select('conversation_id, user_email')
        .silent();

      if (insertError) {
        console.warn(`Nie udało się dopisać członków do kanału ${ministry.key}:`, insertError.message);
        return changed;
      }
      return true;
    } catch (error) {
      console.warn(`Błąd synchronizacji kanału ${ministry.key}:`, error);
      return false;
    }
  };

  // Inicjalizacja kanałów służb dla użytkownika
  const initializeMinistryChannels = useCallback(async () => {
    if (!userEmail || initializedRef.current) return;
    initializedRef.current = true;

    let changed = false;
    try {
      // Sprawdź do których służb należy użytkownik
      const membershipChecks = await Promise.all(
        MINISTRY_CHANNELS.map(async (ministry) => {
          try {
            const { data, error } = await supabase
              .from(ministry.table)
              .select(ministry.emailField)
              // bez względu na wielkość liter (jak serwer); znaki % i _ dosłownie
              .ilike(ministry.emailField, emailPattern(userEmail))
              .limit(1);
            if (error) return { ministry, isMember: false };
            return { ministry, isMember: !!(data && data.length > 0) };
          } catch {
            return { ministry, isMember: false };
          }
        })
      );

      const userMinistries = membershipChecks.filter(c => c.isMember).map(c => c.ministry);

      // Po kolei — żeby nie tworzyć wyścigu przy pierwszym zakładaniu kanałów
      for (const ministry of userMinistries) {
        if (await ensureMinistryChannel(ministry)) changed = true;
      }
    } catch (error) {
      console.warn('Błąd inicjalizacji kanałów służb:', error);
    } finally {
      onSyncedRef.current?.(changed);
    }
  }, [userEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  // Synchronizuj wszystkich członków służby z kanałem (np. po zmianie składu zespołu)
  const syncMinistryMembers = async (ministryKey) => {
    const ministry = MINISTRY_CHANNELS.find(m => m.key === ministryKey);
    if (!ministry) return false;
    return ensureMinistryChannel(ministry);
  };

  useEffect(() => {
    initializeMinistryChannels();
  }, [initializeMinistryChannels]);

  return {
    initializeMinistryChannels,
    syncMinistryMembers
  };
}
