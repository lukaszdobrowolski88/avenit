// Konfiguracja widoczności zakładek według ról
// null = wszyscy mają dostęp
// ['role1', 'role2'] = tylko wymienione role mają dostęp

export const TAB_PERMISSIONS = {
  dashboard: {
    ministry: null,
    tasks: null,
    absences: null,
    prayers: null,
    onlineUsers: null,
    unreadMessages: null
  },
  homegroups: {
    schedule: null,
    members: ['rada_starszych', 'koordynator', 'lider'],
    finances: ['rada_starszych', 'koordynator'],
    equipment: ['rada_starszych', 'koordynator', 'lider']
  },
  media: {
    schedule: null,
    tasks: null,
    members: ['rada_starszych', 'koordynator', 'lider'],
    finances: ['rada_starszych', 'koordynator'],
    equipment: ['rada_starszych', 'koordynator', 'lider']
  },
  kids: {
    schedule: null,
    groups: null,
    teachers: ['rada_starszych', 'koordynator', 'lider'],
    students: null,
    finances: ['rada_starszych', 'koordynator'],
    equipment: ['rada_starszych', 'koordynator', 'lider']
  },
  worship: {
    schedule: null,
    songs: null,
    members: ['rada_starszych', 'koordynator', 'lider'],
    finances: ['rada_starszych', 'koordynator'],
    wall: null,
    equipment: ['rada_starszych', 'koordynator', 'lider']
  },
  atmosfera: {
    schedule: null,
    members: ['rada_starszych', 'koordynator', 'lider'],
    finances: ['rada_starszych', 'koordynator'],
    equipment: ['rada_starszych', 'koordynator', 'lider']
  },
  teaching: {
    wall: null,
    schedule: null,
    series: null,
    speakers: ['rada_starszych', 'koordynator', 'lider']
  },
  prayer: {
    wall: null,
    leaders_requests: ['rada_starszych', 'koordynator', 'lider']
  },
  mlodziezowka: {
    events: null,
    tasks: null,
    leaders: ['rada_starszych', 'koordynator', 'lider'],
    members: ['rada_starszych', 'koordynator', 'lider'],
    finances: ['rada_starszych', 'koordynator'],
    equipment: ['rada_starszych', 'koordynator', 'lider']
  }
};

/**
 * Sprawdza czy użytkownik ma dostęp do zakładki
 */
export function hasTabAccess(module, tab, userRole) {
  if (!module || !tab) return true;
  if (userRole === 'superadmin') return true;

  const modulePermissions = TAB_PERMISSIONS[module];
  if (!modulePermissions) return true;

  const tabPermissions = modulePermissions[tab];
  if (tabPermissions === null || tabPermissions === undefined) return true;
  if (Array.isArray(tabPermissions)) return tabPermissions.includes(userRole);
  return true;
}
