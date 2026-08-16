import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft, Table2, Trello, Calendar as CalIcon, GanttChartSquare, Plus, Loader2, Zap, FormInput,
  BarChart3, GalleryThumbnails, MoreHorizontal, Pencil, Copy, Star, Trash2, Sparkles, Gauge, FileText, Activity, MapPin,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useBoardData } from './hooks/useBoardData';
import { useBoardAutomations } from './hooks/useBoardAutomations';
import TableView from './views/TableView';
import KanbanView from './views/KanbanView';
import CalendarView from './views/CalendarView';
import TimelineView from './views/TimelineView';
import FormView from './views/FormView';
import ChartView from './views/ChartView';
import FilesGalleryView from './views/FilesGalleryView';
import WorkloadView from './views/WorkloadView';
import DocView from './views/DocView';
import MapView from './views/MapView';
import ViewToolbar from './components/ViewToolbar';
import ItemPanel from './components/ItemPanel';
import AutomationsPanel from './components/AutomationsPanel';
import BoardActivityPanel from './components/BoardActivityPanel';
import AiSidekick from './components/AiSidekick';
import Popover from './components/Popover';
import { exportBoardCsv, buildCellsFromRecord } from './lib/csv';

const VIEW_ICONS = { table: Table2, kanban: Trello, calendar: CalIcon, timeline: GanttChartSquare, form: FormInput, chart: BarChart3, files: GalleryThumbnails, workload: Gauge, doc: FileText, map: MapPin };
const VIEW_TYPES = [
  { type: 'table', label: 'Tabela', icon: Table2 },
  { type: 'kanban', label: 'Kanban', icon: Trello },
  { type: 'calendar', label: 'Kalendarz', icon: CalIcon },
  { type: 'timeline', label: 'Oś czasu', icon: GanttChartSquare },
  { type: 'chart', label: 'Wykres', icon: BarChart3 },
  { type: 'workload', label: 'Obciążenie', icon: Gauge },
  { type: 'map', label: 'Mapa', icon: MapPin },
  { type: 'doc', label: 'Dokument', icon: FileText },
  { type: 'files', label: 'Galeria plików', icon: GalleryThumbnails },
  { type: 'form', label: 'Formularz', icon: FormInput },
];

export default function BoardView({ boardId, userEmail, userName, onBack, embedded = false, initialItemId = null }) {
  const data = useBoardData(boardId, { userEmail, userName });
  const automations = useBoardAutomations(boardId, data, { userEmail, userName });
  const [activeViewId, setActiveViewId] = useState(null);
  const [openItem, setOpenItem] = useState(null);
  const [showAutomations, setShowAutomations] = useState(false);
  const [showSidekick, setShowSidekick] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [updatesCount, setUpdatesCount] = useState({});
  const openedInitial = useRef(false);

  // Deep-link: otwórz wskazany element po załadowaniu (z powiadomień/@wzmianek/Mojej pracy)
  useEffect(() => {
    if (initialItemId && !openedInitial.current && data.items.length) {
      const it = data.items.find(i => i.id === initialItemId);
      if (it) { setOpenItem(it); openedInitial.current = true; }
    }
  }, [initialItemId, data.items]);

  // Domyślny widok
  useEffect(() => {
    if (!activeViewId && data.views.length) {
      setActiveViewId((data.views.find(v => v.is_default) || data.views[0]).id);
    }
  }, [data.views, activeViewId]);

  // Liczniki aktualizacji per element (dla plakietek w wierszach)
  useEffect(() => {
    if (!boardId) return;
    let alive = true;
    supabase.from('board_item_updates').select('item_id').eq('board_id', boardId).then(({ data: rows }) => {
      if (!alive) return;
      const map = {};
      (rows || []).forEach(r => { map[r.item_id] = (map[r.item_id] || 0) + 1; });
      setUpdatesCount(map);
    });
    return () => { alive = false; };
  }, [boardId, data.items.length]);

  const activeView = useMemo(() => data.views.find(v => v.id === activeViewId), [data.views, activeViewId]);
  const config = activeView?.config || {};
  const onUpdateConfig = (patch) => activeView && data.updateView(activeView.id, { config: { ...config, ...patch } });
  const addItemToFirstGroup = () => {
    const g = [...data.groups].sort((a, b) => a.display_order - b.display_order)[0];
    if (g) data.addItem(g.id).then(it => it && setOpenItem(it));
  };
  const handleExport = () => exportBoardCsv(data.board, data.columns, data.items);
  const handleImport = async (records) => {
    const g = [...data.groups].sort((a, b) => a.display_order - b.display_order)[0];
    if (!g || !records?.length) return;
    for (const rec of records) {
      const name = rec['Element'] || rec[Object.keys(rec)[0]] || 'Element';
      await data.addItem(g.id, name, buildCellsFromRecord(rec, data.columns));
    }
  };

  if (data.loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400"><Loader2 className="animate-spin" size={28} /></div>;
  }
  if (!data.board) {
    return <div className="text-center text-gray-400 py-12">Nie znaleziono tablicy.</div>;
  }

  const renderView = () => {
    const type = activeView?.type || 'table';
    const shared = { data, config, onUpdateConfig, onOpenItem: setOpenItem, updatesCountByItem: updatesCount };
    switch (type) {
      case 'kanban': return <KanbanView {...shared} />;
      case 'calendar': return <CalendarView {...shared} />;
      case 'timeline': return <TimelineView {...shared} />;
      case 'chart': return <ChartView {...shared} />;
      case 'workload': return <WorkloadView {...shared} />;
      case 'doc': return <DocView {...shared} />;
      case 'map': return <MapView {...shared} />;
      case 'files': return <FilesGalleryView {...shared} />;
      case 'form': return <FormView {...shared} />;
      case 'table':
      default: return <TableView {...shared} />;
    }
  };

  return (
    <div>
      {/* Nagłówek tablicy */}
      <div className="flex items-center gap-3 mb-4">
        {!embedded && onBack && (
          <button onClick={onBack} className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><ArrowLeft size={20} /></button>
        )}
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg" style={{ backgroundColor: data.board.color || '#6366f1' }}>
          <Table2 size={22} />
        </div>
        <input value={data.board.name}
          onChange={(e) => data.setBoard({ ...data.board, name: e.target.value })}
          onBlur={(e) => supabase.from('boards').update({ name: e.target.value }).eq('id', boardId)}
          className="text-2xl font-bold bg-transparent outline-none text-gray-800 dark:text-gray-100 flex-1 min-w-0" />
        <button onClick={() => setShowSidekick(true)}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg text-white bg-gradient-to-r from-accent-primary to-accent-secondary hover:opacity-90 shadow-sm">
          <Sparkles size={15} /> AI Sidekick
        </button>
        <button onClick={() => setShowAutomations(true)}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700">
          <Zap size={15} className="text-accent-primary" /> Automatyzacje
          {automations.automations.length > 0 && <span className="text-xs text-gray-400">{automations.automations.length}</span>}
        </button>
        <button onClick={() => setShowActivity(true)} title="Aktywność tablicy"
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700">
          <Activity size={15} />
        </button>
      </div>

      {/* Zakładki widoków */}
      <div className="flex items-center gap-1 mb-4 border-b border-gray-200 dark:border-gray-700 overflow-x-auto custom-scrollbar">
        {data.views.map(v => (
          <ViewTab key={v.id} view={v} active={activeViewId === v.id} onSelect={setActiveViewId} data={data}
            canDelete={data.views.length > 1}
            onDelete={() => { data.deleteView(v.id); if (activeViewId === v.id) setActiveViewId(data.views.find(x => x.id !== v.id)?.id); }}
            onDuplicated={(nv) => nv && setActiveViewId(nv.id)} />
        ))}
        <AddViewButton onAdd={(type, label) => data.addView(type, label).then(v => v && setActiveViewId(v.id))} />
      </div>

      {!['form', 'doc'].includes(activeView?.type || 'table') && (
        <ViewToolbar columns={data.columns} config={config} onUpdateConfig={onUpdateConfig} onAddItem={addItemToFirstGroup} onExport={handleExport} onImport={handleImport} />
      )}

      {renderView()}

      {openItem && (
        <ItemPanel item={openItem} data={data} onClose={() => setOpenItem(null)} userEmail={userEmail} userName={userName} />
      )}

      {showAutomations && (
        <AutomationsPanel automations={automations.automations} columns={data.columns} people={data.people}
          onAdd={automations.addAutomation} onUpdate={automations.updateAutomation} onDelete={automations.deleteAutomation}
          onClose={() => setShowAutomations(false)} />
      )}

      {showSidekick && <AiSidekick data={data} onClose={() => setShowSidekick(false)} />}

      {showActivity && (
        <BoardActivityPanel boardId={boardId} items={data.items} onClose={() => setShowActivity(false)}
          onOpenItem={(it) => { setShowActivity(false); if (it) setOpenItem(it); }} />
      )}
    </div>
  );
}

