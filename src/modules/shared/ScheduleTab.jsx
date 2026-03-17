import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { ChevronUp, ChevronDown, Check, UserX } from 'lucide-react';

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

// Multi-select dla tabeli grafiku
const TableMultiSelect = ({ options, value, onChange, absentMembers = [] }) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef(null);
  const coords = useDropdownPosition(triggerRef, isOpen);
  const selectedItems = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target) && !e.target.closest('.portal-multiselect')) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const toggleSelection = (name, isAbsent) => {
    if (isAbsent) return;
    let newSelection;
    if (selectedItems.includes(name)) newSelection = selectedItems.filter(i => i !== name);
    else newSelection = [...selectedItems, name];
    onChange(newSelection.join(', '));
  };

  return (
    <div className="relative w-full">
      <div
        ref={triggerRef}
        className="w-full min-h-[32px] px-2 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs cursor-pointer flex flex-wrap gap-1 items-center hover:border-pink-300 dark:hover:border-pink-500 transition"
        onClick={() => setIsOpen(!isOpen)}
      >
        {selectedItems.length === 0 ? (
          <span className="text-gray-400 dark:text-gray-500 text-[10px] italic">Wybierz...</span>
        ) : (
          selectedItems.map((item, idx) => (
            <span key={idx} className="bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 px-1.5 py-0.5 rounded text-[10px] border border-pink-100 dark:border-pink-800 whitespace-nowrap">
              {item}
            </span>
          ))
        )}
      </div>

      {isOpen && coords.width > 0 && document.body && createPortal(
        <div
          className="portal-multiselect fixed z-[9999] w-48 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-h-60 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-100"
          style={{
            ...(coords.openUpward
              ? { bottom: `calc(100vh - ${coords.top}px)` }
              : { top: coords.top }),
            left: coords.left
          }}
        >
          {options.map((person) => {
            const isSelected = selectedItems.includes(person.full_name);
            const isAbsent = absentMembers.includes(person.full_name);
            return (
              <div
                key={person.id}
                className={`px-3 py-1.5 text-xs cursor-pointer flex items-center justify-between transition
                  ${isAbsent ? 'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed' : 'hover:bg-pink-50 dark:hover:bg-pink-900/20 text-gray-700 dark:text-gray-300'}
                  ${isSelected ? 'bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 font-medium' : ''}
                `}
                onClick={() => toggleSelection(person.full_name, isAbsent)}
              >
                <span className={isAbsent ? 'line-through decoration-gray-400 dark:decoration-gray-600' : ''}>
                  {person.full_name}
                </span>
                {isSelected && !isAbsent && <Check size={12} />}
                {isAbsent && <UserX size={12} className="text-red-300 dark:text-red-400" />}
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
};

// Główny komponent grafiku
export default function ScheduleTab({ moduleKey, moduleName }) {
  const [programs, setPrograms] = useState([]);
  const [members, setMembers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [memberRoles, setMemberRoles] = useState([]);
  const [expandedMonths, setExpandedMonths] = useState({});
  const [loading, setLoading] = useState(true);

  const memberTableName = `custom_${moduleKey}_members`;
  const scheduleFieldKey = `custom_${moduleKey}_schedule`;

  // Próbuj utworzyć kolumnę grafiku w tabeli programs jeśli nie istnieje
  const ensureScheduleColumnExists = async () => {
    try {
      await supabase.rpc('create_schedule_column', {
        module_key: moduleKey
      });
      return true;
    } catch (err) {
      // Ignoruj błąd - kolumna może już istnieć lub RPC nie jest dostępne
      return false;
    }
  };

  useEffect(() => {
    fetchData();
  }, [moduleKey]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Pobierz programy
      const { data: progData } = await supabase
        .from('programs')
        .select('*')
        .order('date', { ascending: false });

      setPrograms(progData || []);

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
      console.error('Błąd pobierania danych grafiku:', err);
    } finally {
      setLoading(false);
    }
  };

  // Grupowanie programów po miesiącach
  const groupedPrograms = programs.reduce((acc, prog) => {
    if (!prog.date) return acc;
    const date = new Date(prog.date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(prog);
    return acc;
  }, {});

  const sortedMonths = Object.keys(groupedPrograms).sort().reverse();

  useEffect(() => {
    const currentMonthKey = new Date().toISOString().slice(0, 7);
    setExpandedMonths(prev => ({ ...prev, [currentMonthKey]: true }));
  }, []);

  const toggleMonth = (monthKey) => {
    setExpandedMonths(prev => ({ ...prev, [monthKey]: !prev[monthKey] }));
  };

  const formatMonthName = (monthKey) => {
    const [year, month] = monthKey.split('-');
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase());
  };

  const formatDateShort = (dateString) => {
    return new Date(dateString).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const updateRole = async (programId, field, value) => {
    const programToUpdate = programs.find(p => p.id === programId);
    if (!programToUpdate) return;

    const currentData = programToUpdate[scheduleFieldKey] || {};
    const updatedData = { ...currentData, [field]: value };

    // Aktualizuj lokalnie
    setPrograms(prev => prev.map(p => {
      if (p.id === programId) {
        return { ...p, [scheduleFieldKey]: updatedData };
      }
      return p;
    }));

    // Upewnij się że kolumna grafiku istnieje przed zapisem
    await ensureScheduleColumnExists();

    // Zapisz do bazy
    await supabase.from('programs').update({ [scheduleFieldKey]: updatedData }).eq('id', programId);
  };

  const updateNotes = async (programId, value) => {
    const programToUpdate = programs.find(p => p.id === programId);
    if (!programToUpdate) return;

    const currentData = programToUpdate[scheduleFieldKey] || {};
    const updatedData = { ...currentData, notatki: value };

    setPrograms(prev => prev.map(p => {
      if (p.id === programId) {
        return { ...p, [scheduleFieldKey]: updatedData };
      }
      return p;
    }));

    // Upewnij się że kolumna grafiku istnieje przed zapisem
    await ensureScheduleColumnExists();

    await supabase.from('programs').update({ [scheduleFieldKey]: updatedData }).eq('id', programId);
  };

  // Kolumny na podstawie służb
  const columns = roles.length > 0
    ? roles.map(role => ({ key: role.field_key, label: role.name, roleId: role.id }))
    : [{ key: 'osoba', label: 'Osoba', roleId: null }];

  // Filtrowanie członków według służby
  const getMembersForRole = (roleId) => {
    if (!roleId || memberRoles.length === 0) {
      return members;
    }
    const assignedMemberIds = memberRoles
      .filter(mr => mr.role_id === roleId)
      .map(mr => mr.member_id);

    if (assignedMemberIds.length === 0) {
      return members;
    }

    return members.filter(member => assignedMemberIds.includes(String(member.id)));
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
        <h2 className="text-2xl font-bold bg-gradient-to-r from-pink-600 to-orange-600 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent">
          Grafik
        </h2>
      </div>

      {members.length === 0 ? (
        <div className="p-8 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl text-center">
          <p className="text-gray-500 dark:text-gray-400">Brak członków w zespole</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            Najpierw dodaj członków w zakładce "Członkowie"
          </p>
        </div>
      ) : sortedMonths.length === 0 ? (
        <div className="p-8 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl text-center">
          <p className="text-gray-500 dark:text-gray-400">Brak programów</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            Dodaj programy w module "Programy"
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedMonths.map(monthKey => {
            const isExpanded = expandedMonths[monthKey];
            return (
              <div key={monthKey} className={`bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-gray-200/50 dark:border-gray-700/50 shadow-sm relative z-0 transition-all duration-300 ${isExpanded ? 'mb-8' : 'mb-0'}`}>
                <button
                  onClick={() => toggleMonth(monthKey)}
                  className={`w-full px-6 py-4 bg-white/50 dark:bg-gray-800/50 hover:bg-white/80 dark:hover:bg-gray-800/80 flex justify-between items-center transition border-b border-gray-100 dark:border-gray-700 ${isExpanded ? 'rounded-t-2xl' : 'rounded-2xl'}`}
                >
                  <span className="font-bold text-gray-800 dark:text-gray-200 text-sm uppercase tracking-wider">{formatMonthName(monthKey)}</span>
                  {isExpanded ? <ChevronUp size={18} className="text-gray-500 dark:text-gray-400"/> : <ChevronDown size={18} className="text-gray-500 dark:text-gray-400"/>}
                </button>

                {isExpanded && (
                  <div className="overflow-x-auto pb-4">
                    <table className="w-full text-left border-collapse min-w-max">
                      <thead>
                        <tr className="bg-gray-50/50 dark:bg-gray-800/50 text-xs text-gray-500 dark:text-gray-400 uppercase">
                          <th className="p-3 font-semibold w-24 min-w-[90px]">Data</th>
                          {columns.map(col => (
                            <th key={col.key} className="p-3 font-semibold min-w-[130px]">{col.label}</th>
                          ))}
                          <th className="p-3 font-semibold min-w-[150px]">Notatki</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-700 relative">
                        {groupedPrograms[monthKey]
                          .sort((a, b) => new Date(a.date) - new Date(b.date))
                          .map((prog) => (
                            <tr key={prog.id} className="hover:bg-white/60 dark:hover:bg-gray-700/30 transition relative">
                              <td className="p-3 font-medium text-gray-700 dark:text-gray-300 font-mono text-xs">
                                {formatDateShort(prog.date)}
                              </td>
                              {columns.map(col => (
                                <td key={col.key} className="p-2 relative">
                                  <TableMultiSelect
                                    options={getMembersForRole(col.roleId)}
                                    value={prog[scheduleFieldKey]?.[col.key] || ''}
                                    onChange={(val) => updateRole(prog.id, col.key, val)}
                                  />
                                </td>
                              ))}
                              <td className="p-2">
                                <input
                                  className="w-full bg-transparent border-b border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-pink-500 dark:focus:border-pink-400 text-xs p-1 outline-none transition placeholder-gray-300 dark:placeholder-gray-600 text-gray-700 dark:text-gray-300"
                                  placeholder="Wpisz..."
                                  defaultValue={prog[scheduleFieldKey]?.notatki || ''}
                                  onBlur={(e) => updateNotes(prog.id, e.target.value)}
                                />
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
