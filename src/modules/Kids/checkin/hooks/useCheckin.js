import { useState, useCallback } from 'react';
import { supabase, getCachedUser } from '../../../../lib/supabase';
import { tr, appLocale } from '../../../../i18n';
import {
  PICKUP_CODE_ALPHABET,
  generateUniquePickupCode,
  pickupCodeMatches,
  localDateISO,
  localTimeHM,
  phoneEndsWith,
  pickSessionEvent,
} from '../utils/kiosk';

const HOUSEHOLD_SELECT = `
  *,
  parent_contacts (*),
  kids_students (*)
`;

const CHECKIN_SELECT = `
  *,
  kids_students (*),
  checkin_locations (*)
`;

// Kod „nowego” formatu (losowy z alfabetu) — taki można dać rodzinie ponownie w tej samej sesji.
const isRandomCode = (code) =>
  typeof code === 'string' && code.length >= 4 && code.length <= 6
  && [...code].every((ch) => PICKUP_CODE_ALPHABET.includes(ch));

function addHours(hm, hours) {
  const [h, m] = String(hm || '09:00').split(':').map(Number);
  return `${String(Math.min(23, (h || 0) + hours)).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
}

export function useCheckin() {
  const [loading, setLoading] = useState(false);
  // Ludzki komunikat ostatniego błędu (bez surowego error.message) — pokazywany banerem,
  // nie zastępuje już całego ekranu meldowania.
  const [error, setError] = useState(null);

  const clearError = useCallback(() => setError(null), []);

  const fail = useCallback((message, err) => {
    if (err) console.error('[check-in]', message, err);
    setError(message);
  }, []);

  // Rodziny po ostatnich 4 cyfrach: główny telefon rodziny ORAZ telefony wszystkich opiekunów
  // (drugi rodzic też zamelduje dziecko swoim numerem).
  const searchByPhone = useCallback(async (lastFourDigits) => {
    if (!lastFourDigits || lastFourDigits.length !== 4) return [];

    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from('households')
        .select(HOUSEHOLD_SELECT)
        .eq('phone_last_four', lastFourDigits);
      if (queryError) throw queryError;
      const found = [...(data || [])];

      // Telefony opiekunów — błąd tu nie blokuje wyniku z głównego telefonu.
      try {
        const { data: contacts, error: cErr } = await supabase
          .from('parent_contacts')
          .select('household_id, phone');
        if (cErr) throw cErr;
        const known = new Set(found.map((h) => String(h.id)));
        const extraIds = [...new Set((contacts || [])
          .filter((c) => c.household_id && phoneEndsWith(c.phone, lastFourDigits))
          .map((c) => c.household_id)
          .filter((id) => !known.has(String(id))))];
        if (extraIds.length > 0) {
          const { data: extra, error: eErr } = await supabase
            .from('households')
            .select(HOUSEHOLD_SELECT)
            .in('id', extraIds);
          if (eErr) throw eErr;
          found.push(...(extra || []));
        }
      } catch (contactErr) {
        console.warn('[check-in] wyszukiwanie po telefonach opiekunów nie powiodło się', contactErr);
      }

      return found;
    } catch (err) {
      fail(tr('Nie udało się wyszukać rodziny. Sprawdź połączenie i spróbuj ponownie.'), err);
      return [];
    } finally {
      setLoading(false);
    }
  }, [fail]);

  // Aktywna sesja na DZIŚ (data lokalna). Niczego nie tworzy — sesja powstaje dopiero przy
  // pierwszym meldowaniu albo po „Rozpocznij sesję”.
  const getActiveSession = useCallback(async () => {
    try {
      const { data, error: queryError } = await supabase
        .from('checkin_sessions')
        .select('*')
        .eq('session_date', localDateISO())
        .eq('is_active', true)
        .order('start_time', { ascending: true })
        .limit(1);
      if (queryError) throw queryError;
      return (Array.isArray(data) ? data[0] : data) || null;
    } catch (err) {
      fail(tr('Nie udało się wczytać dzisiejszej sesji.'), err);
      return null;
    }
  }, [fail]);

  // Tworzy sesję na dziś — nazwa z dzisiejszego wydarzenia w kalendarzu, gdy jest.
  const createTodaySession = useCallback(async () => {
    setError(null);
    try {
      const today = localDateISO();
      const user = await getCachedUser();

      let event = null;
      try {
        const { data: events } = await supabase
          .from('events')
          .select('title, time, end_time')
          .eq('date', today);
        event = pickSessionEvent(events || []);
      } catch { /* kalendarz niedostępny — zostaje nazwa domyślna */ }

      const dateLabel = new Date().toLocaleDateString(appLocale(), { weekday: 'long', day: 'numeric', month: 'long' });
      const start = event?.time ? String(event.time).slice(0, 5) : localTimeHM();
      const end = event?.end_time ? String(event.end_time).slice(0, 5) : addHours(start, 3);

      const { data, error: insertError } = await supabase
        .from('checkin_sessions')
        .insert({
          name: event?.title || tr('Meldowanie – {date}', { date: dateLabel }),
          session_date: today,
          start_time: start,
          end_time: end,
          is_active: true,
          created_by: user?.email || 'system',
        })
        .select()
        .single();
      if (insertError) throw insertError;
      return data;
    } catch (err) {
      fail(tr('Nie udało się rozpocząć sesji meldowania.'), err);
      return null;
    }
  }, [fail]);

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
      // Bez sal da się meldować — tylko informujemy w konsoli.
      console.error('[check-in] sale', err);
      return [];
    }
  }, []);

  // Aktywne (nieodebrane) meldowania rodziny w sesji — do blokady podwójnego meldowania.
  const getActiveCheckinsForHousehold = useCallback(async (sessionId, householdId) => {
    if (!sessionId || !householdId) return [];
    try {
      const { data, error: queryError } = await supabase
        .from('checkins')
        .select('id, student_id, checked_in_at, security_code')
        .eq('session_id', sessionId)
        .eq('household_id', householdId)
        .is('checked_out_at', null);
      if (queryError) throw queryError;
      return data || [];
    } catch (err) {
      console.error('[check-in] aktywne meldowania rodziny', err);
      return [];
    }
  }, []);

  const newPickupCode = useCallback(async (sessionId) => {
    const { data, error: queryError } = await supabase
      .from('checkins')
      .select('security_code')
      .eq('session_id', sessionId)
      .is('checked_out_at', null);
    if (queryError) throw queryError;
    return generateUniquePickupCode((data || []).map((r) => r.security_code));
  }, []);

  // Meldowanie dzieci z rodziny: jeden losowy kod odbioru na rodzinę w sesji (rodzic ma jedną
  // naklejkę); dzieci już zameldowane są pomijane (zwracane w `skipped`).
  const checkInHousehold = useCallback(async (sessionId, householdId, members) => {
    setLoading(true);
    setError(null);
    const results = [];
    const skipped = [];
    try {
      const user = await getCachedUser();
      const active = await getActiveCheckinsForHousehold(sessionId, householdId);
      const activeByStudent = new Map(active.map((c) => [String(c.student_id), c]));
      const reuse = active.find((c) => isRandomCode(c.security_code));
      const code = reuse ? reuse.security_code : await newPickupCode(sessionId);

      for (const member of members) {
        const existing = activeByStudent.get(String(member.studentId));
        if (existing) {
          skipped.push({ studentId: member.studentId, checkedInAt: existing.checked_in_at });
          continue;
        }
        const { data, error: insertError } = await supabase
          .from('checkins')
          .insert({
            session_id: sessionId,
            student_id: member.studentId,
            location_id: member.locationId || null,
            household_id: householdId,
            security_code: code,
            checked_in_by: user?.email || 'system',
            is_guest: false,
          })
          .select(CHECKIN_SELECT)
          .single();
        if (insertError) throw insertError;
        results.push(data);
      }
      return { results, skipped, code };
    } catch (err) {
      fail(results.length > 0
        ? tr('Zameldowano tylko część dzieci. Sprawdź listę obecności.')
        : tr('Nie udało się zameldować dziecka. Sprawdź połączenie i spróbuj ponownie.'), err);
      return { results, skipped, code: results[0]?.security_code || null };
    } finally {
      setLoading(false);
    }
  }, [fail, getActiveCheckinsForHousehold, newPickupCode]);

  const checkInGuest = useCallback(async (sessionId, locationId, guestData) => {
    setLoading(true);
    setError(null);
    try {
      const user = await getCachedUser();
      const code = await newPickupCode(sessionId);
      const { data, error: insertError } = await supabase
        .from('checkins')
        .insert({
          session_id: sessionId,
          student_id: null,
          location_id: locationId || null,
          household_id: null,
          security_code: code,
          checked_in_by: user?.email || 'system',
          is_guest: true,
          guest_name: guestData.name,
          guest_birth_year: guestData.birthYear,
          guest_parent_name: guestData.parentName,
          guest_parent_phone: guestData.parentPhone,
          guest_allergies: guestData.allergies || null,
          guest_notes: guestData.notes || null,
        })
        .select(`
          *,
          checkin_locations (*)
        `)
        .single();
      if (insertError) throw insertError;
      return data;
    } catch (err) {
      fail(tr('Nie udało się zameldować gościa. Sprawdź połączenie i spróbuj ponownie.'), err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [fail, newPickupCode]);

  // Dziecko dopisane do rodziny prosto z meldowania (rodzina bez dzieci nie jest ślepym zaułkiem).
  const addChildToHousehold = useCallback(async (householdId, child, campusId = null) => {
    setLoading(true);
    setError(null);
    try {
      const payload = {
        full_name: child.full_name,
        birth_year: child.birth_year ? parseInt(child.birth_year, 10) : null,
        allergies: child.allergies || null,
        household_id: householdId,
      };
      if (campusId) payload.campus_id = campusId;
      const { data, error: insertError } = await supabase
        .from('kids_students')
        .insert(payload)
        .select()
        .single();
      if (insertError) throw insertError;
      return data;
    } catch (err) {
      fail(tr('Nie udało się dodać dziecka do rodziny.'), err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [fail]);

  // Meldowania do odbioru po kodzie z naklejki (nowy kod „K7HX” albo stary „1234|5678”).
  const searchBySecurityCode = useCallback(async (sessionId, securityCode) => {
    if (!sessionId || !securityCode) return [];
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from('checkins')
        .select(CHECKIN_SELECT)
        .eq('session_id', sessionId)
        .is('checked_out_at', null);
      if (queryError) throw queryError;
      return (data || []).filter((c) => pickupCodeMatches(c.security_code, securityCode));
    } catch (err) {
      fail(tr('Nie udało się wyszukać dzieci do odbioru.'), err);
      return [];
    } finally {
      setLoading(false);
    }
  }, [fail]);

  const checkOutMultiple = useCallback(async (checkinIds) => {
    setLoading(true);
    setError(null);
    const results = [];
    try {
      const user = await getCachedUser();
      for (const checkinId of checkinIds) {
        const { data, error: updateError } = await supabase
          .from('checkins')
          .update({
            checked_out_at: new Date().toISOString(),
            checked_out_by: user?.email || 'system',
          })
          .eq('id', checkinId)
          .select()
          .single();
        if (updateError) throw updateError;
        results.push(data);
      }
      return results;
    } catch (err) {
      fail(results.length > 0
        ? tr('Wydano tylko część dzieci. Sprawdź listę obecności.')
        : tr('Nie udało się oznaczyć odbioru. Sprawdź połączenie i spróbuj ponownie.'), err);
      return results;
    } finally {
      setLoading(false);
    }
  }, [fail]);

  const checkOut = useCallback(async (checkinId) => {
    const [row] = await checkOutMultiple([checkinId]);
    return row || null;
  }, [checkOutMultiple]);

  return {
    loading,
    error,
    clearError,
    searchByPhone,
    getActiveSession,
    createTodaySession,
    getLocations,
    getActiveCheckinsForHousehold,
    checkInHousehold,
    checkInGuest,
    addChildToHousehold,
    searchBySecurityCode,
    checkOut,
    checkOutMultiple,
  };
}
