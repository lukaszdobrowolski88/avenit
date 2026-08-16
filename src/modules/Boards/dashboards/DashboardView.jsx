import React, { useState, useMemo } from 'react';
import { ArrowLeft, Plus, Pencil, Check } from 'lucide-react';
import { useBoardsBundle } from '../hooks/useDashboards';
import { WidgetCard } from './Widgets';
import WidgetConfigModal from './WidgetConfigModal';

export default function DashboardView({ dashboard, allBoards, onUpdate, onBack }) {
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
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><ArrowLeft size={20} /></button>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex-1">{dashboard.name}</h1>
        {editing && allBoards.length > 0 && (
          <button onClick={() => setConfigWidget({})} className="flex items-center gap-1.5 bg-accent-primary text-white text-sm px-3 py-1.5 rounded-lg"><Plus size={15} /> Widżet</button>
        )}
        <button onClick={() => setEditing(e => !e)}
          className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border ${editing ? 'border-accent-primary text-accent-primary' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'}`}>
          {editing ? <><Check size={15} /> Gotowe</> : <><Pencil size={15} /> Edytuj</>}
        </button>
      </div>

      {layout.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
          <p className="text-gray-500 dark:text-gray-400 mb-4">Pusty dashboard. Dodaj pierwszy widżet z danych tablic.</p>
          {allBoards.length > 0
            ? <button onClick={() => { setEditing(true); setConfigWidget({}); }} className="inline-flex items-center gap-2 bg-accent-primary text-white px-4 py-2 rounded-xl"><Plus size={18} /> Dodaj widżet</button>
            : <p className="text-sm text-gray-400">Najpierw utwórz tablicę z danymi.</p>}
        </div>
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
