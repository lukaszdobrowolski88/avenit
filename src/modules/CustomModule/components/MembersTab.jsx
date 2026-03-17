import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import { Plus, Search, Trash2, X, User, Mail, Phone, Check, Edit2 } from 'lucide-react';

export default function MembersTab({ moduleKey, moduleName }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [form, setForm] = useState({ full_name: '', email: '', phone: '' });
  const [tableExists, setTableExists] = useState(true);

  // Służby z team_roles
  const [moduleRoles, setModuleRoles] = useState([]);
  const [memberRoles, setMemberRoles] = useState([]);
  const [selectedMemberRoles, setSelectedMemberRoles] = useState([]);

  const tableName = `custom_${moduleKey}_members`;

  // Pobierz służby dla tego modułu
  const fetchModuleRoles = async () => {
    try {
      const { data: rolesData } = await supabase
        .from('team_roles')
        .select('*')
        .eq('team_type', moduleKey)
        .eq('is_active', true)
        .order('display_order');
      setModuleRoles(rolesData || []);

      // Pobierz przypisania członków do służb
      const { data: memberRolesData } = await supabase
        .from('team_member_roles')
        .select('*')
        .eq('member_table', tableName);
      setMemberRoles(memberRolesData || []);
    } catch (err) {
      console.error('Błąd pobierania służb:', err);
    }
  };

  // Pobierz członków
  const fetchMembers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .order('full_name', { ascending: true });

      if (error) {
        // Wykryj różne warianty błędu "tabela nie istnieje"
        const errMsg = error.message?.toLowerCase() || '';
        const isTableMissing = error.code === '42P01' ||
          errMsg.includes('does not exist') ||
          errMsg.includes('schema cache') ||
          errMsg.includes('could not find');

        if (isTableMissing) {
          setTableExists(false);
          setMembers([]);
          setLoading(false);
          return;
        }
        throw error;
      }

      setTableExists(true);
      setMembers(data || []);
    } catch (err) {
      console.error('Błąd pobierania członków:', err);
      setMembers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
    fetchModuleRoles();
  }, [moduleKey]);

  // Filtrowanie
  const filteredMembers = members.filter(m =>
    m.full_name?.toLowerCase().includes(searchFilter.toLowerCase()) ||
    m.email?.toLowerCase().includes(searchFilter.toLowerCase())
  );

  // Pobierz służby członka do edycji
  const loadMemberRoles = (memberId) => {
    const roles = memberRoles
      .filter(mr => String(mr.member_id) === String(memberId))
      .map(mr => mr.role_id);
    setSelectedMemberRoles(roles);
  };

  // Pobierz nazwy służb członka
  const getMemberRoleNames = (memberId) => {
    const roleIds = memberRoles
      .filter(mr => String(mr.member_id) === String(memberId))
      .map(mr => mr.role_id);
    return moduleRoles
      .filter(r => roleIds.includes(r.id))
      .map(r => r.name);
  };

  // Zapisz członka
  const handleSave = async () => {
    if (!form.full_name) return;

    try {
      let memberId = editingMember?.id;
      let result;

      if (editingMember) {
        result = await supabase.from(tableName).update(form).eq('id', editingMember.id);
      } else {
        result = await supabase.from(tableName).insert([form]).select().single();
        if (result.data) memberId = result.data.id;
      }

      if (result.error) {
        // Wykryj różne warianty błędu "tabela nie istnieje"
        const errMsg = result.error.message?.toLowerCase() || '';
        const isTableMissing = result.error.code === '42P01' ||
          errMsg.includes('does not exist') ||
          errMsg.includes('schema cache') ||
          errMsg.includes('could not find');

        if (isTableMissing) {
          setTableExists(false);
          setShowModal(false);
          return;
        }
        throw result.error;
      }

      // Zapisz przypisania do służb
      if (memberId) {
        // Usuń obecne przypisania
        await supabase
          .from('team_member_roles')
          .delete()
          .eq('member_id', String(memberId))
          .eq('member_table', tableName);

        // Dodaj nowe przypisania
        if (selectedMemberRoles.length > 0) {
          const assignments = selectedMemberRoles.map(roleId => ({
            member_id: String(memberId),
            member_table: tableName,
            role_id: roleId
          }));
          await supabase.from('team_member_roles').insert(assignments);
        }
      }

      setShowModal(false);
      setEditingMember(null);
      setForm({ full_name: '', email: '', phone: '' });
      setSelectedMemberRoles([]);
      fetchMembers();
      fetchModuleRoles();
    } catch (err) {
      console.error('Błąd zapisu:', err);
      alert('Błąd zapisu członka: ' + err.message);
    }
  };

  // Usuń członka
  const handleDelete = async (id) => {
    if (!confirm('Usunąć tego członka?')) return;
    try {
      // Usuń przypisania do służb
      await supabase
        .from('team_member_roles')
        .delete()
        .eq('member_id', String(id))
        .eq('member_table', tableName);

      // Usuń członka
      await supabase.from(tableName).delete().eq('id', id);
      fetchMembers();
      fetchModuleRoles();
    } catch (err) {
      console.error('Błąd usuwania:', err);
    }
  };

  // Otwórz modal do edycji
  const openEditModal = (member) => {
    setEditingMember(member);
    setForm({
      full_name: member.full_name || '',
      email: member.email || '',
      phone: member.phone || ''
    });
    loadMemberRoles(member.id);
    setShowModal(true);
  };

  // Otwórz modal do dodawania
  const openAddModal = () => {
    setEditingMember(null);
    setForm({ full_name: '', email: '', phone: '' });
    setSelectedMemberRoles([]);
    setShowModal(true);
  };

  if (loading) {
    return (
      <div className="p-10 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-600 mx-auto"></div>
      </div>
    );
  }

  // Jeśli tabela nie istnieje, pokaż instrukcję
  if (!tableExists) {
    const sqlScript = `-- Utwórz tabelę ${tableName}
CREATE TABLE ${tableName} (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Włącz RLS
ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;

-- Polityka dostępu dla zalogowanych użytkowników
CREATE POLICY "${tableName}_policy" ON ${tableName}
  FOR ALL USING (true) WITH CHECK (true);

-- Uprawnienia
GRANT ALL ON ${tableName} TO authenticated;
GRANT ALL ON ${tableName} TO anon;`;

    return (
      <div className="p-8 text-center">
        <div className="max-w-2xl mx-auto bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-yellow-800 dark:text-yellow-200 mb-2">
            Tabela nie istnieje
          </h3>
          <p className="text-yellow-700 dark:text-yellow-300 mb-4">
            Aby korzystać z członków w tym module, utwórz tabelę w Supabase.
          </p>
          <div className="bg-gray-900 rounded-xl p-4 text-left overflow-x-auto">
            <pre className="text-green-400 text-xs whitespace-pre">{sqlScript}</pre>
          </div>
          <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-4">
            Skopiuj powyższy kod i wykonaj go w Supabase SQL Editor.
          </p>
          <button
            onClick={() => {
              navigator.clipboard.writeText(sqlScript);
              alert('Skopiowano do schowka!');
            }}
            className="mt-4 px-4 py-2 bg-yellow-600 text-white rounded-xl hover:bg-yellow-700 transition"
          >
            Skopiuj SQL
          </button>
          <button
            onClick={fetchMembers}
            className="mt-4 ml-2 px-4 py-2 bg-pink-600 text-white rounded-xl hover:bg-pink-700 transition"
          >
            Odśwież
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold bg-gradient-to-r from-pink-600 to-orange-600 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent">
          Członkowie ({filteredMembers.length})
        </h2>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Szukaj..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white text-sm focus:border-pink-500 outline-none"
            />
          </div>
          <button
            onClick={openAddModal}
            className="px-4 py-2 bg-gradient-to-r from-pink-600 to-orange-600 text-white rounded-xl font-medium flex items-center gap-2 hover:shadow-lg hover:shadow-pink-500/30 transition"
          >
            <Plus size={18} />
            Dodaj członka
          </button>
        </div>
      </div>

      {/* Lista członków */}
      {filteredMembers.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMembers.map(member => {
            const roleNames = getMemberRoleNames(member.id);
            return (
              <div
                key={member.id}
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 hover:shadow-md transition group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-orange-500 flex items-center justify-center text-white font-bold">
                      {member.full_name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-800 dark:text-white">{member.full_name}</h4>
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={() => openEditModal(member)}
                      className="p-1.5 text-gray-400 hover:text-pink-600 hover:bg-pink-50 dark:hover:bg-pink-900/20 rounded-lg transition"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(member.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Służby jako tagi */}
                {roleNames.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {roleNames.map((roleName, idx) => (
                      <span
                        key={idx}
                        className="text-xs bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 px-2 py-0.5 rounded-full"
                      >
                        {roleName}
                      </span>
                    ))}
                  </div>
                )}

                {(member.email || member.phone) && (
                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 space-y-1">
                    {member.email && (
                      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                        <Mail size={14} />
                        {member.email}
                      </div>
                    )}
                    {member.phone && (
                      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                        <Phone size={14} />
                        {member.phone}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-8 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl text-center">
          <User size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-4" />
          <p className="text-gray-500 dark:text-gray-400">Brak członków</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            Kliknij "Dodaj członka" aby dodać pierwszego członka
          </p>
        </div>
      )}

      {/* Modal */}
      {showModal && document.body && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-lg p-6 border border-white/20 dark:border-gray-700">
            <div className="flex justify-between mb-6">
              <h3 className="font-bold text-xl text-gray-800 dark:text-white">
                {editingMember ? 'Edytuj członka' : 'Nowy członek'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition text-gray-500 dark:text-gray-400"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              {/* Imię i nazwisko */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">
                  Imię i nazwisko
                </label>
                <input
                  type="text"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                  placeholder="Jan Kowalski"
                />
              </div>

              {/* Służby / Instrumenty jako tagi */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">
                  Służby / Instrumenty
                </label>
                <div className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 p-3">
                  <div className="flex flex-wrap gap-2">
                    {moduleRoles.map(role => {
                      const isSelected = selectedMemberRoles.includes(role.id);
                      return (
                        <button
                          key={role.id}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setSelectedMemberRoles(prev => prev.filter(id => id !== role.id));
                            } else {
                              setSelectedMemberRoles(prev => [...prev, role.id]);
                            }
                          }}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-gradient-to-r from-pink-500 to-orange-500 text-white shadow-md'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                          }`}
                        >
                          {isSelected && <Check size={14} />}
                          {role.name}
                        </button>
                      );
                    })}
                  </div>
                  {moduleRoles.length === 0 && (
                    <p className="text-gray-400 dark:text-gray-500 text-sm text-center py-2">
                      Brak zdefiniowanych służb. Dodaj je w zakładce "Służby".
                    </p>
                  )}
                </div>
              </div>

              {/* Telefon i Email w jednym wierszu */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">
                    Telefon
                  </label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                    placeholder="+48 123 456 789"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                    placeholder="jan@example.com"
                  />
                </div>
              </div>

              {/* Przyciski */}
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  Anuluj
                </button>
                <button
                  onClick={handleSave}
                  className="px-5 py-2.5 bg-gradient-to-r from-pink-600 to-orange-600 text-white rounded-xl hover:shadow-lg hover:shadow-pink-500/50 transition font-medium"
                >
                  Zapisz
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
