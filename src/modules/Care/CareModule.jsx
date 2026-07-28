import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  HeartPulse, Users, SlidersHorizontal, Search, StickyNote, HeartHandshake,
  Award, Tag as TagIcon, ChevronLeft, Mail, Phone,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useCampusQuery } from '../../hooks/useCampusQuery';
import ResponsiveTabs from '../../components/ResponsiveTabs';
import NotesTab from './tabs/NotesTab';
import CareLogTab from './tabs/CareLogTab';
import MilestonesTab from './tabs/MilestonesTab';
import TagsTab from './tabs/TagsTab';
import CustomValuesTab from './tabs/CustomValuesTab';
import FieldDefsTab from './tabs/FieldDefsTab';
import { memberName, memberInitials } from './lib/careApi';

const VIEW_TABS = [
  { id: 'people', label: 'Kartoteka', icon: Users },
  { id: 'fields', label: 'Definicje pól', icon: SlidersHorizontal },
];

const PERSON_TABS = [
  { id: 'notes', label: 'Notatki', icon: StickyNote },
  { id: 'care', label: 'Opieka', icon: HeartHandshake, tour: 'care-tab' },
  { id: 'milestones', label: 'Kamienie milowe', icon: Award },
  { id: 'tags', label: 'Tagi', icon: TagIcon },
  { id: 'custom', label: 'Pola własne', icon: SlidersHorizontal },
];

const STATUS_STYLES = {
  'Członek': 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Sympatyk': 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  'Gość': 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
};

export default function CareModule() {
  const { withCampusFilter, campusIdForInsert, selectedCampusId } = useCampusQuery();

  const [view, setView] = useState('people');
  const [personTab, setPersonTab] = useState('notes');

  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const [fields, setFields] = useState([]);

  const loadMembers = useCallback(async () => {
    setMembersLoading(true);
    try {
      let q = supabase.from('members')
        .select('id, first_name, last_name, email, phone, address, status')
        .order('last_name', { ascending: true });
      q = withCampusFilter(q);
      const { data, error } = await q;
      if (error) throw error;
      setMembers(data || []);
    } catch (err) {
      console.error('Care loadMembers error:', err);
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }, [withCampusFilter]);

  const loadFields = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('member_custom_fields').select('*')
        .order('sort_order', { ascending: true }).order('created_at', { ascending: true });
      if (error) throw error;
      setFields(data || []);
    } catch (err) {
      console.error('Care loadFields error:', err);
      setFields([]);
    }
  }, []);

  useEffect(() => { loadMembers(); }, [loadMembers, selectedCampusId]);
  useEffect(() => { loadFields(); }, [loadFields]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return members;
    return members.filter(m => {
      const name = `${m.first_name || ''} ${m.last_name || ''}`.toLowerCase();
      return name.includes(s) || (m.email || '').toLowerCase().includes(s);
    });
  }, [members, search]);

  const selected = useMemo(() => members.find(m => m.id === selectedId) || null, [members, selectedId]);

  const goToDefinitions = useCallback(() => setView('fields'), []);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Nagłówek */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center shadow-lg">
          <HeartPulse className="text-white" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Opieka i CRM</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Notatki, opieka duszpasterska, kamienie milowe, tagi i pola własne członków</p>
        </div>
      </div>

      {/* Przełącznik widoku */}
      <ResponsiveTabs tabs={VIEW_TABS} activeTab={view} onChange={setView} className="relative" />

      {view === 'fields' ? (
        <FieldDefsTab fields={fields} refreshFields={loadFields} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          {/* Lewa kolumna — lista członków */}
          <div className={`${selected ? 'hidden lg:block' : 'block'}`}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="p-3 border-b border-gray-100 dark:border-gray-700">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    data-tour="care-search"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Szukaj po imieniu, nazwisku, e-mailu..."
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-accent-primary-light/30 focus:border-accent-primary-light outline-none"
                  />
                </div>
              </div>
              <div className="max-h-[70vh] overflow-y-auto custom-scrollbar">
                {membersLoading ? (
                  <div className="p-8 text-center text-gray-400 text-sm">Ładowanie...</div>
                ) : filtered.length === 0 ? (
                  <div className="p-8 text-center text-gray-400 text-sm">Brak osób.</div>
                ) : (
                  filtered.map(m => {
                    const isActive = m.id === selectedId;
                    return (
                      <button
                        key={m.id}
                        onClick={() => { setSelectedId(m.id); setPersonTab('notes'); }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left border-b border-gray-50 dark:border-gray-700/50 transition ${
                          isActive ? 'bg-accent-primary-lightest dark:bg-accent-primary-darkest/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
                        }`}
                      >
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          isActive ? 'bg-gradient-to-br from-accent-primary to-accent-secondary text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300'
                        }`}>
                          {memberInitials(m)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{memberName(m)}</div>
                          {m.email && <div className="text-xs text-gray-400 dark:text-gray-500 truncate">{m.email}</div>}
                        </div>
                        {m.status && (
                          <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded shrink-0 ${STATUS_STYLES[m.status] || 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                            {m.status}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Prawy panel — wybrana osoba */}
          <div className={`${selected ? 'block' : 'hidden lg:block'}`}>
            {!selected ? (
              <div className="h-full min-h-[300px] flex items-center justify-center bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-12 text-center">
                <div>
                  <HeartPulse size={44} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                  <p className="text-gray-500 dark:text-gray-400">Wybierz osobę z listy, aby zobaczyć jej kartotekę opieki.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Karta osoby */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                  <div className="flex items-start gap-3">
                    <button onClick={() => setSelectedId(null)} className="lg:hidden p-2 -ml-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0"><ChevronLeft size={20} /></button>
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center text-white font-bold shrink-0">
                      {memberInitials(selected)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">{memberName(selected)}</h2>
                        {selected.status && (
                          <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${STATUS_STYLES[selected.status] || 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                            {selected.status}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {selected.email && <span className="inline-flex items-center gap-1 truncate"><Mail size={13} /> {selected.email}</span>}
                        {selected.phone && <span className="inline-flex items-center gap-1"><Phone size={13} /> {selected.phone}</span>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Zakładki osoby */}
                <ResponsiveTabs tabs={PERSON_TABS} activeTab={personTab} onChange={setPersonTab} className="relative" />

                <div>
                  {personTab === 'notes' && <NotesTab key={selected.id} member={selected} campusIdForInsert={campusIdForInsert} withCampusFilter={withCampusFilter} />}
                  {personTab === 'care' && <CareLogTab key={selected.id} member={selected} campusIdForInsert={campusIdForInsert} withCampusFilter={withCampusFilter} />}
                  {personTab === 'milestones' && <MilestonesTab key={selected.id} member={selected} campusIdForInsert={campusIdForInsert} withCampusFilter={withCampusFilter} />}
                  {personTab === 'tags' && <TagsTab key={selected.id} member={selected} campusIdForInsert={campusIdForInsert} withCampusFilter={withCampusFilter} />}
                  {personTab === 'custom' && <CustomValuesTab key={selected.id} member={selected} fields={fields} onGoToDefinitions={goToDefinitions} />}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