function ViewTab({ view, active, onSelect, data, canDelete, onDelete, onDuplicated }) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(view.name);
  const Icon = VIEW_ICONS[view.type] || Table2;
  const commit = () => { setRenaming(false); if (name.trim() && name !== view.name) data.updateView(view.id, { name: name.trim() }); };
  return (
    <div className={`flex items-center border-b-2 -mb-px ${active ? 'border-accent-primary' : 'border-transparent'}`}>
      {renaming ? (
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()}
          className="mx-1 my-1 px-2 py-1 text-sm bg-white dark:bg-gray-700 rounded outline-none ring-2 ring-accent-primary/40 w-28" />
      ) : (
        <button onClick={() => onSelect(view.id)}
          className={`flex items-center gap-1.5 pl-3 pr-1 py-2 text-sm whitespace-nowrap ${active ? 'text-accent-primary' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
          <Icon size={15} /> {view.name} {view.is_default && <Star size={11} className="fill-amber-400 text-amber-400" />}
        </button>
      )}
      {active && !renaming && (
        <Popover align="left" width={185} trigger={<button className="px-1 py-2 text-gray-400 hover:text-gray-600"><MoreHorizontal size={15} /></button>}>
          {({ close }) => (
            <div className="p-1.5 text-sm">
              <button onClick={() => { setRenaming(true); close(); }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-200"><Pencil size={14} /> Zmień nazwę</button>
              <button onClick={() => { data.duplicateView(view).then(onDuplicated); close(); }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-200"><Copy size={14} /> Duplikuj</button>
              <button onClick={() => { data.setDefaultView(view.id); close(); }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-200"><Star size={14} /> Ustaw domyślny</button>
              {canDelete && <button onClick={() => { onDelete(); close(); }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-red-600"><Trash2 size={14} /> Usuń widok</button>}
            </div>
          )}
        </Popover>
      )}
    </div>
  );
}

function AddViewButton({ onAdd }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1 px-2 py-2 text-sm text-gray-400 hover:text-accent-primary"><Plus size={15} /></button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-1.5 w-44">
            {VIEW_TYPES.map(v => (
              <button key={v.type} onClick={() => { onAdd(v.type, v.label); setOpen(false); }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 text-sm text-gray-700 dark:text-gray-200">
                <v.icon size={15} className="text-gray-400" /> {v.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
