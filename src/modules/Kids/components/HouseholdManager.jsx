import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import {
  Plus, Search, Trash2, X, Edit2, Phone, Mail, Users,
  User, ChevronDown, ChevronUp, Check, Loader2, Home
} from 'lucide-react';

export default function HouseholdManager() {
  const [households, setHouseholds] = useState([]);
  const [students, setStudents] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingHousehold, setEditingHousehold] = useState(null);
  const [expandedHousehold, setExpandedHousehold] = useState(null);
  const [formData, setFormData] = useState({
    family_name: '',
    phone_full: '',
    address: '',
    notes: '',
    contacts: [{ member_id: null, full_name: '', phone: '', email: '', relationship: 'Rodzic', is_primary: true, can_pickup: true }]
  });
  const [assignStudentModal, setAssignStudentModal] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [householdsRes, studentsRes, membersRes] = await Promise.all([
        supabase
          .from('households')
          .select(`
            *,
            parent_contacts(*),
            kids_students(id, full_name, birth_year, group_id),
            members(id, first_name, last_name, email, phone)
          `)
          .order('family_name'),
        supabase
          .from('kids_students')
          .select('id, full_name, birth_year, household_id, group_id')
          .order('full_name'),
        supabase
          .from('members')
          .select('id, first_name, last_name, household_id, phone, email')
          .order('last_name')
      ]);

      if (householdsRes.error) throw householdsRes.error;
      if (studentsRes.error) throw studentsRes.error;
      if (membersRes.error) throw membersRes.error;

      setHouseholds(householdsRes.data || []);
      setStudents(studentsRes.data || []);
      setMembers(membersRes.data || []);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const extractLastFour = (phone) => {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    return digits.slice(-4);
  };

  const resetForm = () => {
    setFormData({
      family_name: '',
      phone_full: '',
      address: '',
      notes: '',
      contacts: [{ member_id: null, full_name: '', phone: '', email: '', relationship: 'Rodzic', is_primary: true, can_pickup: true }]
    });
    setEditingHousehold(null);
    setShowForm(false);
  };

  const handleEdit = (household) => {
    setFormData({
      family_name: household.family_name,
      phone_full: household.phone_full || '',
      address: household.address || '',
      notes: household.notes || '',
      contacts: household.parent_contacts?.length > 0
        ? household.parent_contacts.map(c => ({
            id: c.id,
            member_id: c.member_id || null,
            full_name: c.full_name,
            phone: c.phone || '',
            email: c.email || '',
            relationship: c.relationship || 'Rodzic',
            is_primary: c.is_primary,
            can_pickup: c.can_pickup
          }))
        : [{ member_id: null, full_name: '', phone: '', email: '', relationship: 'Rodzic', is_primary: true, can_pickup: true }]
    });
    setEditingHousehold(household);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.family_name.trim()) {
      alert('Nazwa rodziny jest wymagana');
      return;
    }

    const primaryContact = formData.contacts.find(c => c.is_primary);
    const phoneForSearch = primaryContact?.phone || formData.phone_full;

    try {
      const householdPayload = {
        family_name: formData.family_name.trim(),
        phone_full: formData.phone_full || null,
        phone_last_four: extractLastFour(phoneForSearch),
        address: formData.address || null,
        notes: formData.notes || null
      };

      let householdId;

      if (editingHousehold) {
        const { error } = await supabase
          .from('households')
          .update(householdPayload)
          .eq('id', editingHousehold.id);

        if (error) throw error;
        householdId = editingHousehold.id;

        // Delete old contacts that are not in the new list
        const existingContactIds = formData.contacts.filter(c => c.id).map(c => c.id);
        if (existingContactIds.length > 0) {
          await supabase
            .from('parent_contacts')
            .delete()
            .eq('household_id', householdId)
            .not('id', 'in', `(${existingContactIds.join(',')})`);
        } else {
          await supabase
            .from('parent_contacts')
            .delete()
            .eq('household_id', householdId);
        }
      } else {
        const { data, error } = await supabase
          .from('households')
          .insert(householdPayload)
          .select()
          .single();

        if (error) throw error;
        householdId = data.id;
      }

      // Upsert contacts
      for (const contact of formData.contacts) {
        if (!contact.full_name.trim()) continue;

        const contactPayload = {
          household_id: householdId,
          member_id: contact.member_id || null,
          full_name: contact.full_name.trim(),
          phone: contact.phone || null,
          email: contact.email || null,
          relationship: contact.relationship,
          is_primary: contact.is_primary,
          can_pickup: contact.can_pickup
        };

        if (contact.id) {
          await supabase
            .from('parent_contacts')
            .update(contactPayload)
            .eq('id', contact.id);
        } else {
          await supabase
            .from('parent_contacts')
            .insert(contactPayload);
        }
      }

      await fetchData();
      resetForm();
    } catch (err) {
      console.error('Error saving household:', err);
      alert('Błąd podczas zapisywania rodziny');
    }
  };

  const handleDelete = async (householdId) => {
    if (!confirm('Czy na pewno chcesz usunąć tę rodzinę? Uczniowie nie zostaną usunięci, ale stracą powiązanie z rodziną.')) return;

    try {
      // First, unlink students
      await supabase
        .from('kids_students')
        .update({ household_id: null })
        .eq('household_id', householdId);

      // Then delete household (contacts will be deleted by CASCADE)
      const { error } = await supabase
        .from('households')
        .delete()
        .eq('id', householdId);

      if (error) throw error;

      await fetchData();
    } catch (err) {
      console.error('Error deleting household:', err);
      alert('Błąd podczas usuwania rodziny');
    }
  };

  const handleAddContact = () => {
    setFormData(prev => ({
      ...prev,
      contacts: [...prev.contacts, { member_id: null, full_name: '', phone: '', email: '', relationship: 'Rodzic', is_primary: false, can_pickup: true }]
    }));
  };

  const handleRemoveContact = (index) => {
    setFormData(prev => ({
      ...prev,
      contacts: prev.contacts.filter((_, i) => i !== index)
    }));
  };

  const handleContactChange = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      contacts: prev.contacts.map((c, i) => {
        if (i === index) {
          if (field === 'is_primary' && value) {
            // Unset other primary
            return { ...c, is_primary: true };
          }
          return { ...c, [field]: value };
        }
        if (field === 'is_primary' && value) {
          return { ...c, is_primary: false };
        }
        return c;
      })
    }));
  };

  const handleAssignStudent = async (studentId, householdId) => {
    try {
      const { error } = await supabase
        .from('kids_students')
        .update({ household_id: householdId })
        .eq('id', studentId);

      if (error) throw error;

      await fetchData();
      setAssignStudentModal(null);
    } catch (err) {
      console.error('Error assigning student:', err);
      alert('Błąd podczas przypisywania ucznia');
    }
  };

  const handleUnassignStudent = async (studentId) => {
    try {
      const { error } = await supabase
        .from('kids_students')
        .update({ household_id: null })
        .eq('id', studentId);

      if (error) throw error;

      await fetchData();
    } catch (err) {
      console.error('Error unassigning student:', err);
    }
  };

  const filteredHouseholds = households.filter(h => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return h.family_name.toLowerCase().includes(term) ||
      h.phone_last_four?.includes(term) ||
      h.parent_contacts?.some(c =>
        c.full_name.toLowerCase().includes(term) ||
        c.phone?.includes(term)
      ) ||
      h.kids_students?.some(s => s.full_name.toLowerCase().includes(term)) ||
      h.members?.some(m => `${m.first_name} ${m.last_name}`.toLowerCase().includes(term));
  });

  const unassignedStudents = students.filter(s => !s.household_id);
  const unassignedMembers = members.filter(m => !m.household_id);

  const inputClasses = "w-full px-4 py-3 text-base border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:border-pink-500 dark:focus:border-pink-400 focus:outline-none transition";

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Rodziny</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Zarządzaj rodzinami i kontaktami rodziców
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-gradient-to-r from-pink-600 to-orange-600 text-white rounded-xl hover:shadow-lg transition"
        >
          <Plus size={18} />
          Dodaj rodzinę
        </button>
      </div>

      {/* Search and stats */}
      <div className="flex gap-4 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[250px]">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Szukaj po nazwie, telefonie, rodzicu lub dziecku..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:border-pink-500 dark:focus:border-pink-400 focus:outline-none transition"
          />
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
          <span className="flex items-center gap-1.5">
            <Home size={16} />
            {households.length} rodzin
          </span>
          {unassignedStudents.length > 0 && (
            <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
              <User size={16} />
              {unassignedStudents.length} nieprzypisanych uczniów
            </span>
          )}
        </div>
      </div>

      {/* Form modal */}
      {showForm && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center sticky top-0 bg-white dark:bg-gray-900">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                {editingHousehold ? 'Edytuj rodzinę' : 'Dodaj rodzinę'}
              </h3>
              <button
                onClick={resetForm}
                className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Basic info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                    Nazwa rodziny *
                  </label>
                  <input
                    type="text"
                    value={formData.family_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, family_name: e.target.value }))}
                    placeholder="np. Kowalscy"
                    className={inputClasses}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                    Główny telefon (do check-in)
                  </label>
                  <input
                    type="tel"
                    value={formData.phone_full}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone_full: e.target.value }))}
                    placeholder="np. +48 123 456 789"
                    className={inputClasses}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Ostatnie 4 cyfry będą używane do wyszukiwania przy check-in
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                    Adres
                  </label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                    placeholder="np. ul. Przykładowa 1, Wrocław"
                    className={inputClasses}
                  />
                </div>
              </div>

              {/* Contacts - wybór z listy członków */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Kontakty rodziców / opiekunów
                  </label>
                  <button
                    type="button"
                    onClick={handleAddContact}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-pink-600 dark:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-900/20 rounded-lg transition"
                  >
                    <Plus size={16} />
                    Dodaj kontakt
                  </button>
                </div>

                <div className="space-y-4">
                  {formData.contacts.map((contact, index) => (
                    <div
                      key={index}
                      className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700"
                    >
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                          Kontakt {index + 1}
                        </span>
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                            <input
                              type="checkbox"
                              checked={contact.is_primary}
                              onChange={(e) => handleContactChange(index, 'is_primary', e.target.checked)}
                              className="rounded border-gray-300 dark:border-gray-600 text-pink-600 focus:ring-pink-500"
                            />
                            Główny
                          </label>
                          {formData.contacts.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveContact(index)}
                              className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {/* Wybór członka z listy */}
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                            Wybierz z listy członków
                          </label>
                          <select
                            value={contact.member_id || ''}
                            onChange={(e) => {
                              const memberIdStr = e.target.value;
                              if (memberIdStr) {
                                const memberId = parseInt(memberIdStr, 10);
                                const selectedMember = members.find(m => m.id === memberId);
                                if (selectedMember) {
                                  // Aktualizuj wszystkie pola naraz
                                  setFormData(prev => ({
                                    ...prev,
                                    contacts: prev.contacts.map((c, i) => {
                                      if (i === index) {
                                        return {
                                          ...c,
                                          member_id: memberId,
                                          full_name: `${selectedMember.first_name} ${selectedMember.last_name}`,
                                          phone: selectedMember.phone || '',
                                          email: selectedMember.email || ''
                                        };
                                      }
                                      return c;
                                    })
                                  }));
                                }
                              } else {
                                handleContactChange(index, 'member_id', null);
                              }
                            }}
                            className={inputClasses}
                          >
                            <option value="">-- Wybierz członka --</option>
                            {members.map(m => (
                              <option key={m.id} value={m.id}>
                                {m.first_name} {m.last_name} {m.phone ? `(${m.phone})` : ''}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Wyświetlanie wybranego kontaktu */}
                        {contact.full_name && (
                          <>
                            <div>
                              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                                Imię i nazwisko
                              </label>
                              <div className="px-4 py-3 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white">
                                {contact.full_name}
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                                Relacja
                              </label>
                              <select
                                value={contact.relationship}
                                onChange={(e) => handleContactChange(index, 'relationship', e.target.value)}
                                className={inputClasses}
                              >
                                <option value="Rodzic">Rodzic</option>
                                <option value="Mama">Mama</option>
                                <option value="Tata">Tata</option>
                                <option value="Dziadek">Dziadek</option>
                                <option value="Babcia">Babcia</option>
                                <option value="Opiekun">Opiekun</option>
                                <option value="Inny">Inny</option>
                              </select>
                            </div>
                            {contact.phone && (
                              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                <Phone size={14} className="text-pink-500" />
                                {contact.phone}
                              </div>
                            )}
                            {contact.email && (
                              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                <Mail size={14} className="text-pink-500" />
                                {contact.email}
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      <div className="mt-3">
                        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                          <input
                            type="checkbox"
                            checked={contact.can_pickup}
                            onChange={(e) => handleContactChange(index, 'can_pickup', e.target.checked)}
                            className="rounded border-gray-300 dark:border-gray-600 text-pink-600 focus:ring-pink-500"
                          />
                          Może odbierać dzieci
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Uwagi
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Dodatkowe informacje o rodzinie..."
                  rows={2}
                  className={inputClasses}
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex gap-3 justify-end sticky bottom-0 bg-white dark:bg-gray-900">
              <button
                onClick={resetForm}
                className="px-5 py-2.5 text-base font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition"
              >
                Anuluj
              </button>
              <button
                onClick={handleSave}
                className="px-5 py-2.5 text-base font-medium bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl hover:shadow-lg transition"
              >
                {editingHousehold ? 'Zapisz zmiany' : 'Dodaj rodzinę'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Assign student modal */}
      {assignStudentModal && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md max-h-[80vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Przypisz ucznia do rodziny
              </h3>
              <button
                onClick={() => setAssignStudentModal(null)}
                className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4">
              {unassignedStudents.length === 0 ? (
                <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                  Wszyscy uczniowie są już przypisani do rodzin
                </p>
              ) : (
                <div className="space-y-2">
                  {unassignedStudents.map(student => (
                    <button
                      key={student.id}
                      onClick={() => handleAssignStudent(student.id, assignStudentModal)}
                      className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 hover:bg-pink-50 dark:hover:bg-pink-900/20 rounded-xl transition text-left"
                    >
                      <div>
                        <span className="text-base font-medium text-gray-900 dark:text-white">
                          {student.full_name}
                        </span>
                        {student.birth_year && (
                          <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                            ({new Date().getFullYear() - student.birth_year} lat)
                          </span>
                        )}
                      </div>
                      <Plus size={18} className="text-pink-600 dark:text-pink-400" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Households list */}
      {loading ? (
        <div className="flex items-center justify-center gap-3 py-20 text-gray-500 dark:text-gray-400">
          <Loader2 size={24} className="animate-spin" />
          Ładowanie...
        </div>
      ) : filteredHouseholds.length === 0 ? (
        <div className="text-center py-20 text-gray-500 dark:text-gray-400">
          {searchTerm ? 'Brak wyników wyszukiwania' : 'Brak rodzin. Dodaj pierwszą rodzinę.'}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredHouseholds.map(household => {
            const isExpanded = expandedHousehold === household.id;
            const primaryContact = household.parent_contacts?.find(c => c.is_primary) || household.parent_contacts?.[0];

            return (
              <div
                key={household.id}
                className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden transition hover:border-pink-300 dark:hover:border-pink-600"
              >
                {/* Header */}
                <div
                  className="p-4 flex items-center gap-4 cursor-pointer"
                  onClick={() => setExpandedHousehold(isExpanded ? null : household.id)}
                >
                  <div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-orange-500 rounded-xl flex items-center justify-center text-white font-bold text-lg">
                    {household.family_name.charAt(0)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                        {household.family_name}
                      </h3>
                      {household.phone_last_four && (
                        <span className="bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300 px-2 py-0.5 rounded text-xs font-mono">
                          ****{household.phone_last_four}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-600 dark:text-gray-400">
                      {primaryContact && (
                        <span className="flex items-center gap-1">
                          <User size={14} />
                          {primaryContact.full_name}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Users size={14} />
                        {household.kids_students?.length || 0} dzieci
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(household);
                      }}
                      className="p-2 text-gray-500 dark:text-gray-400 hover:text-pink-600 dark:hover:text-pink-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(household.id);
                      }}
                      className="p-2 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
                    >
                      <Trash2 size={18} />
                    </button>
                    {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-4">
                    {/* Contacts */}
                    {household.parent_contacts?.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                          Kontakty
                        </h4>
                        <div className="grid gap-2">
                          {household.parent_contacts.map(contact => (
                            <div
                              key={contact.id}
                              className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-xl"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center">
                                  <User size={14} className="text-gray-600 dark:text-gray-400" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-gray-900 dark:text-white">
                                      {contact.full_name}
                                    </span>
                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                      {contact.relationship}
                                    </span>
                                    {contact.is_primary && (
                                      <span className="bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 px-1.5 py-0.5 rounded text-xs">
                                        Główny
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                                    {contact.phone && (
                                      <span className="flex items-center gap-1">
                                        <Phone size={12} />
                                        {contact.phone}
                                      </span>
                                    )}
                                    {contact.email && (
                                      <span className="flex items-center gap-1">
                                        <Mail size={12} />
                                        {contact.email}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              {contact.can_pickup && (
                                <span className="text-xs text-green-600 dark:text-green-400">
                                  Może odbierać
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Children */}
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                          Dzieci
                        </h4>
                        <button
                          onClick={() => setAssignStudentModal(household.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-pink-600 dark:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-900/20 rounded-lg transition"
                        >
                          <Plus size={16} />
                          Przypisz ucznia
                        </button>
                      </div>

                      {household.kids_students?.length > 0 ? (
                        <div className="grid gap-2">
                          {household.kids_students.map(student => (
                            <div
                              key={student.id}
                              className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-xl"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-pink-100 dark:bg-pink-900/40 rounded-full flex items-center justify-center">
                                  <Users size={14} className="text-pink-600 dark:text-pink-400" />
                                </div>
                                <div>
                                  <span className="font-medium text-gray-900 dark:text-white">
                                    {student.full_name}
                                  </span>
                                  {student.birth_year && (
                                    <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                                      ({new Date().getFullYear() - student.birth_year} lat)
                                    </span>
                                  )}
                                </div>
                              </div>
                              <button
                                onClick={() => handleUnassignStudent(student.id)}
                                className="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition"
                                title="Usuń powiązanie"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                          Brak przypisanych dzieci
                        </p>
                      )}
                    </div>

                    {/* Members (adults) */}
                    {household.members?.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                          Członkowie kościoła
                        </h4>
                        <div className="grid gap-2">
                          {household.members.map(member => (
                            <div
                              key={member.id}
                              className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/40 rounded-full flex items-center justify-center">
                                  <User size={14} className="text-blue-600 dark:text-blue-400" />
                                </div>
                                <div>
                                  <span className="font-medium text-gray-900 dark:text-white">
                                    {member.first_name} {member.last_name}
                                  </span>
                                  <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                                    {member.phone && (
                                      <span className="flex items-center gap-1">
                                        <Phone size={12} />
                                        {member.phone}
                                      </span>
                                    )}
                                    {member.email && (
                                      <span className="flex items-center gap-1">
                                        <Mail size={12} />
                                        {member.email}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Notes */}
                    {household.notes && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                          Uwagi
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {household.notes}
                        </p>
                      </div>
                    )}
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
