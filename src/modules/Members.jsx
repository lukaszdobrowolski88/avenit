import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import {
  Plus, Search, Trash2, Edit2, X, User,
  Mail, Phone, CheckCircle, XCircle,
  MapPin, Users, Home, Calendar, FileText,
  Upload, Eye, Check, FolderOpen
} from 'lucide-react';
import CustomSelect from '../components/CustomSelect';
import CustomDatePicker from '../components/CustomDatePicker';
import MaterialsTab from './shared/MaterialsTab';
import ResponsiveTabs from '../components/ResponsiveTabs';
import HouseholdManager from './Kids/components/HouseholdManager';

// --- STAŁE DANE ---

const STATUS_OPTIONS = [
  "Członek",
  "Sympatyk",
  "Gość"
];

const MINISTRY_OPTIONS = [
  { key: 'media_team', label: 'Media Team', table: 'media_team' },
  { key: 'atmosfera_team', label: 'Atmosfera Team', table: 'atmosfera_members' },
  { key: 'worship_team', label: 'Grupa Uwielbienia', table: 'worship_team' },
  { key: 'home_groups', label: 'Grupy Domowe', table: 'home_group_members' },
  { key: 'kids_ministry', label: 'Małe SchWro', table: 'kids_teachers' },
  { key: 'administration', label: 'Administracja', table: null }
];

// --- GŁÓWNY KOMPONENT ---

