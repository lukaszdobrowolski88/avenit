import React, { useState, useMemo } from 'react';
import { ArrowLeft, Plus, Pencil, Check, BarChart3, Type } from 'lucide-react';
import { useBoardsBundle } from '../hooks/useDashboards';
import { useCan } from '../../../components/Can';
import EmptyState from '../../../components/EmptyState';
import ActionMenu from '../../../components/ActionMenu';
import Spinner from '../../../components/Spinner';
import '../../../components/toolbar.css';
import { WidgetCard } from './Widgets';
import WidgetConfigModal from './WidgetConfigModal';
import { tr } from '../../../i18n';

export default function DashboardView({ dashboard, allBoards, onUpdate, onRename, onBack }) {
  // RBAC: edycja układu dashboardu = res:board_dashboards:update (członek ma tylko odczyt).
  const canEdit = useCan('res:board_dashboards:update');
  const [editing, setEditing] = useState(false);
  const [configWidget, setConfigWidget] = useState(null); // {} nowy | widget istniejący
  const layout = dashboard.layout || [];
  const boardIds = useMemo(() => [...new Set(layout.map(w => w.boardId).filter(Boolean))], [layout]);
  const bundle = useBoardsBundle(boardIds);

  const saveWidget = (widget) => {
    const exists = layout.some(w => w.id === widget.id);
    const next = exists ? layout.map(w => w.id === widget.id ? widget : w) : [...layout, widget];
    onUpdate(dashboard.id, { layout: next });
    setConfigWidget(null);
  };
  const removeWidget = (id) => onUpdate(dashboard.id, { layout: layout.filter(w => w.id !== id) });

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button type="button" onClick={onBack} className="icon-btn" aria-label={tr('Wróć do listy dashboardów')} title={tr('Wróć')}>
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex-1 min-w-0 truncate">{dashboard.name}</h2>
        {editing && allBoards.length > 0 && (
          <button type="button" className="tool-btn" onClick={() => setConfigWidget({})}><Plus size={15} aria-hidden="true" />{tr('Widżet')}</button>
        )}
        {canEdit && (
          <button type="button" className={`tool-btn ${editing ? 'tool-btn--primary' : ''}`} onClick={() => setEditing(e => !e)} aria-pressed={editing}>
            {editing ? <><Check size={15} aria-hidden="true" />{tr('Gotowe')}</> : <><Pencil size={15} aria-hidden="true" />{tr('Edytuj')}</>}
          </button>
        )}
        {canEdit && onRename && (
          <ActionMenu variant="tool" label={tr('Więcej działań')} items={[
            { key: 'rename', icon: Type, label: tr('Zmień nazwę'), onClick: () => onRename(dashboard) },
          ]} />
        )}
      </div>

      {layout.length === 0 ? (
        <EmptyState icon={BarChart3} title={tr('Pusty dashboard. Dodaj pierwszy widżet z danych tablic.')}
          subtitle={canEdit && !allBoards.length ? tr('Najpierw utwórz tablicę z danymi.') : undefined}
          action={canEdit && allBoards.length > 0 ? (
            <button type="button" className="tool-btn tool-btn--primary" onClick={() => { setEditing(true); setConfigWidget({}); }}>
              <Plus size={15} aria-hidden="true" />{tr('Dodaj widżet')}
            </button>
          ) : undefined} />
      ) : bundle.loading && !Object.keys(bundle.columns || {}).length ? (
        <Spinner center />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {layout.map(w => (
            <WidgetCard key={w.id} widget={w} bundle={bundle} boardName={bundle.boards?.[w.boardId]?.name || ''}
              editing={editing} onEdit={() => setConfigWidget(w)} onRemove={() => removeWidget(w.id)} />
          ))}
        </div>
      )}

      {configWidget !== null && (
        <WidgetConfigModal initial={configWidget.id ? configWidget : null} boards={allBoards}
          onSave={saveWidget} onClose={() => setConfigWidget(null)} />
      )}
    </div>
  );
}
