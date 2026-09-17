import React, { useState, useEffect } from 'react';
import Spinner from '../components/Spinner';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import {
  Plus, Search, Trash2, Edit2, X, User,
  Mail, Phone, CheckCircle, XCircle,
  MapPin, Users, Home, Calendar, FileText,
  Upload, Eye, Check, FolderOpen, HeartHandshake, Cake
} from 'lucide-react';
import CustomSelect from '../components/CustomSelect';
import CustomDatePicker from '../components/CustomDatePicker';
import MemberProfile from '../components/MemberProfile';
import Can, { useCan } from '../components/Can';
import CareModule from './Care/CareModule';
import AttendanceTab from './AttendanceTab';
import MaterialsTab from './shared/MaterialsTab';
import { useT } from '../i18n';
import ResponsiveTabs from '../components/ResponsiveTabs';
import PageHeader from '../components/PageHeader';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import HouseholdManager from './Kids/components/HouseholdManager';
import { useCampusQuery } from '../hooks/useCampusQuery';
import { useCampus } from '../contexts/CampusContext';
import { useModuleLabel } from '../hooks/useModuleLabel';
import { useModules } from '../hooks/useModules';
import { tr } from '../i18n';
import { toast } from '../lib/toast';

// --- STAŁE DANE ---

const STATUS_OPTIONS = [
  "Członek",
  "Sympatyk",
  "Gość"
];

// Lista służb budowana dynamicznie w komponencie (etykiety per tenant + moduły custom).
// Grupy domowe mają osobny, wielokrotny wybór (nie jako pojedyncza „służba").
const MINISTRY_SYS_KEYS = new Set(['worship', 'media', 'atmosfera', 'kids', 'mc', 'homegroups', 'programs', 'dashboard', 'calendar', 'general', 'members', 'finance', 'teaching', 'prayer_wall', 'boards']);

// --- GŁÓWNY KOMPONENT ---

