// Konfiguracja widoczności zakładek według ról
// null = wszyscy mają dostęp
// ['role1', 'role2'] = tylko wymienione role mają dostęp

export const TAB_PERMISSIONS = {
  // Moduł Pulpit (Dashboard)
  dashboard: {
    ministry: null, // Moja służba - wszyscy
    tasks: null, // Moje zadania - wszyscy
    absences: null, // Nieobecności - wszyscy
    prayers: null, // Moje modlitwy - wszyscy
    onlineUsers: null, // Kto jest online - wszyscy
    unreadMessages: null // Nieprzeczytane wiadomości - wszyscy
  },

  // Moduł Grupy Domowe
  homegroups: {
    schedule: null, // wszyscy
    members: ['rada_starszych', 'koordynator', 'lider'],
    finances: ['rada_starszych', 'koordynator'],
    equipment: ['rada_starszych', 'koordynator', 'lider']
  },

  // Moduł Media Team
  media: {
    schedule: null,
    tasks: null,
    members: ['rada_starszych', 'koordynator', 'lider'],
    finances: ['rada_starszych', 'koordynator'],
    equipment: ['rada_starszych', 'koordynator', 'lider']
  },

  // Moduł Małe SchWro
  kids: {
    schedule: null,
    groups: null,
    teachers: ['rada_starszych', 'koordynator', 'lider'],
    students: null,
    finances: ['rada_starszych', 'koordynator'],
    equipment: ['rada_starszych', 'koordynator', 'lider']
  },

  // Moduł Grupa Uwielbienia
  worship: {
    schedule: null,
    songs: null,
    members: ['rada_starszych', 'koordynator', 'lider'],
    finances: ['rada_starszych', 'koordynator'],
    wall: null, // Tablica dostępna dla wszystkich
    equipment: ['rada_starszych', 'koordynator', 'lider']
  },

  // Moduł Atmosfera Team
  atmosfera: {
    schedule: null,
    members: ['rada_starszych', 'koordynator', 'lider'],
    finances: ['rada_starszych', 'koordynator'],
    equipment: ['rada_starszych', 'koordynator', 'lider']
  },

  // Moduł Nauczanie
  teaching: {
    wall: null, // Tablica dostępna dla wszystkich
    schedule: null,
    series: null,
    speakers: ['rada_starszych', 'koordynator', 'lider']
  },

  // Moduł Centrum Modlitwy
  prayer: {
    wall: null, // Ściana modlitwy dostępna dla wszystkich zalogowanych
    leaders_requests: ['rada_starszych', 'koordynator', 'lider'] // Prośby tylko dla liderów
  },

  // Moduł Młodzieżówka
  mlodziezowka: {
    events: null, // Wydarzenia - wszyscy
    tasks: null, // Zadania - wszyscy
    leaders: ['rada_starszych', 'koordynator', 'lider'], // Liderzy - tylko kadra
    members: ['rada_starszych', 'koordynator', 'lider'], // Członkowie - tylko kadra
    finances: ['rada_starszych', 'koordynator'], // Finanse - tylko rada i koordynator
    equipment: ['rada_starszych', 'koordynator', 'lider'] // Wyposażenie - tylko kadra
  }
};

/**
 * Sprawdza czy użytkownik ma dostęp do zakładki
 * @param {string} module - nazwa modułu (np. 'homegroups')
 * @param {string} tab - nazwa zakładki (np. 'finances')
 * @param {string} userRole - rola użytkownika
 * @returns {boolean} - true jeśli użytkownik ma dostęp
 */
export function hasTabAccess(module, tab, userRole) {
  if (!module || !tab) return true; // fallback: pokaż wszystko

  const modulePermissions = TAB_PERMISSIONS[module];
  if (!modulePermissions) return true; // moduł nie ma zdefiniowanych uprawnień

  const tabPermissions = modulePermissions[tab];
  if (tabPermissions === null || tabPermissions === undefined) {
    return true; // zakładka dostępna dla wszystkich
  }

  if (Array.isArray(tabPermissions)) {
    return tabPermissions.includes(userRole);
  }

  return true; // fallback
}
