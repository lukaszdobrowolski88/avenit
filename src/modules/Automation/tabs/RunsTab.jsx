import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { History, RefreshCw, Filter } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import CustomSelect from '../../../components/CustomSelect';
import { RUN_STATUSES, statusLabel, formatDateTime, memberName } from '../lib/automationApi';
import Spinner from '../../../components/Spinner';
import EmptyState from '../../../components/EmptyState';
import { DataTable, THead, TH, TR, TD, StatusPill, STATUS_COLORS } from '../../../components/ui/DataTable';

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

  const statusColor = (s) => {
    switch (s) {
      case 'done': return STATUS_COLORS.success;
      case 'running': return STATUS_COLORS.info;
      case 'failed': return STATUS_COLORS.danger;
      default: return STATUS_COLORS.warning;
    }
  };

  const personName = (r) => (r.member_id && membersById?.[r.member_id]) ? memberName(membersById[r.member_id]) : '';

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
          <Spinner center />
        ) : runs.length === 0 ? (
          <EmptyState icon={History} title="Brak uruchomień." subtitle="Pojawią się tu po wykonaniu automatyzacji przez workera." />
        ) : (
          <DataTable flush>
            <THead>
              <tr>
                <TH>Automatyzacja</TH>
                <TH>Osoba</TH>
                <TH>Status</TH>
                <TH align="center">Krok</TH>
                <TH>Data</TH>
              </tr>
            </THead>
            <tbody>
              {runs.map(r => (
                <TR key={r.id}>
                  <TD className="font-medium text-gray-900 dark:text-white">{workflowsById[r.workflow_id]?.name || ''}</TD>
                  <TD muted>{personName(r)}</TD>
                  <TD>
                    <StatusPill color={statusColor(r.status)}>{statusLabel(r.status)}</StatusPill>
                  </TD>
                  <TD align="center" muted numeric>{r.current_step ?? 0}</TD>
                  <TD muted numeric className="whitespace-nowrap">{formatDateTime(r.started_at || r.created_at)}</TD>
                </TR>
              ))}
            </tbody>
          </DataTable>
        )}
      </div>
    </div>
  );
}
