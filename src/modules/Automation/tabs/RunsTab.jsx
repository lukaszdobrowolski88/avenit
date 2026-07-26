import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { History, RefreshCw, Filter } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import CustomSelect from '../../../components/CustomSelect';
import { RUN_STATUSES, statusLabel, formatDateTime, memberName } from '../lib/automationApi';

export default function RunsTab({ membersById, withCampusFilter }) {
  const [runs, setRuns] = useState([]);
  const [workflowsById, setWorkflowsById] = useState({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Workflow-y bieżącego kampusu — po nich filtrujemy uruchomienia
      let wfQuery = supabase.from('automation_workflows').select('id, name');
      wfQuery = withCampusFilter(wfQuery);
      const { data: wfs } = await wfQuery;
      const list = wfs || [];
      const map = {};
      list.forEach(w => { map[w.id] = w; });
      setWorkflowsById(map);

      const ids = list.map(w => w.id);
      if (!ids.length) { setRuns([]); return; }

      let q = supabase
        .from('automation_runs')
        .select('*')
        .in('workflow_id', ids)
        .order('created_at', { ascending: false });
      if (statusFilter) q = q.eq('status', statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      setRuns(data || []);
    } catch (err) {
      console.error('Load runs error:', err);
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, [withCampusFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const statusOptions = useMemo(() => [{ value: '', label: 'Wszystkie statusy' }, ...RUN_STATUSES], []);

  const statusClass = (s) => {
    switch (s) {
      case 'done': return 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'running': return 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400';
      case 'failed': return 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400';
      default: return 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400';
    }
  };

  const personName = (r) => (r.member_id && membersById?.[r.member_id]) ? memberName(membersById[r.member_id]) : '—';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400 flex-1 min-w-[200px]">Dziennik uruchomień automatyzacji (tworzy je worker w tle).</p>
        <div className="w-48"><CustomSelect value={statusFilter} onChange={setStatusFilter} options={statusOptions} compact icon={Filter} /></div>
        <button onClick={load} className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2 text-sm">
          <RefreshCw size={16} /> Odśwież
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-400">Ładowanie...</div>
        ) : runs.length === 0 ? (
          <div className="p-12 text-center">
            <History size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400">Brak uruchomień. Pojawią się tu po wykonaniu automatyzacji przez workera.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
                  <th className="px-4 py-3 font-semibold">Automatyzacja</th>
                  <th className="px-4 py-3 font-semibold">Osoba</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-center">Krok</th>
                  <th className="px-4 py-3 font-semibold">Data</th>
                </tr>
              </thead>
              <tbody>
                {runs.map(r => (
                  <tr key={r.id} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{workflowsById[r.workflow_id]?.name || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{personName(r)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusClass(r.status)}`}>{statusLabel(r.status)}</span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-300">{r.current_step ?? 0}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{formatDateTime(r.started_at || r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
