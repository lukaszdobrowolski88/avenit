import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import Spinner from '../components/Spinner';
import Modal from '../components/Modal';
import { supabase } from '../lib/supabase';
import {
  Plus, Search, Trash2, Edit2, X, User,
  Mail, Phone, CheckCircle,
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
import { DataTable, THead, TH, TR, TD, StatusPill, STATUS_COLORS } from '../components/ui/DataTable';
import { brandTone } from '../lib/brandTone';
import HouseholdManager from './Kids/components/HouseholdManager';
import { useCampusQuery } from '../hooks/useCampusQuery';
import { useCampus } from '../contexts/CampusContext';
import { useModuleLabel } from '../hooks/useModuleLabel';
import { useModules } from '../hooks/useModules';
import { tr, appLocale } from '../i18n';
import { toast } from '../lib/toast';
import { openProtectedFile } from '../lib/protectedFiles';
import { confirmDialog } from '../lib/dialog';
import { memberGroupIds, memberGroupLinks, planMembershipSync, rowMatchesPerson } from './HomeGroups/homeGroupUtils';

// --- STAŁE DANE ---

const STATUS_OPTIONS = [
  "Członek",
  "Sympatyk",
  "Gość"
];

// Lista służb budowana dynamicznie w komponencie (etykiety per tenant + moduły custom).
// Grupy domowe mają osobny, wielokrotny wybór (nie jako pojedyncza „służba").
const MINISTRY_SYS_KEYS = new Set(['worship', 'media', 'atmosfera', 'kids', 'mc', 'homegroups', 'programs', 'dashboard', 'calendar', 'general', 'members', 'finance', 'teaching', 'prayer_wall', 'boards']);

const EMPTY_FORM = {
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
};

const fullName = (m) => `${m?.first_name || ''} ${m?.last_name || ''}`.trim();

// Pole formularza z czerwoną ramką przy błędzie (komunikat pod polem, nie tylko w toaście).
const inputCls = (err) => `w-full px-4 py-3 border rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:ring-2 outline-none text-gray-900 dark:text-gray-100 ${err ? 'border-red-400 dark:border-red-500 focus:ring-red-300/40' : 'border-gray-200/50 dark:border-gray-700/50 focus:ring-accent-primary-light/20'}`;
const labelCls = 'block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const [searchParams, setSearchParams] = useSearchParams();

  // Służby: etykiety z konfiguracji modułów tenanta (nie hardcode) + moduły custom + MC.
  const lblWorship = useModuleLabel('worship', tr('Grupa Uwielbienia'));
  const lblMedia = useModuleLabel('media', tr('Media Team'));
  const lblAtmosfera = useModuleLabel('atmosfera', tr('Atmosfera Team'));
  const lblKids = useModuleLabel('kids', tr('Małe Avenit'));
  const lblMc = useModuleLabel('mc', tr('Scena / MC'));
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
  // Członkostwa w grupach domowych (home_group_members) — wiele grup na osobę, rola per grupa.
  // null = brak dostępu do modułu Grupy domowe (wtedy zostaje tylko members.home_group_id).
  const [hgRows, setHgRows] = useState(null);

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
    } catch (e) { toast.error(e, { fallback: tr('Nie udało się zapisać konfiguracji przypomnień.') }); }
    finally { setBdaySaving(false); }
  };

  // Stan modala
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileMember, setProfileMember] = useState(null);
  const [tagInput, setTagInput] = useState('');
  const [tagFilter, setTagFilter] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const baselineRef = useRef(JSON.stringify(EMPTY_FORM)); // stan wyjściowy (Esc/Anuluj pytają o zmiany)
  const prevPersonRef = useRef(null); // osoba sprzed edycji (zmiana e-maila / nazwiska)
  const firstNameRef = useRef(null);
  const lastNameRef = useRef(null);
  const emailRef = useRef(null);
  const [highlightId, setHighlightId] = useState(null); // świeżo dodana/zmieniona osoba

  // Upload state
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchData();
  }, [selectedCampusId]);

  // Głęboki link (np. z wyszukiwarki ⌘K): /members?member=<id> otwiera profil osoby.
  const deepMemberId = searchParams.get('member');
  useEffect(() => {
    if (!deepMemberId || loading) return undefined;
    let alive = true;
    (async () => {
      let m = members.find((x) => String(x.id) === String(deepMemberId));
      if (!m) {
        const { data } = await supabase.from('members').select('*').eq('id', deepMemberId).maybeSingle();
        m = data || null;
      }
      if (!alive) return;
      if (m) { setActiveTab('members'); setProfileMember(m); }
      else toast.info(tr('Nie znaleziono tej osoby. Mogła zostać usunięta.'));
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepMemberId, loading]);

  const closeProfile = () => {
    setProfileMember(null);
    if (searchParams.get('member')) {
      setSearchParams((prev) => { const p = new URLSearchParams(prev); p.delete('member'); return p; }, { replace: true });
    }
  };

  // Po dodaniu osoby: przewiń do niej i podświetl na chwilę (przy długiej liście nie ginie).
  useEffect(() => {
    if (!highlightId || loading) return undefined;
    const raf = requestAnimationFrame(() => {
      const els = [
        document.querySelector(`[data-member-row="${highlightId}"]`),
        document.querySelector(`[data-member-card="${highlightId}"]`),
      ].filter((el) => el && el.offsetParent !== null);
      try { els[0]?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch { /* starsze przeglądarki */ }
    });
    const tm = setTimeout(() => setHighlightId(null), 4000);
    return () => { cancelAnimationFrame(raf); clearTimeout(tm); };
  }, [highlightId, loading, members]);

  const fetchData = async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const [membersResult, groupsResult, householdsResult, hgmResult, attResult] = await Promise.all([
        withCampusFilter(supabase.from('members').select('*')).order('last_name'),
        supabase.from('home_groups').select('id, name').order('name').then((r) => r, () => ({ data: [], error: true })),
        supabase.from('households').select('*').order('name').then((r) => r, () => ({ data: [], error: true })),
        supabase.from('home_group_members').select('id, group_id, email, full_name, phone, role, is_leader').then((r) => r, () => ({ data: null, error: true })),
        supabase.from('attendance').select('member_id, date').eq('present', true).in('date', last4Sundays).then((r) => r, () => ({ data: [] })),
      ]);

      if (membersResult.error) throw membersResult.error;

      setMembers(membersResult.data || []);
      // Grupy domowe i rodziny są pomocnicze — brak dostępu do tych modułów nie blokuje listy osób.
      setHomeGroups(groupsResult.error ? [] : (groupsResult.data || []));
      setHouseholds(householdsResult.error ? [] : (householdsResult.data || []));
      setHgRows(hgmResult.error ? null : (hgmResult.data || []));
      // Obecność ostatnich 4 niedziel: member_id → zbiór dat.
      const att = {};
      (attResult.data || []).forEach((r) => {
        if (r.member_id == null || !r.date) return;
        const k = String(r.member_id);
        (att[k] = att[k] || new Set()).add(String(r.date).slice(0, 10));
      });
      setAttendanceByMember(att);
    } catch (error) {
      toast.error(error, { fallback: tr('Nie udało się wczytać listy osób. Odśwież stronę.') });
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  // Funkcja do dodawania członka do służby. Zwraca true, gdy się udało (albo osoba już tam jest).
  const addMemberToMinistry = async (ministry, memberData) => {
    if (!ministry.table) return true; // Administracja nie ma tabeli

    const name = fullName(memberData);

    // Sprawdź czy już istnieje (po e-mailu, a bez e-maila po imieniu i nazwisku)
    const base = supabase.from(ministry.table).select('id');
    const { data: existing } = await (memberData.email ? base.eq('email', memberData.email) : base.eq('full_name', name)).maybeSingle();

    if (existing) return true; // Już istnieje

    const insertData = {
      full_name: name,
      email: memberData.email || null,
      phone: memberData.phone || null
    };

    // Moduł custom może nie mieć tabeli członków — nie przerywamy zapisu osoby.
    try {
      const { error } = await supabase.from(ministry.table).insert([insertData]);
      return !error;
    } catch (e) { console.warn('ministry insert failed', ministry.table, e?.message); return false; }
  };

  // Synchronizacja członkostw w grupach domowych (home_group_members) — wiele grup na osobę.
  // Osoba bez e-maila jest wiązana po imieniu i nazwisku (wcześniej zapisywała się tylko 1. grupa).
  // Zwraca true, gdy wszystko się udało.
  const syncHomeGroups = async (memberData, ids = [], prev = null) => {
    if (hgRows === null) return true; // brak dostępu do Grup domowych — zostaje home_group_id
    const { data: rows, error: readErr } = await supabase.from('home_group_members').select('id, group_id, email, full_name, phone, role');
    if (readErr) return false;
    const plan = planMembershipSync({ rows: rows || [], person: memberData, prev, wantIds: ids });
    let ok = true;
    const name = fullName(memberData);
    for (const gid of plan.inserts) {
      const { error } = await supabase.from('home_group_members').insert([{ full_name: name, email: memberData.email || null, phone: memberData.phone || null, group_id: gid, role: 'member', is_leader: false }]);
      if (error) ok = false;
    }
    for (const u of plan.updates) {
      const { error } = await supabase.from('home_group_members').update(u.patch).eq('id', u.id);
      if (error) ok = false;
    }
    for (const id of plan.deletes) {
      const { error } = await supabase.from('home_group_members').delete().eq('id', id);
      if (error) ok = false;
    }
    return ok;
  };

  // Funkcja do usuwania członka ze służby
  const removeMemberFromMinistry = async (ministry, email) => {
    if (!ministry.table || !email) return true;

    const { error } = await supabase
      .from(ministry.table)
      .delete()
      .eq('email', email);
    return !error;
  };

  // Synchronizacja służb
  const syncMinistries = async (memberData, oldMinistries = []) => {
    const newMinistries = memberData.ministries || [];
    let ok = true;

    // Usuń ze służb, z których został usunięty
    for (const ministryKey of oldMinistries) {
      if (!newMinistries.includes(ministryKey)) {
        const ministry = MINISTRY_OPTIONS.find(m => m.key === ministryKey);
        if (ministry && !(await removeMemberFromMinistry(ministry, memberData.email))) ok = false;
      }
    }

    // Dodaj do nowych służb
    for (const ministryKey of newMinistries) {
      if (!oldMinistries.includes(ministryKey)) {
        const ministry = MINISTRY_OPTIONS.find(m => m.key === ministryKey);
        if (ministry && !(await addMemberToMinistry(ministry, memberData))) ok = false;
      }
    }
    return ok;
  };

  const validate = (data) => {
    const next = {};
    if (!String(data.first_name || '').trim()) next.first_name = tr('Podaj imię.');
    if (!String(data.last_name || '').trim()) next.last_name = tr('Podaj nazwisko.');
    if (data.email && !EMAIL_RE.test(String(data.email).trim())) next.email = tr('Sprawdź adres e-mail — brakuje w nim „@” albo domeny.');
    return next;
  };

  const handleSave = async () => {
    const { id, home_group_ids = [], ...dataToSave } = formData;

    const found = validate(dataToSave);
    setErrors(found);
    if (Object.keys(found).length) {
      (found.first_name ? firstNameRef : found.last_name ? lastNameRef : emailRef).current?.focus();
      toast.error(tr('Uzupełnij zaznaczone pola.'));
      return;
    }

    try {
      setSaving(true);
      dataToSave.first_name = dataToSave.first_name.trim();
      dataToSave.last_name = dataToSave.last_name.trim();
      if (dataToSave.email) dataToSave.email = String(dataToSave.email).trim();

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

      let savedId = id;
      if (id) {
        const { error } = await supabase
          .from('members')
          .update(dataToSave)
          .eq('id', id);
        if (error) { toast.error(error, { fallback: tr('Nie udało się zapisać zmian. Spróbuj ponownie.') }); return; }
      } else {
        const { data: inserted, error } = await supabase
          .from('members')
          .insert([dataToSave])
          .select('id')
          .single();
        if (error) { toast.error(error, { fallback: tr('Nie udało się dodać osoby. Spróbuj ponownie.') }); return; }
        savedId = inserted?.id || null;
      }

      // Synchronizuj służby i członkostwa w grupach domowych (wiele grup) → home_group_members.
      const okMin = await syncMinistries({ ...dataToSave }, oldMinistries);
      const okHg = await syncHomeGroups({ ...dataToSave }, home_group_ids, id ? prevPersonRef.current : null);

      const name = fullName(dataToSave);
      toast.success(id ? tr('Zapisano zmiany: {name}', { name }) : tr('Dodano: {name}', { name }));
      if (!okHg) toast.error(tr('Osoba jest zapisana, ale nie udało się zaktualizować jej grup domowych. Sprawdź je w module Grupy domowe.'));
      else if (!okMin) toast.error(tr('Osoba jest zapisana, ale nie udało się zaktualizować wszystkich służb. Sprawdź je w modułach służb.'));

      setShowModal(false);
      setErrors({});
      if (savedId) setHighlightId(String(savedId));
      fetchData({ quiet: true });
    } catch (error) {
      toast.error(error, { fallback: tr('Wystąpił błąd podczas zapisywania.') });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (memberRow) => {
    const name = fullName(memberRow) || tr('ta osoba');
    const ok = await confirmDialog({
      title: tr('Usunąć osobę „{name}”?', { name }),
      message: tr('Zniknie z listy osób, z grup domowych i ze służb. Tej operacji nie można cofnąć.'),
      confirmLabel: tr('Usuń osobę'),
      danger: true,
    });
    if (!ok) return;

    try {
      // Pobierz dane członka przed usunięciem
      const { data: member } = await supabase
        .from('members')
        .select('*')
        .eq('id', memberRow.id)
        .maybeSingle();

      // Najpierw sam rekord osoby — sprzątanie (służby, grupy, plik) dopiero po udanym usunięciu,
      // żeby błąd nie zostawił osoby bez służb i bez deklaracji.
      const { error } = await supabase
        .from('members')
        .delete()
        .eq('id', memberRow.id);
      if (error) { toast.error(error, { fallback: tr('Nie udało się usunąć osoby. Spróbuj ponownie.') }); return; }

      const m = member || memberRow;
      for (const ministryKey of (m.ministries || [])) {
        const ministry = MINISTRY_OPTIONS.find(x => x.key === ministryKey);
        if (ministry) await removeMemberFromMinistry(ministry, m.email);
      }
      // Usuń z grup domowych (po e-mailu albo — bez e-maila — po imieniu i nazwisku).
      for (const r of (hgRows || []).filter((row) => rowMatchesPerson(row, m))) {
        await supabase.from('home_group_members').delete().eq('id', r.id);
      }
      // Usuń deklarację jeśli istnieje
      if (m.membership_declaration_url) {
        const path = m.membership_declaration_url.split('/').slice(-2).join('/');
        await supabase.storage.from('membership-declarations').remove([path]);
      }

      toast.success(tr('Usunięto: {name}', { name }));
      fetchData({ quiet: true });
    } catch (error) {
      toast.error(error, { fallback: tr('Nie udało się usunąć osoby. Spróbuj ponownie.') });
    }
  };

  const openModal = (member = null) => {
    let next;
    if (member) {
      next = {
        ...member,
        first_name: member.first_name || '',
        last_name: member.last_name || '',
        email: member.email || '',
        phone: member.phone || '',
        address: member.address || '',
        home_group_id: member.home_group_id || '',
        home_group_ids: memberGroupIds(member, hgRows || []),
        household_id: member.household_id || '',
        status: member.status || 'Sympatyk',
        membership_date: member.membership_date || '',
        membership_declaration_url: member.membership_declaration_url || '',
        ministries: member.ministries || [],
        birth_date: member.birth_date || '',
        notes: member.notes || '',
        tags: member.tags || []
      };
      prevPersonRef.current = { first_name: member.first_name, last_name: member.last_name, email: member.email, phone: member.phone };
    } else {
      next = { ...EMPTY_FORM, campus_id: campusIdForInsert };
      prevPersonRef.current = null;
    }
    setFormData(next);
    baselineRef.current = JSON.stringify(next);
    setErrors({});
    setTagInput('');
    setShowModal(true);
  };

  // Esc / X / Anuluj: przy wpisanych danych pytamy, zanim je stracimy.
  const requestCloseModal = async () => {
    const dirty = JSON.stringify(formData) !== baselineRef.current || tagInput.trim() !== '';
    if (dirty) {
      const ok = await confirmDialog({
        title: tr('Zamknąć bez zapisywania?'),
        message: tr('Wpisane dane nie zostaną zapisane.'),
        confirmLabel: tr('Zamknij bez zapisu'),
        cancelLabel: tr('Wróć do formularza'),
        danger: true,
      });
      if (!ok) return;
    }
    setShowModal(false);
    setErrors({});
  };

  const setField = (field, value) => {
    setFormData((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((e) => { const n = { ...e }; delete n[field]; return n; });
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
      toast.error(error, { fallback: tr('Błąd podczas przesyłania pliku') });
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

  // Grupy osoby z obu źródeł: home_group_members (po e-mailu / imieniu) + members.home_group_id.
  const groupLinksOf = (member) => memberGroupLinks(member, hgRows || [], homeGroups);

  const q = searchTerm.trim().toLowerCase();
  const filteredMembers = members.filter(member => {
    const matchesSearch = !q || (
      `${member.first_name || ''} ${member.last_name || ''}`.toLowerCase().includes(q) ||
      (member.email || '').toLowerCase().includes(q) ||
      (member.phone || '').replace(/\s/g, '').includes(q.replace(/\s/g, '')) ||
      groupLinksOf(member).some((g) => g.name.toLowerCase().includes(q))
    );

    const matchesStatus = statusFilter === 'all'
      ? true
      : member.status === statusFilter;

    const matchesTag = !tagFilter || (member.tags || []).includes(tagFilter);

    return matchesSearch && matchesStatus && matchesTag;
  });
  const filtersActive = !!q || statusFilter !== 'all' || !!tagFilter;
  const clearFilters = () => { setSearchTerm(''); setStatusFilter('all'); setTagFilter(null); };

  // Wszystkie unikalne tagi (do filtrowania listy).
  const allTags = Array.from(new Set(members.flatMap((m) => m.tags || []))).sort();

  const getStatusColor = (status) => {
    switch (status) {
      case 'Członek':
        return STATUS_COLORS.success;
      case 'Sympatyk':
        return STATUS_COLORS.info;
      default:
        return STATUS_COLORS.neutral;
    }
  };

  // Jeden filtr statusu z licznikami (zamiast kafli statystyk + osobnego przełącznika).
  const statusCounts = [
    { key: 'all', label: tr('Wszyscy'), count: members.length },
    { key: 'Członek', label: tr('Członkowie'), count: members.filter((m) => m.status === 'Członek').length },
    { key: 'Sympatyk', label: tr('Sympatycy'), count: members.filter((m) => m.status === 'Sympatyk').length },
    { key: 'Gość', label: tr('Goście'), count: members.filter((m) => m.status === 'Gość').length },
  ];

  const renderGroupChips = (member) => {
    const links = groupLinksOf(member);
    if (!links.length) return null;
    return (
      <div className="flex flex-wrap gap-1">
        {links.map((g) => (
          <span key={g.id} className="inline-flex items-center gap-1.5 bg-accent-primary-lightest dark:bg-accent-primary-darkest/20 text-accent-primary dark:text-accent-primary-light px-2 py-0.5 rounded-md text-xs font-medium">
            <Home size={12} aria-hidden="true" /> {g.name}{g.role === 'leader' ? ` · ${tr('lider')}` : ''}
          </span>
        ))}
      </div>
    );
  };

  const renderDeclaration = (member) => (member.status === 'Członek' && member.membership_declaration_url ? (
    <a
      href={member.membership_declaration_url}
      onClick={(e) => { e.preventDefault(); openProtectedFile(member.membership_declaration_url); }}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-accent-primary dark:text-accent-primary-light hover:underline"
    >
      <FileText size={12} aria-hidden="true" /> {tr('Deklaracja')}
    </a>
  ) : null);

  const renderActions = (member) => (
    <>
      <button type="button" onClick={() => setProfileMember(member)} title={t('Zobacz profil')} aria-label={tr('Zobacz profil: {name}', { name: fullName(member) })} className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"><Eye size={16} aria-hidden="true" /></button>
      <Can cap="res:members:update"><button type="button" onClick={() => openModal(member)} title={tr('Edytuj dane')} aria-label={tr('Edytuj dane: {name}', { name: fullName(member) })} className="p-2 text-accent-primary dark:text-accent-primary-light hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest/30 rounded-lg transition"><Edit2 size={16} aria-hidden="true" /></button></Can>
      <Can cap="res:members:delete"><button type="button" onClick={() => handleDelete(member)} title={tr('Usuń osobę')} aria-label={tr('Usuń osobę: {name}', { name: fullName(member) })} className="p-2 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition"><Trash2 size={16} aria-hidden="true" /></button></Can>
    </>
  );

  if (loading) {
    return <Spinner center label={tr('Ładowanie bazy członków...')} />;
  }

  return (
    <div className="space-y-8">
      <PageHeader moduleKey="members" icon={Users} title={tr('Baza członków')} />

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
      <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6 transition-colors duration-300">

        {/* Wyszukiwarka (na telefonie w osobnym wierszu, na pełną szerokość) + akcje */}
        <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
          <div className="relative w-full md:flex-1 md:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={20} aria-hidden="true" />
            <input
              type="search"
              aria-label={tr('Szukaj osoby')}
              className="w-full pl-10 pr-4 py-2.5 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl focus:ring-2 focus:ring-accent-primary-light/20 outline-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 transition-colors"
              placeholder={tr('Szukaj po imieniu, telefonie, e-mailu…')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <Can cap="res:members:create">
            <div className="flex gap-2 md:ml-auto">
              {/* Ustawienie całej organizacji (app_settings) — zapis wymaga manage_integrations jak inne ustawienia. */}
              <Can cap="action:settings:manage_integrations">
              <button type="button" onClick={() => setShowBdayCfg(true)} title={tr('Przypomnienia urodzinowe')} aria-label={tr('Przypomnienia urodzinowe')}
                className="whitespace-nowrap px-3 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center gap-1.5 text-sm font-medium">
                <Cake size={16} aria-hidden="true" /> <span className="hidden sm:inline">{tr('Przypomnienia urodzinowe')}</span>
              </button>
              </Can>
              <Button data-tour="member-add" onClick={() => openModal()} icon={Plus} className="whitespace-nowrap flex-1 md:flex-none">
                {t('Dodaj osobę')}
              </Button>
            </div>
          </Can>
        </div>

        {/* Filtr statusu z licznikami; na telefonie przewijany w poziomie, nie wystaje poza kartę */}
        <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto custom-scrollbar mb-5">
          <div role="group" aria-label={tr('Filtr statusu')} className="flex gap-1.5 w-max">
            {statusCounts.map((s) => {
              const on = statusFilter === s.key;
              return (
                <button key={s.key} type="button" onClick={() => setStatusFilter(s.key)} aria-pressed={on}
                  className={`px-3.5 py-2 rounded-full text-sm font-medium border transition whitespace-nowrap ${on ? 'bg-accent-primary text-white border-accent-primary' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-accent-primary-light'}`}>
                  {s.label} <span className={`ml-1 tabular-nums ${on ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'}`}>{s.count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-5">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mr-1">{t('Tagi:')}</span>
            {allTags.map((tg) => (
              <button
                key={tg}
                type="button"
                aria-pressed={tagFilter === tg}
                onClick={() => setTagFilter(tagFilter === tg ? null : tg)}
                className={`text-xs px-2.5 py-1 rounded-full border transition ${tagFilter === tg ? 'bg-accent-primary text-white border-accent-primary' : 'bg-white/50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-accent-primary-light'}`}
              >
                {tg}
              </button>
            ))}
            {tagFilter && (
              <button type="button" onClick={() => setTagFilter(null)} className="text-xs text-gray-500 hover:text-red-500 ml-1">{t('wyczyść')}</button>
            )}
          </div>
        )}

        {/* TELEFON: lista kart (imię, telefon do kliknięcia, status) zamiast szerokiej tabeli */}
        {filteredMembers.length > 0 && (
          <ul className="md:hidden space-y-2" aria-label={tr('Lista osób')}>
            {filteredMembers.map((member) => {
              const hl = highlightId && String(member.id) === String(highlightId);
              return (
                <li key={member.id} data-member-card={member.id}
                  className={`rounded-2xl border p-3 transition ${hl ? 'border-accent-primary ring-2 ring-accent-primary/30 bg-accent-primary-lightest/40 dark:bg-accent-primary-darkest/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}`}>
                  <div className="flex items-start gap-3">
                    <div data-tone={brandTone(fullName(member))} className="w-10 h-10 rounded-full bg-gradient-to-br from-accent-primary-lighter to-accent-secondary-lighter dark:from-accent-primary-darkest dark:to-accent-secondary-darkest flex items-center justify-center text-accent-primary dark:text-accent-primary-light font-bold shrink-0" aria-hidden="true">
                      {member.first_name?.[0]}{member.last_name?.[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <button type="button" onClick={() => setProfileMember(member)} className="font-bold text-gray-800 dark:text-gray-100 text-left leading-tight hover:text-accent-primary">
                          {member.first_name} {member.last_name}
                        </button>
                        <StatusPill color={getStatusColor(member.status)}>{tr(member.status || 'Gość')}</StatusPill>
                      </div>
                      {member.phone && (
                        <a href={`tel:${String(member.phone).replace(/\s/g, '')}`} className="mt-1 inline-flex items-center gap-1.5 text-sm text-accent-primary dark:text-accent-primary-light tabular-nums py-1">
                          <Phone size={14} aria-hidden="true" /> {member.phone}
                        </a>
                      )}
                      {member.email && <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{member.email}</div>}
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">{renderGroupChips(member)}{renderDeclaration(member)}</div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-1 mt-1">{renderActions(member)}</div>
                </li>
              );
            })}
          </ul>
        )}

        {/* KOMPUTER: tabela */}
        {filteredMembers.length > 0 && (
        <div className="hidden md:block bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <DataTable flush tableClassName="min-w-[800px]">
            <THead>
              <tr>
                <TH>{t('Osoba')}</TH>
                <TH>{tr('Kontakt i adres')}</TH>
                <TH>{t('Rodzina')}</TH>
                <TH>{tr('Grupa domowa')}</TH>
                <TH>{t('Służby')}</TH>
                <TH>{t('Data urodzenia')}</TH>
                <TH>{t('Obecność')}</TH>
                <TH>{t('Status')}</TH>
                <TH align="right"><span className="sr-only">{t('Akcje')}</span></TH>
              </tr>
            </THead>
            <tbody>
              {filteredMembers.map((member) => {
                const hl = highlightId && String(member.id) === String(highlightId);
                return (
                <TR key={member.id} data-member-row={member.id} className={hl ? 'bg-accent-primary-lightest/60 dark:bg-accent-primary-darkest/20 ring-2 ring-inset ring-accent-primary/40' : ''}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <div data-tone={brandTone(fullName(member))} className="w-10 h-10 rounded-full bg-gradient-to-br from-accent-primary-lighter to-accent-secondary-lighter dark:from-accent-primary-darkest dark:to-accent-secondary-darkest flex items-center justify-center text-accent-primary dark:text-accent-primary-light font-bold shadow-sm border border-white dark:border-gray-700" aria-hidden="true">
                        {member.first_name?.[0]}{member.last_name?.[0]}
                      </div>
                      <div>
                        <button type="button" onClick={() => setProfileMember(member)} className="font-bold text-gray-800 dark:text-gray-200 hover:text-accent-primary dark:hover:text-accent-primary-light transition text-left">{member.first_name} {member.last_name}</button>
                        {member.status === 'Członek' && member.membership_date && (
                          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                            <Calendar size={12} aria-hidden="true" />
                            {tr('od {date}', { date: new Date(member.membership_date).toLocaleDateString(appLocale()) })}
                          </div>
                        )}
                      </div>
                    </div>
                  </TD>

                  <TD>
                    <div className="space-y-1">
                      {member.email && <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 text-xs"><Mail size={14} className="text-accent-primary-light" aria-hidden="true" /> {member.email}</div>}
                      {member.phone && <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 text-xs tabular-nums"><Phone size={14} className="text-accent-secondary-light" aria-hidden="true" /> {member.phone}</div>}
                      {member.address && <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 text-xs"><MapPin size={14} className="text-accent-secondary-light" aria-hidden="true" /> {member.address}</div>}
                    </div>
                  </TD>

                  <TD>
                    {(() => {
                      const household = getHousehold(member.household_id);
                      return household ? (
                        <span className="inline-flex items-center gap-1.5 bg-gray-100 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded-md text-xs font-medium">
                          <Users size={12} aria-hidden="true" /> {household.name}
                          {household.phone_last_four && <span className="text-gray-500 dark:text-gray-400">(...{household.phone_last_four})</span>}
                        </span>
                      ) : null;
                    })()}
                  </TD>

                  <TD>
                    {renderGroupChips(member)}
                  </TD>

                  <TD>
                    <div className="flex flex-col gap-1.5 items-start">
                      {member.ministries && member.ministries.length > 0 ? (
                        getMinistryLabels(member.ministries).map((label, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1.5 bg-gray-100 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded-md text-xs font-medium">
                            <User size={12} className="text-accent-primary-light" aria-hidden="true" /> {label}
                          </span>
                        ))
                      ) : null}
                    </div>
                  </TD>

                  <TD numeric className="whitespace-nowrap">
                    {member.birth_date ? (
                      <span className={`inline-flex items-center gap-1.5 text-xs ${birthdaySoon(member.birth_date) ? 'text-accent-primary font-semibold' : 'text-gray-600 dark:text-gray-400'}`} title={birthdaySoon(member.birth_date) ? tr('Urodziny w ciągu 7 dni') : undefined}>
                        <Cake size={13} className={birthdaySoon(member.birth_date) ? 'text-accent-primary' : 'text-gray-400'} aria-hidden="true" /> {fmtBirth(member.birth_date)}
                      </span>
                    ) : null}
                  </TD>

                  <TD>
                    {(() => {
                      const cnt = attendanceCount(member.id);
                      return (
                        <div className="flex items-center gap-2" title={tr('Obecność ostatnie 4 niedziele: {cnt}/4', { cnt })}>
                          <div className="flex gap-0.5" aria-hidden="true">
                            {[...last4Sundays].reverse().map((d) => {
                              const on = attendanceByMember[String(member.id)]?.has(d);
                              return <span key={d} title={d} className={`w-2.5 h-4 rounded-sm ${on ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'}`} />;
                            })}
                          </div>
                          <span className={`text-xs font-medium tabular-nums ${cnt >= 3 ? 'text-green-600 dark:text-green-400' : cnt === 0 ? 'text-gray-500 dark:text-gray-400' : 'text-amber-600 dark:text-amber-400'}`}>{cnt * 25}%</span>
                        </div>
                      );
                    })()}
                  </TD>

                  <TD>
                    <div className="flex flex-col gap-1.5 items-start">
                      <StatusPill color={getStatusColor(member.status)}>
                        {tr(member.status || 'Gość')}
                      </StatusPill>
                      {renderDeclaration(member)}
                    </div>
                  </TD>

                  <TD align="right">
                    <div className="flex justify-end gap-0.5 opacity-70 group-hover/row:opacity-100 focus-within:opacity-100 transition-opacity">
                      {renderActions(member)}
                    </div>
                  </TD>
                </TR>
                );
              })}
            </tbody>
          </DataTable>
        </div>
        )}

        {filteredMembers.length === 0 && (
          filtersActive && members.length > 0 ? (
            <EmptyState icon={Search} title={tr('Brak osób pasujących do filtrów')}
              action={<Button variant="secondary" onClick={clearFilters}>{tr('Wyczyść filtry')}</Button>} />
          ) : (
            <EmptyState icon={Users} title={tr('Nie ma jeszcze żadnych osób')} subtitle={tr('Dodaj pierwszą osobę przyciskiem „Dodaj osobę”.')} />
          )
        )}
        {filteredMembers.length > 0 && filtersActive && (
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            {tr('Pokazano {n} z {total}', { n: filteredMembers.length, total: members.length })} · <button type="button" onClick={clearFilters} className="underline hover:text-accent-primary">{tr('Wyczyść filtry')}</button>
          </p>
        )}
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
      <Modal
        isOpen={showModal}
        onClose={requestCloseModal}
        title={formData.id ? tr('Edytuj dane') : tr('Nowa osoba')}
        size="lg"
        closeOnBackdrop={false}
        footer={<>
          <Button variant="secondary" onClick={requestCloseModal}>{tr('Anuluj')}</Button>
          <Button data-tour="member-save" onClick={handleSave} loading={saving}>{tr('Zapisz')}</Button>
        </>}
      >
        <div className="p-6 space-y-5">
          <p className="text-xs text-gray-500 dark:text-gray-400">{tr('Pola oznaczone * są wymagane.')}</p>
          {/* Imię i Nazwisko */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="member-first-name" className={labelCls}>{tr('Imię *')}</label>
              <input
                id="member-first-name"
                ref={firstNameRef}
                data-tour="member-first"
                aria-invalid={!!errors.first_name}
                aria-describedby={errors.first_name ? 'member-first-name-err' : undefined}
                autoComplete="given-name"
                className={inputCls(errors.first_name)}
                value={formData.first_name}
                onChange={e => setField('first_name', e.target.value)}
              />
              {errors.first_name && <p id="member-first-name-err" className="mt-1 ml-1 text-xs text-red-600 dark:text-red-400">{errors.first_name}</p>}
            </div>
            <div>
              <label htmlFor="member-last-name" className={labelCls}>{tr('Nazwisko *')}</label>
              <input
                id="member-last-name"
                ref={lastNameRef}
                data-tour="member-last"
                aria-invalid={!!errors.last_name}
                aria-describedby={errors.last_name ? 'member-last-name-err' : undefined}
                autoComplete="family-name"
                className={inputCls(errors.last_name)}
                value={formData.last_name}
                onChange={e => setField('last_name', e.target.value)}
              />
              {errors.last_name && <p id="member-last-name-err" className="mt-1 ml-1 text-xs text-red-600 dark:text-red-400">{errors.last_name}</p>}
            </div>
          </div>

          {/* Kontakt */}
          <div>
            <label htmlFor="member-email" className={labelCls}>{tr('E-mail')}</label>
            <input
              id="member-email"
              ref={emailRef}
              className={inputCls(errors.email)}
              type="email"
              autoComplete="email"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'member-email-err' : undefined}
              value={formData.email}
              onChange={e => setField('email', e.target.value)}
            />
            {errors.email && <p id="member-email-err" className="mt-1 ml-1 text-xs text-red-600 dark:text-red-400">{errors.email}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="member-phone" className={labelCls}>{tr('Telefon')}</label>
              <input
                id="member-phone"
                type="tel"
                autoComplete="tel"
                className={inputCls(false)}
                value={formData.phone}
                onChange={e => setField('phone', e.target.value)}
              />
            </div>
            {/* DROPDOWN STATUSU */}
            <div>
              <CustomSelect
                label={tr('Status')}
                value={formData.status}
                options={STATUS_OPTIONS.map((s) => ({ value: s, label: tr(s) }))}
                onChange={(val) => setField('status', val)}
              />
            </div>
          </div>

          {/* Grupy domowe (wiele) — tuż pod statusem: „dodaj osobę i przypisz do grupy” to główne zadanie */}
          <div>
            <span id="member-groups-label" className={labelCls}>{tr('Grupy domowe')}</span>
            {homeGroups.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">{tr('Brak grup domowych')}</p>
            ) : (
              <div role="group" aria-labelledby="member-groups-label" className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 p-3">
                <div className="flex flex-wrap gap-2">
                  {homeGroups.map((g) => {
                    const sel = (formData.home_group_ids || []).some((x) => String(x) === String(g.id));
                    return (
                      <button key={g.id} type="button" aria-pressed={sel}
                        onClick={() => setFormData((f) => ({ ...f, home_group_ids: sel ? f.home_group_ids.filter((x) => String(x) !== String(g.id)) : [...(f.home_group_ids || []), g.id] }))}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${sel ? 'bg-gradient-to-r from-accent-primary-light to-accent-secondary-light text-white shadow-md' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
                        {sel ? <Check size={13} aria-hidden="true" /> : <Home size={13} aria-hidden="true" />} {g.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {!formData.email && (formData.home_group_ids || []).length > 0 && hgRows !== null && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 ml-1">{tr('Osoba nie ma e-maila — w grupach rozpoznamy ją po imieniu i nazwisku.')}</p>
            )}
            {hgRows === null && homeGroups.length > 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 ml-1">{tr('Zapisze się tylko pierwsza zaznaczona grupa — nie masz dostępu do modułu Grupy domowe.')}</p>
            )}
          </div>

          {/* Służby */}
          <div>
            <span id="member-ministries-label" className={labelCls}>{tr('Służby')}</span>
            <div role="group" aria-labelledby="member-ministries-label" className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 p-3">
              <div className="flex flex-wrap gap-2">
                {MINISTRY_OPTIONS.map(ministry => {
                  const isSelected = formData.ministries.includes(ministry.key);
                  return (
                    <button
                      key={ministry.key}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => toggleMinistry(ministry.key)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-gradient-to-r from-accent-primary-light to-accent-secondary-light text-white shadow-md'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {isSelected && <Check size={14} aria-hidden="true" />}
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

          {/* Pola dla statusu "Członek" */}
          {formData.status === 'Członek' && (
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800/50 space-y-4">
              <h4 className="font-bold text-green-800 dark:text-green-300 flex items-center gap-2">
                <CheckCircle size={18} aria-hidden="true" /> {tr('Dane członkostwa')}
              </h4>

              <CustomDatePicker
                label={tr('Data członkostwa')}
                value={formData.membership_date}
                onChange={(date) => setField('membership_date', date)}
                placeholder={tr('Wybierz datę członkostwa')}
              />

              <div>
                <span className={labelCls}>{tr('Deklaracja członkostwa (PDF)')}</span>
                {formData.membership_declaration_url ? (
                  <div className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                    <FileText size={24} className="text-accent-primary-light" aria-hidden="true" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{tr('Deklaracja załączona')}</p>
                      <a
                        href={formData.membership_declaration_url}
                        onClick={(e) => { e.preventDefault(); openProtectedFile(formData.membership_declaration_url); }}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-accent-primary dark:text-accent-primary-light hover:underline flex items-center gap-1"
                      >
                        <Eye size={12} aria-hidden="true" /> {tr('Podgląd')}
                      </a>
                    </div>
                    <button
                      type="button"
                      onClick={removeDeclaration}
                      aria-label={tr('Usuń deklarację')}
                      title={tr('Usuń deklarację')}
                      className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition"
                    >
                      <Trash2 size={18} aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl cursor-pointer hover:border-accent-primary-light dark:hover:border-accent-primary-light transition bg-white/50 dark:bg-gray-800/50">
                    <div className="flex flex-col items-center justify-center">
                      {uploading ? (
                        <Spinner size={24} />
                      ) : (
                        <>
                          <Upload size={24} className="text-gray-400 mb-2" aria-hidden="true" />
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

          {/* Adres */}
          <div>
            <label htmlFor="member-address" className={labelCls}>{tr('Adres zamieszkania')}</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} aria-hidden="true" />
              <input
                id="member-address"
                autoComplete="street-address"
                className={`${inputCls(false)} pl-10`}
                placeholder={tr('Ulica, numer domu, miasto')}
                value={formData.address}
                onChange={e => setField('address', e.target.value)}
              />
            </div>
          </div>

          {/* Data urodzenia */}
          <CustomDatePicker
            label={tr('Data urodzenia')}
            value={formData.birth_date || ''}
            onChange={(val) => setField('birth_date', val)}
          />

          {/* Rodzina (Household) */}
          <CustomSelect
            label={tr('Rodzina (do meldowania dzieci)')}
            placeholder={tr('Wybierz rodzinę...')}
            value={formData.household_id}
            onChange={(val) => setField('household_id', val)}
            options={[{ id: '', name: tr('Brak'), phone_last_four: '' }, ...households]}
            mapOptionToValue={(opt) => opt.id}
            mapOptionToLabel={(opt) => opt.name + (opt.phone_last_four ? ` ${tr('(tel. ...{digits})', { digits: opt.phone_last_four })}` : '')}
            icon={Users}
          />

          {/* Kampus */}
          {campuses.length > 0 && (
            <CustomSelect
              label={tr('Kampus')}
              placeholder={tr('Wybierz kampus...')}
              value={formData.campus_id ? String(formData.campus_id) : ''}
              onChange={(val) => setField('campus_id', val ? parseInt(val, 10) : null)}
              options={[{ value: '', label: tr('Brak') }, ...campuses.map(c => ({ value: String(c.id), label: c.name + (c.city ? ` (${c.city})` : '') }))]}
              icon={MapPin}
            />
          )}

          {/* Tagi */}
          <div>
            <label htmlFor="member-tag-input" className={labelCls}>{tr('Tagi')}</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {(formData.tags || []).map((tg) => (
                <span key={tg} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light">
                  {tg}
                  <button type="button" aria-label={tr('Usuń tag {tag}', { tag: tg })} onClick={() => setField('tags', formData.tags.filter((x) => x !== tg))} className="hover:text-red-500">
                    <X size={12} aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
            <input
              id="member-tag-input"
              className={inputCls(false)}
              placeholder={tr('Wpisz tag i naciśnij Enter (np. nowy, do odwiedzenia)')}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const tg = tagInput.trim();
                  if (tg && !(formData.tags || []).includes(tg)) {
                    setField('tags', [...(formData.tags || []), tg]);
                  }
                  setTagInput('');
                }
              }}
            />
          </div>

          {/* Notatki */}
          <div>
            <label htmlFor="member-notes" className={labelCls}>{tr('Notatki (widoczne dla zespołu)')}</label>
            <textarea
              id="member-notes"
              className={`${inputCls(false)} h-24 resize-none`}
              placeholder={tr('Notatki duszpasterskie, historia kontaktu…')}
              value={formData.notes || ''}
              onChange={(e) => setField('notes', e.target.value)}
            />
            {canCare && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-1">{tr('Ta notatka i tagi są widoczne także w profilu osoby, w części „Opieka duszpasterska”.')}</p>
            )}
          </div>
        </div>
      </Modal>

      {profileMember && (
        <MemberProfile
          member={profileMember}
          members={members}
          homeGroups={homeGroups}
          homeGroupLinks={groupLinksOf(profileMember)}
          households={households}
          getMinistryLabels={getMinistryLabels}
          onClose={closeProfile}
          onEdit={(m) => { closeProfile(); openModal(m); }}
        />
      )}

      {/* Konfiguracja przypomnień urodzinowych */}
      <Modal
        isOpen={showBdayCfg}
        onClose={() => setShowBdayCfg(false)}
        title={tr('Przypomnienia urodzinowe')}
        icon={Cake}
        closeOnBackdrop={false}
        footer={<>
          <Button variant="secondary" onClick={() => setShowBdayCfg(false)}>{tr('Anuluj')}</Button>
          <Button onClick={saveBdayCfg} loading={bdaySaving}>{tr('Zapisz')}</Button>
        </>}
      >
        <div className="p-6 space-y-4">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200 cursor-pointer">
            <input type="checkbox" checked={!!bdayCfg.enabled} onChange={(e) => setBdayCfg({ ...bdayCfg, enabled: e.target.checked })} className="w-4 h-4 rounded accent-accent-primary" />
            {tr('Włącz automatyczne przypomnienia')}
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <CustomSelect label={tr('Kiedy wysyłać')} value={bdayCfg.schedule} onChange={(v) => setBdayCfg({ ...bdayCfg, schedule: v })}
                options={[{ value: 'daily', label: tr('Codziennie') }, { value: 'weekly', label: tr('Raz w tygodniu') }]} />
            </div>
            {bdayCfg.schedule === 'weekly' && (
              <div>
                <CustomSelect label={tr('Dzień tygodnia')} value={String(bdayCfg.weekday)} onChange={(v) => setBdayCfg({ ...bdayCfg, weekday: parseInt(v, 10) })}
                  options={[{ value: '1', label: tr('Poniedziałek') }, { value: '2', label: tr('Wtorek') }, { value: '3', label: tr('Środa') }, { value: '4', label: tr('Czwartek') }, { value: '5', label: tr('Piątek') }, { value: '6', label: tr('Sobota') }, { value: '0', label: tr('Niedziela') }]} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="bday-days-ahead" className={labelCls}>{tr('Ile dni wcześniej')}</label>
              <input id="bday-days-ahead" type="number" min="0" max="31" value={bdayCfg.days_ahead} onChange={(e) => setBdayCfg({ ...bdayCfg, days_ahead: parseInt(e.target.value || '0', 10) })}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" />
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 ml-1">{tr('0 = tylko w dniu urodzin. Dla „raz w tygodniu" np. 7 = cały tydzień.')}</p>
            </div>
            <div>
              <CustomSelect label={tr('Kanał')} value={bdayCfg.channel} onChange={(v) => setBdayCfg({ ...bdayCfg, channel: v })}
                options={[{ value: 'email', label: tr('E-mail') }, { value: 'push', label: tr('Powiadomienie w aplikacji') }, { value: 'both', label: tr('E-mail i powiadomienie w aplikacji') }]} />
            </div>
          </div>

          <div>
            <span className={labelCls}>{tr('Odbiorcy — role')}</span>
            <div className="flex flex-wrap gap-1.5">
              {roleList.length === 0 ? <span className="text-xs text-gray-500">{tr('Brak ról')}</span> : roleList.map((r) => {
                const on = (bdayCfg.recipients?.roles || []).includes(r.key);
                return (
                  <button key={r.key} type="button" aria-pressed={on}
                    onClick={() => setBdayCfg((c) => ({ ...c, recipients: { ...c.recipients, roles: on ? c.recipients.roles.filter((x) => x !== r.key) : [...(c.recipients.roles || []), r.key] } }))}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${on ? 'bg-accent-primary text-white border-accent-primary' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'}`}>
                    {r.label || r.key}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="bday-extra-email" className={labelCls}>{tr('Dodatkowe e-maile')}</label>
            <div className="flex items-center gap-2">
              <input id="bday-extra-email" type="email" value={bdayEmail} onChange={(e) => setBdayEmail(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && bdayEmail.trim()) { setBdayCfg((c) => ({ ...c, recipients: { ...c.recipients, emails: [...new Set([...(c.recipients.emails || []), bdayEmail.trim()])] } })); setBdayEmail(''); } }}
                placeholder={tr('jan@example.com i Enter')} className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" />
            </div>
            {(bdayCfg.recipients?.emails || []).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {bdayCfg.recipients.emails.map((em) => (
                  <span key={em} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200">
                    {em}
                    <button type="button" aria-label={tr('Usuń adres {email}', { email: em })} onClick={() => setBdayCfg((c) => ({ ...c, recipients: { ...c.recipients, emails: c.recipients.emails.filter((x) => x !== em) } }))} className="text-gray-400 hover:text-red-500"><X size={12} aria-hidden="true" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <label htmlFor="bday-message" className={labelCls}>{tr('Treść powiadomienia')}</label>
            <textarea id="bday-message" rows={2} value={bdayCfg.message} onChange={(e) => setBdayCfg({ ...bdayCfg, message: e.target.value })}
              placeholder={tr('Pamiętajmy o życzeniach dla najbliższych solenizantów.')}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm resize-none" />
          </div>
        </div>
      </Modal>
    </div>
  );
}
