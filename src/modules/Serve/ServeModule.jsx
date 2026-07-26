import React, { useState, useEffect, useCallback } from 'react';
import { CalendarCheck, CalendarOff, Music } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useCampusQuery } from '../../hooks/useCampusQuery';
import ResponsiveTabs from '../../components/ResponsiveTabs';
import AvailabilityTab from './tabs/AvailabilityTab';
import CcliTab from './tabs/CcliTab';

const TABS = [
  { id: 'availability', label: 'Dostępność', icon: CalendarOff },
  { id: 'ccli', label: 'Raport CCLI', icon: Music },
];

export default function ServeModule() {
  const [activeTab, setActiveTab] = useState('availability');
  const { withCampusFilter, campusIdForInsert, selectedCampusId } = useCampusQuery();

  const [members, setMembers] = useState([]);
  const [membersById, setMembersById] = useState({});
  const [songs, setSongs] = useState([]);
  const [songsById, setSongsById] = useState({});
  const [programs, setPrograms] = useState([]);
  const [programsById, setProgramsById] = useState({});
  const [loading, setLoading] = useState(true);

  const loadShared = useCallback(async () => {
    setLoading(true);
    try {
      // Wolontariusze (członkowie) — do wyboru w niedostępnościach
      let membersQuery = supabase.from('members').select('id, first_name, last_name').order('last_name', { ascending: true });
      membersQuery = withCampusFilter(membersQuery);
      const { data: membersData } = await membersQuery;
      const mList = membersData || [];
      setMembers(mList);
      const mMap = {}; mList.forEach(m => { mMap[m.id] = m; });
      setMembersById(mMap);

      // Pieśni — do raportu CCLI. Tabela współdzielona, bez filtra kampusu.
      const { data: songsData } = await supabase.from('songs').select('id, title, author').order('title', { ascending: true });
      const sList = songsData || [];
      setSongs(sList);
      const sMap = {}; sList.forEach(s => { sMap[s.id] = s; });
      setSongsById(sMap);

      // Programy — opcjonalne powiązanie wykonania pieśni.
      try {
        let programsQuery = supabase.from('programs').select('id, title, date').order('date', { ascending: false });
        programsQuery = withCampusFilter(programsQuery);
        const { data: programsData } = await programsQuery;
        const pList = programsData || [];
        setPrograms(pList);
        const pMap = {}; pList.forEach(p => { pMap[p.id] = p; });
        setProgramsById(pMap);
      } catch {
        setPrograms([]); setProgramsById({});
      }
    } catch (err) {
      console.error('Serve loadShared error:', err);
    } finally {
      setLoading(false);
    }
  }, [withCampusFilter]);

  useEffect(() => { loadShared(); }, [loadShared, selectedCampusId]);

  const shared = {
    members, membersById, songs, songsById, programs, programsById,
    campusIdForInsert, withCampusFilter, refreshShared: loadShared, loadingShared: loading,
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Nagłówek */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center shadow-lg">
          <CalendarCheck className="text-white" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Służba</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Dostępność wolontariuszy i ewidencja wykonań pieśni (CCLI)</p>
        </div>
      </div>

      {/* Zakładki */}
      <ResponsiveTabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} className="relative" />

      {/* Zawartość */}
      <div>
        {activeTab === 'availability' && <AvailabilityTab {...shared} />}
        {activeTab === 'ccli' && <CcliTab {...shared} />}
      </div>
    </div>
  );
}
