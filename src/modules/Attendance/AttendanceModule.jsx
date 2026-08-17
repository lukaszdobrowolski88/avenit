import React, { useState, useEffect, useCallback } from 'react';
import PageHeader from '../../components/PageHeader';
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
      <PageHeader moduleKey="attendance" icon={ClipboardCheck} title="Frekwencja" subtitle="Obecność dorosłych na nabożeństwach, spotkaniach i modlitwach — z analityką trendów" />

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
