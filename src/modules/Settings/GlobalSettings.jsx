import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import {
  List, Plus, Trash2, Settings, Grid, Users, Shield, ShieldCheck, Building2, Upload,
  Edit3, UserX, Check, Layers, Plug, Palette, CreditCard, KeyRound, Mail, Clock, Download,
  AlertTriangle, ArrowRight,
} from 'lucide-react';
import CustomSelect from '../../components/CustomSelect';
import { useT, tr, appLocale } from '../../i18n';
import ModuleManager from './components/ModuleManager';
import PermissionsAdmin from './components/PermissionsAdmin';
import CampusManager from './components/CampusManager';
import IntegrationsTab from './components/IntegrationsTab';
import AppearanceSettings from './components/AppearanceSettings';
import SecuritySettings from './components/SecuritySettings';
import SubscriptionInfo from './components/SubscriptionInfo';
import { Toggle } from './components/SettingsUI';
import TaskDigestSettings from './components/TaskDigestSettings';
import Can from '../../components/Can';
import { resolveSettingsTab, groupDuplicateMembers, mergeFill } from './components/settingsLogic';
import { useCampus } from '../../contexts/CampusContext';
import ResponsiveTabs from '../../components/ResponsiveTabs';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import Button from '../../components/Button';
import Spinner from '../../components/Spinner';
import { DataTable, THead, TH, TR, TD, StatusPill, STATUS_COLORS } from '../../components/ui/DataTable';
import { Settings as SettingsIcon } from 'lucide-react';
import { toast } from '../../lib/toast';
import { injectCustomFont, applyFont, setBgUrl, applyBgPattern } from '../../lib/appearance';
import { confirmDialog } from '../../lib/dialog';

// Grupy nawigacji ustawień (menu po lewej). Adres zakładki: /settings?tab=<id> (UXE-10).
// Ukryte: „Regionalne” i „Powiadomienia” (ich ustawień nic nie czytało — UXE-07),
// „Zarządzanie” scalone z „Moduły” (UXE-13). Stare adresy mapuje resolveSettingsTab.
const SETTINGS_NAV = [
  { group: 'Ogólne', items: [
    { id: 'general', label: 'Organizacja', icon: Settings },
    { id: 'appearance', label: 'Wygląd', icon: Palette },
    { id: 'campuses', label: 'Kampusy', icon: Building2 },
  ]},
  { group: 'Zespół i dostęp', items: [
    { id: 'users', label: 'Użytkownicy', icon: Users },
    { id: 'permissions', label: 'Uprawnienia', icon: Shield },
    { id: 'security', label: 'Bezpieczeństwo i logowanie', icon: ShieldCheck },
  ]},
  { group: 'Moduły i integracje', items: [
    { id: 'modules', label: 'Moduły', icon: Grid },
    { id: 'dictionaries', label: 'Słowniki', icon: List },
    { id: 'integrations', label: 'Integracje', icon: Plug },
  ]},
  { group: 'Konto', items: [
    { id: 'subscription', label: 'Subskrypcja', icon: CreditCard },
  ]},
];
const SETTINGS_NAV_FLAT = SETTINGS_NAV.flatMap((g) => g.items);

// Tabele członków służb, do których można dopisać nowe konto i w których szukamy duplikatów.
// Kolumny wg produkcji: status tylko w worship_team/media_team; kids_teachers ma group_id.
// (home_group_leaders celowo pominięte — lider jest przypisany do konkretnej grupy.)
const TEAM_TABLES = [
  { key: 'worship', table: 'worship_team', hasStatus: true, fallback: 'Grupa Uwielbienia' },
  { key: 'media', table: 'media_team', hasStatus: true, fallback: 'MediaTeam' },
  { key: 'atmosfera', table: 'atmosfera_members', fallback: 'Atmosfera Team' },
  { key: 'kids', table: 'kids_teachers', hasGroup: true, fallback: 'Służba dzieci' },
];
const teamCols = (def) => `id, full_name, email, phone${def.hasStatus ? ', status' : ''}${def.hasGroup ? ', group_id' : ''}`;

// --- UI HELPERS ---

const SectionHeader = ({ title, description }) => (
  <div className="mb-6 border-b border-gray-100 dark:border-gray-700 pb-4">
    <h2 className="text-2xl font-bold text-gray-800 dark:text-white">{title}</h2>
    {description && <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>}
  </div>
);

const DictionaryEditor = ({ category, title, description, items, onAdd, onDelete }) => {
  const [newItem, setNewItem] = useState('');
  const add = () => { const v = newItem.trim(); if (v) { onAdd(category, v); setNewItem(''); } };
  return (
    <div className="bg-white/60 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 mb-6 shadow-sm transition-colors">
      <h3 className="font-bold text-lg text-gray-700 dark:text-gray-200 mb-1 flex items-center gap-2"><List size={20} className="text-accent-primary-light" aria-hidden="true" /> {title}</h3>
      {description && <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{description}</p>}
      <div className="flex gap-2 mb-4">
        <input
          aria-label={tr('Nowa opcja: {title}', { title })}
          className="flex-1 p-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white text-sm outline-none focus:border-accent-primary-light transition"
          placeholder={tr('Nowa opcja...')}
          value={newItem}
          onChange={e => setNewItem(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add(); }}
        />
        <button type="button" onClick={add} aria-label={tr('Dodaj opcję')} className="bg-accent-primary text-white px-4 rounded-xl font-bold hover:bg-accent-primary"><Plus size={18} aria-hidden="true" /></button>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.filter(i => i.category === category).map(item => (
          <div key={item.id} className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 hover:border-accent-primary-light transition">
            <span className="font-medium text-gray-700 dark:text-gray-200">{item.label}</span>
            <button type="button" onClick={() => onDelete(item)} aria-label={tr('Usuń opcję „{name}”', { name: item.label })} className="text-gray-400 hover:text-red-500 transition"><Trash2 size={14} aria-hidden="true" /></button>
          </div>
        ))}
      </div>
    </div>
  );
};

// Komunikaty — zawsze toast (w polu widzenia), „info” nie na czerwono (UXE-23).
const notify = (m) => {
  if (!m?.text) return;
  if (m.type === 'error') toast.error(m.text);
  else if (m.type === 'info') toast.info(m.text);
  else toast.success(m.text);
};

