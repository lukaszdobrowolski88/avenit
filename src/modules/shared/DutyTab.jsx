import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { Plus, Trash2, X, Check, Edit2, Users, ChevronDown } from 'lucide-react';

// Hook do obliczania pozycji dropdowna
function useDropdownPosition(triggerRef, isOpen) {
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, openUpward: false });

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const updatePosition = () => {
        const rect = triggerRef.current.getBoundingClientRect();
        const dropdownMaxHeight = 240;
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const openUpward = spaceBelow < dropdownMaxHeight && spaceAbove > spaceBelow;

        setCoords({
          top: openUpward
            ? rect.top + window.scrollY - 4
            : rect.bottom + window.scrollY + 4,
          left: rect.left + window.scrollX,
          width: rect.width,
          openUpward
        });
      };
      updatePosition();
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
      };
    }
  }, [isOpen]);

  return coords;
}

// MultiSelect dla przypisywania członków do służby
const MemberMultiSelect = ({ members, selectedIds, onChange, roleId }) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef(null);
  const coords = useDropdownPosition(triggerRef, isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target) && !e.target.closest(`.member-select-portal-${roleId}`)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, roleId]);

  const toggleMember = (id) => {
    const idStr = String(id);
    const selectedIdsStr = selectedIds.map(String);
    const newSelection = selectedIdsStr.includes(idStr)
      ? selectedIds.filter(mid => String(mid) !== idStr)
      : [...selectedIds, id];
    onChange(newSelection);
  };

  const selectedMembers = members.filter(m => selectedIds.map(String).includes(String(m.id)));

  return (
    <div ref={triggerRef} className="relative">
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="w-full min-h-[42px] px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl cursor-pointer flex flex-wrap gap-1.5 items-center hover:border-pink-300 dark:hover:border-pink-600 transition"
      >
        {selectedMembers.length === 0 ? (
          <span className="text-gray-400 dark:text-gray-500 text-sm">Przypisz osoby...</span>
        ) : (
          selectedMembers.map(member => (
            <span
              key={member.id}
              className="bg-pink-50 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300 px-2 py-0.5 rounded-lg text-xs font-medium border border-pink-100 dark:border-pink-800 flex items-center gap-1"
            >
              {member.full_name}
              <span
                onClick={(e) => { e.stopPropagation(); toggleMember(member.id); }}
                className="hover:bg-pink-200 dark:hover:bg-pink-800 rounded-full p-0.5 cursor-pointer"
              >
                <X size={10} />
              </span>
            </span>
          ))
        )}
        <div className="ml-auto">
          <ChevronDown size={16} className="text-gray-400" />
        </div>
      </div>

      {isOpen && coords.width > 0 && document.body && createPortal(
        <div
          className={`member-select-portal-${roleId} fixed z-[9999] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl max-h-60 overflow-y-auto custom-scrollbar`}
          style={{
            ...(coords.openUpward
              ? { bottom: `calc(100vh - ${coords.top}px)` }
              : { top: coords.top }),
            left: coords.left,
            width: Math.max(coords.width, 200)
          }}
        >
          {members.map(member => {
            const isSelected = selectedIds.map(String).includes(String(member.id));
            return (
              <div
                key={member.id}
                className={`px-4 py-2 text-sm cursor-pointer flex items-center justify-between transition
                  hover:bg-pink-50 dark:hover:bg-pink-900/20 text-gray-700 dark:text-gray-300
                  ${isSelected ? 'bg-pink-50 dark:bg-pink-900/20 text-pink-700 dark:text-pink-300 font-medium' : ''}
                `}
                onClick={() => toggleMember(member.id)}
              >
                <span>{member.full_name}</span>
                {isSelected && <Check size={16} className="text-pink-600" />}
              </div>
            );
          })}
          {members.length === 0 && (
            <div className="p-3 text-center text-gray-400 text-xs">Brak członków w zespole</div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};

// Główny komponent zakładki Służby dla niestandardowych modułów
export default function DutyTab({ moduleKey, moduleName }) {
  const [members, setMembers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [memberRoles, setMemberRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [roleForm, setRoleForm] = useState({ id: null, name: '', field_key: '', description: '' });

  const memberTableName = `custom_${moduleKey}_members`;

  // Definicja struktury tabeli members
  const MEMBERS_TABLE_COLUMNS = `
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    avatar_url TEXT,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  `;

  // Próbuj utworzyć tabelę członków jeśli nie istnieje
  const ensureMembersTableExists = async () => {
    try {
      await supabase.rpc('create_dynamic_table', {
        p_table_name: memberTableName,
        p_columns: MEMBERS_TABLE_COLUMNS
      });
      return true;
    } catch (err) {
      // Ignoruj błąd - tabela może już istnieć lub RPC nie jest dostępne
      return false;
    }
  };

  useEffect(() => {
    fetchData();
  }, [moduleKey]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Pobierz członków modułu (obsługa braku tabeli)
      const { data: membersData, error: membersError } = await supabase
        .from(memberTableName)
        .select('*')
        .order('full_name');

      // Jeśli tabela nie istnieje (błąd 42P01), ustaw pustą listę
      if (membersError && membersError.code === '42P01') {
        console.log(`Tabela ${memberTableName} nie istnieje jeszcze`);
        setMembers([]);
      } else {
        setMembers(membersData || []);
      }

      // Pobierz służby dla tego modułu
      const { data: rolesData } = await supabase
        .from('team_roles')
        .select('*')
        .eq('team_type', moduleKey)
        .eq('is_active', true)
        .order('display_order');

      setRoles(rolesData || []);

      // Pobierz przypisania członków do służb
      const { data: memberRolesData } = await supabase
        .from('team_member_roles')
        .select('*')
        .eq('member_table', memberTableName);

      setMemberRoles(memberRolesData || []);
    } catch (err) {
      console.error('Błąd pobierania danych służb:', err);
    }
    setLoading(false);
  };

  const saveRole = async () => {
    if (!roleForm.name.trim()) return alert('Podaj nazwę służby');

    // Generuj field_key z nazwy jeśli nie podano
    const fieldKey = roleForm.field_key.trim() || roleForm.name.toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const payload = {
      name: roleForm.name.trim(),
      field_key: fieldKey,
      description: roleForm.description.trim(),
      team_type: moduleKey,
      display_order: roleForm.id ? undefined : roles.length + 1
    };

    try {
      if (roleForm.id) {
        await supabase.from('team_roles').update(payload).eq('id', roleForm.id);
      } else {
        await supabase.from('team_roles').insert([payload]);
      }
      setShowRoleModal(false);
      setRoleForm({ id: null, name: '', field_key: '', description: '' });
      fetchData();
    } catch (err) {
      alert('Błąd zapisu: ' + err.message);
    }
  };

  const deleteRole = async (id) => {
    if (!confirm('Czy na pewno chcesz usunąć tę służbę? Spowoduje to usunięcie wszystkich przypisań.')) return;

    try {
      await supabase.from('team_roles').delete().eq('id', id);
      fetchData();
    } catch (err) {
      alert('Błąd usuwania: ' + err.message);
    }
  };

  const updateMemberAssignments = async (roleId, memberIds) => {
    try {
      // Upewnij się że tabela członków istnieje
      await ensureMembersTableExists();

      // Usuń wszystkie obecne przypisania dla tej służby
      await supabase
        .from('team_member_roles')
        .delete()
        .eq('role_id', roleId)
        .eq('member_table', memberTableName);

      // Dodaj nowe przypisania
      if (memberIds.length > 0) {
        const newAssignments = memberIds.map(memberId => ({
          member_id: String(memberId),
          member_table: memberTableName,
          role_id: roleId
        }));

        await supabase.from('team_member_roles').insert(newAssignments);
      }

      fetchData();
    } catch (err) {
      console.error('Błąd aktualizacji przypisań:', err);
      alert('Błąd aktualizacji: ' + err.message);
    }
  };

  const getMembersForRole = (roleId) => {
    return memberRoles
      .filter(mr => mr.role_id === roleId)
      .map(mr => String(mr.member_id));
  };

  if (loading) {
    return (
      <div className="p-10 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-600 mx-auto"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-pink-600 to-orange-600 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent">
            Służby
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Zarządzaj służbami i przypisuj do nich członków zespołu
          </p>
        </div>
        <button
          onClick={() => {
            setRoleForm({ id: null, name: '', field_key: '', description: '' });
            setShowRoleModal(true);
          }}
          className="bg-gradient-to-r from-pink-600 to-orange-600 text-white text-sm px-5 py-2.5 rounded-xl font-medium hover:shadow-lg hover:shadow-pink-500/50 transition flex items-center gap-2"
        >
          <Plus size={18} /> Dodaj służbę
        </button>
      </div>

      {members.length === 0 ? (
        <div className="p-8 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl text-center">
          <Users size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-4" />
          <p className="text-gray-500 dark:text-gray-400">Brak członków w zespole</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            Najpierw dodaj członków w zakładce "Członkowie"
          </p>
        </div>
      ) : roles.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          <Users size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">Brak zdefiniowanych służb</p>
          <p className="text-sm mt-1">Dodaj pierwszą służbę, aby móc przypisywać do niej członków zespołu</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {roles.map(role => {
            const assignedMembers = getMembersForRole(role.id);

            return (
              <div
                key={role.id}
                className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-lg hover:border-pink-300 dark:hover:border-pink-600 transition-all duration-200 overflow-hidden group"
              >
                {/* Header karty */}
                <div className="bg-gradient-to-r from-pink-50 to-orange-50 dark:from-pink-900/20 dark:to-orange-900/20 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-500 to-orange-500 flex items-center justify-center text-white shadow-md shadow-pink-500/20">
                        <Users size={18} />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-800 dark:text-white text-sm">{role.name}</h3>
                        {role.description && (
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-1">{role.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-pink-600 dark:text-pink-400 bg-pink-100 dark:bg-pink-900/40 px-2 py-0.5 rounded-full">
                        {assignedMembers.length}
                      </span>
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => {
                            setRoleForm({
                              id: role.id,
                              name: role.name,
                              field_key: role.field_key,
                              description: role.description || ''
                            });
                            setShowRoleModal(true);
                          }}
                          className="p-1.5 text-gray-400 hover:text-pink-600 hover:bg-white dark:hover:bg-gray-700 rounded-lg transition"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => deleteRole(role.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-white dark:hover:bg-gray-700 rounded-lg transition"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Body karty - MultiSelect */}
                <div className="p-3">
                  <MemberMultiSelect
                    members={members}
                    selectedIds={assignedMembers}
                    onChange={(memberIds) => updateMemberAssignments(role.id, memberIds)}
                    roleId={role.id}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal dodawania/edycji służby */}
      {showRoleModal && document.body && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md p-6 border border-white/20 dark:border-gray-700">
            <div className="flex justify-between mb-6">
              <h3 className="font-bold text-xl text-gray-800 dark:text-white">
                {roleForm.id ? 'Edytuj służbę' : 'Nowa służba'}
              </h3>
              <button
                onClick={() => setShowRoleModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition text-gray-500 dark:text-gray-400"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">
                  Nazwa służby
                </label>
                <input
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                  placeholder="np. Piano, Nagłośnienie"
                  value={roleForm.name}
                  onChange={e => setRoleForm({ ...roleForm, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">
                  Klucz pola (opcjonalnie)
                </label>
                <input
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 font-mono text-sm"
                  placeholder="np. piano, naglosnienie"
                  value={roleForm.field_key}
                  onChange={e => setRoleForm({ ...roleForm, field_key: e.target.value })}
                />
                <p className="text-xs text-gray-400 mt-1 ml-1">
                  Klucz używany w grafiku. Zostanie wygenerowany automatycznie jeśli nie podano.
                </p>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">
                  Opis (opcjonalnie)
                </label>
                <textarea
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 resize-none"
                  rows={2}
                  placeholder="Krótki opis służby..."
                  value={roleForm.description}
                  onChange={e => setRoleForm({ ...roleForm, description: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowRoleModal(false)}
                  className="px-5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  Anuluj
                </button>
                <button
                  onClick={saveRole}
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
