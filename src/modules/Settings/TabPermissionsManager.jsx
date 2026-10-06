import React, { useState } from 'react';
import { Check, X } from 'lucide-react';
import { tr } from '../../i18n';
import { toast } from '../../lib/toast';
import { DataTable, THead, TH, TR, TD } from '../../components/ui/DataTable';

// Definicja modułów i ich zakładek
const MODULE_TABS = {
  dashboard: {
    label: tr('Pulpit'),
    tabs: {
      ministry: tr('Moja służba'),
      tasks: tr('Moje zadania'),
      absences: tr('Nieobecności'),
      prayers: tr('Moje modlitwy')
    }
  },
  homegroups: {
    label: tr('Grupy Domowe'),
    tabs: {
      groups: tr('Grupy'),
      leaders: tr('Liderzy'),
      members: tr('Członkowie'),
      finances: tr('Finanse')
    }
  },
  media: {
    label: tr('Media Team'),
    tabs: {
      schedule: tr('Grafik'),
      tasks: tr('Zadania'),
      members: tr('Członkowie'),
      finances: tr('Finanse')
    }
  },
  kids: {
    label: tr('Małe Avenit'),
    tabs: {
      schedule: tr('Grafik'),
      groups: tr('Grupy'),
      teachers: tr('Nauczyciele'),
      students: tr('Uczniowie'),
      finances: tr('Finanse')
    }
  },
  worship: {
    label: tr('Grupa Uwielbienia'),
    tabs: {
      schedule: tr('Grafik'),
      songs: tr('Baza Pieśni'),
      members: tr('Członkowie'),
      finances: tr('Finanse')
    }
  },
  atmosfera: {
    label: tr('Atmosfera Team'),
    tabs: {
      schedule: tr('Grafik'),
      members: tr('Członkowie'),
      finances: tr('Finanse')
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
    toast.error(tr('Uprawnienia zaktualizowane. Odśwież stronę, aby zmiany weszły w życie.'));
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
              <DataTable>
                <THead>
                  <tr>
                    <TH>{tr('Zakładka')}</TH>
                    <TH align="center">{tr('Wszyscy')}</TH>
                    {roles.map(role => (
                      <TH key={role.key} align="center">
                        {role.label}
                      </TH>
                    ))}
                  </tr>
                </THead>
                <tbody>
                  {Object.entries(moduleData.tabs).map(([tabKey, tabLabel]) => {
                    const allAccess = permissions[moduleKey]?.[tabKey] === null;

                    return (
                      <TR key={tabKey}>
                        <TD className="font-medium text-gray-800 dark:text-gray-200">
                          {tabLabel}
                          <div className="text-xs text-gray-400 font-mono">{tabKey}</div>
                        </TD>
                        <TD align="center">
                          <button
                            onClick={() => setAllAccess(moduleKey, tabKey)}
                            className={`w-6 h-6 rounded flex items-center justify-center mx-auto transition ${
                              allAccess
                                ? 'bg-green-500 text-white'
                                : 'bg-gray-200 dark:bg-gray-600 text-gray-400'
                            }`}
                          >
                            {allAccess && <Check size={14} />}
                          </button>
                        </TD>
                        {roles.map(role => {
                          const hasRoleAccess = hasAccess(moduleKey, tabKey, role.key);

                          return (
                            <TD key={role.key} align="center">
                              <button
                                onClick={() => toggleRoleAccess(moduleKey, tabKey, role.key)}
                                disabled={allAccess}
                                className={`w-6 h-6 rounded flex items-center justify-center mx-auto transition ${
                                  allAccess
                                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-300 cursor-not-allowed'
                                    : hasRoleAccess
                                    ? 'bg-accent-primary-light text-white'
                                    : 'bg-gray-200 dark:bg-gray-600 text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-500'
                                }`}
                              >
                                {hasRoleAccess && !allAccess && <Check size={14} />}
                              </button>
                            </TD>
                          );
                        })}
                      </TR>
                    );
                  })}
                </tbody>
              </DataTable>
            </div>
          )}
        </div>
      ))}

      <div className="flex justify-end gap-3 mt-6">
        <button
          onClick={() => setPermissions(getInitialPermissions())}
          className="px-6 py-3 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
        >
          {tr('Przywróć domyślne')}
        </button>
        <button
          onClick={savePermissions}
          className="px-6 py-3 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-xl hover:shadow-lg transition font-bold"
        >
          {tr('Zapisz uprawnienia')}
        </button>
      </div>

      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
        <p className="text-sm text-blue-800 dark:text-blue-300">
          <strong>{tr('Instrukcja:')}</strong>{' '}
          {tr('Zaznacz "Wszyscy", aby dać dostęp wszystkim użytkownikom do danej zakładki. W przeciwnym razie zaznacz konkretne role, które mają mieć dostęp. Niezaznaczone role nie będą widzieć zakładki.')}
        </p>
      </div>
    </div>
  );
}
