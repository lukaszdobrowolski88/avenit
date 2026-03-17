import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import {
  List, Plus, Trash2, X, Settings, Grid, Users, Shield, BookOpen,
  CheckCircle, AlertCircle, Upload, Eye,
  Image as ImageIcon, Edit3, ToggleLeft, ToggleRight, UserX, UserCheck, Check, ChevronDown, ChevronUp, Layers
} from 'lucide-react';
import CustomSelect from '../../components/CustomSelect';
import ModuleManager from './components/ModuleManager';
import ResponsiveTabs from '../../components/ResponsiveTabs';

// --- MODULE TABS DEFINITION ---
const MODULE_TABS = {
  members: {
    label: 'Członkowie',
    resourceKey: 'module:members',
    tabs: {}
  },
  homegroups: {
    label: 'Grupy Domowe',
    resourceKey: 'module:homegroups',
    tabs: {
      groups: 'Grupy',
      leaders: 'Liderzy',
      members: 'Członkowie',
      finances: 'Finanse'
    }
  },
  media: {
    label: 'Media Team',
    resourceKey: 'module:media',
    tabs: {
      schedule: 'Grafik',
      tasks: 'Zadania',
      members: 'Członkowie',
      finances: 'Finanse'
    }
  },
  kids: {
    label: 'Małe SchWro',
    resourceKey: 'module:kids',
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
    resourceKey: 'module:worship',
    tabs: {
      schedule: 'Grafik',
      songs: 'Baza Pieśni',
      members: 'Członkowie',
      finances: 'Finanse',
      wall: 'Tablica'
    }
  },
  atmosfera: {
    label: 'Atmosfera Team',
    resourceKey: 'module:atmosfera',
    tabs: {
      schedule: 'Grafik',
      members: 'Członkowie',
      finances: 'Finanse'
    }
  },
  finance: {
    label: 'Finanse',
    resourceKey: 'module:finance',
    tabs: {}
  },
  teaching: {
    label: 'Nauczanie',
    resourceKey: 'module:teaching',
    tabs: {
      wall: 'Tablica',
      schedule: 'Grafik',
      series: 'Serie',
      speakers: 'Mówcy'
    }
  },
  prayer: {
    label: 'Centrum Modlitwy',
    resourceKey: 'module:prayer',
    tabs: {
      wall: 'Ściana Modlitwy',
      leaders_requests: 'Prośby dla Liderów'
    }
  },
  komunikator: {
    label: 'Komunikator',
    resourceKey: 'module:komunikator',
    tabs: {
      direct: 'Rozmowy prywatne',
      groups: 'Grupy',
      ministry: 'Kanały służb'
    }
  },
  mlodziezowka: {
    label: 'Młodzieżówka',
    resourceKey: 'module:mlodziezowka',
    tabs: {
      events: 'Wydarzenia',
      tasks: 'Zadania',
      leaders: 'Liderzy',
      members: 'Członkowie',
      finances: 'Finanse'
    }
  },
  settings: {
    label: 'Ustawienia',
    resourceKey: 'module:settings',
    tabs: {}
  }
};

// --- UI HELPERS ---

const SectionHeader = ({ title, description }) => (
  <div className="mb-6 border-b border-gray-100 dark:border-gray-700 pb-4">
    <h2 className="text-2xl font-bold text-gray-800 dark:text-white">{title}</h2>
    <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
  </div>
);

