import React, { useState, useEffect, useRef } from 'react';
import Spinner from './Spinner';
import Modal from './Modal';
import Button from './Button';
import EmptyState from './EmptyState';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, X, Check, Edit2, Users, ChevronDown } from 'lucide-react';
import { useT } from '../i18n';
import { tr } from '../i18n';
import TabHeader from './TabHeader';
import { confirmDialog } from '../lib/dialog';
import { toast } from '../lib/toast';

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
  const t = useT();
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
        className="w-full min-h-[42px] px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl cursor-pointer flex flex-wrap gap-1.5 items-center hover:border-accent-primary-light dark:hover:border-accent-primary transition"
      >
        {selectedMembers.length === 0 ? (
          <span className="text-gray-400 dark:text-gray-500 text-sm">Przypisz osoby...</span>
        ) : (
          selectedMembers.map(member => (
            <span
              key={member.id}
              className="bg-accent-primary-lightest dark:bg-accent-primary-darkest/40 text-accent-primary dark:text-accent-primary-light px-2 py-0.5 rounded-lg text-xs font-medium border border-accent-primary-lighter dark:border-accent-primary-dark flex items-center gap-1"
            >
              {member.full_name}
              <span
                onClick={(e) => { e.stopPropagation(); toggleMember(member.id); }}
                className="hover:bg-accent-primary-lighter dark:hover:bg-accent-primary-dark rounded-full p-0.5 cursor-pointer"
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
                  hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest/20 text-gray-700 dark:text-gray-300
                  ${isSelected ? 'bg-accent-primary-lightest dark:bg-accent-primary-darkest/20 text-accent-primary dark:text-accent-primary-light font-medium' : ''}
                `}
                onClick={() => toggleMember(member.id)}
              >
                <span>{member.full_name}</span>
                {isSelected && <Check size={16} className="text-accent-primary" />}
              </div>
            );
          })}
          {members.length === 0 && (
            <div className="p-3 text-center text-gray-400 text-xs">{t('Brak członków w zespole')}</div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};

// Główny komponent zakładki Służby
export default function RolesTab({ teamType, teamMembers, memberTable, onUpdate }) {
  const t = useT();
  const [roles, setRoles] = useState([]);
  const [memberRoles, setMemberRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [roleForm, setRoleForm] = useState({ id: null, name: '', field_key: '', description: '' });

  useEffect(() => {
    fetchData();
  }, [teamType]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Pobierz służby dla tego typu zespołu
      const { data: rolesData, error: rolesError } = await supabase
        .from('team_roles')
        .select('*')
        .eq('team_type', teamType)
        .eq('is_active', true)
        .order('display_order');

      if (rolesError) {
        console.error('Błąd pobierania służb:', rolesError);
      }

      // Pobierz przypisania członków do służb
      const { data: memberRolesData, error: memberRolesError } = await supabase
        .from('team_member_roles')
        .select('*')
        .eq('member_table', memberTable);

      if (memberRolesError) {
        console.error('Błąd pobierania przypisań:', memberRolesError);
        // Nie blokuj ładowania - po prostu użyj pustej tablicy
      }

      setRoles(rolesData || []);
      setMemberRoles(memberRolesData || []);
    } catch (err) {
      console.error('Błąd pobierania danych służb:', err);
    }
    setLoading(false);
  };

  const saveRole = async () => {
    if (!roleForm.name.trim()) return toast.error(tr('Podaj nazwę służby'));

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
      team_type: teamType,
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
      toast.error(tr('Błąd zapisu: ') + err.message);
    }
  };

  const deleteRole = async (id) => {
    if (!await confirmDialog(tr('Czy na pewno chcesz usunąć tę służbę? Spowoduje to usunięcie wszystkich przypisań.'))) return;

    try {
      await supabase.from('team_roles').delete().eq('id', id);
      fetchData();
    } catch (err) {
      toast.error(tr('Błąd usuwania: ') + err.message);
    }
  };

  const updateMemberAssignments = async (roleId, memberIds) => {
    try {
      // Usuń wszystkie obecne przypisania dla tej służby
      const { error: deleteError } = await supabase
        .from('team_member_roles')
        .delete()
        .eq('role_id', roleId)
        .eq('member_table', memberTable);

      if (deleteError) {
        console.error('Błąd usuwania przypisań:', deleteError);
        // Kontynuuj mimo błędu - może nie było żadnych przypisań do usunięcia
      }

      // Dodaj nowe przypisania
      if (memberIds.length > 0) {
        // Konwertuj member_id na string (dla kompatybilności z UUID i INT)
        const newAssignments = memberIds.map(memberId => ({
          member_id: String(memberId),
          member_table: memberTable,
          role_id: roleId
        }));

        const { error: insertError } = await supabase
          .from('team_member_roles')
          .insert(newAssignments);

        if (insertError) {
          console.error('Błąd dodawania przypisań:', insertError);
          toast.error(tr('Błąd zapisywania przypisań: ') + insertError.message);
          return;
        }
      }

      fetchData();
      // Powiadom rodzica o zmianie
      if (onUpdate) onUpdate();
    } catch (err) {
      console.error('Błąd aktualizacji przypisań:', err);
      toast.error(tr('Błąd aktualizacji: ') + err.message);
    }
  };

  const getMembersForRole = (roleId) => {
    return memberRoles
      .filter(mr => mr.role_id === roleId)
      .map(mr => String(mr.member_id));
  };

  if (loading) {
    return (
      <Spinner center />
    );
  }

  return (
    <section className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 p-6 transition-colors">
      <TabHeader
        title={t('Służby')}
        subtitle={tr('Zarządzaj służbami i przypisuj do nich członków zespołu')}
        actions={
          <button
            onClick={() => {
              setRoleForm({ id: null, name: '', field_key: '', description: '' });
              setShowRoleModal(true);
            }}
            className="bg-gradient-to-r from-accent-primary to-accent-secondary text-white text-sm px-5 py-2.5 rounded-xl font-medium hover:shadow-lg hover:shadow-accent-primary-light/50 transition flex items-center gap-2"
          >
            <Plus size={18} /> {tr('Dodaj służbę')}
          </button>
        }
      />

      {roles.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t('Brak zdefiniowanych służb')}
          subtitle={t('Dodaj pierwszą służbę, aby móc przypisywać do niej członków zespołu')}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {roles.map(role => {
            const assignedMembers = getMembersForRole(role.id);

            return (
              <div
                key={role.id}
                className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-lg hover:border-accent-primary-light dark:hover:border-accent-primary transition-all duration-200 overflow-hidden group"
              >
                {/* Header karty */}
                <div className="bg-gradient-to-r from-accent-primary-lightest to-accent-secondary-lightest dark:from-accent-primary-darkest/20 dark:to-accent-secondary-darkest/20 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent-primary-light to-accent-secondary-light flex items-center justify-center text-white shadow-md shadow-accent-primary-light/20">
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
                      <span className="text-xs font-bold text-accent-primary dark:text-accent-primary-light bg-accent-primary-lighter dark:bg-accent-primary-darkest/40 px-2 py-0.5 rounded-full">
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
                          className="p-1.5 text-gray-400 hover:text-accent-primary hover:bg-white dark:hover:bg-gray-700 rounded-lg transition"
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
                    members={teamMembers}
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
      <Modal
        isOpen={showRoleModal}
        onClose={() => setShowRoleModal(false)}
        closeOnBackdrop={false}
        size="sm"
        title={roleForm.id ? tr('Edytuj służbę') : tr('Nowa służba')}
        footer={<>
          <Button variant="secondary" onClick={() => setShowRoleModal(false)}>Anuluj</Button>
          <Button onClick={saveRole}>Zapisz</Button>
        </>}
      >
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">
              {tr('Nazwa służby')}
            </label>
            <input
              className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
              placeholder={t('np. Piano, Nagłośnienie')}
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
              {tr('Klucz używany w grafiku. Zostanie wygenerowany automatycznie jeśli nie podano.')}
            </p>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">
              Opis (opcjonalnie)
            </label>
            <textarea
              className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 resize-none"
              rows={2}
              placeholder={t('Krótki opis służby...')}
              value={roleForm.description}
              onChange={e => setRoleForm({ ...roleForm, description: e.target.value })}
            />
          </div>
        </div>
      </Modal>
    </section>
  );
}
