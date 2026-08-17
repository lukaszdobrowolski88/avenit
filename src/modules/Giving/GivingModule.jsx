import React, { useState, useEffect, useCallback } from 'react';
import PageHeader from '../../components/PageHeader';
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
      <PageHeader moduleKey="giving" icon={Gift} title="Dawanie" subtitle="Darowizny, dawanie cykliczne, kampanie i zestawienia roczne" />

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
