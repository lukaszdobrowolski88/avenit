import React, { useState, useRef, useEffect } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  pointerWithin, closestCenter,
} from '@dnd-kit/core';
import { ChevronLeft, Undo2, Redo2, Eye, Save, Check, LayoutTemplate, Monitor, Smartphone, MoreVertical, Download, Upload, Bookmark } from 'lucide-react';
import { tr } from '../../../../i18n';
import { TEMPLATES } from './templates';
import {
  createElement, createWidgetElement, locateElement, findElement, cloneTree,
  emptyLayout, LAYOUT_VERSION, ELEMENT_TYPES, WIDGET_META,
} from './builderElements';

const CUSTOM_TPL_KEY = 'builderCustomTemplates';
function loadCustomTemplates() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_TPL_KEY) || '[]'); } catch { return []; }
}
import { BuilderProvider, useBuilder, useBuilderActions } from './BuilderContext';
import ElementPalette from './ElementPalette';
import BuilderCanvas from './BuilderCanvas';
import Inspector from './Inspector';
import LayoutRenderer from '../../../CustomModule/components/LayoutRenderer';

const collisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : closestCenter(args);
};

function BuilderShell({ tab, moduleId, moduleName, moduleKey, onClose, onSave }) {
  const { root, settings, canUndo, canRedo, dirty, selectedId } = useBuilder();
  const { add, move, undo, redo, markClean, setRoot, remove, duplicate, select } = useBuilderActions();
  const [activeDrag, setActiveDrag] = useState(null);
  const [preview, setPreview] = useState(false);
  const [device, setDevice] = useState('desktop');
  const [tplOpen, setTplOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [customTpls, setCustomTpls] = useState(loadCustomTemplates);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const rootRef = useRef(root);
  rootRef.current = root;
  const fileRef = useRef(null);

  // Skróty klawiszowe (Del=usuń, Ctrl+D=duplikuj, Ctrl+Z/Y=cofnij/ponów, Esc=odznacz).
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      else if (mod && e.key.toLowerCase() === 'd' && selectedId) { e.preventDefault(); duplicate(selectedId); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) { e.preventDefault(); remove(selectedId); }
      else if (e.key === 'Escape') select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, undo, redo, duplicate, remove, select]);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ version: LAYOUT_VERSION, root, settings }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${(tab?.label || 'uklad').replace(/[^a-z0-9]+/gi, '_')}.json`; a.click();
    URL.revokeObjectURL(url); setMenuOpen(false);
  };
  const importJson = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const nodes = Array.isArray(parsed?.root) ? parsed.root : Array.isArray(parsed) ? parsed : null;
        if (nodes) setRoot(cloneTree(nodes)); else alert(tr('Nieprawidłowy plik układu'));
      } catch { alert(tr('Nieprawidłowy plik układu')); }
    };
    reader.readAsText(file); e.target.value = ''; setMenuOpen(false);
  };
  const saveAsTemplate = () => {
    const name = window.prompt(tr('Nazwa szablonu:')); if (!name) return;
    const next = [...loadCustomTemplates(), { key: 'c_' + Date.now(), label: name, root: JSON.parse(JSON.stringify(root)) }];
    localStorage.setItem(CUSTOM_TPL_KEY, JSON.stringify(next)); setCustomTpls(next); setMenuOpen(false);
  };
  const insertTemplate = (t) => {
    setRoot([...root, ...(t.build ? t.build() : cloneTree(t.root))]);
    setTplOpen(false);
  };

  const handleDragStart = (event) => setActiveDrag(event.active.data.current || null);

  const handleDragEnd = (event) => {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;
    const overId = String(over.id);

    let parentId = null;
    let beforeId = null;
    if (overId === 'zone:root') { parentId = null; beforeId = null; }
    else if (overId.startsWith('zone:')) { parentId = overId.slice(5); beforeId = null; }
    else {
      const loc = locateElement(root, overId);
      if (!loc) return;
      parentId = loc.parentId;
      beforeId = overId;
    }

    const data = active.data.current || {};
    if (data.fromPalette) {
      const el = data.type === 'widget' ? createWidgetElement(data.widgetType) : createElement(data.type);
      let target = { parentId };
      if (beforeId) {
        const l = locateElement(root, beforeId);
        if (l) target = { parentId: l.parentId, index: l.index };
      }
      add(el, target);
    } else {
      const id = data.elementId || String(active.id);
      if (id === beforeId) return;
      const moving = findElement(root, id);
      // Nie wolno upuścić kontenera do samego siebie ani do swojego potomka.
      if (moving) {
        if (parentId === id) return;
        if (parentId && findElement(moving.children || [], parentId)) return;
        if (beforeId && findElement(moving.children || [], beforeId)) return;
      }
      move(id, parentId, beforeId);
    }
  };

  const doSave = async () => {
    if (!onSave) return;
    setSaving(true);
    const snapshot = root;
    try {
      const res = await onSave({ version: LAYOUT_VERSION, root: snapshot, settings });
      if (res?.success !== false) {
        setSavedAt(new Date());
        // markClean tylko gdy w trakcie zapisu nic nie zmieniono (inaczej zostaw dirty → nie zgub edycji).
        if (rootRef.current === snapshot) markClean();
      }
    } finally {
      setSaving(false);
    }
  };

  const overlayLabel = () => {
    if (!activeDrag) return null;
    if (activeDrag.type === 'widget') return WIDGET_META[activeDrag.widgetType]?.label || 'Widget';
    if (activeDrag.elementId) return ELEMENT_TYPES[findElement(root, activeDrag.elementId)?.type]?.label;
    return ELEMENT_TYPES[activeDrag.type]?.label || activeDrag.type;
  };

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Nagłówek */}
      <div className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition">
            <ChevronLeft size={20} />
          </button>
          <div className="min-w-0">
            <div className="text-lg font-semibold text-gray-900 dark:text-white truncate">
              {tr('Kreator')}: {tab?.label || tr('Zakładka')}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {moduleName}{dirty ? ` · ${tr('niezapisane zmiany')}` : savedAt ? ` · ${tr('zapisano')}` : ''}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="relative">
            <button onClick={() => setTplOpen((v) => !v)}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
              <LayoutTemplate size={16} /> <span className="hidden sm:inline">{tr('Szablony')}</span>
            </button>
            {tplOpen && (
              <div className="absolute right-0 mt-1 w-60 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-30 py-1 max-h-80 overflow-y-auto">
                {[...TEMPLATES, ...customTpls].map((t) => (
                  <button key={t.key} onClick={() => insertTemplate(t)}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
                    {t.build ? tr(t.label) : t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" title={tr('Więcej')}>
              <MoreVertical size={18} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-1 w-52 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-30 py-1">
                <button onClick={saveAsTemplate} className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"><Bookmark size={15} /> {tr('Zapisz jako szablon')}</button>
                <button onClick={exportJson} className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"><Download size={15} /> {tr('Eksport JSON')}</button>
                <button onClick={() => fileRef.current?.click()} className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"><Upload size={15} /> {tr('Import JSON')}</button>
              </div>
            )}
            <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={importJson} />
          </div>
          <button onClick={undo} disabled={!canUndo} title={tr('Cofnij')}
            className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed">
            <Undo2 size={18} />
          </button>
          <button onClick={redo} disabled={!canRedo} title={tr('Ponów')}
            className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed">
            <Redo2 size={18} />
          </button>
          <button onClick={() => setPreview((v) => !v)}
            className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition ${preview ? 'bg-accent-primary text-white' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
            <Eye size={16} /> <span className="hidden sm:inline">{tr('Podgląd')}</span>
          </button>
          <button onClick={doSave} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-lg hover:shadow-lg transition disabled:opacity-50">
            {savedAt && !dirty ? <Check size={16} /> : <Save size={16} />}
            <span className="hidden sm:inline">{saving ? tr('Zapisywanie...') : tr('Zapisz')}</span>
          </button>
        </div>
      </div>

      {preview ? (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex justify-center gap-2 mb-4">
            {[['desktop', Monitor], ['mobile', Smartphone]].map(([d, Ico]) => (
              <button key={d} onClick={() => setDevice(d)}
                className={`p-2 rounded-lg transition ${device === d ? 'bg-accent-primary text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                <Ico size={16} />
              </button>
            ))}
          </div>
          <div className={`mx-auto bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-gray-700/50 p-6 transition-all ${device === 'mobile' ? 'max-w-[390px]' : 'max-w-3xl'}`}>
            <LayoutRenderer layout={{ version: LAYOUT_VERSION, root, settings }} moduleId={moduleId} moduleKey={moduleKey} moduleName={moduleName} tabId={tab?.id} device={device} />
          </div>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex-1 flex overflow-hidden">
            <div className="w-64 flex-shrink-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-y-auto p-4">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">{tr('Elementy')}</h2>
              <ElementPalette />
            </div>

            <BuilderCanvas />

            <div className="w-72 flex-shrink-0 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 overflow-y-auto p-4">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">{tr('Właściwości')}</h2>
              <Inspector />
            </div>
          </div>

          <DragOverlay>
            {activeDrag ? (
              <div className="px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border-2 border-accent-primary-light shadow-2xl text-sm font-medium text-gray-800 dark:text-gray-200">
                {tr(overlayLabel() || 'Element')}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

export default function ModuleLayoutBuilder({ tab, moduleId, moduleName, moduleKey, onClose, onSave }) {
  return (
    <BuilderProvider initialLayout={tab?.layout || emptyLayout()}>
      <BuilderShell tab={tab} moduleId={moduleId} moduleName={moduleName} moduleKey={moduleKey} onClose={onClose} onSave={onSave} />
    </BuilderProvider>
  );
}