const DictionaryEditor = ({ category, title, items, onAdd, onDelete }) => {
  const [newItem, setNewItem] = useState('');
  return (
    <div className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm border border-gray-200 dark:border-gray-700 rounded-2xl p-6 mb-6 shadow-sm transition-colors">
      <h3 className="font-bold text-lg text-gray-700 dark:text-gray-200 mb-4 flex items-center gap-2"><List size={20} className="text-pink-500"/> {title}</h3>
      <div className="flex gap-2 mb-4">
        <input 
          className="flex-1 p-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white text-sm outline-none focus:border-pink-500 transition" 
          placeholder="Nowa opcja..." 
          value={newItem} 
          onChange={e => setNewItem(e.target.value)} 
        />
        <button onClick={() => { if(newItem) { onAdd(category, newItem); setNewItem(''); } }} className="bg-pink-600 text-white px-4 rounded-xl font-bold hover:bg-pink-700"><Plus size={18}/></button>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.filter(i => i.category === category).map(item => (
          <div key={item.id} className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 group hover:border-pink-300 transition">
            <span className="font-medium text-gray-700 dark:text-gray-200">{item.label}</span>
            <button onClick={() => onDelete(item.id)} className="text-gray-400 hover:text-red-500 transition"><Trash2 size={14}/></button>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- GŁÓWNY KOMPONENT ---

export default function GlobalSettings() {
  const [activeTab, setActiveTab] = useState('general');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);

  const [appSettings, setAppSettings] = useState([]);
  const [dictionaries, setDictionaries] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [users, setUsers] = useState([]);

  const [userForm, setUserForm] = useState({ id: null, full_name: '', email: '', password: '', role: '', is_active: true });
  const [showUserModal, setShowUserModal] = useState(false);
  const [isCreatingAuthUser, setIsCreatingAuthUser] = useState(false);
  const [selectedTeams, setSelectedTeams] = useState([]);
  const [require2FA, setRequire2FA] = useState(false);

  // Definicja służb/zespołów z ich tabelami w bazie
  const teamDefinitions = [
    { key: 'worship', label: 'Grupa Uwielbienia', table: 'worship_team' },
    { key: 'media', label: 'Media Team', table: 'media_team' },
    { key: 'atmosfera', label: 'Atmosfera Team', table: 'atmosfera_members' },
    { key: 'kids', label: 'Małe SchWro', table: 'kids_teachers' },
    { key: 'homegroups', label: 'Grupy Domowe (Lider)', table: 'home_group_leaders' }
  ];

  const [expandedModule, setExpandedModule] = useState(null);
  const [tabPermissions, setTabPermissions] = useState(null);
  const [userPermissions, setUserPermissions] = useState({});
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [expandedUserModule, setExpandedUserModule] = useState(null);

  // Dynamiczne moduły i zakładki z bazy danych
  const [dbModules, setDbModules] = useState([]);
  const [dbTabs, setDbTabs] = useState({});

  const definedRoles = [
    { key: 'superadmin', label: 'Super Administrator' },
    { key: 'rada_starszych', label: 'Rada Starszych' },
    { key: 'koordynator', label: 'Koordynator' },
    { key: 'lider', label: 'Lider Służby' },
    { key: 'czlonek', label: 'Członek' }
  ];


  useEffect(() => {
    fetchData();
    fetchDbModules();
    loadTabPermissions();
    loadUserPermissions();
  }, []);

  // Pobierz moduły i zakładki z bazy danych
  const fetchDbModules = async () => {
    try {
      // Pobierz moduły
      const { data: modulesData, error: modulesError } = await supabase
        .from('app_modules')
        .select('*')
        .order('display_order', { ascending: true });

      if (modulesError) {
        console.log('Tabela app_modules nie istnieje jeszcze');
        return;
      }

      setDbModules(modulesData || []);

      // Pobierz zakładki
      const { data: tabsData, error: tabsError } = await supabase
        .from('app_module_tabs')
        .select('*')
        .order('display_order', { ascending: true });

      if (!tabsError && tabsData) {
        // Grupuj zakładki po module_id
        const grouped = tabsData.reduce((acc, tab) => {
          const moduleKey = modulesData.find(m => m.id === tab.module_id)?.key;
          if (moduleKey) {
            if (!acc[moduleKey]) acc[moduleKey] = {};
            acc[moduleKey][tab.key] = tab.label;
          }
          return acc;
        }, {});
        setDbTabs(grouped);
      }
    } catch (err) {
      console.log('Błąd pobierania modułów z bazy:', err);
    }
  };

  // Połącz statyczne MODULE_TABS z dynamicznymi modułami z bazy
  const getDynamicModuleTabs = () => {
    // Jeśli nie ma danych z bazy, użyj statycznych
    if (dbModules.length === 0) return MODULE_TABS;

    const result = {};

    // Najpierw dodaj moduły z bazy
    dbModules.forEach(mod => {
      // Pomijamy moduły core (dashboard, programs, calendar)
      if (['dashboard', 'programs', 'calendar'].includes(mod.key)) return;

      result[mod.key] = {
        label: mod.label,
        resourceKey: mod.resource_key,
        tabs: dbTabs[mod.key] || MODULE_TABS[mod.key]?.tabs || {}
      };
    });

    return result;
  };

  const dynamicModuleTabs = getDynamicModuleTabs();

  const loadTabPermissions = () => {
    const stored = localStorage.getItem('tabPermissions');
    if (stored) {
      setTabPermissions(JSON.parse(stored));
    } else {
      // Default tab permissions
      const defaultPerms = {
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
        },
        prayer: {
          wall: null, // Ściana modlitwy dostępna dla wszystkich
          leaders_requests: ['superadmin', 'rada_starszych', 'koordynator', 'lider'] // Prośby dla liderów tylko dla liderów
        },
        komunikator: {
          direct: null, // Rozmowy prywatne dla wszystkich
          groups: null, // Grupy dla wszystkich
          ministry: null // Kanały służb dla wszystkich
        },
        mlodziezowka: {
          events: null, // Wydarzenia dla wszystkich
          tasks: null, // Zadania dla wszystkich
          leaders: ['superadmin', 'rada_starszych', 'koordynator', 'lider'], // Liderzy tylko dla kadry
          members: ['superadmin', 'rada_starszych', 'koordynator', 'lider'], // Członkowie tylko dla kadry
          finances: ['superadmin', 'rada_starszych', 'koordynator'] // Finanse dla koordynatorów i wyżej
        }
      };
      setTabPermissions(defaultPerms);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    const { data: s } = await supabase.from('app_settings').select('*');
    const { data: d } = await supabase.from('app_dictionaries').select('*');
    const { data: p } = await supabase.from('app_permissions').select('*');
    const { data: u, error: usersError } = await supabase.from('app_users').select('*').order('full_name');

    if (usersError) {
      console.error('Błąd pobierania użytkowników:', usersError);
    }

    if (s) setAppSettings(s);
    if (d) setDictionaries(d);
    if (p) setPermissions(p);
    if (u) setUsers(u);

    console.log('Pobrani użytkownicy:', u);

    // Sprawdź czy istnieje superadmin
    await ensureSuperAdmin();

    setLoading(false);
  };

  const ensureSuperAdmin = async () => {
    const superAdminEmail = 'lukasz@schwro.pl';
    const { data: existing } = await supabase
      .from('app_users')
      .select('*')
      .eq('email', superAdminEmail)
      .single();

    if (!existing) {
      // Utwórz superadmina w tabeli app_users
      await supabase.from('app_users').insert([{
        email: superAdminEmail,
        full_name: 'Łukasz Dobrowolski',
        role: 'superadmin',
        is_active: true
      }]);

      console.log('Utworzono superadmina');
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `org-logo-${Date.now()}.${fileExt}`;
      await supabase.storage.from('public-assets').upload(fileName, file);
      const { data } = supabase.storage.from('public-assets').getPublicUrl(fileName);
      
      await supabase.from('app_settings').upsert({ key: 'org_logo_url', value: data.publicUrl }, { onConflict: 'key' });
      fetchData();
      window.location.reload(); 
    } catch (err) { alert('Błąd uploadu'); }
  };

  const toggleModule = async (key, currentValue) => {
    const newValue = currentValue === 'true' ? 'false' : 'true';
    await supabase.from('app_settings').update({ value: newValue }).eq('key', key);
    setAppSettings(prev => prev.map(s => s.key === key ? { ...s, value: newValue } : s));
    setTimeout(() => window.location.reload(), 500); 
  };

  const saveUser = async () => {
    if (!userForm.email || !userForm.role) return alert('Wymagany Email i Rola');

    setIsCreatingAuthUser(true);

    try {
      if (userForm.id) {
        // Edycja istniejącego użytkownika
        const payload = {
          full_name: userForm.full_name || '',
          email: userForm.email,
          role: userForm.role,
          is_active: userForm.is_active
        };
        await supabase.from('app_users').update(payload).eq('id', userForm.id);
        setMessage({ type: 'success', text: 'Zaktualizowano użytkownika' });
      } else {
        // Tworzenie nowego użytkownika
        // 1. Zapisz aktualną sesję admina przed utworzeniem nowego użytkownika
        const { data: { session: currentSession } } = await supabase.auth.getSession();

        // 2. Utwórz konto w Supabase Auth z losowym hasłem
        // UWAGA: W Supabase wyłącz "Confirm email" (Authentication → Providers → Email)
        // żeby signUp() nie wysyłał emaila potwierdzającego
        const tempPassword = crypto.randomUUID() + 'Aa1!';
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: userForm.email,
          password: tempPassword,
          options: {
            data: {
              full_name: userForm.full_name
            }
          }
        });

        if (authError) {
          throw new Error(`Błąd tworzenia konta: ${authError.message}`);
        }

        // 3. Przywróć sesję admina (signUp automatycznie loguje nowego użytkownika)
        if (currentSession) {
          await supabase.auth.setSession({
            access_token: currentSession.access_token,
            refresh_token: currentSession.refresh_token
          });
        }

        // 4. Dodaj rekord do app_users
        if (authData?.user?.id) {
          const { error: insertError } = await supabase
            .from('app_users')
            .insert({
              email: userForm.email,
              full_name: userForm.full_name || '',
              role: userForm.role,
              is_active: userForm.is_active,
              auth_user_id: authData.user.id,
              totp_required: require2FA
            });

          if (insertError) {
            console.error('Błąd dodawania do app_users:', insertError);
          }
        }

        // 5. Wyślij email z linkiem do ustawienia hasła (przez Resend SMTP skonfigurowany w Supabase)
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(userForm.email, {
          redirectTo: `${window.location.origin}/reset-password`
        });

        if (resetError) {
          console.error('Błąd wysyłania emaila:', resetError);
          setMessage({ type: 'warning', text: `Utworzono użytkownika, ale nie udało się wysłać emaila: ${resetError.message}` });
        } else {
          setMessage({ type: 'success', text: `Utworzono użytkownika ${userForm.email}. Email z linkiem do ustawienia hasła został wysłany.` });
        }

        // 6. Dodaj użytkownika do wybranych zespołów/służb (lub zaktualizuj istniejącego)
        if (selectedTeams.length > 0) {
          const fullName = userForm.full_name || userForm.email;

          for (const teamKey of selectedTeams) {
            const teamDef = teamDefinitions.find(t => t.key === teamKey);
            if (teamDef) {
              try {
                // Sprawdź czy członkowie o tym imieniu już istnieją w zespole
                const { data: existingMembers } = await supabase
                  .from(teamDef.table)
                  .select('id, email, phone, status')
                  .eq('full_name', fullName);

                if (existingMembers && existingMembers.length > 0) {
                  // Znajdź główny rekord (ten z emailem lub pierwszy)
                  const primaryMember = existingMembers.find(m => m.email) || existingMembers[0];
                  const duplicates = existingMembers.filter(m => m.id !== primaryMember.id);

                  // Scal dane z duplikatów do głównego rekordu
                  const updateData = {};
                  if (!primaryMember.email && userForm.email) {
                    updateData.email = userForm.email;
                  }
                  if (!primaryMember.status) {
                    updateData.status = 'Aktywny';
                  }

                  // Zbierz dane z duplikatów
                  for (const dup of duplicates) {
                    if (!primaryMember.email && dup.email) updateData.email = dup.email;
                    if (!primaryMember.phone && dup.phone) updateData.phone = dup.phone;
                    if (!primaryMember.status && dup.status) updateData.status = dup.status;
                  }

                  // Zaktualizuj główny rekord
                  if (Object.keys(updateData).length > 0) {
                    await supabase
                      .from(teamDef.table)
                      .update(updateData)
                      .eq('id', primaryMember.id);
                  }

                  // Przenieś przypisania służb z duplikatów na główny rekord i usuń duplikaty
                  for (const dup of duplicates) {
                    // Przenieś przypisania z team_member_roles
                    await supabase
                      .from('team_member_roles')
                      .update({ member_id: String(primaryMember.id) })
                      .eq('member_id', String(dup.id))
                      .eq('member_table', teamDef.table);

                    // Usuń duplikat
                    await supabase.from(teamDef.table).delete().eq('id', dup.id);
                  }

                  console.log(`Członek ${fullName} już istnieje w ${teamDef.table} - zaktualizowano i scalono ${duplicates.length} duplikatów`);
                } else {
                  // Dodaj nowego członka
                  const memberData = {
                    full_name: fullName,
                    email: userForm.email,
                    phone: '',
                    status: 'Aktywny'
                  };
                  await supabase.from(teamDef.table).insert([memberData]);
                }
              } catch (teamErr) {
                console.error(`Błąd dodawania do ${teamDef.table}:`, teamErr);
              }
            }
          }
        }
      }

      setShowUserModal(false);
      setSelectedTeams([]);
      setRequire2FA(false);
      fetchData();
    } catch (err) {
      alert('Błąd zapisu: ' + err.message);
    } finally {
      setIsCreatingAuthUser(false);
    }
  };

  const deleteUser = async (id) => {
    const user = users.find(u => u.id === id);
    if (user?.email === 'lukasz@schwro.pl') {
      return alert('Nie można usunąć superadmina!');
    }

    if(confirm('Usunąć użytkownika? To również usunie jego konto z systemu autentykacji.')) {
      try {
        // Usuń z tabeli app_users
        await supabase.from('app_users').delete().eq('id', id);

        // TODO: Można też usunąć z Supabase Auth, ale wymaga admin API
        // const { error } = await supabase.auth.admin.deleteUser(user.auth_user_id);

        fetchData();
        setMessage({ type: 'success', text: 'Użytkownik został usunięty' });
      } catch (err) {
        alert('Błąd usuwania: ' + err.message);
      }
    }
  };
  const toggleUserStatus = async (user) => { await supabase.from('app_users').update({ is_active: !user.is_active }).eq('id', user.id); fetchData(); };

  // Funkcja do scalania zduplikowanych członków we wszystkich tabelach służb
  const mergeDuplicateMembers = async () => {
    if (!confirm('Czy na pewno chcesz scalić zduplikowanych członków? Ta operacja połączy członków o tym samym imieniu i nazwisku.')) {
      return;
    }

    setMessage({ type: 'info', text: 'Scalanie duplikatów...' });
    let totalMerged = 0;

    try {
      for (const teamDef of teamDefinitions) {
        // Pobierz wszystkich członków z tej tabeli
        const { data: allMembers } = await supabase
          .from(teamDef.table)
          .select('id, full_name, email, phone, status');

        if (!allMembers) continue;

        // Grupuj po full_name
        const grouped = {};
        for (const member of allMembers) {
          const name = member.full_name?.trim().toLowerCase();
          if (!name) continue;
          if (!grouped[name]) grouped[name] = [];
          grouped[name].push(member);
        }

        // Scal duplikaty
        for (const [name, members] of Object.entries(grouped)) {
          if (members.length <= 1) continue;

          // Znajdź główny rekord (ten z emailem lub statusem lub pierwszy)
          const primaryMember = members.find(m => m.email && m.status === 'Aktywny')
            || members.find(m => m.email)
            || members.find(m => m.status === 'Aktywny')
            || members[0];
          const duplicates = members.filter(m => m.id !== primaryMember.id);

          // Scal dane
          const updateData = {};
          for (const dup of duplicates) {
            if (!primaryMember.email && dup.email) updateData.email = dup.email;
            if (!primaryMember.phone && dup.phone) updateData.phone = dup.phone;
            if (!primaryMember.status && dup.status) updateData.status = dup.status;
          }
          if (!primaryMember.status && !updateData.status) {
            updateData.status = 'Aktywny';
          }

          if (Object.keys(updateData).length > 0) {
            await supabase.from(teamDef.table).update(updateData).eq('id', primaryMember.id);
          }

          // Przenieś przypisania służb i usuń duplikaty
          for (const dup of duplicates) {
            // Przenieś przypisania z team_member_roles
            await supabase
              .from('team_member_roles')
              .update({ member_id: String(primaryMember.id) })
              .eq('member_id', String(dup.id))
              .eq('member_table', teamDef.table);

            // Usuń duplikat
            await supabase.from(teamDef.table).delete().eq('id', dup.id);
            totalMerged++;
          }
        }
      }

      setMessage({
        type: 'success',
        text: totalMerged > 0
          ? `Scalono ${totalMerged} zduplikowanych członków!`
          : 'Nie znaleziono duplikatów do scalenia.'
      });
    } catch (err) {
      console.error('Błąd scalania duplikatów:', err);
      setMessage({ type: 'error', text: 'Błąd scalania: ' + err.message });
    }
  };

  const addDict = async (category, label) => { const { data } = await supabase.from('app_dictionaries').insert([{ category, label, value: label }]).select(); if (data) setDictionaries([...dictionaries, data[0]]); };
  const delDict = async (id) => { if(confirm('Usunąć?')) { await supabase.from('app_dictionaries').delete().eq('id', id); fetchData(); } };

  const togglePermission = async (role, resource, field, value) => {
    const existing = permissions.find(p => p.role === role && p.resource === resource);
    const payload = { role, resource, [field]: value, [field === 'can_read' ? 'can_write' : 'can_read']: existing ? existing[field === 'can_read' ? 'can_write' : 'can_read'] : false };
    await supabase.from('app_permissions').upsert(payload, { onConflict: 'role, resource' }); fetchData();
  };

  // Tab permissions functions
  const toggleTabRoleAccess = (module, tab, roleKey) => {
    if (!tabPermissions) return;

    setTabPermissions(prev => {
      const currentTabPerms = prev[module]?.[tab];

      if (currentTabPerms === null) {
        // Jeśli wszyscy mają dostęp, zmień na tylko tę jedną rolę
        return {
          ...prev,
          [module]: {
            ...prev[module],
            [tab]: [roleKey]
          }
        };
      } else if (Array.isArray(currentTabPerms)) {
        if (currentTabPerms.includes(roleKey)) {
          // Odklikuj rolę
          const newRoles = currentTabPerms.filter(r => r !== roleKey);
          // Nie zmieniaj pustej tablicy na null - zostaw jako pusta tablica (nikt nie ma dostępu)
          return {
            ...prev,
            [module]: {
              ...prev[module],
              [tab]: newRoles
            }
          };
        } else {
          // Dodaj rolę
          return {
            ...prev,
            [module]: {
              ...prev[module],
              [tab]: [...currentTabPerms, roleKey]
            }
          };
        }
      }

      return prev;
    });
  };

  const setAllTabAccess = (module, tab) => {
    if (!tabPermissions) return;

    setTabPermissions(prev => {
      const currentTabPerms = prev[module]?.[tab];

      // Jeśli już jest null (wszyscy mają dostęp), zmień na pustą tablicę (nikt nie ma dostępu)
      if (currentTabPerms === null) {
        return {
          ...prev,
          [module]: {
            ...prev[module],
            [tab]: []
          }
        };
      }

      // W przeciwnym razie ustaw na null (wszyscy)
      return {
        ...prev,
        [module]: {
          ...prev[module],
          [tab]: null
        }
      };
    });
  };

  const hasTabRoleAccess = (module, tab, roleKey) => {
    if (!tabPermissions) return false;
    const tabPerms = tabPermissions[module]?.[tab];
    if (tabPerms === null) return true; // null = wszyscy mają dostęp
    if (!Array.isArray(tabPerms)) return false;
    return tabPerms.includes(roleKey); // pusta tablica = nikt nie ma dostępu
  };

  const saveTabPermissions = () => {
    localStorage.setItem('tabPermissions', JSON.stringify(tabPermissions));
    setMessage({ type: 'success', text: 'Uprawnienia zaktualizowane. Odśwież stronę, aby zobaczyć zmiany.' });
    setTimeout(() => window.location.reload(), 1500);
  };

  // User-specific permissions functions
  const loadUserPermissions = () => {
    const stored = localStorage.getItem('userPermissions');
    if (stored) {
      setUserPermissions(JSON.parse(stored));
    }
  };

  const toggleUserModuleAccess = (userId, moduleKey, field) => {
    setUserPermissions(prev => {
      const userPerms = prev[userId] || { modules: {}, tabs: {} };
      const modulePerms = userPerms.modules[moduleKey] || { can_read: false, can_write: false };

      return {
        ...prev,
        [userId]: {
          ...userPerms,
          modules: {
            ...userPerms.modules,
            [moduleKey]: {
              ...modulePerms,
              [field]: !modulePerms[field]
            }
          }
        }
      };
    });
  };

  const toggleUserTabAccess = (userId, moduleKey, tabKey) => {
    setUserPermissions(prev => {
      const userPerms = prev[userId] || { modules: {}, tabs: {} };
      const userTabs = userPerms.tabs[moduleKey] || {};

      return {
        ...prev,
        [userId]: {
          ...userPerms,
          tabs: {
            ...userPerms.tabs,
            [moduleKey]: {
              ...userTabs,
              [tabKey]: !userTabs[tabKey]
            }
          }
        }
      };
    });
  };

  const hasUserTabAccess = (userId, moduleKey, tabKey) => {
    return userPermissions[userId]?.tabs?.[moduleKey]?.[tabKey] || false;
  };

  const hasUserModuleAccess = (userId, moduleKey, field) => {
    return userPermissions[userId]?.modules?.[moduleKey]?.[field] || false;
  };

  const saveUserPermissions = () => {
    localStorage.setItem('userPermissions', JSON.stringify(userPermissions));
    setMessage({ type: 'success', text: 'Uprawnienia użytkowników zapisane. Odśwież stronę, aby zobaczyć zmiany.' });
    setTimeout(() => window.location.reload(), 1500);
  };

  const resetUserPermissionsToRole = (userId) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;

    // Usuń wszystkie indywidualne uprawnienia użytkownika
    setUserPermissions(prev => {
      const newPerms = { ...prev };
      delete newPerms[userId];
      return newPerms;
    });

    setMessage({ type: 'success', text: 'Przywrócono uprawnienia z roli użytkownika' });
  };

  const getUserEffectivePermissions = (userId, moduleKey) => {
    const user = users.find(u => u.id === userId);
    if (!user) return { can_read: false, can_write: false };

    // Sprawdź czy użytkownik ma indywidualne uprawnienia
    const userPerms = userPermissions[userId]?.modules?.[moduleKey];
    if (userPerms) {
      return userPerms;
    }

    // W przeciwnym razie zwróć uprawnienia z roli
    const moduleData = Object.values(dynamicModuleTabs).find(m => m.resourceKey === `module:${moduleKey}` || Object.keys(dynamicModuleTabs).includes(moduleKey));
    if (!moduleData) return { can_read: false, can_write: false };

    const rolePerm = permissions.find(p => p.role === user.role && p.resource === moduleData.resourceKey);
    return {
      can_read: rolePerm?.can_read || false,
      can_write: rolePerm?.can_write || false
    };
  };

  const getUserEffectiveTabAccess = (userId, moduleKey, tabKey) => {
    const user = users.find(u => u.id === userId);
    if (!user) return false;

    // Sprawdź czy użytkownik ma indywidualne uprawnienia dla tej zakładki
    const userTabPerm = userPermissions[userId]?.tabs?.[moduleKey]?.[tabKey];
    if (userTabPerm !== undefined) {
      return userTabPerm;
    }

    // W przeciwnym razie zwróć uprawnienia z roli
    const tabPerms = tabPermissions?.[moduleKey]?.[tabKey];
    if (tabPerms === null) return true; // wszyscy mają dostęp
    if (!Array.isArray(tabPerms)) return false;
    return tabPerms.includes(user.role);
  };

  const logoUrl = appSettings.find(s => s.key === 'org_logo_url')?.value;
  const modulesSettings = appSettings.filter(s => s.key.startsWith('module_'));

  return (
    <div className="flex flex-col h-full space-y-6">
      {/* NAGŁÓWEK + MENU */}
      <div className="flex justify-between items-end flex-wrap gap-4">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-700 to-gray-900 dark:from-gray-100 dark:to-gray-300 bg-clip-text text-transparent">Konfiguracja</h1>
        </div>
        <ResponsiveTabs
          tabs={[
            { id: 'general', label: 'Organizacja', icon: Settings },
            { id: 'modules', label: 'Moduły', icon: Grid },
            { id: 'module_manager', label: 'Zarządzanie', icon: Layers },
            { id: 'users', label: 'Użytkownicy', icon: Users },
            { id: 'permissions', label: 'Uprawnienia', icon: Shield },
            { id: 'dictionaries', label: 'Słowniki', icon: BookOpen },
          ]}
          activeTab={activeTab}
          onChange={setActiveTab}
        />
      </div>

      {message && <div className={`p-4 rounded-xl flex items-center gap-2 cursor-pointer ${message.type === 'success' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-800'}`} onClick={() => setMessage(null)}>{message.type === 'success' ? <CheckCircle size={20}/> : <AlertCircle size={20}/>} {message.text}</div>}

      <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-gray-700 p-8 flex-1 overflow-y-auto transition-colors">
        
        {/* --- TAB: ORGANIZACJA --- */}
        {activeTab === 'general' && (
          <div className="max-w-2xl">
            <SectionHeader title="Identyfikacja" description="Logo i nazwa wyświetlana w aplikacji." />
            <div className="flex gap-8 items-start">
              <div className="w-48 text-center">
                <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-2xl aspect-square flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-700 relative overflow-hidden group hover:border-pink-400 transition mb-2">
                  {logoUrl ? <img src={logoUrl} alt="Logo" className="w-full h-full object-contain p-4"/> : <ImageIcon size={40} className="text-gray-300 dark:text-gray-500"/>}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                    <button onClick={() => document.getElementById('logo-u').click()} className="bg-white text-gray-900 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-lg"><Upload size={16}/> Zmień</button>
                  </div>
                  <input id="logo-u" type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                </div>
                <span className="text-xs text-gray-400">Kliknij by zmienić</span>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Nazwa Organizacji</label>
                <input className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:border-pink-500 outline-none transition" defaultValue={appSettings.find(s=>s.key==='org_name')?.value} onBlur={async (e) => { await supabase.from('app_settings').update({value: e.target.value}).eq('key', 'org_name'); setMessage({type:'success', text:'Zapisano'}); }} />
              </div>
            </div>
          </div>
        )}

        {/* --- TAB: MODUŁY --- */}
        {activeTab === 'modules' && (
          <div className="max-w-3xl">
            <SectionHeader title="Włączanie Modułów" description="Włączaj lub ukrywaj funkcje systemu." />
            <div className="space-y-3">
              {/* Moduły z tabeli app_modules (nowy system) */}
              {dbModules
                .filter(mod => !['dashboard', 'programs', 'calendar'].includes(mod.key)) // Pomijamy moduły core
                .map(mod => (
                <div key={mod.id} className="flex items-center justify-between p-4 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl hover:shadow-sm transition">
                  <div>
                    <div className="font-bold text-gray-800 dark:text-white">{mod.label}</div>
                    <div className="text-xs text-gray-400 font-mono">{mod.resource_key}</div>
                  </div>
                  <button
                    onClick={async () => {
                      const newValue = !mod.is_enabled;
                      await supabase.from('app_modules').update({ is_enabled: newValue }).eq('id', mod.id);
                      setDbModules(prev => prev.map(m => m.id === mod.id ? { ...m, is_enabled: newValue } : m));
                      setMessage({ type: 'success', text: `Moduł ${mod.label} ${newValue ? 'włączony' : 'wyłączony'}` });
                    }}
                    className={`px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition ${mod.is_enabled ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-600 dark:text-gray-400'}`}
                  >
                    {mod.is_enabled ? <ToggleRight size={24}/> : <ToggleLeft size={24}/>}
                    {mod.is_enabled ? 'Włączony' : 'Wyłączony'}
                  </button>
                </div>
              ))}

              {/* Fallback: stary system z app_settings jeśli brak modułów w bazie */}
              {dbModules.length === 0 && modulesSettings.map(mod => (
                <div key={mod.key} className="flex items-center justify-between p-4 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl hover:shadow-sm transition">
                  <div>
                    <div className="font-bold text-gray-800 dark:text-white">{mod.description}</div>
                    <div className="text-xs text-gray-400 font-mono">{mod.key}</div>
                  </div>
                  <button onClick={() => toggleModule(mod.key, mod.value)} className={`px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition ${mod.value === 'true' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-600 dark:text-gray-400'}`}>
                    {mod.value === 'true' ? <ToggleRight size={24}/> : <ToggleLeft size={24}/>}
                    {mod.value === 'true' ? 'Włączony' : 'Wyłączony'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- TAB: ZARZĄDZANIE MODUŁAMI --- */}
        {activeTab === 'module_manager' && (
          <div>
            <ModuleManager />
          </div>
        )}

        {/* --- TAB: UŻYTKOWNICY --- */}
        {activeTab === 'users' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <SectionHeader title="Użytkownicy Systemu" description="Zarządzanie dostępem, rolami i statusem kont." />
              <div className="flex items-center gap-2">
                <button onClick={mergeDuplicateMembers} className="bg-orange-500 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:shadow-lg transition text-sm" title="Scal zduplikowanych członków w służbach"><Layers size={16}/> Scal duplikaty</button>
                <button onClick={() => { setUserForm({ id: null, full_name: '', email: '', role: '', is_active: true }); setSelectedTeams([]); setShowUserModal(true); }} className="bg-pink-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:shadow-lg transition"><Plus size={18}/> Dodaj Użytkownika</button>
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
              <table className="w-full text-sm text-left bg-white dark:bg-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300"><tr><th className="p-4">Użytkownik</th><th className="p-4">Email</th><th className="p-4">Rola</th><th className="p-4">Status</th><th className="p-4 text-right">Akcje</th></tr></thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-600">
                  {users.map(user => {
                    const roleLabel = definedRoles.find(r => r.key === user.role)?.label || user.role;
                    const isSuperAdmin = user.email === 'lukasz@schwro.pl';
                    return (
                      <tr key={user.id} className={`hover:bg-pink-50/30 dark:hover:bg-gray-600 transition text-gray-800 dark:text-gray-200 ${isSuperAdmin ? 'bg-yellow-50/30 dark:bg-yellow-900/10' : ''}`}>
                        <td className="p-4 font-medium flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold uppercase ${isSuperAdmin ? 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300' : 'bg-pink-100 dark:bg-pink-900/50 text-pink-600 dark:text-pink-300'}`}>
                            {(user.full_name || user.email || '?').charAt(0)}
                          </div>
                          {user.full_name || 'Brak imienia'}
                          {isSuperAdmin && <span className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 px-2 py-0.5 rounded font-bold">SUPERADMIN</span>}
                        </td>
                        <td className="p-4 text-gray-600 dark:text-gray-400">{user.email}</td>
                        <td className="p-4"><span className={`px-2 py-1 rounded-lg text-xs font-bold ${isSuperAdmin ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300' : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'}`}>{roleLabel}</span></td>
                        <td className="p-4">
                          <button onClick={() => toggleUserStatus(user)} disabled={isSuperAdmin} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold border ${user.is_active ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800'} ${isSuperAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}>
                            {user.is_active ? <UserCheck size={12}/> : <UserX size={12}/>} {user.is_active ? 'Aktywny' : 'Zablokowany'}
                          </button>
                        </td>
                        <td className="p-4 text-right flex justify-end gap-2">
                          <button onClick={() => { setUserForm({...user, password: ''}); setShowUserModal(true); }} className="text-pink-600 dark:text-pink-400 hover:bg-pink-50 dark:hover:bg-gray-600 p-2 rounded-lg"><Edit3 size={16}/></button>
                          <button onClick={() => deleteUser(user.id)} disabled={isSuperAdmin} className={`text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-gray-600 p-2 rounded-lg ${isSuperAdmin ? 'opacity-30 cursor-not-allowed' : ''}`}><Trash2 size={16}/></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- TAB: UPRAWNIENIA (UNIFIED) --- */}
        {activeTab === 'permissions' && (
          <div>
            <SectionHeader title="Uprawnienia" description="Zarządzaj dostępem do modułów i zakładek według ról użytkowników oraz indywidualnych użytkowników." />

            {/* PRZEŁĄCZNIK ROL / UŻYTKOWNICY */}
            <div className="flex gap-2 mb-6 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
              <button
                onClick={() => setSelectedUserId(null)}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition ${!selectedUserId ? 'bg-white dark:bg-gray-700 text-pink-600 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
              >
                Uprawnienia Ról
              </button>
              <button
                onClick={() => setSelectedUserId(users[0]?.id || null)}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition ${selectedUserId ? 'bg-white dark:bg-gray-700 text-pink-600 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
              >
                Uprawnienia Użytkowników
              </button>
            </div>

            {/* SEKCJA UPRAWNIEŃ UŻYTKOWNIKÓW */}
            {selectedUserId && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex-1 max-w-md">
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Wybierz użytkownika</label>
                    <CustomSelect
                      options={users.map(u => ({
                        value: u.id,
                        label: `${u.full_name || u.email} (${definedRoles.find(r => r.key === u.role)?.label || u.role})`
                      }))}
                      value={selectedUserId}
                      onChange={(val) => setSelectedUserId(val)}
                      placeholder="Wybierz użytkownika..."
                    />
                  </div>
                  <button
                    onClick={() => resetUserPermissionsToRole(selectedUserId)}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition text-sm font-bold"
                  >
                    Przywróć z roli
                  </button>
                </div>
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl mb-4">
                  <p className="text-sm text-blue-800 dark:text-blue-300">
                    <strong>Uwaga:</strong> Domyślnie użytkownik dziedziczy uprawnienia ze swojej roli. Możesz nadpisać je indywidualnymi uprawnieniami poniżej.
                    Użyj przycisku "Przywróć z roli" aby zresetować do ustawień domyślnych.
                  </p>
                </div>
              </div>
            )}

            {/* MODUŁY Z ROZWIJANYMI ZAKŁADKAMI */}
            <div className="space-y-4">
              {Object.entries(dynamicModuleTabs).map(([moduleKey, moduleData]) => {
                const isExpanded = selectedUserId ? (expandedUserModule === moduleKey) : (expandedModule === moduleKey);

                return (
                  <div key={moduleKey} className="bg-white dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 overflow-hidden shadow-sm">

                    {/* NAGŁÓWEK MODUŁU Z UPRAWNIENIAMI R/W */}
                    <div className="border-b border-gray-200 dark:border-gray-600">
                      <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800">
                        <div className="flex items-center gap-3 flex-1">
                          <button
                            onClick={() => selectedUserId ? setExpandedUserModule(isExpanded ? null : moduleKey) : setExpandedModule(isExpanded ? null : moduleKey)}
                            className="text-gray-400 hover:text-pink-600 dark:hover:text-pink-400 transition"
                          >
                            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                          </button>
                          <div>
                            <h3 className="font-bold text-lg text-gray-800 dark:text-white">{moduleData.label}</h3>
                            <p className="text-xs text-gray-400 font-mono">{moduleData.resourceKey}</p>
                          </div>
                        </div>

                        {/* UPRAWNIENIA READ/WRITE DLA MODUŁU */}
                        {!selectedUserId ? (
                          <div className="flex gap-6">
                            {definedRoles.map(role => {
                              const perm = permissions.find(p => p.role === role.key && p.resource === moduleData.resourceKey) || { can_read: false, can_write: false };
                              return (
                                <div key={role.key} className="text-center">
                                  <div className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">{role.label}</div>
                                  <div className="flex gap-3">
                                    <label className="flex flex-col items-center gap-1 cursor-pointer group">
                                      <Eye size={12} className="text-gray-400 group-hover:text-pink-500" />
                                      <input
                                        type="checkbox"
                                        className="w-4 h-4 accent-pink-600 cursor-pointer"
                                        checked={perm.can_read}
                                        onChange={() => togglePermission(role.key, moduleData.resourceKey, 'can_read', !perm.can_read)}
                                      />
                                    </label>
                                    <label className="flex flex-col items-center gap-1 cursor-pointer group">
                                      <Edit3 size={12} className="text-gray-400 group-hover:text-red-500" />
                                      <input
                                        type="checkbox"
                                        className="w-4 h-4 accent-red-500 cursor-pointer"
                                        checked={perm.can_write}
                                        onChange={() => togglePermission(role.key, moduleData.resourceKey, 'can_write', !perm.can_write)}
                                      />
                                    </label>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="flex gap-4">
                            <label className="flex flex-col items-center gap-1 cursor-pointer group">
                              <span className="text-xs font-bold text-gray-500 dark:text-gray-400">Odczyt</span>
                              <input
                                type="checkbox"
                                className="w-5 h-5 accent-pink-600 cursor-pointer"
                                checked={hasUserModuleAccess(selectedUserId, moduleKey, 'can_read')}
                                onChange={() => toggleUserModuleAccess(selectedUserId, moduleKey, 'can_read')}
                              />
                            </label>
                            <label className="flex flex-col items-center gap-1 cursor-pointer group">
                              <span className="text-xs font-bold text-gray-500 dark:text-gray-400">Zapis</span>
                              <input
                                type="checkbox"
                                className="w-5 h-5 accent-red-500 cursor-pointer"
                                checked={hasUserModuleAccess(selectedUserId, moduleKey, 'can_write')}
                                onChange={() => toggleUserModuleAccess(selectedUserId, moduleKey, 'can_write')}
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ROZWINIĘTE ZAKŁADKI */}
                    {isExpanded && (
                      <div className="p-6 bg-white dark:bg-gray-700">
                        <h4 className="text-sm font-bold text-gray-600 dark:text-gray-300 mb-4 uppercase tracking-wide">
                          {selectedUserId ? 'Dostęp do zakładek' : 'Widoczność zakładek'}
                        </h4>

                        {!selectedUserId ? (
                          // WIDOK DLA RÓL
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-gray-200 dark:border-gray-600">
                                  <th className="text-left py-3 px-4 font-bold text-gray-600 dark:text-gray-300">Zakładka</th>
                                  <th className="text-center py-3 px-4 font-bold text-gray-600 dark:text-gray-300">Wszyscy</th>
                                  {definedRoles.map(role => (
                                    <th key={role.key} className="text-center py-3 px-4 font-bold text-gray-600 dark:text-gray-300">
                                      {role.label}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 dark:divide-gray-600">
                                {Object.entries(moduleData.tabs).map(([tabKey, tabLabel]) => {
                                  const allAccess = tabPermissions?.[moduleKey]?.[tabKey] === null;

                                  return (
                                    <tr key={tabKey} className="hover:bg-gray-50 dark:hover:bg-gray-600/50">
                                      <td className="py-3 px-4 font-medium text-gray-800 dark:text-gray-200">
                                        {tabLabel}
                                        <div className="text-xs text-gray-400 font-mono">{tabKey}</div>
                                      </td>
                                      <td className="py-3 px-4 text-center">
                                        <button
                                          onClick={() => setAllTabAccess(moduleKey, tabKey)}
                                          className={`w-6 h-6 rounded flex items-center justify-center transition mx-auto ${
                                            allAccess
                                              ? 'bg-green-500 text-white'
                                              : 'bg-gray-200 dark:bg-gray-600 text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-500'
                                          }`}
                                        >
                                          {allAccess && <Check size={14} />}
                                        </button>
                                      </td>
                                      {definedRoles.map(role => {
                                        const hasRoleAccess = hasTabRoleAccess(moduleKey, tabKey, role.key);

                                        return (
                                          <td key={role.key} className="py-3 px-4 text-center">
                                            <button
                                              onClick={() => toggleTabRoleAccess(moduleKey, tabKey, role.key)}
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
                        ) : (
                          // WIDOK DLA UŻYTKOWNIKÓW
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {Object.entries(moduleData.tabs).map(([tabKey, tabLabel]) => {
                              const hasAccess = hasUserTabAccess(selectedUserId, moduleKey, tabKey);

                              return (
                                <label
                                  key={tabKey}
                                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
                                    hasAccess
                                      ? 'bg-pink-50 dark:bg-pink-900/20 border-pink-300 dark:border-pink-700'
                                      : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-600 hover:border-pink-200 dark:hover:border-pink-800'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    className="w-4 h-4 accent-pink-600 cursor-pointer"
                                    checked={hasAccess}
                                    onChange={() => toggleUserTabAccess(selectedUserId, moduleKey, tabKey)}
                                  />
                                  <span className={`text-sm font-medium ${hasAccess ? 'text-pink-700 dark:text-pink-300' : 'text-gray-700 dark:text-gray-300'}`}>
                                    {tabLabel}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* PRZYCISKI AKCJI */}
            <div className="flex justify-end gap-3 mt-6">
              {!selectedUserId && (
                <button
                  onClick={() => {
                    loadTabPermissions();
                    setMessage({ type: 'success', text: 'Przywrócono domyślne uprawnienia zakładek' });
                  }}
                  className="px-6 py-3 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                >
                  Przywróć domyślne zakładki
                </button>
              )}
              <button
                onClick={selectedUserId ? saveUserPermissions : saveTabPermissions}
                className="px-6 py-3 bg-gradient-to-r from-pink-600 to-orange-600 text-white rounded-xl hover:shadow-lg transition font-bold"
              >
                Zapisz wszystkie uprawnienia
              </button>
            </div>

            {!selectedUserId && (
              <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  <strong>Instrukcja:</strong> Rozwiń moduł aby zarządzać widocznością zakładek. Zaznacz "Wszyscy", aby dać dostęp wszystkim użytkownikom do danej zakładki.
                  W przeciwnym razie zaznacz konkretne role, które mają mieć dostęp.
                </p>
              </div>
            )}
          </div>
        )}

        {/* --- TAB: SŁOWNIKI --- */}
        {activeTab === 'dictionaries' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DictionaryEditor title="Statusy Członków" category="member_status" items={dictionaries} onAdd={addDict} onDelete={delDict} />
            <DictionaryEditor title="Role w Zespole" category="team_role" items={dictionaries} onAdd={addDict} onDelete={delDict} />
            <DictionaryEditor title="Typy Materiałów" category="material_type" items={dictionaries} onAdd={addDict} onDelete={delDict} />
            <DictionaryEditor title="Kategorie Pieśni" category="song_category" items={dictionaries} onAdd={addDict} onDelete={delDict} />
            <DictionaryEditor title="Kategorie Wydarzeń" category="event_category" items={dictionaries} onAdd={addDict} onDelete={delDict} />
          </div>
        )}

      </div>

      {/* MODAL DODAWANIA UŻYTKOWNIKA (DARK MODE) */}
      {showUserModal && document.body && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6 border border-white/20 dark:border-gray-700">
            <div className="flex justify-between mb-6">
              <h3 className="font-bold text-xl text-gray-800 dark:text-white">Użytkownik</h3>
              <button onClick={() => setShowUserModal(false)} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white"><X/></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase ml-1">Imię i nazwisko</label>
                <input className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white" placeholder="Jan Kowalski" value={userForm.full_name || ''} onChange={e => setUserForm({...userForm, full_name: e.target.value})} />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase ml-1">Email (Login)</label>
                <input type="email" className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white" placeholder="jan@example.com" value={userForm.email || ''} onChange={e => setUserForm({...userForm, email: e.target.value})} />
              </div>
              {!userForm.id && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                  <p className="text-sm text-blue-800 dark:text-blue-300">
                    Użytkownik otrzyma email z linkiem do ustawienia własnego hasła.
                  </p>
                </div>
              )}
              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase ml-1 mb-1 block">Rola w systemie</label>
                <CustomSelect options={definedRoles.filter(r => r.key !== 'superadmin').map(r => ({value: r.key, label: r.label}))} value={userForm.role} onChange={v => setUserForm({...userForm, role: v})} placeholder="Wybierz rolę..." />
              </div>
              {!userForm.id && (
                <div>
                  <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase ml-1 mb-2 block">Służby / Zespoły</label>
                  <div className="border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 p-3">
                    <div className="flex flex-wrap gap-2">
                      {teamDefinitions.map(team => {
                        const isSelected = selectedTeams.includes(team.key);
                        return (
                          <button
                            key={team.key}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setSelectedTeams(prev => prev.filter(k => k !== team.key));
                              } else {
                                setSelectedTeams(prev => [...prev, team.key]);
                              }
                            }}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
                              isSelected
                                ? 'bg-gradient-to-r from-pink-500 to-orange-500 text-white shadow-md'
                                : 'bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-500'
                            }`}
                          >
                            {isSelected && <Check size={14} />}
                            {team.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                      Użytkownik zostanie automatycznie dodany jako członek wybranych służb.
                    </p>
                  </div>
                </div>
              )}
              {!userForm.id && (
                <div>
                  <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase ml-1 mb-2 block">Bezpieczeństwo</label>
                  <div className="border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 p-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <div className="relative">
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={require2FA}
                          onChange={(e) => setRequire2FA(e.target.checked)}
                        />
                        <div className={`w-11 h-6 rounded-full transition ${require2FA ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                          <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${require2FA ? 'translate-x-5' : ''}`}></div>
                        </div>
                      </div>
                      <div>
                        <span className="font-medium text-gray-800 dark:text-white">Wymagaj weryfikacji dwuetapowej (2FA)</span>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          Użytkownik będzie musiał skonfigurować 2FA przy pierwszym logowaniu
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              )}
              <button onClick={saveUser} disabled={isCreatingAuthUser} className="w-full py-3 bg-pink-600 text-white rounded-xl font-bold mt-2 hover:bg-pink-700 transition disabled:opacity-50 disabled:cursor-not-allowed">
                {isCreatingAuthUser ? 'Tworzenie konta...' : 'Zapisz'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