const fmtDateTime = (d) => (d ? new Date(d).toLocaleString(appLocale(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(appLocale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '');

// --- GŁÓWNY KOMPONENT ---

export default function GlobalSettings() {
  const t = useT();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = resolveSettingsTab(searchParams.get('tab'));
  const setActiveTab = (id) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', id);
    setSearchParams(next);
  };
  const [loading, setLoading] = useState(true);
  const { campuses } = useCampus();

  const [appSettings, setAppSettings] = useState([]);
  const [dictionaries, setDictionaries] = useState([]);
  const [users, setUsers] = useState([]);
  const [dbModules, setDbModules] = useState([]);
  const [dbRoles, setDbRoles] = useState([]); // role z app_roles (wraz z własnymi)

  const [userForm, setUserForm] = useState({ id: null, full_name: '', email: '', password: '', role: '', is_active: true });
  const [showUserModal, setShowUserModal] = useState(false);
  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [isCreatingAuthUser, setIsCreatingAuthUser] = useState(false);
  const [selectedTeams, setSelectedTeams] = useState([]);
  const [require2FA, setRequire2FA] = useState(false);

  // Nazwy służb z app_modules (np. „Małe SchWro”), nie zaszyte w kodzie (UXE-12).
  const moduleLabel = (key, fallback) => dbModules.find(m => m.key === key)?.label || tr(fallback);
  const teamDefinitions = TEAM_TABLES.map(d => ({ ...d, label: moduleLabel(d.key, d.fallback) }));

  // Lista ról do przypisania osobie — z app_roles; fallback do wbudowanych, gdy tabela pusta.
  const BUILTIN_ROLE_LABELS = {
    superadmin: t('Super Administrator'), rada_starszych: t('Rada Starszych'),
    koordynator: t('Koordynator'), lider: t('Lider Służby'), czlonek: t('Członek'),
  };
  const definedRoles = useMemo(() => {
    if (dbRoles && dbRoles.length) {
      return dbRoles.map(r => ({ key: r.key, label: r.label || BUILTIN_ROLE_LABELS[r.key] || r.key }));
    }
    return Object.entries(BUILTIN_ROLE_LABELS).map(([key, label]) => ({ key, label }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbRoles, t]);

  useEffect(() => {
    fetchData();
    fetchDbModules();
    fetchRoles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchRoles = async () => {
    const { data, error } = await supabase.from('app_roles').select('key, label, display_order').order('display_order', { ascending: true });
    if (!error && data) setDbRoles(data);
  };

  const fetchDbModules = async () => {
    const { data, error } = await supabase.from('app_modules').select('id, key, label').order('display_order', { ascending: true });
    if (!error && data) setDbModules(data);
  };

  const fetchData = async () => {
    setLoading(true);
    const [{ data: s }, { data: d }, { data: u, error: usersError }] = await Promise.all([
      supabase.from('app_settings').select('*'),
      supabase.from('app_dictionaries').select('*'),
      supabase.from('app_users').select('*').order('full_name'),
    ]);
    if (usersError) toast.error(tr('Nie udało się wczytać listy użytkowników.'));
    if (s) setAppSettings(s);
    if (d) setDictionaries(d);
    if (u) setUsers(u);
    setLoading(false);
  };

  // Helpery odczytu/zapisu ustawień (app_settings, klucz/wartość).
  const getSetting = (key) => appSettings.find(s => s.key === key)?.value;
  const saveSetting = async (key, value) => {
    const v = String(value);
    const { error } = await supabase.from('app_settings').upsert({ key, value: v }, { onConflict: 'key' });
    if (error) { toast.error(tr('Nie udało się zapisać ustawienia. Spróbuj ponownie.')); return false; }
    setAppSettings(prev => prev.some(s => s.key === key)
      ? prev.map(s => s.key === key ? { ...s, value: v } : s)
      : [...prev, { key, value: v }]);
    toast.success(tr('Zapisano'));
    return true;
  };

  // Admin: ustaw nowe hasło wskazanemu użytkownikowi (fn admin-set-user-password, bramkowany serwerowo).
  const minPw = Math.max(6, parseInt(getSetting('password_min_length') || '8', 10) || 8);
  const handleAdminSetPassword = async () => {
    if (adminNewPassword.length < minPw) return;
    setPwBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-set-user-password', { body: { userId: userForm.id, password: adminNewPassword } });
      if (error || data?.error) throw new Error(data?.error || error?.message || tr('Błąd'));
      toast.success(tr('Hasło zostało zmienione dla {email}.', { email: userForm.email }));
      setAdminNewPassword('');
    } catch (e) {
      toast.error(tr('Nie udało się zmienić hasła: {msg}', { msg: e.message }));
    } finally { setPwBusy(false); }
  };

  // Admin: wyślij użytkownikowi e-mail z linkiem do resetu hasła (istniejący flow).
  const handleAdminSendReset = async () => {
    setPwBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(userForm.email, { redirectTo: `${window.location.origin}/reset-password` });
      if (error) throw new Error(error.message);
      toast.success(tr('Link do resetu hasła wysłany na {email}.', { email: userForm.email }));
    } catch (e) {
      toast.error(tr('Nie udało się wysłać linku: {msg}', { msg: e.message }));
    } finally { setPwBusy(false); }
  };

  // Wgrywanie plików (logo, czcionka, tła) → storage + app_settings.
  const uploadPublic = async (file, prefix) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${prefix}-${Date.now()}.${fileExt}`;
    const { error } = await supabase.storage.from('public-assets').upload(fileName, file);
    if (error) throw error;
    return supabase.storage.from('public-assets').getPublicUrl(fileName).data.publicUrl;
  };
  const uploadFailed = () => toast.error(tr('Nie udało się przesłać pliku. Spróbuj ponownie.'));

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const url = await uploadPublic(file, 'org-logo');
      if (await saveSetting('org_logo_url', url)) window.location.reload();
    } catch { uploadFailed(); }
  };

  // Wgranie własnej czcionki brandowej (woff2/woff/ttf/otf) → storage + @font-face na żywo.
  const handleFontUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const url = await uploadPublic(file, 'org-font');
      await supabase.from('app_settings').upsert({ key: 'custom_font_url', value: url }, { onConflict: 'key' });
      await supabase.from('app_settings').upsert({ key: 'ui_font', value: 'custom' }, { onConflict: 'key' });
      injectCustomFont(url);
      applyFont('custom');
      fetchData();
      toast.success(tr('Wgrano czcionkę'));
    } catch { uploadFailed(); }
  };

  // Wgranie własnego obrazu tła aplikacji → storage + zastosowanie na żywo.
  const handleBgUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const url = await uploadPublic(file, 'org-bg');
      await supabase.from('app_settings').upsert({ key: 'ui_bg_url', value: url }, { onConflict: 'key' });
      await supabase.from('app_settings').upsert({ key: 'ui_bg_pattern', value: 'custom' }, { onConflict: 'key' });
      setBgUrl(url);
      applyBgPattern('custom');
      fetchData();
      toast.success(tr('Wgrano tło'));
    } catch { uploadFailed(); }
  };

  // Wgranie własnego tła ekranu logowania → storage + app_settings (czytane przez Login.jsx).
  const handleLoginBgUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const url = await uploadPublic(file, 'login-bg');
      await supabase.from('app_settings').upsert({ key: 'login_bg_url', value: url }, { onConflict: 'key' });
      await supabase.from('app_settings').upsert({ key: 'login_bg', value: 'custom' }, { onConflict: 'key' });
      fetchData();
      toast.success(tr('Wgrano tło logowania'));
    } catch { uploadFailed(); }
  };

  // Dopisanie nowego konta do wybranych służb — BEZ scalania i usuwania czegokolwiek:
  // istniejący rekord z tym e-mailem → nic nie robimy; jeden rekord o tym imieniu bez e-maila →
  // uzupełniamy e-mail; w pozostałych przypadkach dodajemy nowy rekord.
  const addUserToTeams = async (fullName, email) => {
    const failed = [];
    for (const teamKey of selectedTeams) {
      const def = teamDefinitions.find(d => d.key === teamKey);
      if (!def) continue;
      try {
        const { data: byEmail, error: e1 } = await supabase.from(def.table).select('id').eq('email', email);
        if (e1) throw e1;
        if (byEmail?.length) continue;
        const { data: byName, error: e2 } = await supabase.from(def.table).select('id, email').eq('full_name', fullName);
        if (e2) throw e2;
        const noEmail = (byName || []).filter(m => !m.email);
        if (noEmail.length === 1) {
          const { error } = await supabase.from(def.table).update({ email }).eq('id', noEmail[0].id);
          if (error) throw error;
        } else {
          const row = { full_name: fullName, email, phone: '' };
          if (def.hasStatus) row.status = 'Aktywny';
          const { error } = await supabase.from(def.table).insert([row]);
          if (error) throw error;
        }
      } catch {
        failed.push(def.label);
      }
    }
    return failed;
  };

  const saveUser = async () => {
    if (!userForm.email || !userForm.role) return toast.error(tr('Podaj e-mail i wybierz rolę.'));

    setIsCreatingAuthUser(true);
    try {
      if (userForm.id) {
        // Edycja przez FUNKCJĘ SERWEROWĄ: synchronizuje status z is_active, zapisuje totp_required,
        // pilnuje unikalności e-maila i guardów (self / ostatni admin) + audyt.
        const { error: updateError } = await supabase.functions.invoke('admin-update-user', {
          body: {
            userId: userForm.id,
            full_name: userForm.full_name || '',
            email: userForm.email,
            role: userForm.role,
            is_active: userForm.is_active,
            campus_id: userForm.campus_id || null,
            totp_required: require2FA,
          },
        });
        if (updateError) throw new Error(updateError.message);
        toast.success(tr('Zaktualizowano użytkownika'));
      } else {
        const { data: existingAppUser } = await supabase
          .from('app_users')
          .select('id, auth_user_id')
          .eq('email', userForm.email)
          .maybeSingle();

        if (existingAppUser) {
          const { error } = await supabase.functions.invoke('admin-update-user', {
            body: {
              userId: existingAppUser.id,
              full_name: userForm.full_name || '',
              role: userForm.role,
              is_active: userForm.is_active,
              campus_id: userForm.campus_id || null,
              totp_required: require2FA,
            },
          });
          if (error) throw new Error(error.message);
          toast.info(tr('Konto {email} już istniało — zaktualizowano jego dane.', { email: userForm.email }));
        } else {
          // Konto zakłada FUNKCJA SERWEROWA (aktywne, hash po stronie serwera) i wysyła e-mail „ustaw hasło”.
          const { error: createErr } = await supabase.functions.invoke('admin-create-user', {
            body: {
              email: userForm.email,
              full_name: userForm.full_name || '',
              role: userForm.role,
              is_active: userForm.is_active,
              campus_id: userForm.campus_id || null,
              totp_required: require2FA,
            },
          });
          if (createErr) throw new Error(createErr.message);
          toast.success(tr('Utworzono {email} — wysłano zaproszenie do ustawienia hasła (ważne 7 dni).', { email: userForm.email }));
        }

        if (selectedTeams.length > 0) {
          const failed = await addUserToTeams(userForm.full_name || userForm.email, userForm.email);
          if (failed.length) toast.error(tr('Konto utworzone, ale nie udało się dopisać do: {teams}.', { teams: failed.join(', ') }));
        }
      }

      setShowUserModal(false);
      setSelectedTeams([]);
      setRequire2FA(false);
      fetchData();
      loadAccountEvents();
    } catch (err) {
      toast.error(tr('Nie udało się zapisać użytkownika: {msg}', { msg: err.message }));
    } finally {
      setIsCreatingAuthUser(false);
    }
  };

  const userName = (u) => u?.full_name || u?.email || '';

  // Usuwanie/blokada/reset 2FA przez FUNKCJE SERWEROWE: rewokacja sesji, sprzątanie, guardy
  // (nie usuń/zablokuj siebie ani ostatniego admina) i audyt — patrz fn/delete-user, set-user-status.
  const deleteUser = async (user) => {
    if (!await confirmDialog(tr('Usunąć konto „{name}”? Osoba zostanie wylogowana, a konta nie da się przywrócić.', { name: userName(user) }))) return;
    const { error } = await supabase.functions.invoke('delete-user', { body: { userId: user.id } });
    if (error) { toast.error(error.message || tr('Nie udało się usunąć konta')); return; }
    fetchData(); loadAccountEvents();
    toast.success(tr('Konto zostało usunięte'));
  };
  const toggleUserStatus = async (user) => {
    const active = !user.is_active;
    if (!active && !await confirmDialog(tr('Zablokować konto „{name}”? Osoba zostanie od razu wylogowana.', { name: userName(user) }))) return;
    const { error } = await supabase.functions.invoke('set-user-status', { body: { userId: user.id, active } });
    if (error) { toast.error(error.message || tr('Nie udało się zmienić statusu')); return; }
    fetchData(); loadAccountEvents();
  };
  const resetUser2FA = async (user) => {
    if (!await confirmDialog(tr('Zresetować weryfikację dwuetapową dla „{name}”? Osoba skonfiguruje ją od nowa przy kolejnym logowaniu.', { name: userName(user) }))) return;
    const { error } = await supabase.functions.invoke('admin-reset-2fa', { body: { userId: user.id } });
    notify(error ? { type: 'error', text: error.message || tr('Nie udało się zresetować weryfikacji') } : { type: 'success', text: tr('Zresetowano weryfikację dwuetapową') });
    fetchData(); loadAccountEvents();
  };
  const forceLogoutUser = async (id) => {
    if (!await confirmDialog(tr('Wylogować „{name}” ze wszystkich urządzeń?', { name: userName(userForm) }))) return;
    const { error } = await supabase.functions.invoke('force-logout-user', { body: { userId: id } });
    notify(error ? { type: 'error', text: error.message || tr('Nie udało się wylogować') } : { type: 'success', text: tr('Wylogowano ze wszystkich urządzeń') });
    loadAccountEvents();
  };
  const unlockLogin = async (user) => {
    // Zdejmuje TYLKO blokadę anty-brute-force (nie rusza is_active — nie odblokowuje zablokowanego konta).
    const { error } = await supabase.functions.invoke('unlock-login', { body: { userId: user.id } });
    if (error) { toast.error(error.message || tr('Nie udało się odblokować logowania')); return; }
    fetchData(); loadAccountEvents();
    toast.success(tr('Odblokowano logowanie'));
  };
  const resendInvite = async (id) => {
    const { error } = await supabase.functions.invoke('resend-invite', { body: { userId: id } });
    notify(error ? { type: 'error', text: error.message || tr('Nie udało się wysłać zaproszenia') } : { type: 'success', text: tr('Ponowiono zaproszenie') });
  };

  // Zaznaczanie i akcje masowe (pętla po zaznaczonych — każdą operację robi funkcja serwerowa).
  const [selectedUserIds, setSelectedUserIds] = useState(() => new Set());
  const [bulkRole, setBulkRole] = useState('');
  const toggleSelectUser = (id) => setSelectedUserIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const clearSelection = () => setSelectedUserIds(new Set());
  const bulkRun = async (op, action) => {
    let ok = 0, fail = 0;
    for (const id of [...selectedUserIds]) { const err = await op(id); if (err) fail++; else ok++; }
    fetchData(); loadAccountEvents(); clearSelection();
    if (fail) toast.error(tr('{action}: udało się {ok}, nie udało się {fail}.', { action, ok, fail }));
    else toast.success(tr('{action}: {ok}', { action, ok }));
  };
  const bulkActivate = () => bulkRun(async id => (await supabase.functions.invoke('set-user-status', { body: { userId: id, active: true } })).error, tr('Aktywowano'));
  const bulkBlock = async () => { if (await confirmDialog(tr('Zablokować zaznaczone konta ({n})? Te osoby zostaną od razu wylogowane.', { n: selectedUserIds.size }))) bulkRun(async id => (await supabase.functions.invoke('set-user-status', { body: { userId: id, active: false } })).error, tr('Zablokowano')); };
  const bulkDelete = async () => { if (await confirmDialog(tr('Usunąć zaznaczone konta ({n})? Tej operacji nie da się cofnąć.', { n: selectedUserIds.size }))) bulkRun(async id => (await supabase.functions.invoke('delete-user', { body: { userId: id } })).error, tr('Usunięto')); };
  const bulkChangeRole = () => { if (bulkRole) bulkRun(async id => (await supabase.functions.invoke('admin-update-user', { body: { userId: id, role: bulkRole } })).error, tr('Zmieniono rolę')); };

  const statusLabel = (st) => (st === 'active' ? tr('Aktywny') : st === 'pending' ? tr('Oczekujący') : tr('Zablokowany'));

  const exportUsersCsv = () => {
    const rows = [[tr('Imię i nazwisko'), tr('E-mail'), tr('Rola'), tr('Status'), tr('Kampus'), tr('Ostatnie logowanie')]];
    filteredUsers.forEach(u => {
      const st = u.status || (u.is_active ? 'active' : 'blocked');
      rows.push([u.full_name || '', u.email || '', definedRoles.find(r => r.key === u.role)?.label || u.role || '', statusLabel(st), campuses.find(c => c.id === u.campus_id)?.name || '', fmtDateTime(u.last_login_at)]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'uzytkownicy.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };
  const parseCsvLine = (line) => {
    const out = []; let cur = ''; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map(s => s.trim());
  };
  const importUsersCsv = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const lines = (await file.text()).split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) { e.target.value = ''; return; }
    const header = parseCsvLine(lines[0]).map(h => h.toLowerCase());
    const ie = header.findIndex(h => h.includes('mail'));
    const inm = header.findIndex(h => h.includes('imi') || h.includes('name') || h.includes('nazw'));
    const ir = header.findIndex(h => h.includes('rol'));
    if (ie < 0) { toast.error(tr('Brak kolumny e-mail w pliku CSV')); e.target.value = ''; return; }
    let ok = 0, fail = 0;
    for (const line of lines.slice(1)) {
      const cells = parseCsvLine(line);
      const email = cells[ie]; if (!email || !email.includes('@')) continue;
      const roleCell = ir >= 0 ? cells[ir] : '';
      const role = definedRoles.find(r => r.key === roleCell || r.label === roleCell)?.key || 'czlonek';
      const { error } = await supabase.functions.invoke('admin-create-user', { body: { email, full_name: inm >= 0 ? cells[inm] : '', role } });
      if (error) fail++; else ok++;
    }
    e.target.value = '';
    fetchData(); loadAccountEvents();
    if (fail) toast.error(tr('Import CSV: utworzono {ok}, pominięto {fail}.', { ok, fail }));
    else toast.success(tr('Import CSV: utworzono {ok}.', { ok }));
  };

  // ── Scalanie duplikatów w służbach: najpierw PODGLĄD par i zaznaczanie (UXE-08) ──────────
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [mergeBusy, setMergeBusy] = useState(false);
  const [mergeGroups, setMergeGroups] = useState([]); // [{ id, team, table, ...group }]
  const [mergeSelected, setMergeSelected] = useState(() => new Set());

  const openMergePreview = async () => {
    setMergeOpen(true);
    setMergeLoading(true);
    const all = [];
    for (const def of teamDefinitions) {
      const { data, error } = await supabase.from(def.table).select(teamCols(def));
      if (error || !data) continue;
      groupDuplicateMembers(data).forEach(g => all.push({ ...g, id: `${def.table}:${g.key}`, team: def.label, table: def.table }));
    }
    setMergeGroups(all);
    // Domyślnie zaznaczone tylko grupy bez sprzecznych danych — resztę admin zaznacza świadomie.
    setMergeSelected(new Set(all.filter(g => !g.conflict).map(g => g.id)));
    setMergeLoading(false);
  };

  const runMerge = async () => {
    const chosen = mergeGroups.filter(g => mergeSelected.has(g.id));
    if (!chosen.length) return;
    setMergeBusy(true);
    let merged = 0, failed = 0;
    for (const g of chosen) {
      try {
        const fill = mergeFill(g.primary, g.duplicates);
        const def = TEAM_TABLES.find(d => d.table === g.table);
        if (!def?.hasStatus) delete fill.status;
        if (Object.keys(fill).length) {
          const { error } = await supabase.from(g.table).update(fill).eq('id', g.primary.id);
          if (error) throw error;
        }
        for (const dup of g.duplicates) {
          const { error: e1 } = await supabase.from('team_member_roles')
            .update({ member_id: String(g.primary.id) })
            .eq('member_id', String(dup.id))
            .eq('member_table', g.table);
          if (e1) throw e1;
          const { error: e2 } = await supabase.from(g.table).delete().eq('id', dup.id);
          if (e2) throw e2;
          merged++;
        }
      } catch {
        failed++;
      }
    }
    setMergeBusy(false);
    setMergeOpen(false);
    if (failed) toast.error(tr('Scalono {n} wpisów. Nie udało się scalić {fail} grup — spróbuj ponownie.', { n: merged, fail: failed }));
    else toast.success(tr('Scalono {n} powtórzonych wpisów.', { n: merged }));
  };

  // ── Słowniki ────────────────────────────────────────────────────────────────────────────
  const addDict = async (category, label) => {
    const { data, error } = await supabase.from('app_dictionaries').insert([{ category, label, value: label }]).select();
    if (error) { toast.error(tr('Nie udało się dodać opcji.')); return; }
    if (data) setDictionaries(prev => [...prev, data[0]]);
  };
  const delDict = async (item) => {
    if (!await confirmDialog(tr('Usunąć opcję „{name}”? Zniknie z listy wyboru.', { name: item.label }))) return;
    const { error } = await supabase.from('app_dictionaries').delete().eq('id', item.id);
    if (error) { toast.error(tr('Nie udało się usunąć opcji.')); return; }
    setDictionaries(prev => prev.filter(d => d.id !== item.id));
  };

  const logoUrl = getSetting('org_logo_url');

  // Rejestracja: kolejki oczekujących + audyt. Akcje = funkcje serwerowe (bramka admina + maile + log).
  const pendingUsers = users.filter(u => u.status === 'pending' && u.pending_kind === 'admin');
  const emailPendingUsers = users.filter(u => u.status === 'pending' && u.pending_kind === 'email');
  const [userSearch, setUserSearch] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState('all');
  // Zmiana filtra/wyszukiwarki czyści zaznaczenie — akcje masowe nigdy nie dotkną kont spoza widoku.
  useEffect(() => { setSelectedUserIds(new Set()); }, [userSearch, userStatusFilter]);
  const filteredUsers = users.filter(u => {
    const q = userSearch.trim().toLowerCase();
    const roleLabel = (definedRoles.find(r => r.key === u.role)?.label || u.role || '').toLowerCase();
    const matchesQ = !q || (u.full_name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q) || roleLabel.includes(q);
    const st = u.status || (u.is_active ? 'active' : 'blocked');
    const matchesS = userStatusFilter === 'all' || st === userStatusFilter;
    return matchesQ && matchesS;
  });
  const [accountEvents, setAccountEvents] = useState([]);
  const loadAccountEvents = async () => {
    const { data } = await supabase.functions.invoke('account-events');
    setAccountEvents(data?.events || []);
  };
  useEffect(() => { loadAccountEvents(); }, []);
  const approveUser = async (id) => {
    const { error } = await supabase.functions.invoke('approve-user', { body: { userId: id } });
    if (error) { toast.error(error.message || tr('Nie udało się zatwierdzić konta')); return; }
    fetchData(); loadAccountEvents();
    toast.success(tr('Konto zatwierdzone — wysłano powitanie'));
  };
  const rejectUser = async (user) => {
    if (!await confirmDialog(tr('Odrzucić zgłoszenie „{name}”? Zgłoszenie zostanie usunięte.', { name: userName(user) }))) return;
    const { error } = await supabase.functions.invoke('reject-user', { body: { userId: user.id } });
    if (error) { toast.error(error.message || tr('Nie udało się odrzucić')); return; }
    fetchData(); loadAccountEvents();
  };
  const resendVerification = async (id) => {
    const { error } = await supabase.functions.invoke('resend-verification', { body: { userId: id } });
    notify(error
      ? { type: 'error', text: error.message || tr('Nie udało się wysłać') }
      : { type: 'success', text: tr('Wysłano ponownie link weryfikacyjny') });
  };
  const ACTION_LABEL = { registered: tr('Rejestracja'), verified: tr('Potwierdzenie e-mail'), approved: tr('Zatwierdzenie'), rejected: tr('Odrzucenie'), created: tr('Utworzenie (admin)'), edited: tr('Edycja'), deleted: tr('Usunięcie'), blocked: tr('Zablokowanie'), unblocked: tr('Odblokowanie'), reset_2fa: tr('Reset weryfikacji dwuetapowej'), logged_out: tr('Wylogowanie (wszędzie)'), unlocked_login: tr('Odblokowanie logowania') };

  const activeNav = SETTINGS_NAV_FLAT.find(i => i.id === activeTab);
  const openNewUser = () => { setUserForm({ id: null, full_name: '', email: '', role: '', is_active: true }); setSelectedTeams([]); setRequire2FA(false); setShowUserModal(true); };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* NAGŁÓWEK */}
      <PageHeader moduleKey="settings" icon={SettingsIcon} title={t('Ustawienia')} />

      {/* Mobile: poziome zakładki (bez moduleKey — domyślna zakładka z preferencji nie może nadpisać ?tab=) */}
      <div className="lg:hidden">
        <ResponsiveTabs tabs={SETTINGS_NAV_FLAT.map((i) => ({ ...i, label: t(i.label) }))} activeTab={activeTab} onChange={setActiveTab} />
      </div>

      <div className="flex gap-6 flex-1 min-h-0">
        {/* MENU PO LEWEJ (desktop) */}
        <nav aria-label={tr('Sekcje ustawień')} className="hidden lg:flex flex-col w-60 shrink-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 p-3 overflow-y-auto">
          {SETTINGS_NAV.map((section) => (
            <div key={section.group} className="mb-2">
              <div className="px-3 pt-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">{t(section.group)}</div>
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    aria-current={active ? 'page' : undefined}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition mb-0.5 text-left ${
                      active
                        ? 'bg-gradient-to-r from-accent-primary to-accent-secondary text-white shadow-md shadow-accent-primary-light/30'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <Icon size={18} className="shrink-0" aria-hidden="true" />
                    {t(item.label)}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* TREŚĆ */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 p-6 lg:p-8 flex-1 overflow-y-auto transition-colors">
        {activeNav && (
          <div className="flex items-center gap-2.5 mb-6 lg:hidden">
            <activeNav.icon size={22} className="text-accent-primary" aria-hidden="true" />
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">{t(activeNav.label)}</h2>
          </div>
        )}

        {loading && ['general', 'users', 'security', 'appearance', 'dictionaries'].includes(activeTab) ? (
          <Spinner center />
        ) : (<>

        {/* --- TAB: ORGANIZACJA --- */}
        {activeTab === 'general' && (
          <div className="max-w-2xl">
            <SectionHeader title={tr('Profil organizacji')} description={tr('Podstawowe dane Twojego kościoła.')} />
            {[
              { key: 'org_name', label: tr('Nazwa organizacji'), placeholder: tr('np. Kościół Chrześcijański') },
              { key: 'org_legal_name', label: tr('Nazwa prawna'), placeholder: tr('Pełna nazwa do dokumentów') },
              { key: 'org_tax_id', label: 'NIP', placeholder: '000-000-00-00' },
              { key: 'org_email', label: tr('E-mail kontaktowy'), type: 'email', placeholder: 'kontakt@kosciol.pl' },
              { key: 'org_phone', label: t('Telefon'), placeholder: '+48 000 000 000' },
              { key: 'org_website', label: tr('Strona WWW'), placeholder: 'https://...' },
            ].map((f) => (
              <div key={f.key} className="mb-4">
                <label htmlFor={`org-${f.key}`} className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">{f.label}</label>
                <input
                  id={`org-${f.key}`}
                  type={f.type || 'text'}
                  placeholder={f.placeholder}
                  className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:border-accent-primary-light outline-none transition"
                  defaultValue={getSetting(f.key) || ''}
                  onBlur={(e) => { if (e.target.value !== (getSetting(f.key) || '')) saveSetting(f.key, e.target.value); }}
                />
              </div>
            ))}
            <div className="mb-4">
              <label htmlFor="org-address" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">{t('Adres')}</label>
              <textarea
                id="org-address"
                rows={2}
                placeholder={tr('Ulica, kod pocztowy, miasto')}
                className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:border-accent-primary-light outline-none transition resize-none"
                defaultValue={getSetting('org_address') || ''}
                onBlur={(e) => { if (e.target.value !== (getSetting('org_address') || '')) saveSetting('org_address', e.target.value); }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {tr('Zmiany zapisują się automatycznie po opuszczeniu pola.')}{' '}
              <button type="button" onClick={() => setActiveTab('appearance')} className="underline hover:text-accent-primary">{tr('Logo i kolory ustawisz w zakładce {tab}.', { tab: t('Wygląd') })}</button>
            </p>
            {/* Ustawienie całej organizacji (app_settings) — zapis wymaga manage_integrations jak inne ustawienia. */}
            <Can cap="action:settings:manage_integrations">
              <TaskDigestSettings raw={getSetting('task_digest')} onSave={(v) => saveSetting('task_digest', v)} />
            </Can>
          </div>
        )}

        {/* --- TAB: KAMPUSY --- */}
        {activeTab === 'campuses' && (
          <CampusManager onMessage={notify} />
        )}

        {/* --- TAB: MODUŁY (włączanie + nazwa/ikona + kolejność w jednym miejscu) --- */}
        {activeTab === 'modules' && (
          <ModuleManager />
        )}

        {/* --- TAB: UŻYTKOWNICY --- */}
        {activeTab === 'users' && (
          <div>
            <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-3 mb-2">
              <SectionHeader title={t('Konta użytkowników')} description={tr('Zarządzanie dostępem, rolami i statusem kont.')} />
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Button variant="outline" size="sm" icon={Download} onClick={exportUsersCsv} title={tr('Pobierz listę kont jako plik CSV')}>{tr('Eksportuj CSV')}</Button>
                <Button variant="outline" size="sm" icon={Upload} onClick={() => document.getElementById('users-csv-import').click()} title={tr('Importuj konta z CSV (kolumny: e-mail, imię, rola)')}>{tr('Importuj CSV')}</Button>
                <input id="users-csv-import" type="file" accept=".csv,text/csv" className="hidden" onChange={importUsersCsv} />
                <Button variant="outline" size="sm" icon={Layers} onClick={openMergePreview} title={tr('Znajdź i scal powtórzone wpisy osób w służbach')}>{tr('Scal duplikaty')}</Button>
                <Button icon={Plus} onClick={openNewUser}>{tr('Dodaj użytkownika')}</Button>
              </div>
            </div>

            <button type="button" onClick={() => setActiveTab('security')} className="mb-5 w-full flex items-center justify-between gap-3 text-left text-sm rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 text-gray-600 dark:text-gray-300 hover:border-accent-primary-light/60 transition">
              <span className="flex items-center gap-2"><ShieldCheck size={16} className="text-accent-primary shrink-0" aria-hidden="true" /> {tr('Zasady logowania, haseł, rejestracji i logowania kontem Google lub Microsoft ustawisz w zakładce „Bezpieczeństwo i logowanie”.')}</span>
              <ArrowRight size={16} className="shrink-0" aria-hidden="true" />
            </button>

            {/* Kolejka: oczekujący na zatwierdzenie (tryb „za zgodą administratora”) */}
            {pendingUsers.length > 0 && (
              <div className="mb-6 rounded-xl border border-amber-200 dark:border-amber-900/40 p-5 bg-amber-50/60 dark:bg-amber-900/10">
                <h3 className="font-bold text-gray-800 dark:text-white mb-3 flex items-center gap-2"><Clock size={18} aria-hidden="true" /> {tr('Oczekujący na zatwierdzenie')} ({pendingUsers.length})</h3>
                <div className="space-y-2">
                  {pendingUsers.map(u => (
                    <div key={u.id} className="flex items-center justify-between gap-3 bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-100 dark:border-gray-700">
                      <div className="min-w-0">
                        <div className="font-medium text-sm text-gray-800 dark:text-gray-100 truncate">{u.full_name || u.email}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{u.email} · {definedRoles.find(r => r.key === u.role)?.label || u.role}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => approveUser(u.id)} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-green-500 text-white hover:bg-green-600 transition">{tr('Zatwierdź')}</button>
                        <button onClick={() => rejectUser(u)} className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">{tr('Odrzuć')}</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Kolejka: oczekują na potwierdzenie e-mail (tryb otwarty) */}
            {emailPendingUsers.length > 0 && (
              <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-700 p-5 bg-white dark:bg-gray-800">
                <h3 className="font-bold text-gray-800 dark:text-white mb-3 flex items-center gap-2"><Mail size={18} aria-hidden="true" /> {tr('Oczekują na potwierdzenie e-mail')} ({emailPendingUsers.length})</h3>
                <div className="space-y-2">
                  {emailPendingUsers.map(u => (
                    <div key={u.id} className="flex items-center justify-between gap-3 bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-100 dark:border-gray-700">
                      <div className="min-w-0">
                        <div className="font-medium text-sm text-gray-800 dark:text-gray-100 truncate">{u.full_name || u.email}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{u.email}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => resendVerification(u.id)} className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">{tr('Wyślij ponownie')}</button>
                        <button onClick={() => approveUser(u.id)} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-green-500 text-white hover:bg-green-600 transition">{tr('Aktywuj')}</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 mb-3">
              <input type="search" aria-label={tr('Szukaj kont')} value={userSearch} onChange={e => setUserSearch(e.target.value)} placeholder={tr('Szukaj po imieniu, e-mailu, roli…')} className="flex-1" />
              <select aria-label={tr('Filtruj po statusie')} value={userStatusFilter} onChange={e => setUserStatusFilter(e.target.value)} className="sm:w-56">
                <option value="all">{tr('Wszystkie statusy')}</option>
                <option value="active">{tr('Aktywni')}</option>
                <option value="blocked">{tr('Zablokowani')}</option>
                <option value="pending">{tr('Oczekujący')}</option>
              </select>
            </div>
            {selectedUserIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-3 p-3 rounded-xl bg-accent-primary-lightest/50 dark:bg-gray-800 border border-accent-primary-light/40">
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{tr('Zaznaczono')}: {selectedUserIds.size}</span>
                <button onClick={bulkActivate} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-green-500 text-white hover:bg-green-600">{tr('Aktywuj')}</button>
                <button onClick={bulkBlock} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600">{tr('Zablokuj')}</button>
                <div className="flex items-center gap-1.5">
                  <select aria-label={tr('Zmień rolę zaznaczonych')} value={bulkRole} onChange={e => setBulkRole(e.target.value)} className="text-sm">
                    <option value="">{tr('Zmień rolę…')}</option>
                    {definedRoles.filter(r => r.key !== 'superadmin').map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                  </select>
                  <button onClick={bulkChangeRole} disabled={!bulkRole} className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-600 disabled:opacity-50">{tr('Zastosuj')}</button>
                </div>
                <button onClick={bulkDelete} className="px-3 py-1.5 rounded-lg text-sm font-medium border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">{tr('Usuń')}</button>
                <button onClick={clearSelection} className="px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:underline ml-auto">{tr('Wyczyść')}</button>
              </div>
            )}
            <DataTable>
              <THead>
                <tr>
                  <TH className="w-10"><input type="checkbox" aria-label={tr('Zaznacz wszystkie')} checked={filteredUsers.length > 0 && selectedUserIds.size === filteredUsers.length} onChange={() => setSelectedUserIds(prev => prev.size === filteredUsers.length ? new Set() : new Set(filteredUsers.map(u => u.id)))} /></TH>
                  <TH>{t('Użytkownik')}</TH>
                  <TH>{t('E-mail')}</TH>
                  <TH>{t('Rola')}</TH>
                  {campuses.length > 0 && <TH>{t('Kampus')}</TH>}
                  <TH>{t('Status')}</TH>
                  <TH>{t('Ostatnie logowanie')}</TH>
                  <TH align="right"><span className="sr-only">{t('Akcje')}</span></TH>
                </tr>
              </THead>
              <tbody>
                {filteredUsers.map(user => {
                  const roleLabel = definedRoles.find(r => r.key === user.role)?.label || user.role;
                  const isSuperAdmin = user.is_super_admin === true;
                  const st = user.status || (user.is_active ? 'active' : 'blocked');
                  const loginLocked = user.locked_until && new Date(user.locked_until).getTime() > Date.now();
                  const invitedPending = user.invited_at && !user.last_login_at;
                  return (
                    <TR key={user.id} selected={selectedUserIds.has(user.id)}>
                      <TD className="w-10"><input type="checkbox" aria-label={tr('Zaznacz {name}', { name: userName(user) })} checked={selectedUserIds.has(user.id)} onChange={() => toggleSelectUser(user.id)} /></TD>
                      <TD className="font-medium text-gray-900 dark:text-white">
                        <div className="flex items-center gap-3">
                          <div aria-hidden="true" className={`w-8 h-8 rounded-full flex items-center justify-center font-bold uppercase shrink-0 ${isSuperAdmin ? 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300' : 'bg-accent-primary-lighter dark:bg-accent-primary-darkest/50 text-accent-primary dark:text-accent-primary-light'}`}>
                            {(user.full_name || user.email || '?').charAt(0)}
                          </div>
                          {user.full_name || tr('Brak imienia')}
                          {isSuperAdmin && <StatusPill color={STATUS_COLORS.warning}>{tr('Główny administrator')}</StatusPill>}
                        </div>
                      </TD>
                      <TD muted>{user.email}</TD>
                      <TD><StatusPill color={isSuperAdmin ? STATUS_COLORS.warning : STATUS_COLORS.accent}>{roleLabel}</StatusPill></TD>
                      {campuses.length > 0 && <TD muted>{campuses.find(c => c.id === user.campus_id)?.name || null}</TD>}
                      <TD>
                        <div className="flex flex-col gap-1 items-start">
                          <button onClick={() => toggleUserStatus(user)} disabled={isSuperAdmin || st === 'pending'} title={isSuperAdmin || st === 'pending' ? undefined : (st === 'active' ? tr('Kliknij, aby zablokować') : tr('Kliknij, aby odblokować'))} className={`rounded-full transition ${isSuperAdmin || st === 'pending' ? 'opacity-70 cursor-default' : 'hover:opacity-80'}`}>
                            <StatusPill color={st === 'active' ? STATUS_COLORS.success : st === 'pending' ? STATUS_COLORS.warning : STATUS_COLORS.danger}>
                              {statusLabel(st)}
                            </StatusPill>
                          </button>
                          {loginLocked && (
                            <button onClick={() => unlockLogin(user)} title={tr('Zablokowane logowanie po nieudanych próbach — kliknij, aby odblokować')} className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 hover:underline">
                              <KeyRound size={11} aria-hidden="true" /> {tr('Odblokuj logowanie')}
                            </button>
                          )}
                        </div>
                      </TD>
                      <TD muted numeric className="whitespace-nowrap">{user.last_login_at ? fmtDate(user.last_login_at) : invitedPending ? <span className="text-amber-600 dark:text-amber-400 text-xs font-medium">{tr('zaproszono')}</span> : <span className="text-gray-400 dark:text-gray-500">{tr('nigdy')}</span>}</TD>
                      <TD align="right" className="whitespace-nowrap">
                        <div className="flex justify-end gap-2 opacity-60 group-hover/row:opacity-100 focus-within:opacity-100 transition-opacity">
                        <button onClick={() => { setUserForm({...user, password: ''}); setAdminNewPassword(''); setRequire2FA(!!user.totp_required); setShowUserModal(true); }} title={t('Edytuj')} aria-label={tr('Edytuj {name}', { name: userName(user) })} className="text-accent-primary dark:text-accent-primary-light hover:bg-accent-primary-lightest dark:hover:bg-gray-600 p-2 rounded-lg"><Edit3 size={16} aria-hidden="true" /></button>
                        {invitedPending && (
                          <button onClick={() => resendInvite(user.id)} title={tr('Ponów zaproszenie')} aria-label={tr('Ponów zaproszenie')} className="text-blue-500 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-gray-600 p-2 rounded-lg"><Mail size={16} aria-hidden="true" /></button>
                        )}
                        {user.totp_enabled && (
                          <button onClick={() => resetUser2FA(user)} title={tr('Zresetuj weryfikację dwuetapową')} aria-label={tr('Zresetuj weryfikację dwuetapową')} className="text-amber-500 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-gray-600 p-2 rounded-lg"><KeyRound size={16} aria-hidden="true" /></button>
                        )}
                        <button onClick={() => deleteUser(user)} title={t('Usuń')} aria-label={tr('Usuń {name}', { name: userName(user) })} className="text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-gray-600 p-2 rounded-lg"><Trash2 size={16} aria-hidden="true" /></button>
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </DataTable>

            {/* Historia kont (audyt rejestracji/zatwierdzeń) — pod tabelą */}
            {accountEvents.length > 0 && (
              <details className="mt-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <summary className="cursor-pointer select-none p-4 font-bold text-gray-800 dark:text-white flex items-center gap-2"><Clock size={18} aria-hidden="true" /> {tr('Historia kont')} ({accountEvents.length})</summary>
                <div className="px-4 pb-4 max-h-64 overflow-y-auto">
                  {accountEvents.map((ev, i) => (
                    <div key={i} className="flex items-center gap-3 text-xs py-1.5 border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                      <span className="text-gray-400 whitespace-nowrap w-40 shrink-0">{fmtDateTime(ev.created_at)}</span>
                      <span className="font-semibold text-gray-700 dark:text-gray-200 w-32 shrink-0">{ACTION_LABEL[ev.action] || ev.action}</span>
                      <span className="text-gray-600 dark:text-gray-300 truncate flex-1">{ev.email}</span>
                      <span className="text-gray-400 truncate hidden sm:block">{ev.actor}{ev.detail ? ` · ${ev.detail}` : ''}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {/* --- TAB: UPRAWNIENIA --- */}
        {activeTab === 'permissions' && (
          <div>
            <SectionHeader title={t('Uprawnienia')} description={tr('Role i to, co każda z nich może widzieć i zmieniać. Możesz też nadać wyjątki konkretnym osobom.')} />
            <PermissionsAdmin />
          </div>
        )}

        {/* --- TAB: BEZPIECZEŃSTWO I LOGOWANIE --- */}
        {activeTab === 'security' && (
          <div>
            <SectionHeader title={t('Bezpieczeństwo i logowanie')} description={tr('Logowanie, hasła, zakładanie kont i logowanie kontem Google lub Microsoft.')} />
            <SecuritySettings get={getSetting} save={saveSetting} roles={definedRoles} campuses={campuses} />
          </div>
        )}

        {/* --- TAB: SŁOWNIKI --- (pozostał tylko słownik, którego aplikacja naprawdę używa) */}
        {activeTab === 'dictionaries' && (
          <div className="max-w-3xl">
            <SectionHeader title={t('Słowniki')} description={tr('Listy wyboru używane w aplikacji.')} />
            <DictionaryEditor title={t('Kategorie wydarzeń')} description={tr('Pojawiają się przy dodawaniu wydarzenia w kalendarzu.')} category="event_category" items={dictionaries} onAdd={addDict} onDelete={delDict} />
          </div>
        )}

        {/* --- TAB: INTEGRACJE --- */}
        {activeTab === 'integrations' && <IntegrationsTab />}

        {/* --- TAB: WYGLĄD --- */}
        {activeTab === 'appearance' && (
          <AppearanceSettings get={getSetting} save={saveSetting} logoUrl={logoUrl} onLogoUpload={handleLogoUpload} onFontUpload={handleFontUpload} onBgUpload={handleBgUpload} onLoginBgUpload={handleLoginBgUpload} />
        )}

        {/* --- TAB: SUBSKRYPCJA --- */}
        {activeTab === 'subscription' && <SubscriptionInfo />}
        </>)}

        </div>
      </div>

      {/* MODAL: PODGLĄD SCALANIA DUPLIKATÓW */}
      <Modal
        isOpen={mergeOpen}
        onClose={() => !mergeBusy && setMergeOpen(false)}
        closeOnBackdrop={false}
        size="lg"
        icon={Layers}
        title={tr('Scal duplikaty w służbach')}
        subtitle={tr('Zaznacz grupy, które na pewno dotyczą tej samej osoby. Zostanie jeden wpis, a przypisania do służby przejdą na niego.')}
        footer={<>
          <Button variant="secondary" onClick={() => setMergeOpen(false)} disabled={mergeBusy}>{tr('Anuluj')}</Button>
          <Button onClick={runMerge} loading={mergeBusy} disabled={mergeLoading || mergeSelected.size === 0}>
            {tr('Scal zaznaczone ({n})', { n: mergeSelected.size })}
          </Button>
        </>}
      >
        <div className="p-6">
          {mergeLoading ? (
            <Spinner center />
          ) : mergeGroups.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">{tr('Nie znaleziono powtórzonych wpisów w służbach.')}</p>
          ) : (
            <div className="space-y-3">
              {mergeGroups.map(g => {
                const checked = mergeSelected.has(g.id);
                return (
                  <label key={g.id} className={`block rounded-xl border p-3 cursor-pointer transition ${checked ? 'border-accent-primary bg-accent-primary-lightest/30 dark:bg-gray-700/60' : 'border-gray-200 dark:border-gray-600'}`}>
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 w-4 h-4"
                        checked={checked}
                        onChange={() => setMergeSelected(prev => { const n = new Set(prev); n.has(g.id) ? n.delete(g.id) : n.add(g.id); return n; })}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-gray-800 dark:text-gray-100">{g.name} <span className="font-normal text-gray-500 dark:text-gray-400">· {g.team} · {tr('wpisów: {n}', { n: g.members.length })}</span></div>
                        {g.conflict && (
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                            <AlertTriangle size={13} aria-hidden="true" /> {tr('Różne dane kontaktowe lub grupy — to mogą być dwie różne osoby.')}
                          </div>
                        )}
                        <ul className="mt-2 space-y-1">
                          {g.members.map(m => (
                            <li key={m.id} className="text-xs text-gray-600 dark:text-gray-300 flex flex-wrap gap-x-3">
                              <span className="font-medium">{m.id === g.primary.id ? tr('Zostaje') : tr('Zostanie scalony')}</span>
                              <span>{m.email || tr('bez e-maila')}</span>
                              <span>{m.phone || tr('bez telefonu')}</span>
                              {m.status && <span>{m.status}</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </Modal>

      {/* MODAL UŻYTKOWNIKA */}
      <Modal
        isOpen={showUserModal}
        onClose={() => setShowUserModal(false)}
        closeOnBackdrop={false}
        size="sm"
        title={userForm.id ? t('Edytuj użytkownika') : t('Dodaj użytkownika')}
        footer={<>
          <Button variant="secondary" onClick={() => setShowUserModal(false)}>{tr('Anuluj')}</Button>
          <Button onClick={saveUser} loading={isCreatingAuthUser}>{tr('Zapisz')}</Button>
        </>}
      >
        <div className="p-6 space-y-4">
          <div>
            <label htmlFor="user-full-name" className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase ml-1">{t('Imię i nazwisko')}</label>
            <input id="user-full-name" className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white" placeholder={t('Jan Kowalski')} value={userForm.full_name || ''} onChange={e => setUserForm({...userForm, full_name: e.target.value})} />
          </div>
          <div>
            <label htmlFor="user-email" className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase ml-1">{tr('E-mail (login)')}</label>
            <input id="user-email" type="email" className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white" placeholder="jan@example.com" value={userForm.email || ''} onChange={e => setUserForm({...userForm, email: e.target.value})} />
          </div>
          {!userForm.id && (
            <p className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl p-3">
              {tr('Użytkownik otrzyma e-mail z linkiem do ustawienia własnego hasła.')}
            </p>
          )}
          <div>
            <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase ml-1 mb-1 block">{tr('Rola w systemie')}</label>
            <CustomSelect options={definedRoles.filter(r => r.key !== 'superadmin').map(r => ({value: r.key, label: r.label}))} value={userForm.role} onChange={v => setUserForm({...userForm, role: v})} placeholder={t('Wybierz rolę...')} />
          </div>
          {campuses.length > 0 && (
            <div>
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase ml-1 mb-1 block">{tr('Kampus')}</label>
              <CustomSelect
                options={[{ value: '', label: t('Wszystkie kampusy (brak ograniczeń)') }, ...campuses.map(c => ({ value: String(c.id), label: c.name + (c.city ? ` (${c.city})` : '') }))]}
                value={userForm.campus_id ? String(userForm.campus_id) : ''}
                onChange={v => setUserForm({ ...userForm, campus_id: v ? parseInt(v, 10) : null })}
                placeholder={t('Wybierz kampus...')}
              />
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 ml-1">{t('Użytkownik przypisany do kampusu widzi tylko dane tego kampusu.')}</p>
            </div>
          )}
          {userForm.id && (
            <div className="p-3 border border-gray-200 dark:border-gray-600 rounded-xl space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase"><KeyRound size={13} aria-hidden="true" /> {tr('Hasło (administrator)')}</div>
              <div className="flex gap-2">
                <input type="text" aria-label={tr('Nowe hasło')} autoComplete="new-password" value={adminNewPassword} onChange={e => setAdminNewPassword(e.target.value)} placeholder={tr('Nowe hasło (min. {n} znaków)', { n: minPw })}
                  className="flex-1 p-2.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white text-sm" />
                <Button size="sm" onClick={handleAdminSetPassword} loading={pwBusy} disabled={adminNewPassword.length < minPw}>{tr('Ustaw')}</Button>
              </div>
              <button type="button" onClick={handleAdminSendReset} disabled={pwBusy || !userForm.email}
                className="w-full py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 flex items-center justify-center gap-2">
                <Mail size={15} aria-hidden="true" /> {tr('Wyślij link do resetu hasła')}
              </button>
              <p className="text-[11px] text-gray-400">{tr('„Ustaw” zmienia hasło od razu. „Wyślij link” pozwala użytkownikowi ustawić hasło samodzielnie.')}</p>
              <button type="button" onClick={() => forceLogoutUser(userForm.id)}
                className="w-full py-2 border border-amber-200 dark:border-amber-900/50 rounded-lg text-sm text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 flex items-center justify-center gap-2">
                <UserX size={15} aria-hidden="true" /> {tr('Wyloguj ze wszystkich urządzeń')}
              </button>
            </div>
          )}
          {!userForm.id && (
            <div>
              <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase ml-1 mb-2">{t('Służby / Zespoły')}</div>
              <div className="border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 p-3">
                <div className="flex flex-wrap gap-2">
                  {teamDefinitions.map(team => {
                    const isSelected = selectedTeams.includes(team.key);
                    return (
                      <button
                        key={team.key}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => setSelectedTeams(prev => isSelected ? prev.filter(k => k !== team.key) : [...prev, team.key])}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-gradient-to-r from-accent-primary-light to-accent-secondary-light text-white shadow-md'
                            : 'bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-500'
                        }`}
                      >
                        {isSelected && <Check size={14} aria-hidden="true" />}
                        {team.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                  {tr('Użytkownik zostanie dopisany jako członek wybranych służb.')}
                </p>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 p-3">
            <div>
              <div className="font-medium text-sm text-gray-800 dark:text-white">{tr('Wymagaj weryfikacji dwuetapowej')}</div>
              <p className="text-xs text-gray-400 dark:text-gray-500">{tr('Osoba będzie musiała ją włączyć przy najbliższym logowaniu.')}</p>
            </div>
            <Toggle label={tr('Wymagaj weryfikacji dwuetapowej')} checked={require2FA} onChange={setRequire2FA} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
