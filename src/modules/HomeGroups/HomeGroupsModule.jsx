import React, { useState, useEffect } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import Button from '../../components/Button';
import { supabase } from '../../lib/supabase';
import CustomSelect from '../../components/CustomSelect';
import ModuleBoard, { hasItemDeepLink } from '../Boards/ModuleBoard';
import ResponsiveTabs from '../../components/ResponsiveTabs';
import PageHeader from '../../components/PageHeader';
import { Home } from 'lucide-react';
import {
  Plus, Search, Trash2, Users, MapPin, Calendar,
  UserPlus, BookOpen, Upload, Link as LinkIcon,
  CheckSquare, DollarSign, FolderOpen, Package, Pencil, AlertTriangle
} from 'lucide-react';
import FinanceTab from '../shared/FinanceTab';
import HomeGroupsMap from './HomeGroupsMap';
import EventsTab from '../shared/EventsTab';
import { ensureGroupFolder as ensureGroupFolderUtil } from './homeGroupFolder';
import MaterialsTab from '../shared/MaterialsTab';
import EquipmentTab from '../shared/EquipmentTab';
import { useUserRole } from '../../hooks/useUserRole';
import { useTabAccess } from '../../components/Can';
import { useCampusQuery } from '../../hooks/useCampusQuery';
import { useT } from '../../i18n';
import { tr } from '../../i18n';
import { toast } from '../../lib/toast';
import Spinner from '../../components/Spinner';
import Modal from '../../components/Modal';
import EmptyState from '../../components/EmptyState';
import { DataTable, THead, TH, TR, TD, EmptyRow, StatusPill, STATUS_COLORS } from '../../components/ui/DataTable';
import { DateInput, TimeField } from '../../components/pickers';
import { confirmDialog } from '../../lib/dialog';
import {
  groupLeaders, leaderMissingFromGroup, personCandidates, findDuplicateGroup, normalizeWeekday,
  WEEKDAYS, rowMatchesPerson, fullNameOf, personKey, plural,
} from './homeGroupUtils';

const NEW_PERSON = '__new__';
const isLeaderRow = (r) => r && (r.role === 'leader' || r.role === 'coordinator' || r.is_leader === true);
// Dzień spotkania: wartość w bazie po polsku (Poniedziałek…), etykieta przez tr().
const dayLabel = (d) => { const n = normalizeWeekday(d); return n ? tr(n) : (d || ''); };

