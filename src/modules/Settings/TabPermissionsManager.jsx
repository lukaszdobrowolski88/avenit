import React, { useState } from 'react';
import { Check, X } from 'lucide-react';

// Definicja modułów i ich zakładek
const MODULE_TABS = {
  dashboard: {
    label: 'Pulpit',
    tabs: {
      ministry: 'Moja służba',
      tasks: 'Moje zadania',
      absences: 'Nieobecności',
      prayers: 'Moje modlitwy'
    }
  },
  homegroups: {
    label: 'Grupy Domowe',
    tabs: {
      groups: 'Grupy',
      leaders: 'Liderzy',
      members: 'Członkowie',
      finances: 'Finanse'
    }
  },
  media: {
    label: 'Media Team',
    tabs: {
      schedule: 'Grafik',
      tasks: 'Zadania',
      members: 'Członkowie',
      finances: 'Finanse'
    }
  },
  kids: {
    label: 'Małe SchWro',
    tabs: {
      schedule: 'Grafik',
      groups: 'Grupy',
      teachers: 'Nauczyciele',
      students: 'Uczniowie',
      finances: 'Finanse'
    }
  },
  worship: {
    label: 'Grupa Uwielbienia',
    tabs: {
      schedule: 'Grafik',
      songs: 'Baza Pieśni',
      members: 'Członkowie',
      finances: 'Finanse'
    }
  },
  atmosfera: {
    label: 'Atmosfera Team',
    tabs: {
      schedule: 'Grafik',
      members: 'Członkowie',
      finances: 'Finanse'
    }
  }
};

