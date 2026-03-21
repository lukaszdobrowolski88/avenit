import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

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

      // Pobierz dane programów
      const programIds = [...new Set(assignmentsData.map(a => a.program_id))];
      const { data: programsData } = await supabase
        .from('programs')
        .select('id, date')
        .in('id', programIds);

      // Połącz dane
      const programsMap = (programsData || []).reduce((acc, p) => {
        acc[p.id] = p;
        return acc;
      }, {});

      return assignmentsData.map(a => ({
        ...a,
        programs: programsMap[a.program_id] || null
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
    teamType,
    roleKey,
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

      const { data, error } = await supabase
        .from('schedule_assignments')
        .upsert({
          program_id: programId,
          team_type: teamType,
          role_key: roleKey,
          assigned_name: assignedName,
          assigned_email: assignedEmail,
          assigned_by_email: assignedByEmail,
          assigned_by_name: assignedByName,
          status: status,
          responded_at: isSelfAssignment ? new Date().toISOString() : null
        }, {
          onConflict: 'program_id,team_type,role_key,assigned_name'
        })
        .select()
        .single();

      if (error) throw error;

      // Aktualizuj lokalny stan - dodaj nowe przypisanie lub zaktualizuj istniejące
      setAssignments(prev => {
        const existingIndex = prev.findIndex(
          a => a.program_id === programId &&
               a.team_type === teamType &&
               a.role_key === roleKey &&
               a.assigned_name === assignedName
        );
        if (existingIndex >= 0) {
          // Zaktualizuj istniejące
          const updated = [...prev];
          updated[existingIndex] = data;
          return updated;
        }
        // Dodaj nowe
        return [...prev, data];
      });

      // Jeśli nie jest to przypisanie do siebie - wyślij email (w tle, nie blokuj)
      if (!isSelfAssignment && assignedEmail && data) {
        sendAssignmentEmail(data).catch(err => {
          console.warn('Failed to send assignment email:', err);
        });
      }

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
   * Wyślij email z powiadomieniem o przypisaniu
   */
  const sendAssignmentEmail = async (assignment) => {
    try {
      const baseUrl = window.location.origin;
      const acceptUrl = `${baseUrl}/assignment-response?token=${assignment.token}&action=accept`;
      const rejectUrl = `${baseUrl}/assignment-response?token=${assignment.token}&action=reject`;

      // Mapowanie kluczy ról na czytelne nazwy
      const roleNames = {
        lider: 'Lider Uwielbienia',
        piano: 'Piano',
        wokale: 'Wokal',
        gitara_akustyczna: 'Gitara Akustyczna',
        gitara_elektryczna: 'Gitara Elektryczna',
        bas: 'Gitara Basowa',
        cajon: 'Cajon/Perkusja',
        naglospienie: 'Nagłośnienie',
        projekcja: 'Projekcja',
        transmisja: 'Transmisja',
        foto: 'Fotograf',
        video: 'Wideo'
      };

      const roleName = roleNames[assignment.role_key] || assignment.role_key;

      // Wyślij email przez edge function - program_id przekazujemy do funkcji
      // która pobierze dane z service role key
      const { error } = await supabase.functions.invoke('send-assignment-email', {
        body: {
          to: assignment.assigned_email,
          assignedName: assignment.assigned_name,
          assignedByName: assignment.assigned_by_name,
          roleName: roleName,
          programId: assignment.program_id,
          acceptUrl: acceptUrl,
          rejectUrl: rejectUrl
        }
      });

      if (error) {
        console.error('Error sending email via function:', error);
        // Fallback - zapisz że email nie został wysłany
      } else {
        // Oznacz że email został wysłany
        await supabase
          .from('schedule_assignments')
          .update({ email_sent_at: new Date().toISOString() })
          .eq('id', assignment.id);
      }
    } catch (err) {
      console.error('Error sending assignment email:', err);
    }
  };

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

  return {
    loading,
    assignments,
    fetchAssignments,
    fetchAssignmentsForPrograms,
    fetchPendingAssignments,
    createAssignment,
    removeAssignment,
    acceptAssignment,
    rejectAssignment,
    acceptByToken,
    rejectByToken,
    getAssignmentStatus
  };
}