export default function HomeGroupsModule() {
  const t = useT();
  const { userRole, loading: roleLoading } = useUserRole();
  const hasTabAccess = useTabAccess();
  const { withCampusFilter, selectedCampusId, campusIdForInsert } = useCampusQuery();
  const [activeTab, setActiveTab] = useState(() => (hasItemDeepLink() ? 'tasks' : 'groups'));
  const { search: locationSearch } = useLocation();
  useEffect(() => { if (hasItemDeepLink()) setActiveTab('tasks'); }, [locationSearch]); // link z powiadomienia na tej samej stronie
  const [groups, setGroups] = useState([]);
  const [leaders, setLeaders] = useState([]);
  const [members, setMembers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentUserEmail, setCurrentUserEmail] = useState(null);
  const [people, setPeople] = useState([]); // baza osób (members) — do wyboru lidera i członków
  const [searchParams, setSearchParams] = useSearchParams();
  const [groupErrors, setGroupErrors] = useState({});
  const [initialLeaderKey, setInitialLeaderKey] = useState(''); // lider grupy w chwili otwarcia formularza
  const [addPersonKey, setAddPersonKey] = useState(''); // wybór osoby w oknie „Członkowie grupy”
  const [savingGroup, setSavingGroup] = useState(false);

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('group');
  const [editingItem, setEditingItem] = useState(null);
  const [showGroupMembersModal, setShowGroupMembersModal] = useState(false);
  const [showMaterialsModal, setShowMaterialsModal] = useState(false);
  const [currentGroup, setCurrentGroup] = useState(null);
  const [groupMaterials, setGroupMaterials] = useState([]); // materials_files folderu bieżącej grupy
  const [materialCounts, setMaterialCounts] = useState({}); // group.id -> liczba plików

  // Forms
  const [groupForm, setGroupForm] = useState({
    name: '',
    description: '',
    leader_id: '',
    leader_key: '', // osoba-lider (klucz z personCandidates) albo NEW_PERSON
    new_leader: { full_name: '', email: '', phone: '' },
    meeting_day: '',
    meeting_time: '',
    location: '',
    address: '',
    phone: '',
    email: '',
    materials: []
  });

  const [personForm, setPersonForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    group_id: '',
    role: 'leader' // coordinator | leader (dotyczy liderów)
  });
  const [personErrors, setPersonErrors] = useState({});

  const [materialForm, setMaterialForm] = useState({
    title: '',
    type: 'Dokument',
    attachment: null
  });

  const [uploading, setUploading] = useState(false);

  // Finance data
  const [budgetItems, setBudgetItems] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    payment_date: '',
    amount: '',
    contractor: '',
    category: 'Grupy domowe',
    description: '',
    detailed_description: '',
    responsible_person: '',
    documents: [],
    tags: [],
    ministry: 'Grupy domowe'
  });

  useEffect(() => {
    fetchData();
    getCurrentUser();
  }, [selectedCampusId]);

  useEffect(() => {
    if (activeTab === 'finances') {
      fetchFinanceData();
    }
  }, [activeTab, selectedCampusId]);

  async function getCurrentUser() {
    const { data } = await supabase.auth.getUser();
    if (data?.user) {
      setCurrentUserEmail(data.user.email);
    }
  }

  const fetchFinanceData = async () => {
    const currentYear = new Date().getFullYear();
    const ministryName = 'Grupy domowe';

    try {
      const { data: budget, error: budgetError } = await withCampusFilter(supabase
        .from('budget_items')
        .select('*'))
        .eq('team_type', ministryName)
        .eq('year', currentYear)
        .order('id', { ascending: true });

      if (budgetError) throw budgetError;
      setBudgetItems(budget || []);

      const { data: exp, error: expError } = await supabase
        .from('expense_transactions')
        .select('*')
        .eq('team_type', ministryName)
        .gte('payment_date', `${currentYear}-01-01`)
        .lte('payment_date', `${currentYear}-12-31`)
        .order('payment_date', { ascending: false });

      if (expError) throw expError;
      setExpenses(exp || []);
    } catch (error) {
      console.error('Error fetching finance data:', error);
    }
  };

  const saveExpense = async () => {
    const missingFields = [
      !expenseForm.payment_date && tr('Data'),
      !expenseForm.amount && tr('Kwota (PLN)'),
      !expenseForm.description && tr('Pozycja budżetowa'),
      !expenseForm.contractor && tr('Kontrahent'),
      !expenseForm.responsible_person && tr('Osoba odpowiedzialna'),
    ].filter(Boolean);
    if (missingFields.length) {
      toast.error(tr('Uzupełnij: {fields}', { fields: missingFields.join(', ') }));
      return;
    }

    try {
      const { error } = await supabase.from('expense_transactions').insert([{
        payment_date: expenseForm.payment_date,
        amount: parseFloat(expenseForm.amount),
        contractor: expenseForm.contractor,
        category: expenseForm.category,
        description: expenseForm.description,
        detailed_description: expenseForm.detailed_description,
        responsible_person: expenseForm.responsible_person,
        documents: expenseForm.documents,
        tags: expenseForm.tags,
        team_type: expenseForm.ministry
      }]);

      if (error) throw error;

      setShowExpenseModal(false);
      const ministryName = expenseForm.ministry;
      setExpenseForm({
        payment_date: '',
        amount: '',
        contractor: '',
        category: ministryName,
        description: '',
        detailed_description: '',
        responsible_person: '',
        documents: [],
        tags: [],
        ministry: ministryName
      });
      fetchFinanceData();
    } catch (error) {
      console.error('Error saving expense:', error);
      toast.error(error, { fallback: tr('Nie udało się zapisać wydatku.') });
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // Zadania żyją na Tablicy (ModuleBoard) — home_group_tasks nie jest już pobierane.
      const [groupsRes, leadersRes, membersRes, peopleRes] = await Promise.all([
        withCampusFilter(supabase.from('home_groups').select('*, home_group_leaders(full_name)')).order('name'),
        supabase.from('home_group_leaders').select('*').order('full_name'),
        supabase.from('home_group_members').select('*, home_groups(name)').order('full_name'),
        // Baza osób (moduł Członkowie) — lider bez dostępu do niej wybiera z osób z grup.
        supabase.from('members').select('id, first_name, last_name, email, phone').order('last_name').then((r) => r, () => ({ data: [] })),
      ]);

      if (groupsRes.error) throw groupsRes.error;
      if (groupsRes.data) setGroups(groupsRes.data);
      if (leadersRes.data) setLeaders(leadersRes.data);
      if (membersRes.data) setMembers(membersRes.data);
      setPeople(peopleRes?.error ? [] : (peopleRes?.data || []));

      // Liczniki materiałów per grupa: pliki (materials_files) w folderze grupy.
      try {
        const folderToGroup = {};
        (groupsRes.data || []).forEach((g) => { if (g.materials_folder_id) folderToGroup[g.materials_folder_id] = g.id; });
        const folderIds = Object.keys(folderToGroup);
        if (folderIds.length) {
          const { data: mf } = await supabase.from('materials_files').select('folder_id').in('folder_id', folderIds);
          const counts = {};
          (mf || []).forEach((f) => { const gid = folderToGroup[f.folder_id]; if (gid) counts[gid] = (counts[gid] || 0) + 1; });
          setMaterialCounts(counts);
        } else {
          setMaterialCounts({});
        }
      } catch { /* liczniki best-effort */ }
    } catch (error) {
      toast.error(error, { fallback: tr('Nie udało się wczytać grup domowych. Odśwież stronę.') });
    } finally {
      setLoading(false);
    }
  };

  // Kandydaci do wyboru (lider / członek): baza osób + osoby z grup + katalog liderów.
  const candidates = personCandidates({ people, rows: members, leaders });
  const candidateByKey = (key) => candidates.find((c) => c.key === key) || null;

  // Lider grupy = członek tej grupy z rolą „leader” (to z tej roli liczą się uprawnienia
  // „moje grupy” na serwerze i w aplikacji). Dodatkowo utrzymujemy katalog liderów
  // (home_group_leaders + home_groups.leader_id), z którego korzystają mapa, Komunikator
  // i „Moje grupy” w aplikacji. Zwraca true, gdy wszystko się udało.
  const ensureLeader = async (groupId, person, prevPerson = null) => {
    let ok = true;
    const { data: rows, error: rowsErr } = await supabase.from('home_group_members').select('*').eq('group_id', groupId);
    if (rowsErr) return false;
    // 1) Poprzedni lider (wybrany wcześniej w formularzu) zostaje członkiem grupy.
    if (prevPerson && (!person || personKey(prevPerson) !== personKey(person))) {
      for (const r of (rows || []).filter((x) => isLeaderRow(x) && x.role !== 'coordinator' && rowMatchesPerson(x, prevPerson))) {
        const { error } = await supabase.from('home_group_members').update({ role: 'member', is_leader: false }).eq('id', r.id);
        if (error) ok = false;
      }
    }
    if (!person) {
      const { error } = await supabase.from('home_groups').update({ leader_id: null }).eq('id', groupId);
      return ok && !error;
    }
    const full_name = fullNameOf(person);
    // 2) Członkostwo z rolą lidera.
    const existing = (rows || []).find((r) => rowMatchesPerson(r, person));
    if (existing) {
      if (!isLeaderRow(existing) || (!existing.email && person.email)) {
        const patch = { role: existing.role === 'coordinator' ? 'coordinator' : 'leader', is_leader: true };
        if (!existing.email && person.email) patch.email = person.email;
        if (!existing.phone && person.phone) patch.phone = person.phone;
        const { error } = await supabase.from('home_group_members').update(patch).eq('id', existing.id);
        if (error) ok = false;
      }
    } else {
      const { error } = await supabase.from('home_group_members').insert([{ full_name, email: person.email || null, phone: person.phone || null, group_id: groupId, role: 'leader', is_leader: true }]);
      if (error) ok = false;
    }
    // 3) Katalog liderów + home_groups.leader_id.
    let leaderId = null;
    const inCatalog = leaders.find((l) => l.role !== 'coordinator' && rowMatchesPerson(l, person) && (!l.group_id || String(l.group_id) === String(groupId)))
      || leaders.find((l) => rowMatchesPerson(l, person) && String(l.group_id) === String(groupId));
    if (inCatalog) {
      leaderId = inCatalog.id;
      if (!inCatalog.group_id) {
        const { error } = await supabase.from('home_group_leaders').update({ group_id: groupId }).eq('id', inCatalog.id);
        if (error) ok = false;
      }
    } else {
      const { data: ins, error } = await supabase.from('home_group_leaders')
        .insert([{ full_name, email: person.email || null, phone: person.phone || null, role: 'leader', group_id: groupId }])
        .select('id').single();
      if (error) ok = false; else leaderId = ins?.id || null;
    }
    if (leaderId) {
      const { error } = await supabase.from('home_groups').update({ leader_id: leaderId }).eq('id', groupId);
      if (error) ok = false;
    }
    return ok;
  };

  const handleSaveGroup = async () => {
    const name = (groupForm.name || '').trim();
    const errs = {};
    if (!name) errs.name = tr('Podaj nazwę grupy.');
    let leaderPerson = null;
    if (groupForm.leader_key === NEW_PERSON) {
      const nl = groupForm.new_leader || {};
      if (!String(nl.full_name || '').trim()) errs.new_leader = tr('Podaj imię i nazwisko nowego lidera.');
      else leaderPerson = { full_name: nl.full_name.trim(), email: (nl.email || '').trim() || null, phone: (nl.phone || '').trim() || null };
    } else if (groupForm.leader_key) {
      leaderPerson = candidateByKey(groupForm.leader_key);
    }
    setGroupErrors(errs);
    if (Object.keys(errs).length) { toast.error(tr('Uzupełnij zaznaczone pola.')); return; }

    // Duplikat nazwy: pytamy, zanim powstaną dwie „Grupa Zachód”.
    const dup = findDuplicateGroup(name, groups, editingItem?.id);
    if (dup) {
      const goOn = await confirmDialog({
        title: tr('Grupa „{name}” już istnieje', { name: dup.name }),
        message: tr('Dwie grupy o tej samej nazwie łatwo pomylić na liście i na mapie. Zapisać mimo to?'),
        confirmLabel: tr('Zapisz mimo to'),
        danger: false,
      });
      if (!goOn) return;
    }

    setSavingGroup(true);
    try {
      const payload = {
        name,
        description: groupForm.description || null,
        meeting_day: groupForm.meeting_day || null,
        meeting_time: groupForm.meeting_time || null,
        location: groupForm.location || null,
        address: groupForm.address || null,
        phone: groupForm.phone || null,
        email: groupForm.email || null,
        materials: groupForm.materials || []
      };
      // Zmiana adresu → mapa przelicza współrzędne na nowo.
      if (editingItem && (editingItem.address || '') !== (payload.address || '')) {
        Object.assign(payload, { lat: null, lng: null, latitude: null, longitude: null, geocoded_at: null });
      }

      let groupId = editingItem?.id || null;
      if (editingItem) {
        const { error } = await supabase
          .from('home_groups')
          .update(payload)
          .eq('id', editingItem.id);
        if (error) throw error;
        // Zsynchronizuj nazwę folderu materiałów, jeśli zmieniono nazwę grupy.
        if (editingItem.materials_folder_id && editingItem.name !== payload.name) {
          try {
            await supabase.from('materials_folders').update({ name: payload.name }).eq('id', editingItem.materials_folder_id);
            await supabase.from('materials_shares').update({ target_label: payload.name })
              .eq('target_type', 'home_group').eq('target_id', String(editingItem.id));
          } catch { /* best-effort */ }
        }
      } else {
        const { data: ins, error } = await supabase
          .from('home_groups')
          .insert([{ ...payload, campus_id: campusIdForInsert }])
          .select('id')
          .single();
        if (error) throw error;
        groupId = ins?.id || null;
      }

      // Lider w tym samym kroku: staje się członkiem grupy z rolą lidera.
      const prevPerson = initialLeaderKey ? (candidateByKey(initialLeaderKey) || null) : null;
      const leaderChanged = (groupForm.leader_key || '') !== (initialLeaderKey || '') || groupForm.leader_key === NEW_PERSON;
      let leaderOk = true;
      // Bez zmiany lidera, ale lider z katalogu nie jest członkiem grupy — naprawiamy przy okazji.
      const needsFix = !leaderChanged && leaderPerson && editingItem && leaderMissingFromGroup(editingItem, members, leaders);
      if (groupId && (leaderChanged || needsFix)) leaderOk = await ensureLeader(groupId, leaderPerson, leaderChanged ? prevPerson : null);

      toast.success(editingItem ? tr('Zapisano grupę „{name}”', { name }) : tr('Dodano grupę „{name}”', { name }));
      if (!leaderOk) toast.error(tr('Grupa jest zapisana, ale nie udało się ustawić lidera. Spróbuj ponownie w edycji grupy.'));
      closeModal();
      fetchData();
    } catch (error) {
      toast.error(error, { fallback: tr('Nie udało się zapisać grupy. Spróbuj ponownie.') });
    } finally {
      setSavingGroup(false);
    }
  };

  const handleSavePerson = async (type) => {
    const errs = {};
    if (!personForm.full_name?.trim()) errs.full_name = tr('Podaj imię i nazwisko.');
    if (type === 'member' && !personForm.group_id) errs.group_id = tr('Wybierz grupę.');
    setPersonErrors(errs);
    if (Object.keys(errs).length) { toast.error(tr('Uzupełnij zaznaczone pola.')); return; }

    try {
      const payload = {
        full_name: personForm.full_name.trim(),
        email: personForm.email?.trim() || null,
        phone: personForm.phone?.trim() || null
      };

      if (type === 'member') {
        payload.group_id = personForm.group_id || null;
        payload.role = personForm.role || 'member';
        payload.is_leader = (personForm.role === 'leader' || personForm.role === 'coordinator');
        // Ta sama osoba dwa razy w tej samej grupie — zatrzymujemy (różne grupy są OK).
        const dupRow = members.find((m) => m.id !== editingItem?.id && String(m.group_id) === String(payload.group_id) && rowMatchesPerson(m, payload));
        if (dupRow) { toast.error(tr('Ta osoba już jest w tej grupie.')); return; }
      }
      if (type === 'leader') {
        payload.role = personForm.role || 'leader';
        payload.group_id = payload.role === 'leader' ? (personForm.group_id || null) : null;
      }

      const table = type === 'leader' ? 'home_group_leaders' : 'home_group_members';

      let savedId = editingItem?.id || null;
      if (editingItem) {
        const { error } = await supabase
          .from(table)
          .update(payload)
          .eq('id', editingItem.id);
        if (error) throw error;
      } else {
        const { data: ins, error } = await supabase
          .from(table)
          .insert([payload])
          .select('id')
          .single();
        if (error) throw error;
        savedId = ins?.id || null;
      }

      // Lider przypisany do grupy w zakładce „Liderzy” = też członek tej grupy z rolą lidera.
      let leaderOk = true;
      if (type === 'leader' && payload.group_id) {
        leaderOk = await ensureLeader(payload.group_id, payload, null);
        const grp = groups.find((g) => String(g.id) === String(payload.group_id));
        if (grp && !grp.leader_id && savedId) {
          const { error } = await supabase.from('home_groups').update({ leader_id: savedId }).eq('id', grp.id);
          if (error) leaderOk = false;
        }
      }

      toast.success(editingItem ? tr('Zapisano: {name}', { name: payload.full_name }) : tr('Dodano: {name}', { name: payload.full_name }));
      if (!leaderOk) toast.error(tr('Lider jest zapisany, ale nie udało się dodać go do członków grupy.'));
      closeModal();
      fetchData();
    } catch (error) {
      toast.error(error, { fallback: tr('Nie udało się zapisać. Spróbuj ponownie.') });
    }
  };

  const handleDelete = async (item, type) => {
    const name = type === 'group' ? item.name : item.full_name;
    const groupName = type === 'member' ? groups.find((g) => g.id === item.group_id)?.name : null;
    const confirmOpts = type === 'group'
      ? { title: tr('Usunąć grupę „{name}”?', { name }), message: tr('Znikną też jej członkostwa i folder materiałów z plikami. Osoby zostaną w bazie członków. Tej operacji nie można cofnąć.'), confirmLabel: tr('Usuń grupę') }
      : type === 'leader'
        ? { title: tr('Usunąć „{name}” z listy liderów?', { name }), message: tr('Osoba zostanie w grupie jako członek. Tej operacji nie można cofnąć.'), confirmLabel: tr('Usuń z liderów') }
        : { title: groupName ? tr('Usunąć „{name}” z grupy „{group}”?', { name, group: groupName }) : tr('Usunąć „{name}”?', { name }), message: tr('Osoba zostanie w bazie członków.'), confirmLabel: tr('Usuń') };
    if (!await confirmDialog({ ...confirmOpts, danger: true })) return;

    try {
      const table = type === 'group' ? 'home_groups'
        : type === 'leader' ? 'home_group_leaders'
        : 'home_group_members';

      // Sprzątanie folderu materiałów grupy (pliki + storage + udostępnienia) — best-effort.
      if (type === 'group') {
        const folderId = item?.materials_folder_id;
        if (folderId) {
          try {
            const { data: files } = await supabase.from('materials_files').select('storage_path').eq('folder_id', folderId);
            const paths = (files || []).map((f) => f.storage_path).filter(Boolean);
            if (paths.length) await supabase.storage.from('materials').remove(paths);
            await supabase.from('materials_files').delete().eq('folder_id', folderId);
            await supabase.from('materials_shares').delete().eq('folder_id', folderId);
            await supabase.from('materials_folders').delete().eq('id', folderId);
          } catch { /* best-effort */ }
        }
      }

      const { error } = await supabase
        .from(table)
        .delete()
        .eq('id', item.id);

      if (error) throw error;
      // Usunięty z katalogu liderów → w grupie zostaje jako członek (bez roli lidera).
      if (type === 'leader' && item.group_id) {
        const rows = members.filter((m) => String(m.group_id) === String(item.group_id) && isLeaderRow(m) && m.role !== 'coordinator' && rowMatchesPerson(m, item));
        for (const r of rows) await supabase.from('home_group_members').update({ role: 'member', is_leader: false }).eq('id', r.id);
        const grp = groups.find((g) => String(g.id) === String(item.group_id));
        if (grp?.leader_id === item.id) await supabase.from('home_groups').update({ leader_id: null }).eq('id', grp.id);
      }
      toast.success(tr('Usunięto: {name}', { name }));
      fetchData();
    } catch (error) {
      toast.error(error, { fallback: tr('Nie udało się usunąć. Spróbuj ponownie.') });
    }
  };

  // Klucz osoby-lidera grupy do formularza (wiersz z rolą lidera albo katalog leader_id).
  const leaderKeyOfGroup = (group) => {
    const l = groupLeaders(group, members, leaders)[0];
    if (!l) return '';
    const key = personKey({ ...l, full_name: fullNameOf(l) });
    return candidates.some((c) => c.key === key) ? key : '';
  };

  // opts.groupId — grupa podpowiadana dla nowego członka (np. z okna „Członkowie grupy”).
  const openModal = (type, item = null, opts = {}) => {
    setModalType(type);
    setEditingItem(item);
    setGroupErrors({});
    setPersonErrors({});

    if (type === 'group') {
      const lk = item ? leaderKeyOfGroup(item) : '';
      setInitialLeaderKey(lk);
      setGroupForm(item ? {
        name: item.name || '',
        description: item.description || '',
        leader_id: item.leader_id || '',
        leader_key: lk,
        new_leader: { full_name: '', email: '', phone: '' },
        meeting_day: normalizeWeekday(item.meeting_day) || item.meeting_day || '',
        meeting_time: item.meeting_time || '',
        location: item.location || '',
        address: item.address || '',
        phone: item.phone || '',
        email: item.email || '',
        materials: item.materials || []
      } : {
        name: '',
        description: '',
        leader_id: '',
        leader_key: '',
        new_leader: { full_name: '', email: '', phone: '' },
        meeting_day: '',
        meeting_time: '',
        location: '',
        address: '',
        phone: '',
        email: '',
        materials: []
      });
    } else {
      const defRole = type === 'member' ? 'member' : 'leader';
      setPersonForm(item ? {
        full_name: item.full_name || '',
        email: item.email || '',
        phone: item.phone || '',
        group_id: item.group_id || '',
        role: item.role || defRole
      } : {
        full_name: '',
        email: '',
        phone: '',
        group_id: type === 'member' ? (opts.groupId || '') : '',
        role: defRole
      });
    }

    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingItem(null);
  };

  // Okno „Członkowie grupy”: dodanie osoby (z bazy lub z innych grup) = nowy wiersz członkostwa,
  // więc ta sama osoba może należeć do kilku grup (wcześniej wiersz był przenoszony między grupami).
  const attachMemberToGroup = async () => {
    const person = candidateByKey(addPersonKey);
    if (!person || !currentGroup) {
      toast.info(tr('Wybierz osobę'));
      return;
    }
    if (members.some((m) => String(m.group_id) === String(currentGroup.id) && rowMatchesPerson(m, person))) {
      toast.info(tr('{name} już jest w tej grupie.', { name: person.full_name }));
      return;
    }
    try {
      // Wiersz osoby bez grupy (dodanej wcześniej w zakładce Członkowie) — przypinamy go zamiast dublować.
      const loose = members.find((m) => !m.group_id && rowMatchesPerson(m, person));
      const { error } = loose
        ? await supabase.from('home_group_members').update({ group_id: currentGroup.id, role: 'member', is_leader: false }).eq('id', loose.id)
        : await supabase.from('home_group_members').insert([{ full_name: person.full_name, email: person.email || null, phone: person.phone || null, group_id: currentGroup.id, role: 'member', is_leader: false }]);
      if (error) throw error;
      toast.success(tr('Dodano {name} do grupy „{group}”', { name: person.full_name, group: currentGroup.name }));
      setAddPersonKey('');
      fetchData();
    } catch (err) {
      toast.error(err, { fallback: tr('Nie udało się dodać osoby do grupy.') });
    }
  };

  const detachMemberFromGroup = async (row) => {
    if (!await confirmDialog({
      title: tr('Odłączyć „{name}” od grupy „{group}”?', { name: row.full_name, group: currentGroup?.name || '' }),
      message: tr('Osoba zostanie w bazie członków i w innych grupach.'),
      confirmLabel: tr('Odłącz'),
      danger: true,
    })) return;

    try {
      // Osoba ma też inne grupy → usuwamy tylko to członkostwo; ostatnie zostaje bez grupy.
      const others = members.filter((m) => m.id !== row.id && m.group_id && rowMatchesPerson(m, row));
      const { error } = others.length
        ? await supabase.from('home_group_members').delete().eq('id', row.id)
        : await supabase.from('home_group_members').update({ group_id: null, role: 'member', is_leader: false }).eq('id', row.id);

      if (error) throw error;
      toast.success(tr('Odłączono: {name}', { name: row.full_name }));
      fetchData();
    } catch (err) {
      toast.error(err, { fallback: tr('Nie udało się odłączyć osoby od grupy.') });
    }
  };

  // Lider z katalogu (leader_id) bez członkostwa w swojej grupie → jedno kliknięcie naprawia.
  const fixLeaderMembership = async (group, leader) => {
    const ok = await ensureLeader(group.id, leader, null);
    if (ok) toast.success(tr('{name} jest teraz członkiem grupy z rolą lidera.', { name: leader.full_name }));
    else toast.error(tr('Nie udało się dodać lidera do członków grupy.'));
    fetchData();
  };

  // Głęboki link (np. z wyszukiwarki ⌘K): /home-groups?group=<id> otwiera kartę grupy (jej członków).
  const deepGroupId = searchParams.get('group');
  useEffect(() => {
    if (!deepGroupId || loading) return;
    const g = groups.find((x) => String(x.id) === String(deepGroupId));
    if (g) { setActiveTab('groups'); setCurrentGroup(g); setShowGroupMembersModal(true); }
    else toast.info(tr('Nie znaleziono tej grupy. Mogła zostać usunięta albo należy do innego kampusu.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepGroupId, loading]);

  const closeGroupMembers = () => {
    setShowGroupMembersModal(false);
    setAddPersonKey('');
    if (searchParams.get('group')) {
      setSearchParams((prev) => { const p = new URLSearchParams(prev); p.delete('group'); return p; }, { replace: true });
    }
  };

  // === Materiały grupy = pliki w folderze grupy (materials_files) ===
  // Folder (materials_folders, team_type='homegroups') powiązany z grupą przez
  // home_groups.materials_folder_id i udostępniony całej grupie domowej (materials_shares),
  // dzięki czemu materiały widać też w „Plikach" i w „Udostępnione mi" u członków — i na odwrót.
  const MATERIALS_TEAM = 'homegroups';

  const ensureGroupFolder = async (group) => {
    const folderId = await ensureGroupFolderUtil(group);
    if (!group.materials_folder_id) {
      setGroups((prev) => prev.map((g) => g.id === group.id ? { ...g, materials_folder_id: folderId } : g));
      setCurrentGroup((cg) => cg && cg.id === group.id ? { ...cg, materials_folder_id: folderId } : cg);
    }
    return folderId;
  };

  const loadGroupMaterials = async (group) => {
    const folderId = group.materials_folder_id;
    if (!folderId) { setGroupMaterials([]); return; }
    const { data } = await supabase.from('materials_files').select('*').eq('folder_id', folderId).order('name');
    setGroupMaterials(data || []);
  };

  const openMaterialsModal = async (group) => {
    setCurrentGroup(group);
    setGroupMaterials([]);
    setShowMaterialsModal(true);
    try {
      const folderId = await ensureGroupFolder(group);
      const { data } = await supabase.from('materials_files').select('*').eq('folder_id', folderId).order('name');
      setGroupMaterials(data || []);
    } catch (err) {
      console.error('Błąd wczytywania materiałów:', err);
    }
  };

  const addMaterial = async () => {
    if (!materialForm.attachment) {
      toast.error(tr('Wybierz plik'));
      return;
    }
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const email = user?.email || null;
      const folderId = await ensureGroupFolder(currentGroup);

      const file = materialForm.attachment;
      if (file.size > 50 * 1024 * 1024) throw new Error(tr('Plik przekracza limit 50MB'));
      const sanitized = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const storagePath = `${MATERIALS_TEAM}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${sanitized}`;

      const { error: upErr } = await supabase.storage.from('materials').upload(storagePath, file);
      if (upErr) throw upErr;

      const { error: insErr } = await supabase.from('materials_files').insert({
        name: materialForm.title?.trim() || file.name,
        storage_path: storagePath,
        file_size: file.size,
        mime_type: file.type || 'application/octet-stream',
        folder_id: folderId,
        team_type: MATERIALS_TEAM,
        description: materialForm.type || null,
        uploaded_by: email,
      });
      if (insErr) throw insErr;

      setMaterialForm({ title: '', type: 'Dokument', attachment: null });
      await loadGroupMaterials({ ...currentGroup, materials_folder_id: folderId });
      fetchData();
    } catch (err) {
      console.error('Błąd dodawania materiału:', err);
      toast.error(err, { fallback: tr('Nie udało się dodać materiału.') });
    } finally {
      setUploading(false);
    }
  };

  const deleteMaterial = async (file) => {
    if (!await confirmDialog({ title: tr('Usunąć materiał „{name}”?', { name: file.name }), message: tr('Plik zniknie też z zakładki „Pliki” i u członków grupy.'), confirmLabel: tr('Usuń'), danger: true })) return;
    try {
      if (file.storage_path) await supabase.storage.from('materials').remove([file.storage_path]);
      const { error } = await supabase.from('materials_files').delete().eq('id', file.id);
      if (error) throw error;
      await loadGroupMaterials(currentGroup);
      fetchData();
    } catch (err) {
      console.error('Błąd usuwania materiału:', err);
      toast.error(err, { fallback: tr('Nie udało się usunąć materiału.') });
    }
  };

  // Filtered data. `groups` jest już przefiltrowane po wybranym kampusie (withCampusFilter),
  // a members/leaders/tasks nie mają campus_id — wiążemy je przez grupę: pokazujemy tylko osoby
  // z grup widocznych w tym kampusie (osoby bez grupy oraz koordynatorzy globalni — zawsze).
  const visibleGroupIds = new Set(groups.map((g) => g.id));
  const inVisibleCampus = (groupId) => !groupId || visibleGroupIds.has(groupId);
  const term = searchTerm.trim().toLowerCase();
  const groupName = (id) => groups.find((g) => String(g.id) === String(id))?.name || '';

  const filteredGroups = groups.filter(g =>
    !term || g.name?.toLowerCase().includes(term) || (g.location || '').toLowerCase().includes(term)
  );

  // Liderzy = katalog liderów (z koordynatorami) + członkowie z rolą „Lider” w grupie, których
  // nie ma w katalogu — jeden widok zamiast trzech osobnych „liderów”.
  const leaderRows = (() => {
    const out = leaders.map((l) => {
      const ledIds = new Set();
      if (l.group_id) ledIds.add(String(l.group_id));
      members.filter((m) => m.group_id && isLeaderRow(m) && rowMatchesPerson(m, l)).forEach((m) => ledIds.add(String(m.group_id)));
      groups.filter((g) => g.leader_id === l.id).forEach((g) => ledIds.add(String(g.id)));
      return { ...l, _kind: 'catalog', _groups: [...ledIds] };
    });
    members.filter((m) => m.group_id && isLeaderRow(m)).forEach((m) => {
      if (out.some((l) => rowMatchesPerson(m, l))) return;
      const prev = out.find((l) => l._kind === 'member' && personKey(l) === personKey(m));
      if (prev) { if (!prev._groups.includes(String(m.group_id))) prev._groups.push(String(m.group_id)); return; }
      out.push({ ...m, _kind: 'member', _groups: [String(m.group_id)] });
    });
    return out;
  })();
  const filteredLeaders = leaderRows
    .filter(l => !term || l.full_name?.toLowerCase().includes(term))
    .filter(l => l.role === 'coordinator' || !l._groups.length || l._groups.some((g) => visibleGroupIds.has(g) || visibleGroupIds.has(Number(g))) || inVisibleCampus(l.group_id))
    .sort((a, b) => (a.role === 'coordinator' ? -1 : 0) - (b.role === 'coordinator' ? -1 : 0) || (a.full_name || '').localeCompare(b.full_name || '', 'pl'));

  const filteredMembers = members
    .filter(m => !term || m.full_name?.toLowerCase().includes(term) || (m.email || '').toLowerCase().includes(term))
    .filter(m => inVisibleCampus(m.group_id));

  const groupMembers = members
    .filter(m => currentGroup && String(m.group_id) === String(currentGroup.id))
    .sort((a, b) => (isLeaderRow(b) ? 1 : 0) - (isLeaderRow(a) ? 1 : 0) || (a.full_name || '').localeCompare(b.full_name || '', 'pl'));
  const addableCandidates = candidates.filter((c) => !groupMembers.some((m) => rowMatchesPerson(m, c)));

  const materialTypeOptions = [
    { value: 'Dokument', label: t('Dokument') },
    { value: 'Video', label: t('Video') },
    { value: 'Audio', label: t('Audio') },
    { value: 'Prezentacja', label: t('Prezentacja') },
    { value: 'Inne', label: t('Inne') }
  ];

  const candidateOptions = candidates.map((c) => ({ value: c.key, label: c.email ? `${c.full_name} · ${c.email}` : c.full_name }));
  const dayOptions = [
    { value: '', label: tr('Nie ustalono') },
    ...WEEKDAYS.map((d) => ({ value: d, label: tr(d) })),
    // Dotychczasowy wolny tekst (np. „co dwa tygodnie”) zostaje do wyboru, dopóki ktoś go nie zmieni.
    ...(groupForm.meeting_day && !WEEKDAYS.includes(groupForm.meeting_day) ? [{ value: groupForm.meeting_day, label: tr('{text} (dotychczasowy wpis)', { text: groupForm.meeting_day }) }] : []),
  ];
  const dupGroup = modalType === 'group' ? findDuplicateGroup(groupForm.name, groups, editingItem?.id) : null;
  const modalTitle = modalType === 'group'
    ? (editingItem ? tr('Edytuj grupę') : tr('Nowa grupa domowa'))
    : modalType === 'leader'
      ? (editingItem ? tr('Edytuj lidera') : tr('Nowy lider'))
      : (editingItem ? tr('Edytuj członka grupy') : tr('Nowy członek grupy'));
  const fieldCls = (err) => `w-full px-4 py-3 border rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 outline-none ${err ? 'border-red-400 dark:border-red-500 focus:ring-red-300/40' : 'border-gray-200 dark:border-gray-700 focus:ring-accent-primary-light'}`;
  const lblCls = 'block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1';
  const countLabel = (n, one, few, many) => plural(n, tr(one, { n }), tr(few, { n }), tr(many, { n }));

  if (loading) {
    return <Spinner center />;
  }

  return (
    <div className="space-y-8">
      <PageHeader moduleKey="homegroups" icon={Home} title={tr('Grupy domowe')} />

      {/* Tabs */}
      <ResponsiveTabs moduleKey="homegroups"
        tabs={[
          { id: 'groups', label: t('Grupy'), icon: Users },
          { id: 'map', label: tr('Mapa'), icon: MapPin },
          { id: 'tasks', label: t('Zadania'), icon: CheckSquare },
          { id: 'leaders', label: t('Liderzy'), icon: UserPlus },
          ...(hasTabAccess('homegroups', 'members') ? [{ id: 'members', label: t('Członkowie'), icon: Users }] : []),
          ...(hasTabAccess('homegroups', 'finances') ? [{ id: 'finances', label: t('Finanse'), icon: DollarSign }] : []),
          { id: 'events', label: t('Wydarzenia'), icon: Calendar },
          ...(hasTabAccess('homegroups', 'equipment') ? [{ id: 'equipment', label: t('Wyposażenie'), icon: Package }] : []),
          { id: 'files', label: t('Pliki'), icon: FolderOpen },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* GROUPS TAB */}
      {activeTab === 'groups' && (
        <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6 transition-colors">
          <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {tr('Grupy domowe')} <span className="text-gray-400 font-medium tabular-nums">({filteredGroups.length})</span>
            </h2>
            <div className="flex gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-none min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} aria-hidden="true" />
                <input
                  type="search"
                  aria-label={tr('Szukaj grupy')}
                  placeholder={t('Szukaj...')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-accent-primary-light outline-none"
                />
              </div>
              <Button data-tour="hg-add-group" onClick={() => openModal('group')} icon={Plus}>
                {tr('Dodaj grupę')}
              </Button>
            </div>
          </div>

          {filteredGroups.length === 0 ? (
            term
              ? <EmptyState icon={Search} title={tr('Brak grup pasujących do wyszukiwania')} action={<Button variant="secondary" onClick={() => setSearchTerm('')}>{tr('Wyczyść wyszukiwanie')}</Button>} />
              : <EmptyState icon={Home} title={tr('Nie ma jeszcze grup domowych')} subtitle={tr('Dodaj pierwszą grupę — od razu wskażesz też jej lidera.')} action={<Button icon={Plus} onClick={() => openModal('group')}>{tr('Dodaj grupę')}</Button>} />
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredGroups.map((group) => {
              const memberCount = members.filter(m => String(m.group_id) === String(group.id)).length;
              const gLeaders = groupLeaders(group, members, leaders);
              const missingLeader = leaderMissingFromGroup(group, members, leaders);

              return (
                <div key={group.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 hover:shadow-lg transition">
                  <div className="flex justify-between items-start mb-3 gap-2">
                    <h3 className="font-bold text-lg text-gray-800 dark:text-gray-100">{group.name}</h3>
                    <div className="flex gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => openModal('group', group)}
                        title={tr('Edytuj grupę')}
                        aria-label={tr('Edytuj grupę {name}', { name: group.name })}
                        className="p-2 text-accent-primary dark:text-accent-primary-light hover:bg-accent-primary-lightest dark:hover:bg-gray-800 rounded-lg"
                      >
                        <Pencil size={16} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(group, 'group')}
                        title={tr('Usuń grupę')}
                        aria-label={tr('Usuń grupę {name}', { name: group.name })}
                        className="p-2 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-gray-800 rounded-lg"
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  {group.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{group.description}</p>
                  )}

                  <div className="space-y-2 mb-4">
                    {gLeaders.length > 0 && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <UserPlus size={14} aria-hidden="true" />
                        <span><span className="sr-only">{tr('Lider')}: </span>{gLeaders.map((l) => l.full_name).join(', ')}</span>
                      </div>
                    )}
                    {missingLeader && (
                      <button type="button" onClick={() => fixLeaderMembership(group, missingLeader)}
                        className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 hover:underline text-left">
                        <AlertTriangle size={13} aria-hidden="true" /> {tr('Lider nie jest członkiem grupy — dodaj')}
                      </button>
                    )}
                    {group.meeting_day && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <Calendar size={14} aria-hidden="true" />
                        <span>{dayLabel(group.meeting_day)} {group.meeting_time && tr('o {time}', { time: String(group.meeting_time).slice(0, 5) })}</span>
                      </div>
                    )}
                    {(group.location || group.address) && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <MapPin size={14} aria-hidden="true" />
                        <span>{group.location || group.address}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 border-t border-gray-100 dark:border-gray-700 pt-3 mt-2">
                    <button
                      type="button"
                      onClick={() => { setCurrentGroup(group); setShowGroupMembersModal(true); }}
                      className="flex-1 bg-accent-primary-lightest dark:bg-gray-800 text-accent-primary dark:text-accent-primary-light text-xs font-bold py-2 rounded-xl hover:bg-accent-primary-lighter dark:hover:bg-gray-700 transition flex items-center justify-center gap-1"
                    >
                      <Users size={14} aria-hidden="true" /> {tr('Członkowie')} ({memberCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => openMaterialsModal(group)}
                      className="flex-1 bg-accent-secondary-lightest dark:bg-gray-800 text-accent-secondary dark:text-accent-secondary-light text-xs font-bold py-2 rounded-xl hover:bg-accent-secondary-lighter dark:hover:bg-gray-700 transition flex items-center justify-center gap-1"
                    >
                      <BookOpen size={14} aria-hidden="true" /> {tr('Materiały')} ({materialCounts[group.id] || 0})
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </section>
      )}

      {/* MAP TAB — mapa grup + wyszukiwanie najbliższej po adresie */}
      {activeTab === 'map' && (
        <section className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 p-6 transition-colors">
          <HomeGroupsMap groups={groups} leaders={leaders} members={members} />
        </section>
      )}

      {/* TASKS TAB — nowy silnik Tablic (Monday-style) */}
      {activeTab === 'tasks' && (
        <ModuleBoard sourceKind="home_group_tasks" moduleKey="homegroups" title={tr('Zadania grup domowych')} />
      )}
      {activeTab === 'leaders' && (
        <section className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6 transition-colors">
          <div className="flex flex-wrap justify-between items-center gap-3 mb-2">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
              {tr('Liderzy')} <span className="text-gray-400 font-medium tabular-nums">({filteredLeaders.length})</span>
            </h2>
            <div className="flex gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-none min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} aria-hidden="true" />
                <input
                  type="search"
                  aria-label={tr('Szukaj lidera')}
                  placeholder={t('Szukaj...')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-accent-primary-light outline-none"
                />
              </div>
              <Button onClick={() => openModal('leader')} icon={Plus}>
                {tr('Dodaj lidera')}
              </Button>
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">{tr('Lidera grupy najprościej ustawić w edycji grupy. Tutaj widać wszystkich liderów i koordynatorów.')}</p>

          <DataTable tableClassName="min-w-[640px]">
            <THead>
              <tr>
                <TH>{t('Imię i nazwisko')}</TH>
                <TH>{tr('Prowadzi grupę')}</TH>
                <TH>{tr('E-mail')}</TH>
                <TH>{t('Telefon')}</TH>
                <TH align="right"><span className="sr-only">{t('Akcje')}</span></TH>
              </tr>
            </THead>
            <tbody>
              {filteredLeaders.map((leader) => (
                <TR key={`${leader._kind}-${leader.id}`}>
                  <TD className="font-medium text-gray-900 dark:text-white">
                    <span className="inline-flex items-center gap-2">
                      {leader.full_name}
                      {leader.role === 'coordinator' && (
                        <StatusPill color={STATUS_COLORS.accent}>{tr('Koordynator')}</StatusPill>
                      )}
                    </span>
                  </TD>
                  <TD muted>{leader._groups.map(groupName).filter(Boolean).join(', ')}</TD>
                  <TD muted>{leader.email || ''}</TD>
                  <TD muted numeric>{leader.phone || ''}</TD>
                  <TD align="right">
                    <div className="flex justify-end gap-2 opacity-70 group-hover/row:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => openModal(leader._kind === 'member' ? 'member' : 'leader', leader)}
                        className="text-accent-primary dark:text-accent-primary-light font-medium hover:underline"
                        aria-label={tr('Edytuj: {name}', { name: leader.full_name })}
                      >
                        {tr('Edytuj')}
                      </button>
                      {leader._kind === 'catalog' && (
                        <button
                          type="button"
                          onClick={() => handleDelete(leader, 'leader')}
                          className="text-red-500 dark:text-red-400 font-medium hover:underline"
                          aria-label={tr('Usuń z liderów: {name}', { name: leader.full_name })}
                        >
                          {tr('Usuń')}
                        </button>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
              {filteredLeaders.length === 0 && (
                <EmptyRow colSpan={5}>{tr('Brak liderów')}</EmptyRow>
              )}
            </tbody>
          </DataTable>
        </section>
      )}

      {/* MEMBERS TAB */}
      {activeTab === 'members' && (
        <section className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6 transition-colors">
          <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
              {tr('Członkowie')} <span className="text-gray-400 font-medium tabular-nums">({filteredMembers.length})</span>
            </h2>
            <div className="flex gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-none min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} aria-hidden="true" />
                <input
                  type="search"
                  aria-label={tr('Szukaj członka grupy')}
                  placeholder={t('Szukaj...')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-accent-primary-light outline-none"
                />
              </div>
              <Button onClick={() => openModal('member')} icon={Plus}>
                {tr('Dodaj członka')}
              </Button>
            </div>
          </div>

          <DataTable tableClassName="min-w-[700px]">
            <THead>
              <tr>
                <TH>{t('Imię i nazwisko')}</TH>
                <TH>{tr('E-mail')}</TH>
                <TH>{t('Telefon')}</TH>
                <TH>{t('Grupa')}</TH>
                <TH align="right"><span className="sr-only">{t('Akcje')}</span></TH>
              </tr>
            </THead>
            <tbody>
              {filteredMembers.map((member) => {
                const gName = groupName(member.group_id);
                return (
                  <TR key={member.id}>
                    <TD className="font-medium text-gray-900 dark:text-white">{member.full_name}</TD>
                    <TD muted>{member.email || ''}</TD>
                    <TD muted numeric>{member.phone || ''}</TD>
                    <TD>
                      <span className="inline-flex items-center gap-1.5">
                        {gName ? (
                          <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light">
                            {gName}
                          </span>
                        ) : <span className="text-xs text-gray-500 dark:text-gray-400">{tr('bez grupy')}</span>}
                        {member.role && member.role !== 'member' && (
                          <StatusPill color={member.role === 'coordinator' ? STATUS_COLORS.accent : STATUS_COLORS.info}>
                            {member.role === 'coordinator' ? tr('Koordynator') : tr('Lider')}
                          </StatusPill>
                        )}
                      </span>
                    </TD>
                    <TD align="right">
                      <div className="flex justify-end gap-2 opacity-70 group-hover/row:opacity-100 focus-within:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => openModal('member', member)}
                          className="text-accent-primary dark:text-accent-primary-light font-medium hover:underline"
                          aria-label={tr('Edytuj: {name}', { name: member.full_name })}
                        >
                          {tr('Edytuj')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(member, 'member')}
                          className="text-red-500 dark:text-red-400 font-medium hover:underline"
                          aria-label={tr('Usuń: {name}', { name: member.full_name })}
                        >
                          {tr('Usuń')}
                        </button>
                      </div>
                    </TD>
                  </TR>
                );
              })}
              {filteredMembers.length === 0 && (
                <EmptyRow colSpan={5}>{tr('Brak członków')}</EmptyRow>
              )}
            </tbody>
          </DataTable>
        </section>
      )}

      {/* FINANCES TAB */}
      {activeTab === 'finances' && (
        <FinanceTab
          ministry="Grupy domowe"
          budgetItems={budgetItems}
          expenses={expenses}
          onAddExpense={() => setShowExpenseModal(true)}
          onRefresh={fetchFinanceData}
        />
      )}

      {/* EVENTS TAB */}
      {activeTab === 'events' && (
        <section className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 p-6 relative z-[50] transition-colors">
          <EventsTab ministry="homegroups" currentUserEmail={currentUserEmail} />
        </section>
      )}

      {/* FILES TAB */}
      {activeTab === 'files' && (
        <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors">
          <MaterialsTab moduleKey="homegroups" canEdit={true} />
        </section>
      )}

      {/* EQUIPMENT TAB */}
      {activeTab === 'equipment' && (
        <EquipmentTab
          ministryKey="homegroups"
          currentUserEmail={currentUserEmail}
          canEdit={hasTabAccess('homegroups', 'equipment')}
        />
      )}

      {/* MODAL: Group/Leader/Member */}
      <Modal
        isOpen={showModal}
        onClose={closeModal}
        closeOnBackdrop={false}
        size="lg"
        title={modalTitle}
        footer={<>
          <Button variant="secondary" onClick={closeModal}>{tr('Anuluj')}</Button>
          <Button data-tour="hg-group-save" loading={modalType === 'group' ? savingGroup : undefined} onClick={() => (modalType === 'group' ? handleSaveGroup() : handleSavePerson(modalType))}>
            {tr('Zapisz')}
          </Button>
        </>}
      >
            <div className="p-6">
              {modalType === 'group' ? (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="hg-name" className={lblCls}>{tr('Nazwa grupy *')}</label>
                    <input
                      id="hg-name"
                      data-tour="hg-group-name"
                      aria-invalid={!!groupErrors.name}
                      className={fieldCls(groupErrors.name)}
                      value={groupForm.name}
                      onChange={(e) => { setGroupForm({...groupForm, name: e.target.value}); if (groupErrors.name) setGroupErrors({ ...groupErrors, name: undefined }); }}
                    />
                    {groupErrors.name && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{groupErrors.name}</p>}
                    {!groupErrors.name && dupGroup && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{tr('Grupa o tej nazwie już istnieje. Dodaj wyróżnik, np. dzielnicę.')}</p>}
                  </div>
                  <div>
                    <label htmlFor="hg-desc" className={lblCls}>{t('Opis')}</label>
                    <textarea
                      id="hg-desc"
                      className={`${fieldCls(false)} resize-none`}
                      rows={3}
                      value={groupForm.description}
                      onChange={(e) => setGroupForm({...groupForm, description: e.target.value})}
                    />
                  </div>
                  <div>
                    <CustomSelect
                      label={tr('Lider grupy')}
                      value={groupForm.leader_key}
                      onChange={(val) => { setGroupForm({ ...groupForm, leader_key: val }); if (groupErrors.new_leader) setGroupErrors({ ...groupErrors, new_leader: undefined }); }}
                      options={[
                        { value: '', label: tr('Bez lidera') },
                        { value: NEW_PERSON, label: tr('+ Dodaj nową osobę') },
                        ...candidateOptions,
                      ]}
                      placeholder={tr('Wybierz osobę...')}
                    />
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 ml-1">{tr('Lider zostanie też członkiem tej grupy z rolą „Lider”.')}</p>
                    {groupForm.leader_key === NEW_PERSON && (
                      <div className="mt-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-3">
                          <label htmlFor="hg-new-leader-name" className={lblCls}>{tr('Imię i nazwisko lidera *')}</label>
                          <input id="hg-new-leader-name" aria-invalid={!!groupErrors.new_leader} className={fieldCls(groupErrors.new_leader)}
                            value={groupForm.new_leader.full_name}
                            onChange={(e) => { setGroupForm({ ...groupForm, new_leader: { ...groupForm.new_leader, full_name: e.target.value } }); if (groupErrors.new_leader) setGroupErrors({ ...groupErrors, new_leader: undefined }); }} />
                          {groupErrors.new_leader && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{groupErrors.new_leader}</p>}
                        </div>
                        <div className="sm:col-span-2">
                          <label htmlFor="hg-new-leader-email" className={lblCls}>{tr('E-mail')}</label>
                          <input id="hg-new-leader-email" type="email" className={fieldCls(false)} value={groupForm.new_leader.email}
                            onChange={(e) => setGroupForm({ ...groupForm, new_leader: { ...groupForm.new_leader, email: e.target.value } })} />
                        </div>
                        <div>
                          <label htmlFor="hg-new-leader-phone" className={lblCls}>{t('Telefon')}</label>
                          <input id="hg-new-leader-phone" type="tel" className={fieldCls(false)} value={groupForm.new_leader.phone}
                            onChange={(e) => setGroupForm({ ...groupForm, new_leader: { ...groupForm.new_leader, phone: e.target.value } })} />
                        </div>
                        <p className="sm:col-span-3 text-[11px] text-gray-500 dark:text-gray-400">{tr('Z e-mailem lider zobaczy swoją grupę w aplikacji po zalogowaniu.')}</p>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div data-tour="hg-group-day">
                      <CustomSelect
                        label={tr('Dzień spotkania')}
                        value={groupForm.meeting_day}
                        onChange={(val) => setGroupForm({ ...groupForm, meeting_day: val })}
                        options={dayOptions}
                        placeholder={tr('Wybierz dzień...')}
                      />
                    </div>
                    <div>
                      <label className={lblCls}>{t('Godzina')}</label>
                      <TimeField
                        className={fieldCls(false)}
                        value={groupForm.meeting_time}
                        onChange={(e) => setGroupForm({...groupForm, meeting_time: e.target.value})}
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="hg-location" className={lblCls}>{tr('Miejsce spotkań')}</label>
                    <input
                      id="hg-location"
                      data-tour="hg-group-location"
                      className={fieldCls(false)}
                      placeholder={tr('np. u Kowalskich, Leśnica')}
                      value={groupForm.location}
                      onChange={(e) => setGroupForm({...groupForm, location: e.target.value})}
                    />
                  </div>
                  <div>
                    <label htmlFor="hg-address" className={lblCls}>{tr('Adres (do mapy)')}</label>
                    <input
                      id="hg-address"
                      className={fieldCls(false)}
                      placeholder={tr('Ulica, numer, miasto')}
                      value={groupForm.address}
                      onChange={(e) => setGroupForm({...groupForm, address: e.target.value})}
                    />
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 ml-1">{tr('Po tym adresie grupa pojawi się na mapie. Bez adresu mapa spróbuje użyć miejsca spotkań.')}</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="hg-phone" className={lblCls}>{t('Telefon')}</label>
                      <input
                        id="hg-phone"
                        type="tel"
                        className={fieldCls(false)}
                        value={groupForm.phone}
                        onChange={(e) => setGroupForm({...groupForm, phone: e.target.value})}
                      />
                    </div>
                    <div>
                      <label htmlFor="hg-email" className={lblCls}>{tr('E-mail')}</label>
                      <input
                        id="hg-email"
                        type="email"
                        className={fieldCls(false)}
                        value={groupForm.email}
                        onChange={(e) => setGroupForm({...groupForm, email: e.target.value})}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {!editingItem && candidates.length > 0 && (
                    <div>
                      <CustomSelect
                        label={tr('Wybierz osobę z bazy (opcjonalnie)')}
                        value=""
                        onChange={(val) => {
                          const c = candidateByKey(val);
                          if (c) { setPersonForm({ ...personForm, full_name: c.full_name, email: c.email || '', phone: c.phone || '' }); setPersonErrors({}); }
                        }}
                        options={[{ value: '', label: tr('Wpiszę dane ręcznie') }, ...candidateOptions]}
                        placeholder={tr('Wybierz osobę...')}
                      />
                    </div>
                  )}
                  <div>
                    <label htmlFor="hg-person-name" className={lblCls}>{tr('Imię i nazwisko *')}</label>
                    <input
                      id="hg-person-name"
                      aria-invalid={!!personErrors.full_name}
                      className={fieldCls(personErrors.full_name)}
                      value={personForm.full_name}
                      onChange={(e) => { setPersonForm({...personForm, full_name: e.target.value}); if (personErrors.full_name) setPersonErrors({ ...personErrors, full_name: undefined }); }}
                    />
                    {personErrors.full_name && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{personErrors.full_name}</p>}
                  </div>
                  <div>
                    <label htmlFor="hg-person-email" className={lblCls}>{tr('E-mail')}</label>
                    <input
                      id="hg-person-email"
                      type="email"
                      className={fieldCls(false)}
                      value={personForm.email}
                      onChange={(e) => setPersonForm({...personForm, email: e.target.value})}
                    />
                  </div>
                  <div>
                    <label htmlFor="hg-person-phone" className={lblCls}>{t('Telefon')}</label>
                    <input
                      id="hg-person-phone"
                      type="tel"
                      className={fieldCls(false)}
                      value={personForm.phone}
                      onChange={(e) => setPersonForm({...personForm, phone: e.target.value})}
                    />
                  </div>
                  {modalType === 'leader' && (
                    <>
                      <div>
                        <CustomSelect
                          label={tr('Funkcja')}
                          value={personForm.role}
                          onChange={(val) => setPersonForm({ ...personForm, role: val })}
                          options={[
                            { value: 'leader', label: tr('Lider grupy') },
                            { value: 'coordinator', label: tr('Koordynator (Lider Grup domowych)') },
                          ]}
                        />
                      </div>
                      {personForm.role !== 'coordinator' && (
                        <div>
                          <CustomSelect
                            label={tr('Prowadzi grupę')}
                            value={personForm.group_id}
                            onChange={(val) => setPersonForm({ ...personForm, group_id: val })}
                            options={[{ value: '', label: tr('Jeszcze nie przypisano') }, ...groups.map(g => ({ value: g.id, label: g.name }))]}
                            placeholder={t('Wybierz grupę...')}
                          />
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 ml-1">{tr('Lider zostanie też członkiem tej grupy z rolą „Lider”.')}</p>
                        </div>
                      )}
                    </>
                  )}
                  {modalType === 'member' && (
                    <>
                      <div>
                        <CustomSelect
                          label={tr('Grupa *')}
                          value={personForm.group_id}
                          onChange={(val) => { setPersonForm({...personForm, group_id: val}); if (personErrors.group_id) setPersonErrors({ ...personErrors, group_id: undefined }); }}
                          options={groups.map(g => ({ value: g.id, label: g.name }))}
                          placeholder={t('Wybierz grupę...')}
                        />
                        {personErrors.group_id && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{personErrors.group_id}</p>}
                      </div>
                      <div>
                        <CustomSelect
                          label={tr('Rola w tej grupie')}
                          value={personForm.role === 'coordinator' ? 'leader' : personForm.role}
                          onChange={(val) => setPersonForm({ ...personForm, role: val })}
                          options={[
                            { value: 'member', label: tr('Członek') },
                            { value: 'leader', label: tr('Lider') },
                          ]}
                        />
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 ml-1">{tr('Tę samą osobę możesz dodać do kilku grup z różnymi rolami. Koordynatora (nad liderami) ustawisz w zakładce „Liderzy".')}</p>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
      </Modal>

      {/* MODAL: Group Members */}
      {showGroupMembersModal && currentGroup && (
      <Modal
        isOpen
        onClose={closeGroupMembers}
        closeOnBackdrop={false}
        size="xl"
        title={tr('Członkowie: {name}', { name: currentGroup.name })}
        subtitle={[
          currentGroup.meeting_day ? `${dayLabel(currentGroup.meeting_day)}${currentGroup.meeting_time ? ` ${tr('o {time}', { time: String(currentGroup.meeting_time).slice(0, 5) })}` : ''}` : null,
          currentGroup.location || currentGroup.address || null,
          groupLeaders(currentGroup, members, leaders).length ? `${tr('Lider')}: ${groupLeaders(currentGroup, members, leaders).map((l) => l.full_name).join(', ')}` : null,
        ].filter(Boolean).join(' · ') || undefined}
      >
            <div className="p-6">
              <div className="bg-accent-primary-lightest dark:bg-gray-800 p-4 rounded-xl mb-4 flex flex-col sm:flex-row gap-3 sm:items-end">
                <div className="flex-1">
                  <CustomSelect
                    label={tr('Dodaj osobę do grupy')}
                    value={addPersonKey}
                    onChange={setAddPersonKey}
                    options={[
                      { value: '', label: t('Wybierz...') },
                      ...addableCandidates.map((c) => ({ value: c.key, label: c.email ? `${c.full_name} · ${c.email}` : c.full_name })),
                    ]}
                    placeholder={t('Wybierz...')}
                  />
                </div>
                <Button onClick={attachMemberToGroup} disabled={!addPersonKey} className="h-[46px]">
                  {tr('Dodaj')}
                </Button>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">
                {tr('Nie ma tej osoby na liście?')}{' '}
                <button type="button" className="underline hover:text-accent-primary" onClick={() => openModal('member', null, { groupId: currentGroup.id })}>{tr('Dodaj nową osobę')}</button>
              </p>

              <div className="flex-1 overflow-y-auto">
                <DataTable>
                  <THead>
                    <tr>
                      <TH>{t('Imię')}</TH>
                      <TH>{tr('E-mail')}</TH>
                      <TH>{t('Telefon')}</TH>
                      <TH align="right"><span className="sr-only">{t('Akcja')}</span></TH>
                    </tr>
                  </THead>
                  <tbody>
                    {groupMembers.map(m => (
                      <TR key={m.id}>
                        <TD className="font-medium text-gray-900 dark:text-white">
                          <span className="inline-flex items-center gap-2">
                            {m.full_name}
                            {isLeaderRow(m) && <StatusPill color={STATUS_COLORS.info}>{m.role === 'coordinator' ? tr('Koordynator') : tr('Lider')}</StatusPill>}
                          </span>
                        </TD>
                        <TD muted>{m.email || ''}</TD>
                        <TD muted numeric>{m.phone ? <a href={`tel:${String(m.phone).replace(/\s/g, '')}`} className="hover:underline">{m.phone}</a> : ''}</TD>
                        <TD align="right">
                          <button
                            type="button"
                            onClick={() => detachMemberFromGroup(m)}
                            aria-label={tr('Odłącz od grupy: {name}', { name: m.full_name })}
                            className="text-red-500 dark:text-red-400 hover:underline text-xs font-bold opacity-70 group-hover/row:opacity-100 focus:opacity-100 transition-opacity"
                          >
                            {tr('Odłącz')}
                          </button>
                        </TD>
                      </TR>
                    ))}
                    {groupMembers.length === 0 && (
                      <EmptyRow colSpan={4}>{tr('Brak członków w tej grupie')}</EmptyRow>
                    )}
                  </tbody>
                </DataTable>
                {groupMembers.length > 0 && (
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{countLabel(groupMembers.length, '{n} osoba w grupie', '{n} osoby w grupie', '{n} osób w grupie')}</p>
                )}
              </div>
            </div>
      </Modal>
      )}

      {/* MODAL: Materials */}
      {showMaterialsModal && currentGroup && (
      <Modal
        isOpen
        onClose={() => setShowMaterialsModal(false)}
        closeOnBackdrop={false}
        size="lg"
        title={tr('Materiały: {name}', { name: currentGroup.name })}
      >
            <div className="p-6">
              <div className="bg-accent-secondary-lightest dark:bg-gray-800 p-4 rounded-xl mb-4 space-y-2">
                <input
                  className="w-full p-3 rounded-xl border dark:bg-gray-900 dark:border-gray-600 dark:text-white"
                  placeholder={t('Nazwa')}
                  value={materialForm.title}
                  onChange={(e) => setMaterialForm({...materialForm, title: e.target.value})}
                />
                <div className="flex gap-2 items-center">
                  <div className="flex-1">
                    <CustomSelect
                      value={materialForm.type}
                      onChange={(val) => setMaterialForm({...materialForm, type: val})}
                      options={materialTypeOptions}
                    />
                  </div>
                  <input
                    type="file"
                    id="file-upload"
                    className="hidden"
                    onChange={(e) => setMaterialForm({...materialForm, attachment: e.target.files[0]})}
                  />
                  <button
                    onClick={() => document.getElementById('file-upload').click()}
                    className={`border px-4 rounded-xl flex items-center gap-2 h-[46px] transition ${materialForm.attachment ? 'bg-accent-secondary-lighter border-accent-secondary-light text-accent-secondary' : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-500 text-gray-600 dark:text-gray-300'}`}
                  >
                    <Upload size={16}/> {materialForm.attachment ? tr('Plik wybrany') : tr('Plik')}
                  </button>
                  <button
                    onClick={addMaterial}
                    disabled={uploading}
                    className="bg-accent-secondary text-white px-6 rounded-xl font-bold hover:bg-accent-secondary h-[46px] disabled:opacity-50"
                  >
                    {uploading ? tr('Wysyłanie…') : tr('Dodaj')}
                  </button>
                </div>
              </div>

              <p className="text-[11px] text-gray-400 mb-2">{tr('Materiały trafiają do zakładki „Pliki" (folder „{name}") i są udostępnione członkom tej grupy. Pliki dodane w „Plikach" w tym folderze też pojawią się tutaj.', { name: currentGroup.name })}</p>
              <div className="flex-1 overflow-y-auto space-y-2">
                {groupMaterials.map(m => {
                  const url = supabase.storage.from('materials').getPublicUrl(m.storage_path).data.publicUrl;
                  return (
                  <div key={m.id} className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="bg-accent-secondary-lighter dark:bg-accent-secondary-darkest/40 p-2 rounded-lg text-accent-secondary dark:text-accent-secondary-light">
                        <BookOpen size={18}/>
                      </div>
                      <div>
                        <div className="font-bold text-gray-800 dark:text-gray-200">{m.name}</div>
                        {m.description && <div className="text-xs text-gray-500 dark:text-gray-400">{m.description}</div>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={tr('Otwórz: {name}', { name: m.name })}
                        title={tr('Otwórz')}
                        className="text-accent-secondary hover:bg-accent-secondary-lightest p-2 rounded-lg"
                      >
                        <LinkIcon size={18} aria-hidden="true" />
                      </a>
                      <button
                        type="button"
                        onClick={() => deleteMaterial(m)}
                        aria-label={tr('Usuń materiał: {name}', { name: m.name })}
                        title={tr('Usuń')}
                        className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 p-2 rounded-lg"
                      >
                        <Trash2 size={18} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  );
                })}
                {groupMaterials.length === 0 && (
                  <EmptyState compact icon={BookOpen} title={tr('Brak materiałów')} />
                )}
              </div>
            </div>
      </Modal>
      )}

      {/* MODAL: Add Expense */}
      <Modal
        isOpen={showExpenseModal}
        onClose={() => setShowExpenseModal(false)}
        closeOnBackdrop={false}
        size="lg"
        title={`${tr('Dodaj wydatek')} - ${tr(expenseForm.ministry)}`}
        footer={<>
          <Button variant="secondary" onClick={() => setShowExpenseModal(false)}>{tr('Anuluj')}</Button>
          <Button onClick={saveExpense}>
            {tr('Zapisz wydatek')}
          </Button>
        </>}
      >
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{t('Data')}</label>
                <DateInput
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  value={expenseForm.payment_date}
                  onChange={(e) => setExpenseForm({...expenseForm, payment_date: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{t('Kwota (PLN)')}</label>
                <input
                  type="number"
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({...expenseForm, amount: e.target.value})}
                  placeholder="0.00"
                />
              </div>
              <CustomSelect
                label={tr('Pozycja budżetowa')}
                value={expenseForm.description}
                onChange={(value) => setExpenseForm({...expenseForm, description: value})}
                options={[
                  { value: '', label: t('Wybierz pozycję') },
                  ...budgetItems.map(item => ({
                    value: item.description,
                    label: item.description
                  }))
                ]}
                placeholder={t('Wybierz pozycję')}
              />
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{t('Kontrahent')}</label>
                <input
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  value={expenseForm.contractor}
                  onChange={(e) => setExpenseForm({...expenseForm, contractor: e.target.value})}
                  placeholder={t('Nazwa firmy/osoby')}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{t('Szczegółowy opis')}</label>
                <textarea
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
                  rows={2}
                  value={expenseForm.detailed_description}
                  onChange={(e) => setExpenseForm({...expenseForm, detailed_description: e.target.value})}
                  placeholder={t('Dodatkowe informacje...')}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{t('Osoba odpowiedzialna')}</label>
                <input
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  value={expenseForm.responsible_person}
                  onChange={(e) => setExpenseForm({...expenseForm, responsible_person: e.target.value})}
                  placeholder={t('Imię i nazwisko')}
                />
              </div>
            </div>
      </Modal>
    </div>
  );
}
