import React, { useState, useEffect } from 'react';
import { Plus, BarChart3, Trash2, Type } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useDashboards } from '../hooks/useDashboards';
import { tr } from '../../../i18n';
import { useCan } from '../../../components/Can';
import DashboardView from './DashboardView';
import ActionMenu from '../../../components/ActionMenu';
import { confirmDialog, promptDialog } from '../../../lib/dialog';
import Spinner from '../../../components/Spinner';
import EmptyState from '../../../components/EmptyState';
import '../../../components/toolbar.css';
import '../components/boardCards.css';

export default function DashboardsSection({ userEmail }) {
  const { dashboards, loading, createDashboard, updateDashboard, deleteDashboard } = useDashboards(userEmail);
  const canCreate = useCan('res:board_dashboards:create'); // twórz dashboardy (lider+)
  const canUpdate = useCan('res:board_dashboards:update');
  const canDelete = useCan('res:board_dashboards:delete');
  const [selectedId, setSelectedId] = useState(null);
  const [allBoards, setAllBoards] = useState([]);

  useEffect(() => {
    // Źródła widżetów: ogólne tablice + tablice modułów (zadania Mediów, Młodzieżówki, Grup
    // domowych, modułów z kreatora) — najpierw ogólne, potem modułowe. Bez szablonów i archiwum.
    supabase.from('boards').select('id, name, module_key').eq('is_archived', false).eq('is_template', false).order('display_order')
      .then(({ data }) => setAllBoards(
        [...(data || [])].sort((a, b) => Number(!!a.module_key) - Number(!!b.module_key))
      ));
  }, []);

  const rename = async (d) => {
    const name = await promptDialog({ title: tr('Zmień nazwę dashboardu'), defaultValue: d.name || '', confirmLabel: tr('Zapisz') });
    if (name != null && name.trim() && name.trim() !== d.name) await updateDashboard(d.id, { name: name.trim() });
  };
  const remove = async (d) => {
    if (await confirmDialog({ title: tr('Usunąć „{name}"?', { name: d.name }), confirmLabel: tr('Usuń'), danger: true })) {
      await deleteDashboard(d.id);
      if (selectedId === d.id) setSelectedId(null);
    }
  };

  const selected = dashboards.find(d => d.id === selectedId);
  if (selected) {
    return (
      <DashboardView dashboard={selected} allBoards={allBoards} onUpdate={updateDashboard}
        onRename={canUpdate ? rename : undefined} onBack={() => setSelectedId(null)} />
    );
  }

  const handleCreate = async () => {
    const d = await createDashboard(tr('Nowy dashboard'));
    if (d) setSelectedId(d.id);
  };

  const menuFor = (d) => [
    ...(canUpdate ? [{ key: 'rename', icon: Type, label: tr('Zmień nazwę'), onClick: () => rename(d) }] : []),
    ...(canDelete ? [{ key: 'delete', icon: Trash2, label: tr('Usuń'), danger: true, onClick: () => remove(d) }] : []),
  ];

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">{tr('Wykresy i wskaźniki zasilane danymi z tablic.')}</p>
        {canCreate && (
          <button type="button" className="tool-btn tool-btn--primary" onClick={handleCreate}>
            <Plus size={15} aria-hidden="true" />{tr('Nowy dashboard')}
          </button>
        )}
      </div>

      {loading ? (
        <Spinner center />
      ) : dashboards.length === 0 ? (
        <EmptyState icon={BarChart3} title={canCreate ? tr('Brak dashboardów. Utwórz pierwszy, by wizualizować dane tablic.') : tr('Brak dashboardów.')} />
      ) : (
        <ul className="bc-grid">
          {dashboards.map(d => {
            const items = menuFor(d);
            const n = (d.layout || []).length;
            return (
              <li key={d.id} className="bc-card">
                <button type="button" className="bc-open" onClick={() => setSelectedId(d.id)}>
                  <span className="bc-tile" data-tone={0} aria-hidden="true"><BarChart3 size={18} /></span>
                  <span className="bc-title">{d.name || tr('Bez nazwy')}</span>
                  <span className="bc-meta"><span>{n} {tr('widżetów')}</span></span>
                </button>
                {items.length > 0 && (
                  <div className="bc-menu">
                    <ActionMenu variant="ghost" label={tr('Działania: {name}', { name: d.name || tr('Dashboard') })} items={items} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