export default function TabPermissionsManager({ roles }) {
  // Wczytaj aktualne uprawnienia z localStorage lub użyj domyślnych
  const getInitialPermissions = () => {
    const stored = localStorage.getItem('tabPermissions');
    if (stored) {
      return JSON.parse(stored);
    }

    // Domyślne uprawnienia
    return {
      dashboard: {
        ministry: null,
        tasks: null,
        absences: null,
        prayers: null
      },
      homegroups: {
        groups: null,
        leaders: null,
        members: ['rada_starszych', 'koordynator', 'lider'],
        finances: ['rada_starszych', 'koordynator']
      },
      media: {
        schedule: null,
        tasks: null,
        members: ['rada_starszych', 'koordynator', 'lider'],
        finances: ['rada_starszych', 'koordynator']
      },
      kids: {
        schedule: null,
        groups: null,
        teachers: ['rada_starszych', 'koordynator', 'lider'],
        students: null,
        finances: ['rada_starszych', 'koordynator']
      },
      worship: {
        schedule: null,
        songs: null,
        members: ['rada_starszych', 'koordynator', 'lider'],
        finances: ['rada_starszych', 'koordynator']
      },
      atmosfera: {
        schedule: null,
        members: ['rada_starszych', 'koordynator', 'lider'],
        finances: ['rada_starszych', 'koordynator']
      }
    };
  };

  const [permissions, setPermissions] = useState(getInitialPermissions());
  const [expandedModule, setExpandedModule] = useState(null);

  const savePermissions = () => {
    localStorage.setItem('tabPermissions', JSON.stringify(permissions));

    // Zapisz również do pliku tabPermissions.js
    const fileContent = `// Konfiguracja widoczności zakładek według ról
// null = wszyscy mają dostęp
// ['role1', 'role2'] = tylko wymienione role mają dostęp

export const TAB_PERMISSIONS = ${JSON.stringify(permissions, null, 2)};

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
`;

    // W przeglądarce nie możemy bezpośrednio zapisać pliku,
    // więc pokazujemy komunikat, że zmiany wymagają restartu
    alert('Uprawnienia zaktualizowane. Odśwież stronę, aby zmiany weszły w życie.');
    window.location.reload();
  };

  const toggleRoleAccess = (module, tab, roleKey) => {
    setPermissions(prev => {
      const newPerms = { ...prev };
      const currentTabPerms = newPerms[module][tab];

      if (currentTabPerms === null) {
        // Jeśli wszyscy mieli dostęp, ustaw tylko tę rolę
        newPerms[module][tab] = [roleKey];
      } else if (Array.isArray(currentTabPerms)) {
        if (currentTabPerms.includes(roleKey)) {
          // Usuń rolę z listy
          const newRoles = currentTabPerms.filter(r => r !== roleKey);
          newPerms[module][tab] = newRoles.length === 0 ? null : newRoles;
        } else {
          // Dodaj rolę do listy
          newPerms[module][tab] = [...currentTabPerms, roleKey];
        }
      }

      return newPerms;
    });
  };

  const setAllAccess = (module, tab) => {
    setPermissions(prev => ({
      ...prev,
      [module]: {
        ...prev[module],
        [tab]: null
      }
    }));
  };

  const hasAccess = (module, tab, roleKey) => {
    const tabPerms = permissions[module]?.[tab];
    if (tabPerms === null) return true; // wszyscy mają dostęp
    return Array.isArray(tabPerms) && tabPerms.includes(roleKey);
  };

  return (
    <div className="space-y-4">
      {Object.entries(MODULE_TABS).map(([moduleKey, moduleData]) => (
        <div key={moduleKey} className="bg-white dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 overflow-hidden">
          <button
            onClick={() => setExpandedModule(expandedModule === moduleKey ? null : moduleKey)}
            className="w-full px-6 py-4 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-600 transition"
          >
            <h3 className="font-bold text-lg text-gray-800 dark:text-white">{moduleData.label}</h3>
            <span className="text-gray-400">{expandedModule === moduleKey ? '−' : '+'}</span>
          </button>

          {expandedModule === moduleKey && (
            <div className="border-t border-gray-200 dark:border-gray-600 p-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-600">
                      <th className="text-left py-3 px-4 font-bold text-gray-600 dark:text-gray-300">Zakładka</th>
                      <th className="text-center py-3 px-4 font-bold text-gray-600 dark:text-gray-300">Wszyscy</th>
                      {roles.map(role => (
                        <th key={role.key} className="text-center py-3 px-4 font-bold text-gray-600 dark:text-gray-300">
                          {role.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-600">
                    {Object.entries(moduleData.tabs).map(([tabKey, tabLabel]) => {
                      const allAccess = permissions[moduleKey]?.[tabKey] === null;

                      return (
                        <tr key={tabKey} className="hover:bg-gray-50 dark:hover:bg-gray-600/50">
                          <td className="py-3 px-4 font-medium text-gray-800 dark:text-gray-200">
                            {tabLabel}
                            <div className="text-xs text-gray-400 font-mono">{tabKey}</div>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => setAllAccess(moduleKey, tabKey)}
                              className={`w-6 h-6 rounded flex items-center justify-center transition ${
                                allAccess
                                  ? 'bg-green-500 text-white'
                                  : 'bg-gray-200 dark:bg-gray-600 text-gray-400'
                              }`}
                            >
                              {allAccess && <Check size={14} />}
                            </button>
                          </td>
                          {roles.map(role => {
                            const hasRoleAccess = hasAccess(moduleKey, tabKey, role.key);

                            return (
                              <td key={role.key} className="py-3 px-4 text-center">
                                <button
                                  onClick={() => toggleRoleAccess(moduleKey, tabKey, role.key)}
                                  disabled={allAccess}
                                  className={`w-6 h-6 rounded flex items-center justify-center mx-auto transition ${
                                    allAccess
                                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-300 cursor-not-allowed'
                                      : hasRoleAccess
                                      ? 'bg-pink-500 text-white'
                                      : 'bg-gray-200 dark:bg-gray-600 text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-500'
                                  }`}
                                >
                                  {hasRoleAccess && !allAccess && <Check size={14} />}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ))}

      <div className="flex justify-end gap-3 mt-6">
        <button
          onClick={() => setPermissions(getInitialPermissions())}
          className="px-6 py-3 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
        >
          Przywróć domyślne
        </button>
        <button
          onClick={savePermissions}
          className="px-6 py-3 bg-gradient-to-r from-pink-600 to-orange-600 text-white rounded-xl hover:shadow-lg transition font-bold"
        >
          Zapisz uprawnienia
        </button>
      </div>

      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
        <p className="text-sm text-blue-800 dark:text-blue-300">
          <strong>Instrukcja:</strong> Zaznacz "Wszyscy", aby dać dostęp wszystkim użytkownikom do danej zakładki.
          W przeciwnym razie zaznacz konkretne role, które mają mieć dostęp. Niezaznaczone role nie będą widzieć zakładki.
        </p>
      </div>
    </div>
  );
}
