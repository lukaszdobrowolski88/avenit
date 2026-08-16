import React, { useState, useEffect } from 'react';
import { Plus, BarChart3, MoreHorizontal, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useDashboards } from '../hooks/useDashboards';
import { tr } from '../../../i18n';
import DashboardView from './DashboardView';
import Popover from '../components/Popover';

export default function DashboardsSection({ userEmail }) {
  const { dashboards, loading, createDashboard, updateDashboard, deleteDashboard } = useDashboards(userEmail);
  const [selectedId, setSelectedId] = useState(null);
  const [allBoards, setAllBoards] = useState([]);

  useEffect(() => {
    supabase.from('boards').select('id, name').eq('is_archived', false).is('module_key', null).order('display_order')
      .then(({ data }) => setAllBoards(data || []));
  }, []);

  const selected = dashboards.find(d => d.id === selectedId);
  if (selected) {
    return <DashboardView dashboard={selected} allBoards={allBoards} onUpdate={updateDashboard} onBack={() => setSelectedId(null)} />;
  }

  const handleCreate = async () => {
    const d = await createDashboard('Nowy dashboard');
    if (d) setSelectedId(d.id);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">{tr('Wykresy i wskaźniki zasilane danymi z tablic.')}</p>
        <button onClick={handleCreate} className="flex items-center gap-2 bg-gradient-to-r from-accent-primary to-accent-secondary text-white px-4 py-2.5 rounded-xl font-medium shadow-md hover:shadow-lg hover:opacity-90">
          <Plus size={18} /> {tr('Nowy dashboard')}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-400"><Loader2 className="animate-spin" size={26} /></div>
      ) : dashboards.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
          <BarChart3 size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400">Brak dashboardów. Utwórz pierwszy, by wizualizować dane tablic.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {dashboards.map(d => (
            <div key={d.id} onClick={() => setSelectedId(d.id)}
              className="group relative h-32 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-lg flex flex-col">
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white bg-gradient-to-br from-accent-primary to-accent-secondary"><BarChart3 size={20} /></div>
                <Popover align="right" width={150} trigger={<button onClick={(e) => e.stopPropagation()} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 p-1"><MoreHorizontal size={18} /></button>}>
                  {({ close }) => (
                    <div className="p-1.5" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => { if (confirm(`Usunąć „${d.name}"?`)) deleteDashboard(d.id); close(); }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-sm text-red-600"><Trash2 size={14} /> Usuń</button>
                    </div>
                  )}
                </Popover>
              </div>
              <h3 className="mt-3 font-semibold text-gray-800 dark:text-gray-100 truncate">{d.name}</h3>
              <p className="text-xs text-gray-400">{(d.layout || []).length} widżetów</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