export default function Members() {
  const [activeTab, setActiveTab] = useState('members');
  const [members, setMembers] = useState([]);
  const [homeGroups, setHomeGroups] = useState([]);
  const [households, setHouseholds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Stan modala
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    id: null,
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    address: '',
    home_group_id: '',
    household_id: '',
    status: 'Sympatyk',
    membership_date: '',
    membership_declaration_url: '',
    ministries: []
  });

  // Upload state
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [membersResult, groupsResult, householdsResult] = await Promise.all([
        supabase.from('members').select('*').order('last_name'),
        supabase.from('home_groups').select('id, name').order('name'),
        supabase.from('households').select('*').order('family_name')
      ]);

      if (membersResult.error) throw membersResult.error;
      if (groupsResult.error) throw groupsResult.error;
      if (householdsResult.error) throw householdsResult.error;

      setMembers(membersResult.data || []);
      setHomeGroups(groupsResult.data || []);
      setHouseholds(householdsResult.data || []);
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

    // Dodaj group_id dla home_group_members
    if (ministry.table === 'home_group_members' && memberData.home_group_id) {
      insertData.group_id = memberData.home_group_id;
    }

    await supabase.from(ministry.table).insert([insertData]);
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
      const { id, ...dataToSave } = formData;

      if (!dataToSave.first_name || !dataToSave.last_name) {
        alert("Imię i nazwisko są wymagane");
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
      if (!dataToSave.home_group_id) dataToSave.home_group_id = null;
      if (!dataToSave.household_id) dataToSave.household_id = null;
      if (!dataToSave.address) dataToSave.address = null;
      if (!dataToSave.email) dataToSave.email = null;
      if (!dataToSave.phone) dataToSave.phone = null;

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
          alert('Błąd zapisu: ' + (error.message || JSON.stringify(error)));
          setSaving(false);
          return;
        }
      } else {
        const { error } = await supabase
          .from('members')
          .insert([dataToSave]);
        if (error) {
          console.error('Supabase insert error:', error);
          alert('Błąd zapisu: ' + (error.message || JSON.stringify(error)));
          setSaving(false);
          return;
        }
      }

      // Synchronizuj służby
      await syncMinistries({ ...dataToSave, email: dataToSave.email }, oldMinistries);

      setShowModal(false);
      fetchData();
    } catch (error) {
      console.error('Błąd zapisu:', error);
      alert('Wystąpił błąd podczas zapisywania.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Czy na pewno chcesz usunąć tego członka?')) return;

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
        household_id: member.household_id || '',
        status: member.status || 'Sympatyk',
        membership_date: member.membership_date || '',
        membership_declaration_url: member.membership_declaration_url || '',
        ministries: member.ministries || []
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
        household_id: '',
        status: 'Sympatyk',
        membership_date: '',
        membership_declaration_url: '',
        ministries: []
      });
    }
    setShowModal(true);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert('Proszę wybrać plik PDF');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('Plik jest za duży. Maksymalny rozmiar to 10MB');
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
      alert('Błąd podczas przesyłania pliku');
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
      return ministry?.label || key;
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

    return matchesSearch && matchesStatus;
  });

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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600 dark:border-pink-400 mx-auto"></div>
        <div className="mt-4 text-gray-600 dark:text-gray-400">Ładowanie bazy członków...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-pink-600 to-orange-600 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent">
          Baza Członków
        </h1>
      </div>

      {/* TAB NAVIGATION */}
      <ResponsiveTabs
        tabs={[
          { id: 'members', label: 'Członkowie', icon: Users },
          { id: 'households', label: 'Rodziny', icon: Home },
          { id: 'files', label: 'Pliki', icon: FolderOpen },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* MEMBERS TAB */}
      {activeTab === 'members' && (
      <section className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-gray-700/50 p-6 transition-colors duration-300">

        <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
          <div className="flex-1 w-full md:w-auto flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={20} />
              <input
                className="w-full pl-10 pr-4 py-2.5 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl focus:ring-2 focus:ring-pink-500/20 outline-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 transition-colors"
                placeholder="Szukaj..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="flex bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm p-1 rounded-xl border border-gray-200/50 dark:border-gray-700/50 gap-1">
              <button onClick={() => setStatusFilter('all')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${statusFilter === 'all' ? 'bg-white dark:bg-gray-700 shadow text-pink-600 dark:text-pink-300' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>Wszyscy</button>
              <button onClick={() => setStatusFilter('Członek')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${statusFilter === 'Członek' ? 'bg-white dark:bg-gray-700 shadow text-green-600 dark:text-green-300' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>Członkowie</button>
              <button onClick={() => setStatusFilter('Sympatyk')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${statusFilter === 'Sympatyk' ? 'bg-white dark:bg-gray-700 shadow text-blue-600 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>Sympatycy</button>
              <button onClick={() => setStatusFilter('Gość')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${statusFilter === 'Gość' ? 'bg-white dark:bg-gray-700 shadow text-gray-600 dark:text-gray-300' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>Goście</button>
            </div>
          </div>

          <button
            onClick={() => openModal()}
            className="bg-gradient-to-r from-pink-600 to-orange-600 dark:from-pink-500 dark:to-orange-500 text-white text-sm px-6 py-2.5 rounded-xl font-bold hover:shadow-lg hover:shadow-pink-500/30 transition flex items-center gap-2 whitespace-nowrap"
          >
            <Plus size={18} /> Dodaj osobę
          </button>
        </div>

        <div className="bg-white/50 dark:bg-gray-800/30 backdrop-blur-sm rounded-2xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[800px]">
            <thead className="bg-gradient-to-r from-pink-50/80 to-orange-50/80 dark:from-pink-900/20 dark:to-orange-900/20 text-gray-700 dark:text-gray-300 font-bold border-b border-gray-200/50 dark:border-gray-700/50">
              <tr>
                <th className="p-4 pl-6">Osoba</th>
                <th className="p-4">Kontakt & Adres</th>
                <th className="p-4">Rodzina</th>
                <th className="p-4">Grupa Domowa</th>
                <th className="p-4">Służby</th>
                <th className="p-4">Status</th>
                <th className="p-4 pr-6 text-right">Akcje</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200/50 dark:divide-gray-700/50">
              {filteredMembers.map((member) => (
                <tr key={member.id} className="hover:bg-pink-50/30 dark:hover:bg-pink-900/10 transition duration-200">
                  <td className="p-4 pl-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-100 to-orange-100 dark:from-pink-900 dark:to-orange-900 flex items-center justify-center text-pink-700 dark:text-pink-300 font-bold shadow-sm border border-white dark:border-gray-700">
                        {member.first_name?.[0]}{member.last_name?.[0]}
                      </div>
                      <div>
                        <div className="font-bold text-gray-800 dark:text-gray-200">{member.first_name} {member.last_name}</div>
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
                      {member.email && <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 text-xs"><Mail size={14} className="text-pink-400" /> {member.email}</div>}
                      {member.phone && <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 text-xs"><Phone size={14} className="text-orange-400" /> {member.phone}</div>}
                      {member.address && <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 text-xs"><MapPin size={14} className="text-green-500" /> {member.address}</div>}
                    </div>
                  </td>

                  <td className="p-4">
                    {(() => {
                      const household = getHousehold(member.household_id);
                      return household ? (
                        <span className="inline-flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30 text-blue-700 dark:text-blue-300 px-2.5 py-1 rounded-md text-xs font-medium">
                          <Users size={12} /> {household.family_name}
                          {household.phone_last_four && <span className="text-blue-500 dark:text-blue-400">(...{household.phone_last_four})</span>}
                        </span>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-600 text-xs">-</span>
                      );
                    })()}
                  </td>

                  <td className="p-4">
                    {member.home_group_id ? (
                      <span className="inline-flex items-center gap-1.5 bg-pink-50 dark:bg-pink-900/20 border border-pink-100 dark:border-pink-800/30 text-pink-700 dark:text-pink-300 px-2.5 py-1 rounded-md text-xs font-medium">
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
                            <User size={12} className="text-pink-500" /> {label}
                          </span>
                        ))
                      ) : (
                        <span className="text-gray-400 dark:text-gray-600 text-xs">-</span>
                      )}
                    </div>
                  </td>

                  <td className="p-4">
                    <div className="flex flex-col gap-1.5">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${getStatusColor(member.status)}`}>
                        {member.status === 'Członek' ? <CheckCircle size={12} /> : member.status === 'Sympatyk' ? <Users size={12} /> : <XCircle size={12} />}
                        {member.status || 'Gość'}
                      </span>
                      {member.status === 'Członek' && member.membership_declaration_url && (
                        <a
                          href={member.membership_declaration_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-pink-600 dark:text-pink-400 hover:underline"
                        >
                          <FileText size={12} /> Deklaracja
                        </a>
                      )}
                    </div>
                  </td>

                  <td className="p-4 pr-6 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openModal(member)} className="p-2 text-pink-600 dark:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-900/30 rounded-lg transition"><Edit2 size={18} /></button>
                      <button onClick={() => handleDelete(member.id)} className="p-2 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition"><Trash2 size={18} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          {filteredMembers.length === 0 && (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              Brak wyników do wyświetlenia
            </div>
          )}
        </div>
      </section>
      )}

      {/* HOUSEHOLDS TAB */}
      {activeTab === 'households' && (
        <section className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-gray-700/50 overflow-hidden transition-colors duration-300">
          <HouseholdManager />
        </section>
      )}

      {/* FILES TAB */}
      {activeTab === 'files' && (
        <section className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-gray-700/50 overflow-hidden transition-colors duration-300">
          <MaterialsTab moduleKey="members" canEdit={true} />
        </section>
      )}

      {/* MODAL */}
      {showModal && document.body && createPortal(
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[100] transition-opacity">
          <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-3xl shadow-2xl w-full max-w-2xl p-8 border border-white/20 dark:border-gray-700/50 relative animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto custom-scrollbar">

            <div className="flex justify-between items-center mb-8">
              <h3 className="text-2xl font-bold bg-gradient-to-r from-pink-600 to-orange-600 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent">
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
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Imię *</label>
                  <input
                    className="w-full px-4 py-3 border border-gray-200/50 dark:border-gray-700/50 rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:ring-2 focus:ring-pink-500/20 outline-none text-gray-900 dark:text-gray-100"
                    value={formData.first_name}
                    onChange={e => setFormData({ ...formData, first_name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Nazwisko *</label>
                  <input
                    className="w-full px-4 py-3 border border-gray-200/50 dark:border-gray-700/50 rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:ring-2 focus:ring-pink-500/20 outline-none text-gray-900 dark:text-gray-100"
                    value={formData.last_name}
                    onChange={e => setFormData({ ...formData, last_name: e.target.value })}
                  />
                </div>
              </div>

              {/* Kontakt */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Email</label>
                <input
                  className="w-full px-4 py-3 border border-gray-200/50 dark:border-gray-700/50 rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:ring-2 focus:ring-pink-500/20 outline-none text-gray-900 dark:text-gray-100"
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Telefon</label>
                  <input
                    className="w-full px-4 py-3 border border-gray-200/50 dark:border-gray-700/50 rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:ring-2 focus:ring-pink-500/20 outline-none text-gray-900 dark:text-gray-100"
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                {/* DROPDOWN STATUSU */}
                <div>
                  <CustomSelect
                    label="Status"
                    value={formData.status}
                    options={STATUS_OPTIONS}
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
                    label="Data członkostwa"
                    value={formData.membership_date}
                    onChange={(date) => setFormData({ ...formData, membership_date: date })}
                    placeholder="Wybierz datę członkostwa"
                  />

                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Deklaracja członkostwa (PDF)</label>
                    {formData.membership_declaration_url ? (
                      <div className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                        <FileText size={24} className="text-pink-500" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Deklaracja załączona</p>
                          <a
                            href={formData.membership_declaration_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-pink-600 dark:text-pink-400 hover:underline flex items-center gap-1"
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
                      <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl cursor-pointer hover:border-pink-400 dark:hover:border-pink-500 transition bg-white/50 dark:bg-gray-800/50">
                        <div className="flex flex-col items-center justify-center">
                          {uploading ? (
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pink-600"></div>
                          ) : (
                            <>
                              <Upload size={24} className="text-gray-400 mb-2" />
                              <p className="text-sm text-gray-500 dark:text-gray-400">Kliknij, aby dodać plik PDF</p>
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
                    className="w-full pl-10 pr-4 py-3 border border-gray-200/50 dark:border-gray-700/50 rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:ring-2 focus:ring-pink-500/20 outline-none text-gray-900 dark:text-gray-100"
                    placeholder="Ulica, numer domu, miasto"
                    value={formData.address}
                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                  />
                </div>
              </div>

              {/* Rodzina (Household) */}
              <CustomSelect
                label="Rodzina (do Check-in)"
                placeholder="Wybierz rodzinę..."
                value={formData.household_id}
                onChange={(val) => setFormData({ ...formData, household_id: val })}
                options={[{ id: '', family_name: 'Brak', phone_last_four: '' }, ...households]}
                mapOptionToValue={(opt) => opt.id}
                mapOptionToLabel={(opt) => opt.family_name + (opt.phone_last_four ? ` (tel. ...${opt.phone_last_four})` : '')}
                icon={Users}
              />

              {/* Grupa Domowa */}
              <CustomSelect
                label="Grupa Domowa"
                placeholder="Wybierz grupę..."
                value={formData.home_group_id}
                onChange={(val) => setFormData({ ...formData, home_group_id: val })}
                options={[{ id: '', name: 'Brak' }, ...homeGroups]}
                mapOptionToValue={(opt) => opt.id}
                mapOptionToLabel={(opt) => opt.name}
                icon={Home}
              />

              {/* Służby */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Służby</label>
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
                              ? 'bg-gradient-to-r from-pink-500 to-orange-500 text-white shadow-md'
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
                  Wybór służby automatycznie doda osobę do odpowiedniego modułu.
                </p>
              </div>

              <div className="pt-6 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3">
                <button onClick={() => setShowModal(false)} className="px-6 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition">Anuluj</button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-8 py-3 bg-gradient-to-r from-pink-600 to-orange-600 dark:from-pink-500 dark:to-orange-500 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-pink-500/30 transition disabled:opacity-50"
                >
                  {saving ? 'Zapisywanie...' : 'Zapisz'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
