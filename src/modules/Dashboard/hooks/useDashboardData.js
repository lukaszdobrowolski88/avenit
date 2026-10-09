import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { useCampusQuery } from '../../../hooks/useCampusQuery';
import { fetchMyEventService } from './myService';

const DASHBOARD_CACHE_KEY = 'dashboard_data_cache';

// Domyślne dane - nie blokuj renderowania
const DEFAULT_DATA = {
  userProfile: null,
  upcomingMinistry: [],
  pastMinistry: [],
  upcomingPrograms: [],
  tasks: [], // zadania osobiste (user_tasks) — zadania z tablic: useMyBoardTasks
  absences: [],
  prayers: [],
  stats: {
    tasksCount: 0, // tylko osobiste; Pulpit dolicza zadania z tablic (useMyBoardTasks)
    upcomingServicesCount: 0,
    prayersCount: 0,
  },
};

export function useDashboardData(userEmail) {
  const { withCampusFilter, selectedCampusId, campusIdForInsert } = useCampusQuery();

  // Inicjalizuj z cache jeśli dostępny
  const [data, setData] = useState(() => {
    if (!userEmail) return DEFAULT_DATA;
    try {
      const cached = localStorage.getItem(`${DASHBOARD_CACHE_KEY}_${userEmail}`);
      return cached ? JSON.parse(cached) : DEFAULT_DATA;
    } catch { return DEFAULT_DATA; }
  });
  const [loading, setLoading] = useState(false); // Nie blokuj - pokaż od razu z cache/domyślnymi
  const userNameRef = useRef(null);

  // Pobierz profil użytkownika
  const fetchUserProfile = useCallback(async () => {
    if (!userEmail) return null;

    try {
      const { data: profile } = await supabase
        .from('app_users')
        .select('full_name, avatar_url, role')
        .eq('email', userEmail)
        .maybeSingle();

      if (profile) {
        userNameRef.current = profile.full_name;
      }
      return profile;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }
  }, [userEmail]);

  // Helper do filtrowania i mapowania programów
  const filterAndMapPrograms = (programs, searchName) => {
    if (!programs) return [];

    const userPrograms = programs.filter(program => {
      const zespol = program.zespol || {};
      const produkcja = program.produkcja || {};
      const atmosfera_team = program.atmosfera_team || {};
      const szkolka = program.szkolka || {};
      const scena = program.scena || {};

      const checkField = (obj) => Object.values(obj).some(val =>
        typeof val === 'string' && val.toLowerCase().includes(searchName.toLowerCase())
      );

      return checkField(zespol) || checkField(produkcja) || checkField(atmosfera_team) ||
             checkField(szkolka) || checkField(scena);
    });

    return userPrograms.map(program => {
      const roles = [];

      const checkRoles = (obj, category) => {
        Object.entries(obj || {}).forEach(([key, val]) => {
          if (typeof val === 'string' && val.toLowerCase().includes(searchName.toLowerCase())) {
            roles.push({ category, role: key });
          }
        });
      };

      checkRoles(program.zespol, 'Zespół');
      checkRoles(program.produkcja, 'Produkcja');
      checkRoles(program.atmosfera_team, 'Atmosfera');
      checkRoles(program.szkolka, 'Szkółka');
      checkRoles(program.scena, 'Scena');

      return {
        id: program.id,
        date: program.date,
        title: program.title || 'Nabożeństwo niedzielne',
        roles,
        notes: program.zespol?.notatki || '',
      };
    });
  };

  // Nadchodzące służby — z grafiku na wydarzeniach (myService.js). Służby wypadające
  // w mojej zgłoszonej nieobecności NIE znikają (konflikt trzeba widzieć) — są oznaczone.
  const fetchUpcomingMinistry = useCallback(async () => {
    if (!userEmail) return [];
    try {
      const [items, blockoutsResponse] = await Promise.all([
        fetchMyEventService({ email: userEmail, range: 'upcoming', withCampusFilter }),
        supabase.functions.invoke('my-blockouts', { body: { action: 'list' } }).catch(() => ({ data: null })),
      ]);
      const blockouts = blockoutsResponse?.data?.blockouts || [];
      return items.map((it) => ({
        ...it,
        absent: blockouts.some((b) => b.start_date <= it.date && it.date <= b.end_date),
      }));
    } catch (error) {
      console.error('Error fetching upcoming ministry:', error);
      return [];
    }
  }, [userEmail, withCampusFilter]);

  // Historia służb: wydarzenia + stare programy sprzed przeniesienia grafiku na wydarzenia.
  const fetchPastMinistry = useCallback(async (userName) => {
    if (!userEmail) return [];

    try {
      const today = new Date().toISOString().split('T')[0];
      const [eventItems, { data: programs }, profile] = await Promise.all([
        fetchMyEventService({ email: userEmail, range: 'past', withCampusFilter, limit: 20 }),
        withCampusFilter(supabase.from('programs').select('*')).lt('date', today).order('date', { ascending: false }).limit(10),
        userName ? Promise.resolve({ data: { full_name: userName } }) : supabase.from('app_users').select('full_name').eq('email', userEmail).maybeSingle(),
      ]);
      const name = profile?.data?.full_name;
      const programItems = name ? filterAndMapPrograms(programs, name).map((p) => ({ ...p, kind: 'program' })) : [];
      return [...eventItems, ...programItems].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 20);
    } catch (error) {
      console.error('Error fetching past ministry:', error);
      return [];
    }
  }, [userEmail, withCampusFilter]);

  // Pobierz wszystkie nadchodzące programy (dla widgetu nieobecności)
  const fetchUpcomingPrograms = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0];

      const { data: programs } = await withCampusFilter(supabase
        .from('programs')
        .select('*'))
        .gte('date', today)
        .order('date', { ascending: true })
        .limit(30);

      return programs || [];
    } catch (error) {
      console.error('Error fetching upcoming programs:', error);
      return [];
    }
  }, [withCampusFilter]);

  // Zadania osobiste (user_tasks): moje ORAZ przypisane mi przez kogoś (jak w aplikacji mobilnej).
  // Serwer i tak zawęża wiersze do „moje albo przypisane mnie” (ownership.js, bez względu na
  // wielkość liter) — filtr tu jest jawny dla czytelności. Zadania z tablic (Projekty, zakładki
  // „Zadania” modułów, Kalendarz) czyta JEDNO źródło: useMyBoardTasks (lista + licznik na Pulpicie).
  const fetchTasks = useCallback(async () => {
    if (!userEmail) return [];

    try {
      const me = userEmail.toLowerCase();
      const { data, error } = await supabase
        .from('user_tasks')
        .select('*')
        .or(`user_email.ilike.${userEmail},assigned_to_email.ilike.${userEmail}`)
        .order('due_date', { ascending: true });
      if (error) throw error;
      const rows = data || [];

      // Kto przypisał (autor zadania przypisanego mnie) — imiona z kont, bez N+1.
      const authors = [...new Set(rows
        .filter((t) => String(t.user_email || '').toLowerCase() !== me && t.user_email)
        .map((t) => t.user_email))];
      const names = new Map();
      if (authors.length) {
        try {
          const { data: users } = await supabase.from('app_users').select('email, full_name, name').in('email', authors);
          (users || []).forEach((u) => names.set(String(u.email).toLowerCase(), u.full_name || u.name || u.email));
        } catch { /* bez imion — zostaje e-mail */ }
      }

      return rows.map((task) => {
        const owner = String(task.user_email || '').toLowerCase();
        const assignee = String(task.assigned_to_email || '').toLowerCase();
        return {
          ...task,
          source: 'personal',
          source_label: 'Osobiste',
          // Przypisane mi przez kogoś innego → „Od: …”; moje zlecone komuś → „Dla: …”.
          assigned_by: owner && owner !== me ? (names.get(owner) || task.user_email) : null,
          assigned_for: assignee && assignee !== me ? (task.assigned_to_name || task.assigned_to_email) : null,
        };
      });
    } catch (error) {
      console.error('Error fetching tasks:', error);
      return [];
    }
  }, [userEmail]);

  // Pobierz nieobecności użytkownika
  const fetchAbsences = useCallback(async () => {
    if (!userEmail) return [];

    try {
      // Jedna funkcja nieobecności (jak w aplikacji): volunteer_blockouts przez my-blockouts.
      const { data, error } = await supabase.functions.invoke('my-blockouts', { body: { action: 'list' } });
      if (error) throw error;
      return data || { memberResolved: false, blockouts: [] };
    } catch (error) {
      console.error('Error fetching absences:', error);
      return [];
    }
  }, [userEmail]);

  // Pobierz modlitwy użytkownika (tylko aktywne)
  const fetchPrayers = useCallback(async () => {
    if (!userEmail) return [];

    try {
      const { data: prayers } = await supabase
        .from('prayer_requests')
        .select('*')
        .eq('user_email', userEmail)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(10);

      return prayers || [];
    } catch (error) {
      console.error('Error fetching prayers:', error);
      return [];
    }
  }, [userEmail]);

  // Pobierz wszystkie dane - WSZYSTKO RÓWNOLEGLE
  const fetchAllData = useCallback(async () => {
    if (!userEmail) {
      setLoading(false);
      return;
    }

    // NIE ustawiaj loading=true - pokaż UI od razu z cache/domyślnymi danymi
    // Dane będą aktualizowane w tle

    try {
      // Wykonaj WSZYSTKIE zapytania równolegle - nie czekaj na profil
      const [
        userProfile,
        upcomingMinistry,
        pastMinistry,
        upcomingPrograms,
        tasks,
        absences,
        prayers
      ] = await Promise.all([
        fetchUserProfile(),
        fetchUpcomingMinistry(null), // Użyj emaila zamiast czekać na userName
        fetchPastMinistry(null),
        fetchUpcomingPrograms(),
        fetchTasks(),
        fetchAbsences(),
        fetchPrayers(),
      ]);

      // Zapisz userName dla przyszłych odświeżeń
      if (userProfile?.full_name) {
        userNameRef.current = userProfile.full_name;
      }

      const pendingTasks = tasks.filter(t => t.status !== 'done');

      const newData = {
        userProfile,
        upcomingMinistry,
        pastMinistry,
        upcomingPrograms,
        tasks,
        absences,
        prayers,
        stats: {
          tasksCount: pendingTasks.length,
          upcomingServicesCount: upcomingMinistry.length,
          prayersCount: prayers.length,
        },
      };

      setData(newData);

      // Zapisz do cache
      try {
        localStorage.setItem(`${DASHBOARD_CACHE_KEY}_${userEmail}`, JSON.stringify(newData));
      } catch (e) {
        // Ignoruj błędy cache (np. przekroczony limit)
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
  }, [userEmail, fetchUserProfile, fetchUpcomingMinistry, fetchPastMinistry, fetchUpcomingPrograms, fetchTasks, fetchAbsences, fetchPrayers]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const refreshMinistry = useCallback(async () => {
    const [upcoming, past] = await Promise.all([
      fetchUpcomingMinistry(userNameRef.current),
      fetchPastMinistry(userNameRef.current),
    ]);
    setData(prev => ({
      ...prev,
      upcomingMinistry: upcoming,
      pastMinistry: past,
      stats: { ...prev.stats, upcomingServicesCount: upcoming.length },
    }));
  }, [fetchUpcomingMinistry, fetchPastMinistry]);

  const refreshTasks = useCallback(async () => {
    const tasks = await fetchTasks();
    const pendingTasks = tasks.filter(t => t.status !== 'done');
    setData(prev => ({
      ...prev,
      tasks,
      stats: { ...prev.stats, tasksCount: pendingTasks.length },
    }));
  }, [fetchTasks]);

  const refreshAbsences = useCallback(async () => {
    const absences = await fetchAbsences();
    setData(prev => ({ ...prev, absences }));
  }, [fetchAbsences]);

  const refreshPrayers = useCallback(async () => {
    const prayers = await fetchPrayers();
    setData(prev => ({
      ...prev,
      prayers,
      stats: { ...prev.stats, prayersCount: prayers.length },
    }));
  }, [fetchPrayers]);

  return {
    ...data,
    loading,
    refresh: fetchAllData,
    refreshMinistry,
    refreshTasks,
    refreshAbsences,
    refreshPrayers,
  };
}
