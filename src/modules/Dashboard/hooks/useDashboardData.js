import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabase';

const DASHBOARD_CACHE_KEY = 'dashboard_data_cache';

// Domyślne dane - nie blokuj renderowania
const DEFAULT_DATA = {
  userProfile: null,
  upcomingMinistry: [],
  pastMinistry: [],
  upcomingPrograms: [],
  tasks: [],
  absences: [],
  prayers: [],
  stats: {
    tasksCount: 0,
    upcomingServicesCount: 0,
    prayersCount: 0,
  },
};

export function useDashboardData(userEmail) {
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

  // Pobierz nadchodzące służby użytkownika (z pominięciem tych, na które ma nieobecność)
  const fetchUpcomingMinistry = useCallback(async (userName) => {
    if (!userEmail) return [];

    try {
      const today = new Date().toISOString().split('T')[0];

      // Pobierz programy i nieobecności równolegle
      const [programsResponse, absencesResponse] = await Promise.all([
        supabase
          .from('programs')
          .select('*')
          .gte('date', today)
          .order('date', { ascending: true })
          .limit(20),
        supabase
          .from('user_absences')
          .select('program_id')
          .eq('user_email', userEmail)
          .gte('absence_date', today)
      ]);

      const programs = programsResponse.data || [];
      const absences = absencesResponse.data || [];

      // Utwórz zbiór ID programów, na które użytkownik ma nieobecność
      const absentProgramIds = new Set(absences.map(a => a.program_id));

      // Filtruj programy - pomiń te z nieobecnością
      const availablePrograms = programs.filter(p => !absentProgramIds.has(p.id));

      return filterAndMapPrograms(availablePrograms, userName || userEmail);
    } catch (error) {
      console.error('Error fetching upcoming ministry:', error);
      return [];
    }
  }, [userEmail]);

  // Pobierz historię służb użytkownika
  const fetchPastMinistry = useCallback(async (userName) => {
    if (!userEmail) return [];

    try {
      const today = new Date().toISOString().split('T')[0];

      const { data: programs } = await supabase
        .from('programs')
        .select('*')
        .lt('date', today)
        .order('date', { ascending: false })
        .limit(10);

      return filterAndMapPrograms(programs, userName || userEmail);
    } catch (error) {
      console.error('Error fetching past ministry:', error);
      return [];
    }
  }, [userEmail]);

  // Pobierz wszystkie nadchodzące programy (dla widgetu nieobecności)
  const fetchUpcomingPrograms = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0];

      const { data: programs } = await supabase
        .from('programs')
        .select('*')
        .gte('date', today)
        .order('date', { ascending: true })
        .limit(30);

      return programs || [];
    } catch (error) {
      console.error('Error fetching upcoming programs:', error);
      return [];
    }
  }, []);

  // Pobierz zadania użytkownika ze wszystkich źródeł - ZOPTYMALIZOWANE
  const fetchTasks = useCallback(async (userName) => {
    if (!userEmail) return [];

    try {
      // Wykonaj wszystkie początkowe zapytania RÓWNOLEGLE
      const [personalTasksResult, leaderResult, mediaResult] = await Promise.all([
        // 1. Osobiste zadania
        supabase
          .from('user_tasks')
          .select('*')
          .eq('user_email', userEmail)
          .order('due_date', { ascending: true }),
        // 2. Szukaj lidera grup domowych (po emailu lub nazwie)
        supabase
          .from('home_group_leaders')
          .select('id')
          .or(`email.eq.${userEmail}${userName ? `,full_name.eq.${userName}` : ''}`)
          .limit(1),
        // 3. Szukaj członka media team (po emailu lub nazwie)
        supabase
          .from('media_team')
          .select('id')
          .or(`email.eq.${userEmail}${userName ? `,full_name.eq.${userName}` : ''}`)
          .limit(1)
      ]);

      const allTasks = [];

      // Przetwórz osobiste zadania
      if (personalTasksResult.data) {
        allTasks.push(...personalTasksResult.data.map(task => ({
          ...task,
          source: 'personal',
          source_label: 'Osobiste',
        })));
      }

      // Pobierz zadania grup domowych i media RÓWNOLEGLE (jeśli znaleziono IDs)
      const homeGroupLeaderId = leaderResult.data?.[0]?.id;
      const mediaTeamMemberId = mediaResult.data?.[0]?.id;

      const additionalQueries = [];

      if (homeGroupLeaderId) {
        additionalQueries.push(
          supabase
            .from('home_group_tasks')
            .select('*, home_groups:group_id (name)')
            .eq('assigned_to', homeGroupLeaderId)
            .order('due_date', { ascending: true })
            .then(({ data }) => ({ type: 'home_group', data }))
        );
      }

      if (mediaTeamMemberId) {
        additionalQueries.push(
          supabase
            .from('media_tasks')
            .select('*')
            .eq('assigned_to', mediaTeamMemberId)
            .order('due_date', { ascending: true })
            .then(({ data }) => ({ type: 'media_team', data }))
        );
      }

      // Wykonaj dodatkowe zapytania równolegle
      if (additionalQueries.length > 0) {
        const additionalResults = await Promise.all(additionalQueries);

        additionalResults.forEach(result => {
          if (result.data) {
            if (result.type === 'home_group') {
              allTasks.push(...result.data.map(task => ({
                id: task.id,
                title: task.title,
                description: task.description,
                due_date: task.due_date,
                status: task.status === 'Do zrobienia' ? 'todo' : task.status === 'W trakcie' ? 'in_progress' : 'done',
                created_at: task.created_at,
                updated_at: task.updated_at,
                source: 'home_group',
                source_label: task.home_groups?.name || 'Grupa domowa',
                original_id: task.id,
                original_table: 'home_group_tasks',
              })));
            } else if (result.type === 'media_team') {
              allTasks.push(...result.data.map(task => ({
                id: task.id,
                title: task.title,
                description: task.description,
                due_date: task.due_date,
                status: task.status === 'Do zrobienia' ? 'todo' : task.status === 'W trakcie' ? 'in_progress' : 'done',
                created_at: task.created_at,
                updated_at: task.updated_at,
                source: 'media_team',
                source_label: 'Media Team',
                original_id: task.id,
                original_table: 'media_tasks',
              })));
            }
          }
        });
      }

      // Sortuj wszystkie zadania według due_date
      allTasks.sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date) - new Date(b.due_date);
      });

      return allTasks;
    } catch (error) {
      console.error('Error fetching tasks:', error);
      return [];
    }
  }, [userEmail]);

  // Pobierz nieobecności użytkownika
  const fetchAbsences = useCallback(async () => {
    if (!userEmail) return [];

    try {
      const { data: absences } = await supabase
        .from('user_absences')
        .select(`
          *,
          programs:program_id (date)
        `)
        .eq('user_email', userEmail)
        .order('absence_date', { ascending: false })
        .limit(10);

      return absences || [];
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
        fetchTasks(null),
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
    const tasks = await fetchTasks(userNameRef.current);
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
