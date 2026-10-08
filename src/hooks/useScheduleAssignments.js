import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { chunkOps, reassignFields } from '../lib/scheduleBridge';
import { tr } from '../i18n';

const newToken = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : null);

/**
 * Atomowa zmiana pól grafiku na wydarzeniu (events.assignments) przez fn event-assignments-patch.
 * ops: [{ team, key, value }] — value null usuwa pole, key null dotyczy całej sekcji służby.
 * Zwraca { assignments, event, error } — assignments to ŚWIEŻY stan z serwera (z cudzymi zmianami).
 */
export async function patchEventAssignments(eventId, ops) {
  const list = (ops || []).filter(Boolean);
  if (!list.length) return { assignments: null, event: null, error: null };
  let last = null;
  for (const part of chunkOps(list)) {
    const { data, error } = await supabase.functions.invoke('event-assignments-patch', { body: { event_id: eventId, ops: part } });
    if (error) return { assignments: last?.assignments ?? null, event: last?.event ?? null, error };
    last = data;
  }
  return { assignments: last?.assignments || {}, event: last?.event || null, error: null };
}

// Ludzki komunikat błędu zapisu grafiku (bez surowego HTTP/SQL).
export function scheduleSaveErrorMessage(error) {
  if (error?.status === 403) return tr('Nie masz uprawnień do edycji grafiku tego wydarzenia.');
  if (error?.status === 404) return tr('Nie znaleziono wydarzenia — mogło zostać usunięte.');
  return tr('Nie udało się zapisać grafiku. Sprawdź połączenie i spróbuj ponownie.');
}

/**
 * Hook do zarządzania przypisaniami do służby z systemem akceptacji
 */
