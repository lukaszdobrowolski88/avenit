import React, { useState, useEffect, useCallback } from 'react';
import ModuleTitle from '../../components/ModuleTitle';
import { Workflow, Zap, LayoutTemplate, History } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useCampusQuery } from '../../hooks/useCampusQuery';
import ResponsiveTabs from '../../components/ResponsiveTabs';
import WorkflowsTab from './tabs/WorkflowsTab';
import TemplatesTab from './tabs/TemplatesTab';
import RunsTab from './tabs/RunsTab';

const TABS = [
  { id: 'workflows', label: 'Automatyzacje', icon: Zap },
  { id: 'templates', label: 'Szablony', icon: LayoutTemplate },
  { id: 'runs', label: 'Uruchomienia', icon: History },
];

export default function AutomationModule() {
  const [activeTab, setActiveTab] = useState('workflows');
  const { withCampusFilter, campusIdForInsert, selectedCampusId } = useCampusQuery();

  const [members, setMembers] = useState([]);
  const [membersById, setMembersById] = useState({});
  const [loading, setLoading] = useState(true);

  const loadShared = useCallback(async () => {
    setLoading(true);
    try {
      let membersQuery = supabase
        .from('members')
        .select('id, first_name, last_name, email')
        .order('last_name', { ascending: true });
      membersQuery = withCampusFilter(membersQuery);
      const { data: membersData } = await membersQuery;
      const list = membersData || [];
      setMembers(list);
      const map = {};
      list.forEach(m => { map[m.id] = m; });
      setMembersById(map);
    } catch (err) {
      console.error('Automation loadShared error:', err);
    } finally {
      setLoading(false);
    }
  }, [withCampusFilter]);

  useEffect(() => { loadShared(); }, [loadShared, selectedCampusId]);

  const shared = { members, membersById, campusIdForInsert, withCampusFilter, selectedCampusId };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Nagłówek */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center shadow-lg">
          <Workflow className="text-white" size={24} />
        </div>
        <div>
          <ModuleTitle moduleKey="automation" fallback="Automatyzacje" className="text-2xl font-bold text-gray-900 dark:text-white" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Silnik automatyzacji i ścieżki asymilacji nowych gości</p>
        </div>
      </div>

      {/* Notka o workerze */}
      <div className="flex items-start gap-2 p-3 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 text-sm text-amber-700 dark:text-amber-300">
        <Zap size={16} className="shrink-0 mt-0.5" />
        <span>
          Definiujesz automatyzacje i przeglądasz dziennik uruchomień. Wykonanie kroków (e-mail, SMS, push, zadania, opóźnienia)
          realizuje w tle worker <b>co ~5 minut</b> — nowi członkowie/goście zapisywani są automatycznie wg wyzwalacza,
          a dowolną osobę możesz też dodać ręcznie przyciskiem „Zapisz osobę do ścieżki".
        </span>
      </div>

      {/* Zakładki */}
      <ResponsiveTabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} className="relative" />

      {/* Zawartość */}
      <div>
        {activeTab === 'workflows' && <WorkflowsTab {...shared} />}
        {activeTab === 'templates' && <TemplatesTab {...shared} onNavigate={setActiveTab} />}
        {activeTab === 'runs' && <RunsTab {...shared} loading={loading} />}
      </div>
    </div>
  );
}