export default function Members() {
  const t = useT();
  const [activeTab, setActiveTab] = useState('members');
  const canCare = useCan('module:care'); // Opieka/CRM scalona z Członkami (per-członek w profilu; tu globalne pola)
  const [members, setMembers] = useState([]);
  const [homeGroups, setHomeGroups] = useState([]);
  const [households, setHouseholds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const { withCampusFilter, selectedCampusId, campusIdForInsert } = useCampusQuery();
  const { campuses } = useCampus();

  // Służby: etykiety z konfiguracji modułów tenanta (nie hardcode) + moduły custom + MC.
  const lblWorship = useModuleLabel('worship', 'Grupa Uwielbienia');
  const lblMedia = useModuleLabel('media', 'Media Team');
  const lblAtmosfera = useModuleLabel('atmosfera', 'Atmosfera Team');
  const lblKids = useModuleLabel('kids', 'Małe Avenit');
  const lblMc = useModuleLabel('mc', 'Scena / MC');
  const { modules } = useModules();
  const MINISTRY_OPTIONS = React.useMemo(() => {
    const sys = [
      { key: 'worship_team', label: lblWorship, table: 'worship_team' },
      { key: 'media_team', label: lblMedia, table: 'media_team' },
      { key: 'atmosfera_team', label: lblAtmosfera, table: 'atmosfera_members' },
      { key: 'kids_ministry', label: lblKids, table: 'kids_teachers' },
      { key: 'mc_team', label: lblMc, table: 'custom_mc_members' },
    ];
    const customs = (modules || [])
      .filter((m) => m.is_enabled && m.key && !MINISTRY_SYS_KEYS.has(m.key))
      .map((m) => ({ key: `custom_${m.key}`, label: m.label || m.key, table: `custom_${m.key}_members` }));
    return [...sys, ...customs, { key: 'administration', label: tr('Administracja'), table: null }];
  }, [lblWorship, lblMedia, lblAtmosfera, lblKids, lblMc, modules]);
  const [hgIdsByEmail, setHgIdsByEmail] = useState({}); // email(lower) -> [group_id] (członkostwa w grupach domowych)

  // Obecność: ostatnie 4 niedziele (25% za każdą). Data lokalna (bez przesunięcia strefy).
  const fmtDate = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  const last4Sundays = React.useMemo(() => {
    const out = []; const d = new Date(); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay()); // ostatnia (lub dzisiejsza) niedziela
    for (let i = 0; i < 4; i++) { out.push(fmtDate(d)); d.setDate(d.getDate() - 7); }
    return out; // [najnowsza … najstarsza]
  }, []);
  const [attendanceByMember, setAttendanceByMember] = useState({}); // member_id -> Set(date)
  const attendanceCount = (memberId) => {
    const set = attendanceByMember[String(memberId)];
    return set ? last4Sundays.filter((d) => set.has(d)).length : 0;
  };
  const birthdaySoon = (bd) => {
    if (!bd) return false;
    const d = new Date(bd); const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let next = new Date(now.getFullYear(), d.getMonth(), d.getDate());
    if (next < today) next = new Date(now.getFullYear() + 1, d.getMonth(), d.getDate());
    return (next - today) / 86400000 <= 7;
  };
  const fmtBirth = (bd) => {
    if (!bd) return '';
    const d = new Date(bd);
    const age = new Date().getFullYear() - d.getFullYear();
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()} (${age})`;
  };

  // Przypomnienia urodzinowe (konfiguracja + role do wyboru odbiorców).
  const [showBdayCfg, setShowBdayCfg] = useState(false);
  const [bdayCfg, setBdayCfg] = useState({ enabled: false, schedule: 'weekly', weekday: 1, days_ahead: 7, channel: 'email', recipients: { roles: [], emails: [] }, message: '' });
  const [roleList, setRoleList] = useState([]);
  const [bdayEmail, setBdayEmail] = useState('');
  const [bdaySaving, setBdaySaving] = useState(false);
  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', 'birthday_reminders').maybeSingle().then(({ data }) => {
      if (data?.value) { try { const c = typeof data.value === 'string' ? JSON.parse(data.value) : data.value; setBdayCfg((prev) => ({ ...prev, ...c, recipients: { roles: c?.recipients?.roles || [], emails: c?.recipients?.emails || [] } })); } catch { /* domyślne */ } }
    }, () => {});
    supabase.from('app_roles').select('key, label').order('label').then(({ data }) => setRoleList(data || []), () => {});
  }, []);
  const saveBdayCfg = async () => {
    setBdaySaving(true);
    try {
      const { error } = await supabase.from('app_settings').upsert({ key: 'birthday_reminders', value: JSON.stringify(bdayCfg) }, { onConflict: 'key' });
      if (error) throw error;
      toast.success(tr('Zapisano konfigurację'));
      setShowBdayCfg(false);
    } catch (e) { toast.error('Nie udało się zapisać: ' + (e.message || e)); }
    finally { setBdaySaving(false); }
  };

  // Stan modala
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileMember, setProfileMember] = useState(null);
  const [tagInput, setTagInput] = useState('');
  const [tagFilter, setTagFilter] = useState(null);
  const [formData, setFormData] = useState({
    id: null,
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    address: '',
    home_group_id: '',
    home_group_ids: [],
    household_id: '',
    status: 'Sympatyk',
    membership_date: '',
    membership_declaration_url: '',
    ministries: [],
    birth_date: '',
    notes: '',
    tags: [],
    campus_id: null
  });

  // Upload state
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchData();
  }, [selectedCampusId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [membersResult, groupsResult, householdsResult, hgmResult, attResult] = await Promise.all([
        withCampusFilter(supabase.from('members').select('*')).order('last_name'),
        supabase.from('home_groups').select('id, name').order('name'),
        supabase.from('households').select('*').order('name'),
        supabase.from('home_group_members').select('email, group_id').then((r) => r, () => ({ data: [] })),
        supabase.from('attendance').select('member_id, date').eq('present', true).in('date', last4Sundays).then((r) => r, () => ({ data: [] })),
      ]);

      if (membersResult.error) throw membersResult.error;
      if (groupsResult.error) throw groupsResult.error;
      if (householdsResult.error) throw householdsResult.error;

      setMembers(membersResult.data || []);
      setHomeGroups(groupsResult.data || []);
      setHouseholds(householdsResult.data || []);
      // Mapa e-mail → grupy domowe (członkostwa) do multi-wyboru i wyświetlania.
      const map = {};
      (hgmResult.data || []).forEach((r) => {
        const e = (r.email || '').toLowerCase();
        if (!e || r.group_id == null) return;
        (map[e] = map[e] || []).push(r.group_id);
      });
      setHgIdsByEmail(map);
      // Obecność ostatnich 4 niedziel: member_id → zbiór dat.
      const att = {};
      (attResult.data || []).forEach((r) => {
        if (r.member_id == null || !r.date) return;
        const k = String(r.member_id);
        (att[k] = att[k] || new Set()).add(String(r.date).slice(0, 10));
      });
      setAttendanceByMember(att);
    } catch (error) {
      console.error('Błąd pobierania danych:', error);
    } finally {
      setLoading(false);
    }
  };

  // Funkcja do dodawania członka do służby
  const addMemberToMinistry = async (ministry, memberData) => {
    if (!ministry.table) return; // Administracja nie ma tabeli

    const fullName = `${memberData.first_name} ${memberData.last_name}`.trim();

    // Sprawdź czy już istnieje
    const { data: existing } = await supabase
      .from(ministry.table)
      .select('id')
      .eq('email', memberData.email)
      .maybeSingle();

    if (existing) return; // Już istnieje

    const insertData = {
      full_name: fullName,
      email: memberData.email || null,
      phone: memberData.phone || null
    };

    // Best-effort: moduł custom może nie mieć tabeli członków — nie przerywamy zapisu.
    try { await supabase.from(ministry.table).insert([insertData]); } catch (e) { console.warn('ministry insert failed', ministry.table, e?.message); }
  };

  // Synchronizacja członkostw w grupach domowych (home_group_members) — wiele grup na osobę.
  const syncHomeGroups = async (memberData, ids = []) => {
    const email = memberData.email;
    if (!email) return; // bez e-maila nie ma jak powiązać
    const want = new Set((ids || []).map(String));
    const { data: cur } = await supabase.from('home_group_members').select('id, group_id').eq('email', email);
    const curIds = new Set((cur || []).map((r) => String(r.group_id)));
    const fullName = `${memberData.first_name || ''} ${memberData.last_name || ''}`.trim();
    for (const gid of want) {
      if (!curIds.has(gid)) {
        try { await supabase.from('home_group_members').insert([{ full_name: fullName, email, phone: memberData.phone || null, group_id: gid }]); } catch (e) { console.warn('home_group_members insert', e?.message); }
      }
    }
    for (const r of (cur || [])) {
      if (!want.has(String(r.group_id))) {
        try { await supabase.from('home_group_members').delete().eq('id', r.id); } catch (e) { console.warn('home_group_members delete', e?.message); }
      }
    }
  };

  // Funkcja do usuwania członka ze służby
  const removeMemberFromMinistry = async (ministry, email) => {
    if (!ministry.table || !email) return;

    await supabase
      .from(ministry.table)
      .delete()
      .eq('email', email);
  };

  // Synchronizacja służb
  const syncMinistries = async (memberData, oldMinistries = []) => {
    const newMinistries = memberData.ministries || [];

    // Usuń ze służb, z których został usunięty
    for (const ministryKey of oldMinistries) {
      if (!newMinistries.includes(ministryKey)) {
        const ministry = MINISTRY_OPTIONS.find(m => m.key === ministryKey);
        if (ministry) {
          await removeMemberFromMinistry(ministry, memberData.email);
        }
      }
    }

    // Dodaj do nowych służb
    for (const ministryKey of newMinistries) {
      if (!oldMinistries.includes(ministryKey)) {
        const ministry = MINISTRY_OPTIONS.find(m => m.key === ministryKey);
        if (ministry) {
          await addMemberToMinistry(ministry, memberData);
        }
      }
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const { id, home_group_ids = [], ...dataToSave } = formData;

      if (!dataToSave.first_name || !dataToSave.last_name) {
        toast.error(tr('Imię i nazwisko są wymagane'));
        setSaving(false);
        return;
      }

      // Jeśli status nie jest "Członek", wyczyść pola członkostwa
      if (dataToSave.status !== 'Członek') {
        dataToSave.membership_date = null;
        dataToSave.membership_declaration_url = null;
      }

      // Konwertuj puste stringi na null dla pól opcjonalnych
      if (!dataToSave.membership_date) dataToSave.membership_date = null;
      if (!dataToSave.membership_declaration_url) dataToSave.membership_declaration_url = null;
      dataToSave.home_group_id = home_group_ids[0] || null; // primary (kompatybilność/widoczność)
      if (!dataToSave.household_id) dataToSave.household_id = null;
      if (!dataToSave.address) dataToSave.address = null;
      if (!dataToSave.email) dataToSave.email = null;
      if (!dataToSave.phone) dataToSave.phone = null;
      if (!dataToSave.birth_date) dataToSave.birth_date = null;
      if (!dataToSave.notes) dataToSave.notes = null;
      if (!Array.isArray(dataToSave.tags)) dataToSave.tags = [];
      if (!dataToSave.campus_id) dataToSave.campus_id = campusIdForInsert;

      // Pobierz stare dane członka (jeśli edycja)
      let oldMinistries = [];
      if (id) {
        const { data: oldMember } = await supabase
          .from('members')
          .select('ministries')
          .eq('id', id)
          .single();
        oldMinistries = oldMember?.ministries || [];
      }

      if (id) {
        const { error } = await supabase
          .from('members')
          .update(dataToSave)
          .eq('id', id);
        if (error) {
          console.error('Supabase update error:', error);
          toast.error(tr('Błąd zapisu: ') + (error.message || JSON.stringify(error)));
          setSaving(false);
          return;
        }
      } else {
        const { error } = await supabase
          .from('members')
          .insert([dataToSave]);
        if (error) {
          console.error('Supabase insert error:', error);
          toast.error(tr('Błąd zapisu: ') + (error.message || JSON.stringify(error)));
          setSaving(false);
          return;
        }
      }

      // Synchronizuj służby
      await syncMinistries({ ...dataToSave, email: dataToSave.email }, oldMinistries);
      // Synchronizuj członkostwa w grupach domowych (wiele grup) → home_group_members.
      await syncHomeGroups({ ...dataToSave, email: dataToSave.email }, home_group_ids);

      setShowModal(false);
      fetchData();
    } catch (error) {
      console.error('Błąd zapisu:', error);
      toast.error(tr('Wystąpił błąd podczas zapisywania.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm(tr('Czy na pewno chcesz usunąć tego członka?'))) return;

    try {
      // Pobierz dane członka przed usunięciem
      const { data: member } = await supabase
        .from('members')
        .select('*')
        .eq('id', id)
        .single();

      if (member) {
        // Usuń ze wszystkich służb
        for (const ministryKey of (member.ministries || [])) {
          const ministry = MINISTRY_OPTIONS.find(m => m.key === ministryKey);
          if (ministry) {
            await removeMemberFromMinistry(ministry, member.email);
          }
        }
        // Usuń z grup domowych.
        if (member.email) { try { await supabase.from('home_group_members').delete().eq('email', member.email); } catch { /* best-effort */ } }

        // Usuń deklarację jeśli istnieje
        if (member.membership_declaration_url) {
          const path = member.membership_declaration_url.split('/').slice(-2).join('/');
          await supabase.storage.from('membership-declarations').remove([path]);
        }
      }

      const { error } = await supabase
        .from('members')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchData();
    } catch (error) {
      console.error('Błąd usuwania:', error);
    }
  };

  const openModal = (member = null) => {
    if (member) {
      setFormData({
        ...member,
        address: member.address || '',
        home_group_id: member.home_group_id || '',
        home_group_ids: hgIdsByEmail[(member.email || '').toLowerCase()] || (member.home_group_id ? [member.home_group_id] : []),
        household_id: member.household_id || '',
        status: member.status || 'Sympatyk',
        membership_date: member.membership_date || '',
        membership_declaration_url: member.membership_declaration_url || '',
        ministries: member.ministries || [],
        birth_date: member.birth_date || '',
        notes: member.notes || '',
        tags: member.tags || []
      });
    } else {
      setFormData({
        id: null,
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        address: '',
        home_group_id: '',
        home_group_ids: [],
        household_id: '',
        status: 'Sympatyk',
        membership_date: '',
        membership_declaration_url: '',
        ministries: [],
        birth_date: '',
        notes: '',
        tags: [],
        campus_id: campusIdForInsert
      });
    }
    setShowModal(true);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast.error(tr('Proszę wybrać plik PDF'));
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error(tr('Plik jest za duży. Maksymalny rozmiar to 10MB'));
      return;
    }

    setUploading(true);
    try {
      const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const filePath = `declarations/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('membership-declarations')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('membership-declarations')
        .getPublicUrl(filePath);

      setFormData(prev => ({
        ...prev,
        membership_declaration_url: publicUrl
      }));
    } catch (error) {
      console.error('Błąd uploadu:', error);
      toast.error(tr('Błąd podczas przesyłania pliku'));
    } finally {
      setUploading(false);
    }
  };

  const removeDeclaration = async () => {
    if (formData.membership_declaration_url) {
      try {
        const path = formData.membership_declaration_url.split('/').slice(-2).join('/');
        await supabase.storage.from('membership-declarations').remove([path]);
      } catch (error) {
        console.error('Błąd usuwania pliku:', error);
      }
    }
    setFormData(prev => ({
      ...prev,
      membership_declaration_url: ''
    }));
  };

  const toggleMinistry = (ministryKey) => {
    setFormData(prev => ({
      ...prev,
      ministries: prev.ministries.includes(ministryKey)
        ? prev.ministries.filter(m => m !== ministryKey)
        : [...prev.ministries, ministryKey]
    }));
  };

  const getHomeGroupName = (groupId) => {
    const group = homeGroups.find(g => g.id === groupId);
    return group?.name || '';
  };

  const getHousehold = (householdId) => {
    return households.find(h => h.id === householdId);
  };

  const getMinistryLabels = (ministries) => {
    if (!ministries || ministries.length === 0) return [];
    return ministries.map(key => {
      const ministry = MINISTRY_OPTIONS.find(m => m.key === key);
      return ministry?.label || (key === 'home_groups' ? tr('Grupy domowe') : key);
    });
  };

  const filteredMembers = members.filter(member => {
    const matchesSearch = (
      (member.first_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (member.last_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (member.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      getHomeGroupName(member.home_group_id).toLowerCase().includes(searchTerm.toLowerCase())
    );

    const matchesStatus = statusFilter === 'all'
      ? true
      : member.status === statusFilter;

    const matchesTag = !tagFilter || (member.tags || []).includes(tagFilter);

    return matchesSearch && matchesStatus && matchesTag;
  });

  // Wszystkie unikalne tagi (do filtrowania listy).
  const allTags = Array.from(new Set(members.flatMap((m) => m.tags || []))).sort();

  const getStatusColor = (status) => {
    switch (status) {
      case 'Członek':
        return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200/50 dark:border-green-800/50';
      case 'Sympatyk':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200/50 dark:border-blue-800/50';
      case 'Gość':
        return 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200/50 dark:border-gray-700/50';
      default:
        return 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200/50 dark:border-gray-700/50';
    }
  };

  if (loading) {
    return (
      <div className="p-10 text-center">
        <Spinner size={48} className="mx-auto" />
        <div className="mt-4 text-gray-600 dark:text-gray-400">{tr('Ładowanie bazy członków...')}</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader moduleKey="members" icon={Users} title={tr('Baza Członków')} />

      {/* TAB NAVIGATION */}
      <ResponsiveTabs moduleKey="members"
        tabs={[
          { id: 'members', label: t('Członkowie'), icon: Users },
          { id: 'attendance', label: t('Obecność'), icon: CheckCircle },
          { id: 'households', label: t('Rodziny'), icon: Home },
          ...(canCare ? [{ id: 'care', label: t('Opieka'), icon: HeartHandshake }] : []),
          { id: 'files', label: t('Pliki'), icon: FolderOpen },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* MEMBERS TAB */}
      {activeTab === 'members' && (
      <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 transition-colors duration-300">

        {/* Kafelki statystyk (klik = filtr statusu) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {[
            { key: 'all', label: tr('Wszyscy'), count: members.length, Icon: Users, color: 'text-accent-primary' },
            { key: 'Członek', label: tr('Członkowie'), count: members.filter((m) => m.status === 'Członek').length, Icon: CheckCircle, color: 'text-green-500' },
            { key: 'Sympatyk', label: tr('Sympatycy'), count: members.filter((m) => m.status === 'Sympatyk').length, Icon: HeartHandshake, color: 'text-blue-500' },
            { key: 'Gość', label: tr('Goście'), count: members.filter((m) => m.status === 'Gość').length, Icon: Users, color: 'text-gray-400' },
          ].map((s) => (
            <button key={s.key} onClick={() => setStatusFilter(s.key)}
              className={`text-left rounded-2xl border p-4 transition bg-white dark:bg-gray-800 ${statusFilter === s.key ? 'border-accent-primary ring-2 ring-accent-primary/20' : 'border-gray-200 dark:border-gray-700 hover:border-accent-primary-lighter dark:hover:border-accent-primary-dark'}`}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{s.label}</span>
                <s.Icon size={16} className={s.color} />
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1 tabular-nums">{s.count}</div>
            </button>
          ))}
        </div>

        <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
          <div className="flex-1 w-full md:w-auto flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={20} />
              <input
                className="w-full pl-10 pr-4 py-2.5 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl focus:ring-2 focus:ring-accent-primary-light/20 outline-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 transition-colors"
                placeholder={t('Szukaj...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="flex bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm p-1 rounded-xl border border-gray-200/50 dark:border-gray-700/50 gap-1">
              <button onClick={() => setStatusFilter('all')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${statusFilter === 'all' ? 'bg-white dark:bg-gray-700 shadow text-accent-primary dark:text-accent-primary-light' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>{t('Wszyscy')}</button>
              <button onClick={() => setStatusFilter('Członek')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${statusFilter === 'Członek' ? 'bg-white dark:bg-gray-700 shadow text-green-600 dark:text-green-300' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>{t('Członkowie')}</button>
              <button onClick={() => setStatusFilter('Sympatyk')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${statusFilter === 'Sympatyk' ? 'bg-white dark:bg-gray-700 shadow text-blue-600 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>{t('Sympatycy')}</button>
              <button onClick={() => setStatusFilter('Gość')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${statusFilter === 'Gość' ? 'bg-white dark:bg-gray-700 shadow text-gray-600 dark:text-gray-300' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>{t('Goście')}</button>
            </div>
          </div>

          <Can cap="res:members:create">
          <button onClick={() => setShowBdayCfg(true)} title={tr('Przypomnienia urodzinowe')}
            className="whitespace-nowrap px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-1.5 text-sm">
            <Cake size={16} /> {tr('Przypomnienia')}
          </button>
          <Button data-tour="member-add" onClick={() => openModal()} icon={Plus} className="whitespace-nowrap">
            {t('Dodaj osobę')}
          </Button>
          </Can>
        </div>

        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-5">
            <span className="text-xs font-semibold text-gray-400 uppercase mr-1">{t('Tagi:')}</span>
            {allTags.map((t) => (
              <button
                key={t}
                onClick={() => setTagFilter(tagFilter === t ? null : t)}
                className={`text-xs px-2.5 py-1 rounded-full border transition ${tagFilter === t ? 'bg-accent-primary text-white border-accent-primary' : 'bg-white/50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-accent-primary-light'}`}
              >
                {t}
              </button>
            ))}
            {tagFilter && (
              <button onClick={() => setTagFilter(null)} className="text-xs text-gray-400 hover:text-red-500 ml-1">{t('wyczyść')}</button>
            )}
          </div>
        )}

        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[800px]">
            <thead className="bg-gradient-to-r from-accent-primary-lightest/80 to-accent-secondary-lightest/80 dark:from-accent-primary-darkest/20 dark:to-accent-secondary-darkest/20 text-gray-700 dark:text-gray-300 font-bold border-b border-gray-200/50 dark:border-gray-700/50">
              <tr>
                <th className="p-4 pl-6">{t('Osoba')}</th>
                <th className="p-4">{t('Kontakt & Adres')}</th>
                <th className="p-4">{t('Rodzina')}</th>
                <th className="p-4">{t('Grupa Domowa')}</th>
                <th className="p-4">{t('Służby')}</th>
                <th className="p-4">{t('Data urodzenia')}</th>
                <th className="p-4">{t('Obecność')}</th>
                <th className="p-4">{t('Status')}</th>
                <th className="p-4 pr-6 text-right">{t('Akcje')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200/50 dark:divide-gray-700/50">
              {filteredMembers.map((member) => (
                <tr key={member.id} className="hover:bg-accent-primary-lightest/30 dark:hover:bg-accent-primary-darkest/10 transition duration-200">
                  <td className="p-4 pl-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent-primary-lighter to-accent-secondary-lighter dark:from-accent-primary-darkest dark:to-accent-secondary-darkest flex items-center justify-center text-accent-primary dark:text-accent-primary-light font-bold shadow-sm border border-white dark:border-gray-700">
                        {member.first_name?.[0]}{member.last_name?.[0]}
                      </div>
                      <div>
                        <button onClick={() => setProfileMember(member)} className="font-bold text-gray-800 dark:text-gray-200 hover:text-accent-primary dark:hover:text-accent-primary-light transition text-left">{member.first_name} {member.last_name}</button>
                        {member.status === 'Członek' && member.membership_date && (
                          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                            <Calendar size={12} />
                            od {new Date(member.membership_date).toLocaleDateString('pl-PL')}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="p-4">
                    <div className="space-y-1">
                      {member.email && <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 text-xs"><Mail size={14} className="text-accent-primary-light" /> {member.email}</div>}
                      {member.phone && <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 text-xs"><Phone size={14} className="text-accent-secondary-light" /> {member.phone}</div>}
                      {member.address && <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 text-xs"><MapPin size={14} className="text-green-500" /> {member.address}</div>}
                    </div>
                  </td>

                  <td className="p-4">
                    {(() => {
                      const household = getHousehold(member.household_id);
                      return household ? (
                        <span className="inline-flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30 text-blue-700 dark:text-blue-300 px-2.5 py-1 rounded-md text-xs font-medium">
                          <Users size={12} /> {household.name}
                          {household.phone_last_four && <span className="text-blue-500 dark:text-blue-400">(...{household.phone_last_four})</span>}
                        </span>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-600 text-xs">-</span>
                      );
                    })()}
                  </td>

                  <td className="p-4">
                    {member.home_group_id ? (
                      <span className="inline-flex items-center gap-1.5 bg-accent-primary-lightest dark:bg-accent-primary-darkest/20 border border-accent-primary-lighter dark:border-accent-primary-dark/30 text-accent-primary dark:text-accent-primary-light px-2.5 py-1 rounded-md text-xs font-medium">
                        <Home size={12} /> {getHomeGroupName(member.home_group_id)}
                      </span>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-600 text-xs">-</span>
                    )}
                  </td>

                  <td className="p-4">
                    <div className="flex flex-col gap-1.5 items-start">
                      {member.ministries && member.ministries.length > 0 ? (
                        getMinistryLabels(member.ministries).map((label, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 px-2.5 py-1 rounded-md text-xs font-medium">
                            <User size={12} className="text-accent-primary-light" /> {label}
                          </span>
                        ))
                      ) : (
                        <span className="text-gray-400 dark:text-gray-600 text-xs">-</span>
                      )}
                    </div>
                  </td>

                  <td className="p-4 whitespace-nowrap">
                    {member.birth_date ? (
                      <span className={`inline-flex items-center gap-1.5 text-xs ${birthdaySoon(member.birth_date) ? 'text-accent-primary font-semibold' : 'text-gray-600 dark:text-gray-400'}`} title={birthdaySoon(member.birth_date) ? 'Urodziny w ciągu 7 dni' : undefined}>
                        <Cake size={13} className={birthdaySoon(member.birth_date) ? 'text-accent-primary' : 'text-gray-400'} /> {fmtBirth(member.birth_date)}
                      </span>
                    ) : <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>}
                  </td>

                  <td className="p-4">
                    {(() => {
                      const cnt = attendanceCount(member.id);
                      return (
                        <div className="flex items-center gap-2" title={`Obecność ostatnie 4 niedziele: ${cnt}/4`}>
                          <div className="flex gap-0.5">
                            {[...last4Sundays].reverse().map((d) => {
                              const on = attendanceByMember[String(member.id)]?.has(d);
                              return <span key={d} title={d} className={`w-2.5 h-4 rounded-sm ${on ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'}`} />;
                            })}
                          </div>
                          <span className={`text-xs font-medium ${cnt >= 3 ? 'text-green-600 dark:text-green-400' : cnt === 0 ? 'text-gray-400' : 'text-amber-600 dark:text-amber-400'}`}>{cnt * 25}%</span>
                        </div>
                      );
                    })()}
                  </td>

                  <td className="p-4">
                    <div className="flex flex-col gap-1.5">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${getStatusColor(member.status)}`}>
                        {member.status === 'Członek' ? <CheckCircle size={12} /> : member.status === 'Sympatyk' ? <Users size={12} /> : <XCircle size={12} />}
                        {tr(member.status || 'Gość')}
                      </span>
                      {member.status === 'Członek' && member.membership_declaration_url && (
                        <a
                          href={member.membership_declaration_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-accent-primary dark:text-accent-primary-light hover:underline"
                        >
                          <FileText size={12} /> Deklaracja
                        </a>
                      )}
                    </div>
                  </td>

                  <td className="p-4 pr-6 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setProfileMember(member)} title={t('Zobacz profil')} className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"><Eye size={18} /></button>
                      <Can cap="res:members:update"><button onClick={() => openModal(member)} className="p-2 text-accent-primary dark:text-accent-primary-light hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest/30 rounded-lg transition"><Edit2 size={18} /></button></Can>
                      <Can cap="res:members:delete"><button onClick={() => handleDelete(member.id)} className="p-2 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition"><Trash2 size={18} /></button></Can>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          {filteredMembers.length === 0 && (
            <EmptyState icon={Users} title={tr('Brak wyników do wyświetlenia')} />
          )}
        </div>
      </section>
      )}

      {/* ATTENDANCE TAB */}
      {activeTab === 'attendance' && (
        <AttendanceTab members={members} />
      )}

      {/* HOUSEHOLDS TAB */}
      {activeTab === 'households' && (
        <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors duration-300">
          <HouseholdManager />
        </section>
      )}

      {/* OPIEKA (CRM) — pełna kartoteka opieki (lista osób + notatki/opieka/kamienie/tagi/pola)
          oraz definicje pól własnych. Opieka per-członek jest też w profilu (ikona podglądu). */}
      {activeTab === 'care' && canCare && (
        <CareModule embedded />
      )}

      {/* FILES TAB */}
      {activeTab === 'files' && (
        <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors duration-300">
          <MaterialsTab moduleKey="members" canEdit={true} />
        </section>
      )}

      {/* MODAL */}
      {showModal && document.body && createPortal(
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[100] transition-opacity">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-2xl p-8 border border-gray-200 dark:border-gray-700 relative animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto custom-scrollbar">

            <div className="flex justify-between items-center mb-8">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                {formData.id ? 'Edytuj dane' : 'Nowa osoba'}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100/50 dark:hover:bg-gray-800/50 rounded-full transition">
                <X size={24} className="text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            <div className="space-y-5">
              {/* Imię i Nazwisko */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Imię *')}</label>
                  <input
                    data-tour="member-first"
                    className="w-full px-4 py-3 border border-gray-200/50 dark:border-gray-700/50 rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:ring-2 focus:ring-accent-primary-light/20 outline-none text-gray-900 dark:text-gray-100"
                    value={formData.first_name}
                    onChange={e => setFormData({ ...formData, first_name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Nazwisko *</label>
                  <input
                    data-tour="member-last"
                    className="w-full px-4 py-3 border border-gray-200/50 dark:border-gray-700/50 rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:ring-2 focus:ring-accent-primary-light/20 outline-none text-gray-900 dark:text-gray-100"
                    value={formData.last_name}
                    onChange={e => setFormData({ ...formData, last_name: e.target.value })}
                  />
                </div>
              </div>

              {/* Kontakt */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Email')}</label>
                <input
                  className="w-full px-4 py-3 border border-gray-200/50 dark:border-gray-700/50 rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:ring-2 focus:ring-accent-primary-light/20 outline-none text-gray-900 dark:text-gray-100"
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Telefon')}</label>
                  <input
                    className="w-full px-4 py-3 border border-gray-200/50 dark:border-gray-700/50 rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:ring-2 focus:ring-accent-primary-light/20 outline-none text-gray-900 dark:text-gray-100"
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                {/* DROPDOWN STATUSU */}
                <div>
                  <CustomSelect
                    label="Status"
                    value={formData.status}
                    options={STATUS_OPTIONS.map((s) => ({ value: s, label: tr(s) }))}
                    onChange={(val) => setFormData({ ...formData, status: val })}
                  />
                </div>
              </div>

              {/* Pola dla statusu "Członek" */}
              {formData.status === 'Członek' && (
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800/50 space-y-4">
                  <h4 className="font-bold text-green-800 dark:text-green-300 flex items-center gap-2">
                    <CheckCircle size={18} /> Dane członkostwa
                  </h4>

                  <CustomDatePicker
                    label={tr('Data członkostwa')}
                    value={formData.membership_date}
                    onChange={(date) => setFormData({ ...formData, membership_date: date })}
                    placeholder={tr('Wybierz datę członkostwa')}
                  />

                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Deklaracja członkostwa (PDF)')}</label>
                    {formData.membership_declaration_url ? (
                      <div className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                        <FileText size={24} className="text-accent-primary-light" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{tr('Deklaracja załączona')}</p>
                          <a
                            href={formData.membership_declaration_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-accent-primary dark:text-accent-primary-light hover:underline flex items-center gap-1"
                          >
                            <Eye size={12} /> Podgląd
                          </a>
                        </div>
                        <button
                          onClick={removeDeclaration}
                          className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl cursor-pointer hover:border-accent-primary-light dark:hover:border-accent-primary-light transition bg-white/50 dark:bg-gray-800/50">
                        <div className="flex flex-col items-center justify-center">
                          {uploading ? (
                            <Spinner size={24} />
                          ) : (
                            <>
                              <Upload size={24} className="text-gray-400 mb-2" />
                              <p className="text-sm text-gray-500 dark:text-gray-400">{tr('Kliknij, aby dodać plik PDF')}</p>
                            </>
                          )}
                        </div>
                        <input
                          type="file"
                          accept=".pdf"
                          className="hidden"
                          onChange={handleFileUpload}
                          disabled={uploading}
                        />
                      </label>
                    )}
                  </div>
                </div>
              )}

              {/* Nowe pole Adres */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Adres Zamieszkania</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    className="w-full pl-10 pr-4 py-3 border border-gray-200/50 dark:border-gray-700/50 rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:ring-2 focus:ring-accent-primary-light/20 outline-none text-gray-900 dark:text-gray-100"
                    placeholder="Ulica, numer domu, miasto"
                    value={formData.address}
                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                  />
                </div>
              </div>

              {/* Data urodzenia */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Data urodzenia</label>
                <CustomDatePicker
                  value={formData.birth_date || ''}
                  onChange={(val) => setFormData({ ...formData, birth_date: val })}
                />
              </div>

              {/* Tagi */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Tagi')}</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {(formData.tags || []).map((t) => (
                    <span key={t} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light">
                      {t}
                      <button type="button" onClick={() => setFormData({ ...formData, tags: formData.tags.filter((x) => x !== t) })} className="hover:text-red-500">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
                <input
                  className="w-full px-4 py-3 border border-gray-200/50 dark:border-gray-700/50 rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:ring-2 focus:ring-accent-primary-light/20 outline-none text-gray-900 dark:text-gray-100"
                  placeholder={tr('Wpisz tag i naciśnij Enter (np. nowy, do odwiedzenia)')}
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const t = tagInput.trim();
                      if (t && !(formData.tags || []).includes(t)) {
                        setFormData({ ...formData, tags: [...(formData.tags || []), t] });
                      }
                      setTagInput('');
                    }
                  }}
                />
              </div>

              {/* Notatki */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Notatki (widoczne dla zespołu)')}</label>
                <textarea
                  className="w-full px-4 py-3 border border-gray-200/50 dark:border-gray-700/50 rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:ring-2 focus:ring-accent-primary-light/20 outline-none text-gray-900 dark:text-gray-100 h-24 resize-none"
                  placeholder="Notatki duszpasterskie, historia kontaktu…"
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>

              {/* Rodzina (Household) */}
              <CustomSelect
                label="Rodzina (do Check-in)"
                placeholder={tr('Wybierz rodzinę...')}
                value={formData.household_id}
                onChange={(val) => setFormData({ ...formData, household_id: val })}
                options={[{ id: '', name: 'Brak', phone_last_four: '' }, ...households]}
                mapOptionToValue={(opt) => opt.id}
                mapOptionToLabel={(opt) => opt.name + (opt.phone_last_four ? ` (tel. ...${opt.phone_last_four})` : '')}
                icon={Users}
              />

              {/* Grupy Domowe (wiele) */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Grupy domowe')}</label>
                {homeGroups.length === 0 ? (
                  <p className="text-sm text-gray-400">{tr('Brak grup domowych')}</p>
                ) : (
                  <div className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 p-3">
                    <div className="flex flex-wrap gap-2">
                      {homeGroups.map((g) => {
                        const sel = (formData.home_group_ids || []).some((x) => String(x) === String(g.id));
                        return (
                          <button key={g.id} type="button"
                            onClick={() => setFormData((f) => ({ ...f, home_group_ids: sel ? f.home_group_ids.filter((x) => String(x) !== String(g.id)) : [...(f.home_group_ids || []), g.id] }))}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${sel ? 'bg-gradient-to-r from-accent-primary-light to-accent-secondary-light text-white shadow-md' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
                            <Home size={13} /> {g.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Kampus */}
              {campuses.length > 0 && (
                <CustomSelect
                  label={tr('Kampus')}
                  placeholder={tr('Wybierz kampus...')}
                  value={formData.campus_id ? String(formData.campus_id) : ''}
                  onChange={(val) => setFormData({ ...formData, campus_id: val ? parseInt(val, 10) : null })}
                  options={[{ value: '', label: tr('Brak') }, ...campuses.map(c => ({ value: String(c.id), label: c.name + (c.city ? ` (${c.city})` : '') }))]}
                  icon={MapPin}
                />
              )}

              {/* Służby */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Służby')}</label>
                <div className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 p-3">
                  <div className="flex flex-wrap gap-2">
                    {MINISTRY_OPTIONS.map(ministry => {
                      const isSelected = formData.ministries.includes(ministry.key);
                      return (
                        <button
                          key={ministry.key}
                          type="button"
                          onClick={() => toggleMinistry(ministry.key)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-gradient-to-r from-accent-primary-light to-accent-secondary-light text-white shadow-md'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                          }`}
                        >
                          {isSelected && <Check size={14} />}
                          {ministry.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  {tr('Wybór służby automatycznie doda osobę do odpowiedniego modułu.')}
                </p>
              </div>

              <div className="pt-6 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3">
                <Button variant="outline" size="lg" onClick={() => setShowModal(false)}>{tr('Anuluj')}</Button>
                <Button size="lg" data-tour="member-save" onClick={handleSave} loading={saving}>
                  {saving ? 'Zapisywanie...' : 'Zapisz'}
                </Button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {profileMember && (
        <MemberProfile
          member={profileMember}
          members={members}
          homeGroups={homeGroups}
          households={households}
          getMinistryLabels={getMinistryLabels}
          onClose={() => setProfileMember(null)}
          onEdit={(m) => { setProfileMember(null); openModal(m); }}
        />
      )}

      {/* Konfiguracja przypomnień urodzinowych */}
      {showBdayCfg && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200 dark:border-gray-700 flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h3 className="font-bold text-lg text-gray-800 dark:text-white flex items-center gap-2"><Cake size={18} className="text-accent-primary" /> {tr('Przypomnienia urodzinowe')}</h3>
              <button onClick={() => setShowBdayCfg(false)} className="text-gray-400 hover:text-gray-600"><X size={22} /></button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200 cursor-pointer">
                <input type="checkbox" checked={!!bdayCfg.enabled} onChange={(e) => setBdayCfg({ ...bdayCfg, enabled: e.target.checked })} className="w-4 h-4 rounded accent-accent-primary" />
                {tr('Włącz automatyczne przypomnienia')}
              </label>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Kiedy wysyłać')}</label>
                  <CustomSelect value={bdayCfg.schedule} onChange={(v) => setBdayCfg({ ...bdayCfg, schedule: v })}
                    options={[{ value: 'daily', label: tr('Codziennie') }, { value: 'weekly', label: tr('Raz w tygodniu') }]} />
                </div>
                {bdayCfg.schedule === 'weekly' && (
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Dzień tygodnia')}</label>
                    <CustomSelect value={String(bdayCfg.weekday)} onChange={(v) => setBdayCfg({ ...bdayCfg, weekday: parseInt(v, 10) })}
                      options={[{ value: '1', label: 'Poniedziałek' }, { value: '2', label: 'Wtorek' }, { value: '3', label: 'Środa' }, { value: '4', label: 'Czwartek' }, { value: '5', label: 'Piątek' }, { value: '6', label: 'Sobota' }, { value: '0', label: 'Niedziela' }]} />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Ile dni wcześniej')}</label>
                  <input type="number" min="0" max="31" value={bdayCfg.days_ahead} onChange={(e) => setBdayCfg({ ...bdayCfg, days_ahead: parseInt(e.target.value || '0', 10) })}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" />
                  <p className="text-[11px] text-gray-400 mt-1 ml-1">0 = tylko w dniu urodzin. Dla „raz w tygodniu" np. 7 = cały tydzień.</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Kanał')}</label>
                  <CustomSelect value={bdayCfg.channel} onChange={(v) => setBdayCfg({ ...bdayCfg, channel: v })}
                    options={[{ value: 'email', label: 'E-mail' }, { value: 'push', label: 'Push' }, { value: 'both', label: tr('E-mail + Push') }]} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Odbiorcy — role')}</label>
                <div className="flex flex-wrap gap-1.5">
                  {roleList.length === 0 ? <span className="text-xs text-gray-400">{tr('Brak ról')}</span> : roleList.map((r) => {
                    const on = (bdayCfg.recipients?.roles || []).includes(r.key);
                    return (
                      <button key={r.key} type="button"
                        onClick={() => setBdayCfg((c) => ({ ...c, recipients: { ...c.recipients, roles: on ? c.recipients.roles.filter((x) => x !== r.key) : [...(c.recipients.roles || []), r.key] } }))}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${on ? 'bg-accent-primary text-white border-accent-primary' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'}`}>
                        {r.label || r.key}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Dodatkowe e-maile')}</label>
                <div className="flex items-center gap-2">
                  <input value={bdayEmail} onChange={(e) => setBdayEmail(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && bdayEmail.trim()) { setBdayCfg((c) => ({ ...c, recipients: { ...c.recipients, emails: [...new Set([...(c.recipients.emails || []), bdayEmail.trim()])] } })); setBdayEmail(''); } }}
                    placeholder="jan@example.com + Enter" className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" />
                </div>
                {(bdayCfg.recipients?.emails || []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {bdayCfg.recipients.emails.map((em) => (
                      <span key={em} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200">
                        {em}
                        <button onClick={() => setBdayCfg((c) => ({ ...c, recipients: { ...c.recipients, emails: c.recipients.emails.filter((x) => x !== em) } }))} className="text-gray-400 hover:text-red-500"><X size={12} /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Treść powiadomienia')}</label>
                <textarea rows={2} value={bdayCfg.message} onChange={(e) => setBdayCfg({ ...bdayCfg, message: e.target.value })}
                  placeholder={tr('Pamiętajmy o życzeniach dla najbliższych solenizantów.')}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm resize-none" />
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <button onClick={() => setShowBdayCfg(false)} className="px-4 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">{tr('Anuluj')}</button>
              <button onClick={saveBdayCfg} disabled={bdaySaving} className="px-4 py-2 text-sm rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium disabled:opacity-60">{bdaySaving ? tr('Zapisywanie…') : tr('Zapisz')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