export function useScheduleAssignments() {
  const [loading, setLoading] = useState(false);
  const [assignments, setAssignments] = useState([]);

  /**
   * Pobierz przypisania dla danego programu
   */
  const fetchAssignments = useCallback(async (programId) => {
    try {
      const { data, error } = await supabase
        .from('schedule_assignments')
        .select('*')
        .eq('program_id', programId);

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Error fetching assignments:', err);
      return [];
    }
  }, []);

  /**
   * Pobierz wszystkie oczekujące przypisania dla użytkownika (po emailu)
   */
  const fetchPendingAssignments = useCallback(async (userEmail) => {
    if (!userEmail) return [];

    try {
      // Pobierz przypisania
      const { data: assignmentsData, error: assignmentsError } = await supabase
        .from('schedule_assignments')
        .select('*')
        .eq('assigned_email', userEmail)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (assignmentsError) throw assignmentsError;
      if (!assignmentsData || assignmentsData.length === 0) return [];

      // Cel przypisania: wydarzenie (grafik od migracji 055) albo stary program.
      const programIds = [...new Set(assignmentsData.map(a => a.program_id).filter(x => x != null))];
      const eventIds = [...new Set(assignmentsData.map(a => a.event_id).filter(x => x != null))];
      const [{ data: programsData }, { data: eventsData }] = await Promise.all([
        programIds.length ? supabase.from('programs').select('id, date, title').in('id', programIds) : Promise.resolve({ data: [] }),
        eventIds.length ? supabase.from('events').select('id, date, time, title').in('id', eventIds) : Promise.resolve({ data: [] }),
      ]);

      const programsMap = Object.fromEntries((programsData || []).map(p => [p.id, p]));
      const eventsMap = Object.fromEntries((eventsData || []).map(e => [e.id, e]));

      return assignmentsData.map(a => ({
        ...a,
        programs: programsMap[a.program_id] || null,
        events: eventsMap[a.event_id] || null,
      }));
    } catch (err) {
      console.error('Error fetching pending assignments:', err);
      return [];
    }
  }, []);

  /**
   * Pobierz przypisania dla wielu programów (bulk)
   */
  const fetchAssignmentsForPrograms = useCallback(async (programIds) => {
    if (!programIds || programIds.length === 0) return [];

    try {
      const { data, error } = await supabase
        .from('schedule_assignments')
        .select('*')
        .in('program_id', programIds);

      if (error) throw error;
      setAssignments(data || []);
      return data || [];
    } catch (err) {
      console.error('Error fetching assignments:', err);
      return [];
    }
  }, []);

  /**
   * Utwórz lub zaktualizuj przypisanie
   * @param {Object} params - Parametry przypisania
   * @param {number} params.programId - ID programu
   * @param {string} params.teamType - Typ zespołu (worship, media, itp.)
   * @param {string} params.roleKey - Klucz roli (piano, wokale, itp.)
   * @param {string} params.assignedName - Imię przypisanej osoby
   * @param {string} params.assignedEmail - Email przypisanej osoby
   * @param {string} params.assignedByEmail - Email osoby przypisującej
   * @param {string} params.assignedByName - Imię osoby przypisującej
   * @param {boolean} params.isSelfAssignment - Czy przypisanie do siebie
   */
  const createAssignment = useCallback(async ({
    programId,
    eventId,
    teamType,
    roleKey,
    roleLabel,
    assignedName,
    assignedEmail,
    assignedByEmail,
    assignedByName,
    isSelfAssignment
  }) => {
    setLoading(true);

    try {
      // Jeśli przypisanie do siebie - automatycznie zaakceptowane
      const status = isSelfAssignment ? 'accepted' : 'pending';
      const base = {
        team_type: teamType,
        role_key: roleKey,
        role_label: roleLabel || null,
        assigned_name: assignedName,
        assigned_email: assignedEmail,
        assigned_by_email: assignedByEmail,
        assigned_by_name: assignedByName,
        status,
        responded_at: isSelfAssignment ? new Date().toISOString() : null,
      };

      let data, error;
      if (eventId) {
        // Grafik/służby na WYDARZENIU. Ręczny upsert (częściowy unikat event_id → PostgREST
        // nie wnioskuje predykatu z onConflict): sprawdź istniejący wiersz, potem update/insert.
        const { data: existing, error: findError } = await supabase.from('schedule_assignments').select('id, status, assigned_email')
          .eq('event_id', eventId).eq('team_type', teamType).eq('role_key', roleKey).eq('assigned_name', assignedName).maybeSingle();
        if (findError) throw findError;
        if (existing) {
          // Ponowne przypisanie (np. po odrzuceniu): status/token/stempel wysyłki ustala
          // reassignFields — odrzucona osoba wraca do „Wyślij”, zaakceptowana nie dostaje maila drugi raz.
          const patch = { ...base };
          delete patch.status;
          delete patch.responded_at;
          Object.assign(patch, reassignFields(existing, { assignedEmail, isSelfAssignment, newToken: newToken() }));
          ({ data, error } = await supabase.from('schedule_assignments').update(patch).eq('id', existing.id).select().single());
        } else {
          ({ data, error } = await supabase.from('schedule_assignments').insert({ event_id: eventId, ...base }).select().single());
        }
      } else {
        ({ data, error } = await supabase.from('schedule_assignments').upsert(
          { program_id: programId, ...base },
          { onConflict: 'program_id,team_type,role_key,assigned_name' }
        ).select().single());
      }

      if (error) throw error;

      // Aktualizuj lokalny stan - dodaj nowe przypisanie lub zaktualizuj istniejące
      setAssignments(prev => {
        const matches = (a) => (eventId ? a.event_id === eventId : a.program_id === programId) &&
               a.team_type === teamType && a.role_key === roleKey && a.assigned_name === assignedName;
        const existingIndex = prev.findIndex(matches);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = data;
          return updated;
        }
        return [...prev, data];
      });

      // Wysyłka zaproszeń jest teraz WSADOWA (przycisk „Wyślij zaproszenia" przy dacie →
      // fn send-assignment-invites): NIE wysyłamy e-maila/push przy każdym wyborze osoby.

      return { success: true, data };
    } catch (err) {
      console.error('Error creating assignment:', err);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Usuń przypisanie (gdy ktoś zostaje usunięty z grafiku)
   */
  const removeAssignment = useCallback(async (programId, teamType, roleKey, assignedName) => {
    try {
      const { error } = await supabase
        .from('schedule_assignments')
        .delete()
        .eq('program_id', programId)
        .eq('team_type', teamType)
        .eq('role_key', roleKey)
        .eq('assigned_name', assignedName);

      if (error) throw error;

      // Usuń z lokalnego stanu
      setAssignments(prev => prev.filter(
        a => !(a.program_id === programId &&
               a.team_type === teamType &&
               a.role_key === roleKey &&
               a.assigned_name === assignedName)
      ));

      return { success: true };
    } catch (err) {
      console.error('Error removing assignment:', err);
      return { success: false, error: err.message };
    }
  }, []);

  /**
   * Usuń przypisanie wydarzenia (grafik/służby na events).
   */
  const removeEventAssignment = useCallback(async (eventId, teamType, roleKey, assignedName) => {
    try {
      const { error } = await supabase
        .from('schedule_assignments')
        .delete()
        .eq('event_id', eventId)
        .eq('team_type', teamType)
        .eq('role_key', roleKey)
        .eq('assigned_name', assignedName);
      if (error) throw error;
      setAssignments(prev => prev.filter(
        a => !(a.event_id === eventId && a.team_type === teamType && a.role_key === roleKey && a.assigned_name === assignedName)
      ));
      return { success: true };
    } catch (err) {
      console.error('Error removing event assignment:', err);
      return { success: false, error: err.message };
    }
  }, []);

  /**
   * Pobierz przypisania dla wielu wydarzeń (bulk) — do grafiku nad wydarzeniami.
   */
  const fetchAssignmentsForEvents = useCallback(async (eventIds) => {
    if (!eventIds || eventIds.length === 0) return [];
    try {
      const { data, error } = await supabase
        .from('schedule_assignments')
        .select('*')
        .in('event_id', eventIds);
      if (error) throw error;
      setAssignments(data || []);
      return data || [];
    } catch (err) {
      console.error('Error fetching event assignments:', err);
      return [];
    }
  }, []);

  /**
   * Akceptuj przypisanie
   */
  const acceptAssignment = useCallback(async (assignmentId) => {
    try {
      const { data, error } = await supabase
        .from('schedule_assignments')
        .update({
          status: 'accepted',
          responded_at: new Date().toISOString()
        })
        .eq('id', assignmentId)
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (err) {
      console.error('Error accepting assignment:', err);
      return { success: false, error: err.message };
    }
  }, []);

  /**
   * Odrzuć przypisanie
   */
  const rejectAssignment = useCallback(async (assignmentId) => {
    try {
      const { data, error } = await supabase
        .from('schedule_assignments')
        .update({
          status: 'rejected',
          responded_at: new Date().toISOString()
        })
        .eq('id', assignmentId)
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (err) {
      console.error('Error rejecting assignment:', err);
      return { success: false, error: err.message };
    }
  }, []);

  /**
   * Akceptuj przypisanie po tokenie (dla linku z emaila)
   */
  const acceptByToken = useCallback(async (token) => {
    try {
      const { data, error } = await supabase
        .from('schedule_assignments')
        .update({
          status: 'accepted',
          responded_at: new Date().toISOString()
        })
        .eq('token', token)
        .eq('status', 'pending')
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (err) {
      console.error('Error accepting by token:', err);
      return { success: false, error: err.message };
    }
  }, []);

  /**
   * Odrzuć przypisanie po tokenie (dla linku z emaila)
   */
  const rejectByToken = useCallback(async (token) => {
    try {
      // Najpierw pobierz dane przypisania (potrzebne do usunięcia z grafiku)
      const { data: assignment, error: fetchError } = await supabase
        .from('schedule_assignments')
        .select('*')
        .eq('token', token)
        .eq('status', 'pending')
        .single();

      if (fetchError) throw fetchError;

      // Zaktualizuj status na odrzucony
      const { data, error } = await supabase
        .from('schedule_assignments')
        .update({
          status: 'rejected',
          responded_at: new Date().toISOString()
        })
        .eq('token', token)
        .select()
        .single();

      if (error) throw error;

      return { success: true, data, assignment };
    } catch (err) {
      console.error('Error rejecting by token:', err);
      return { success: false, error: err.message };
    }
  }, []);

  /**
   * Pobierz status przypisania dla konkretnej osoby w programie
   */
  const getAssignmentStatus = useCallback((programId, teamType, roleKey, assignedName) => {
    const assignment = assignments.find(
      a => a.program_id === programId &&
           a.team_type === teamType &&
           a.role_key === roleKey &&
           a.assigned_name === assignedName
    );
    return assignment?.status || null;
  }, [assignments]);

  /**
   * Status przypisania osoby dla wydarzenia (grafik/służby na events).
   */
  const getEventAssignmentStatus = useCallback((eventId, teamType, roleKey, assignedName) => {
    const assignment = assignments.find(
      a => a.event_id === eventId &&
           a.team_type === teamType &&
           a.role_key === roleKey &&
           a.assigned_name === assignedName
    );
    return assignment?.status || null;
  }, [assignments]);

  /**
   * Wsadowa wysyłka zaproszeń dla programu (daty). Jeden łączony e-mail + push per osoba,
   * tylko do osób, którym wcześniej nie wysłano dla tej daty. Zwraca { success, sent, skipped }.
   */
  const sendInvitesForProgram = useCallback(async (programId, teamType) => {
    try {
      const { data, error } = await supabase.functions.invoke('send-assignment-invites', {
        body: { programId, teamType, baseUrl: window.location.origin },
      });
      if (error || data?.error) return { success: false, error: data?.error || error?.message };
      return { success: true, ...data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, []);

  /**
   * Wsadowa wysyłka zaproszeń dla WYDARZENIA (grafik/służby na events).
   * teamLabel — nazwa służby do maila/push (np. „Grupa Uwielbienia”); opcjonalna.
   */
  const sendInvitesForEvent = useCallback(async (eventId, teamType, teamLabel) => {
    try {
      const { data, error } = await supabase.functions.invoke('send-assignment-invites', {
        body: { eventId, teamType, teamLabel: teamLabel || undefined, baseUrl: window.location.origin },
      });
      if (error) return { success: false, error: error.message, status: error.status };
      // Brak konfiguracji poczty: serwer zwraca success:false + emailReady:false — przekaż flagę,
      // żeby UI pokazał zrozumiały komunikat zamiast technicznego.
      if (data?.emailReady === false) return { success: false, emailReady: false, error: data?.error };
      if (data?.error) return { success: false, error: data.error };
      return { success: true, ...data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, []);

  return {
    loading,
    assignments,
    fetchAssignments,
    fetchAssignmentsForPrograms,
    fetchAssignmentsForEvents,
    fetchPendingAssignments,
    createAssignment,
    removeAssignment,
    removeEventAssignment,
    acceptAssignment,
    rejectAssignment,
    acceptByToken,
    rejectByToken,
    getAssignmentStatus,
    getEventAssignmentStatus,
    sendInvitesForProgram,
    sendInvitesForEvent
  };
}
