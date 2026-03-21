import { useState, useCallback } from 'react';
import { supabase, getCachedUser } from '../../../../lib/supabase';

export function useCheckin() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Wyszukaj rodziny po ostatnich 4 cyfrach telefonu
  const searchByPhone = useCallback(async (lastFourDigits) => {
    if (!lastFourDigits || lastFourDigits.length !== 4) {
      return [];
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: queryError } = await supabase
        .from('households')
        .select(`
          *,
          parent_contacts (*),
          kids_students (*)
        `)
        .eq('phone_last_four', lastFourDigits);

      if (queryError) throw queryError;
      return data || [];
    } catch (err) {
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Pobierz aktywną sesję na dzisiaj
  const getActiveSession = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const today = new Date().toISOString().split('T')[0];

      const { data, error: queryError } = await supabase
        .from('checkin_sessions')
        .select('*')
        .eq('session_date', today)
        .eq('is_active', true)
        .order('start_time', { ascending: true })
        .limit(1)
        .single();

      if (queryError && queryError.code !== 'PGRST116') {
        throw queryError;
      }

      return data || null;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Pobierz lub utwórz sesję na dzisiaj
  const getOrCreateTodaySession = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const today = new Date().toISOString().split('T')[0];
      const user = await getCachedUser();

      // Sprawdź czy istnieje aktywna sesja
      let { data: session, error: selectError } = await supabase
        .from('checkin_sessions')
        .select('*')
        .eq('session_date', today)
        .eq('is_active', true)
        .order('start_time', { ascending: true })
        .limit(1)
        .single();

      if (selectError && selectError.code !== 'PGRST116') {
        throw selectError;
      }

      // Jeśli nie ma sesji, utwórz nową
      if (!session) {
        const dayName = new Date().toLocaleDateString('pl-PL', { weekday: 'long' });
        const { data: newSession, error: insertError } = await supabase
          .from('checkin_sessions')
          .insert({
            name: `Nabożeństwo - ${dayName}`,
            session_date: today,
            start_time: '09:00',
            end_time: '13:00',
            is_active: true,
            created_by: user?.email || 'system'
          })
          .select()
          .single();

        if (insertError) throw insertError;
        session = newSession;
      }

      return session;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Pobierz dostępne lokalizacje (sale)
  const getLocations = useCallback(async () => {
    try {
      const { data, error: queryError } = await supabase
        .from('checkin_locations')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (queryError) throw queryError;
      return data || [];
    } catch (err) {
      setError(err.message);
      return [];
    }
  }, []);

  // Pobierz kody bezpieczeństwa dla rodziny (ostatnie 4 cyfry telefonów osób z can_pickup)
  const getSecurityCodesForHousehold = useCallback(async (householdId) => {
    if (!householdId) return [];

    try {
      const { data: contacts, error } = await supabase
        .from('parent_contacts')
        .select('phone, full_name')
        .eq('household_id', householdId)
        .eq('can_pickup', true);

      if (error) throw error;

      // Wyodrębnij ostatnie 4 cyfry z każdego telefonu
      const codes = (contacts || [])
        .filter(c => c.phone)
        .map(c => {
          const digits = c.phone.replace(/\D/g, ''); // Usuń wszystko poza cyframi
          return {
            code: digits.slice(-4), // Ostatnie 4 cyfry
            name: c.full_name
          };
        })
        .filter(c => c.code.length === 4); // Tylko pełne 4-cyfrowe kody

      return codes;
    } catch (err) {
      console.error('Error getting security codes:', err);
      return [];
    }
  }, []);

  // Wykonaj check-in dla dziecka
  const checkInStudent = useCallback(async (sessionId, studentId, locationId, householdId, securityCodes = []) => {
    setLoading(true);
    setError(null);

    try {
      const user = await getCachedUser();

      // Użyj pierwszego kodu jako głównego (wszystkie kody są zapisane jako JSON w polu)
      // Format: "1234|5678|9012" - kody oddzielone |
      const securityCodeStr = securityCodes.map(c => c.code).join('|') || 'XXXX';

      // Utwórz rekord check-in
      const { data, error: insertError } = await supabase
        .from('checkins')
        .insert({
          session_id: sessionId,
          student_id: studentId,
          location_id: locationId,
          household_id: householdId,
          security_code: securityCodeStr,
          checked_in_by: user?.email || 'system',
          is_guest: false
        })
        .select(`
          *,
          kids_students (*),
          checkin_locations (*)
        `)
        .single();

      if (insertError) throw insertError;

      // Dodaj informacje o kodach do zwracanego obiektu
      return { ...data, security_codes_list: securityCodes };
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Wykonaj check-in dla gościa
  const checkInGuest = useCallback(async (sessionId, locationId, guestData) => {
    setLoading(true);
    setError(null);

    try {
      const user = await getCachedUser();

      // Kod bezpieczeństwa = ostatnie 4 cyfry telefonu rodzica gościa
      const parentPhoneDigits = (guestData.parentPhone || '').replace(/\D/g, '');
      const securityCode = parentPhoneDigits.slice(-4) || 'XXXX';

      // Utwórz rekord check-in dla gościa
      const { data, error: insertError } = await supabase
        .from('checkins')
        .insert({
          session_id: sessionId,
          student_id: null,
          location_id: locationId,
          household_id: null,
          security_code: securityCode,
          checked_in_by: user?.email || 'system',
          is_guest: true,
          guest_name: guestData.name,
          guest_birth_year: guestData.birthYear,
          guest_parent_name: guestData.parentName,
          guest_parent_phone: guestData.parentPhone,
          guest_allergies: guestData.allergies || null,
          guest_notes: guestData.notes || null
        })
        .select(`
          *,
          checkin_locations (*)
        `)
        .single();

      if (insertError) throw insertError;

      // Dodaj informację o kodzie do zwracanego obiektu
      return {
        ...data,
        security_codes_list: [{ code: securityCode, name: guestData.parentName }]
      };
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Wyszukaj check-iny po kodzie bezpieczeństwa (dla checkout)
  // Szuka kodu w formacie "1234" w polu security_code, które może zawierać "1234|5678|9012"
  const searchBySecurityCode = useCallback(async (sessionId, securityCode) => {
    if (!securityCode || securityCode.length !== 4) {
      return [];
    }

    setLoading(true);
    setError(null);

    try {
      // Szukamy kodu, który zawiera podane 4 cyfry (może być w formacie "1234|5678|9012")
      const { data, error: queryError } = await supabase
        .from('checkins')
        .select(`
          *,
          kids_students (*),
          checkin_locations (*)
        `)
        .eq('session_id', sessionId)
        .like('security_code', `%${securityCode}%`)
        .is('checked_out_at', null);

      if (queryError) throw queryError;

      // Dodatkowo filtrujemy, żeby upewnić się że kod dokładnie pasuje (nie np. "1234" w "12345")
      const filteredData = (data || []).filter(checkin => {
        const codes = checkin.security_code.split('|');
        return codes.includes(securityCode);
      });

      return filteredData;
    } catch (err) {
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Wykonaj checkout
  const checkOut = useCallback(async (checkinId) => {
    setLoading(true);
    setError(null);

    try {
      const user = await getCachedUser();

      const { data, error: updateError } = await supabase
        .from('checkins')
        .update({
          checked_out_at: new Date().toISOString(),
          checked_out_by: user?.email || 'system'
        })
        .eq('id', checkinId)
        .select(`
          *,
          kids_students (*),
          checkin_locations (*)
        `)
        .single();

      if (updateError) throw updateError;
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Checkout wielu dzieci naraz
  const checkOutMultiple = useCallback(async (checkinIds) => {
    setLoading(true);
    setError(null);

    try {
      const user = await getCachedUser();
      const results = [];

      for (const checkinId of checkinIds) {
        const { data, error: updateError } = await supabase
          .from('checkins')
          .update({
            checked_out_at: new Date().toISOString(),
            checked_out_by: user?.email || 'system'
          })
          .eq('id', checkinId)
          .select()
          .single();

        if (updateError) throw updateError;
        results.push(data);
      }

      return results;
    } catch (err) {
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Pobierz dzieci z rodziny (household)
  const getHouseholdChildren = useCallback(async (householdId) => {
    try {
      const { data, error: queryError } = await supabase
        .from('kids_students')
        .select('*')
        .eq('household_id', householdId)
        .order('full_name');

      if (queryError) throw queryError;
      return data || [];
    } catch (err) {
      setError(err.message);
      return [];
    }
  }, []);

  return {
    loading,
    error,
    searchByPhone,
    getActiveSession,
    getOrCreateTodaySession,
    getLocations,
    checkInStudent,
    checkInGuest,
    searchBySecurityCode,
    checkOut,
    checkOutMultiple,
    getHouseholdChildren,
    getSecurityCodesForHousehold
  };
}
