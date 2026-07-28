import React, { useState, useEffect, useCallback } from 'react';
import { Gift, LayoutDashboard, Receipt, Repeat, Target, FolderOpen, FileText, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useCampusQuery } from '../../hooks/useCampusQuery';
import ResponsiveTabs from '../../components/ResponsiveTabs';
import OverviewTab from './tabs/OverviewTab';
import DonationsTab from './tabs/DonationsTab';
import RecurringTab from './tabs/RecurringTab';
import CampaignsTab from './tabs/CampaignsTab';
import FundsTab from './tabs/FundsTab';
import StatementsTab from './tabs/StatementsTab';
import DonorsTab from './tabs/DonorsTab';

const TABS = [
  { id: 'overview', label: 'Pulpit', icon: LayoutDashboard },
  { id: 'donations', label: 'Darowizny', icon: Receipt },
  { id: 'donors', label: 'Darczyńcy', icon: Users },
  { id: 'recurring', label: 'Cykliczne', icon: Repeat },
  { id: 'campaigns', label: 'Kampanie', icon: Target, tour: 'giving-campaigns-tab' },
  { id: 'funds', label: 'Fundusze', icon: FolderOpen },
  { id: 'statements', label: 'Zestawienia PIT', icon: FileText },
];

export default function GivingModule() {
  const [activeTab, setActiveTab] = useState('overview');
  const { withCampusFilter, campusIdForInsert, selectedCampusId } = useCampusQuery();

  const [funds, setFunds] = useState([]);
  const [members, setMembers] = useState([]);
  const [membersById, setMembersById] = useState({});
  const [loading, setLoading] = useState(true);

  const loadShared = useCallback(async () => {
    setLoading(true);
    try {
      // Fundusze
      let fundsQuery = supabase.from('giving_funds').select('*').order('sort_order', { ascending: true });
      fundsQuery = withCampusFilter(fundsQuery);
      const { data: fundsData } = await fundsQuery;
      setFunds(fundsData || []);

      // Członkowie (do selektora darczyńcy)
      let membersQuery = supabase.from('members').select('id, first_name, last_name, email').order('last_name', { ascending: true });
      membersQuery = withCampusFilter(membersQuery);
      const { data: membersData } = await membersQuery;
      const list = membersData || [];
      setMembers(list);
      const map = {};
      list.forEach(m => { map[m.id] = m; });
      setMembersById(map);
    } catch (err) {
      console.error('Giving loadShared error:', err);
    } finally {
      setLoading(false);
    }
  }, [withCampusFilter]);

  useEffect(() => { loadShared(); }, [loadShared, selectedCampusId]);

  const shared = { funds, members, membersById, campusIdForInsert, withCampusFilter, refreshShared: loadShared };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Nagłówek */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center shadow-lg">
          <Gift className="text-white" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dawanie</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Darowizny, dawanie cykliczne, kampanie i zestawienia roczne</p>
        </div>
      </div>

      {/* Zakładki */}
      <ResponsiveTabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} className="relative" />

      {/* Zawartość */}
      <div>
        {activeTab === 'overview' && <OverviewTab {...shared} loading={loading} onNavigate={setActiveTab} />}
        {activeTab === 'donations' && <DonationsTab {...shared} />}
        {activeTab === 'donors' && <DonorsTab {...shared} />}
        {activeTab === 'recurring' && <RecurringTab {...shared} />}
        {activeTab === 'campaigns' && <CampaignsTab {...shared} />}
        {activeTab === 'funds' && <FundsTab {...shared} />}
        {activeTab === 'statements' && <StatementsTab {...shared} />}
      </div>
    </div>
  );
}
