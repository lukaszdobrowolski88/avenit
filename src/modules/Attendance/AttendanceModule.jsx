import React, { useState, useEffect, useCallback } from 'react';
import ModuleTitle from '../../components/ModuleTitle';
import { ClipboardCheck, ListChecks, TrendingUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useCampusQuery } from '../../hooks/useCampusQuery';
import ResponsiveTabs from '../../components/ResponsiveTabs';
import SessionsTab from './tabs/SessionsTab';
import TrendsTab from './tabs/TrendsTab';

const TABS = [
  { id: 'sessions', label: 'Sesje', icon: ListChecks },
  { id: 'trends', label: 'Trendy', icon: TrendingUp },
];

export default function AttendanceModule() {
  const [activeTab, setActiveTab] = useState('sessions');
  const { withCampusFilter, campusIdForInsert, selectedCampusId } = useCampusQuery();

  const [members, setMembers] = useState([]);
  const [membersById, setMembersById] = useState({});
  const [loading, setLoading] = useState(true);

  const loadShared = useCallback(async () => {
    setLoading(true);
    try {
      let membersQuery = supabase
        .from('members')
        .select('id, first_name, last_name')
        .order('last_name', { ascending: true });
      membersQuery = withCampusFilter(membersQuery);
      const { data: membersData } = await membersQuery;
      const list = membersData || [];
      setMembers(list);
      const map = {};
      list.forEach(m => { map[m.id] = m; });
      setMembersById(map);
    } catch (err) {
      console.error('Attendance loadShared error:', err);
    } finally {
      setLoading(false);
    }
  }, [withCampusFilter]);

  useEffect(() => { loadShared(); }, [loadShared, selectedCampusId]);

  const shared = { members, membersById, campusIdForInsert, withCampusFilter };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Nagłówek */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center shadow-lg">
          <ClipboardCheck className="text-white" size={24} />
        </div>
        <div>
          <ModuleTitle moduleKey="attendance" fallback="Frekwencja" className="text-2xl font-bold text-gray-900 dark:text-white" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Obecność dorosłych na nabożeństwach, spotkaniach i modlitwach — z analityką trendów</p>
        </div>
      </div>

      {/* Zakładki */}
      <ResponsiveTabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} className="relative" />

      {/* Zawartość */}
      <div>
        {activeTab === 'sessions' && <SessionsTab {...shared} loading={loading} />}
        {activeTab === 'trends' && <TrendsTab {...shared} />}
      </div>
    </div>
  );
}
