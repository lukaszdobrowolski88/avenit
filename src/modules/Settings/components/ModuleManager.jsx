import React, { useState } from 'react';
import { Plus, GripVertical, Pencil, Trash2, Lock, Layers, ToggleLeft, ToggleRight, Loader2 } from 'lucide-react';
import * as Icons from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useModules } from '../../../hooks/useModules';
import { supabase } from '../../../lib/supabase';
import ModuleEditor from './ModuleEditor';
import TabManager from './TabManager';
import { MODULE_TEMPLATES, iconForType } from './moduleTemplates';
import { WIDGET_TYPES } from '../../CustomModule/components/ModuleWidget';
import { callAi } from '../../AI/lib/aiApi';
import { invalidateModuleLabels } from '../../../hooks/useModuleLabel';
import { useT } from '../../../i18n';
import { tr } from '../../../i18n';

// Sortable Module Item
function SortableModuleItem({ module, onEdit, onDelete, onToggle, onManageTabs, onDuplicate, onSaveTemplate, tabCount }) {
  const t = useT();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: module.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 1
  };

  const IconComponent = Icons[module.icon] || Icons.Square;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl group transition-all
        ${isDragging ? 'shadow-xl ring-2 ring-accent-primary-light/30' : 'hover:shadow-md'}
        ${!module.is_enabled ? 'opacity-60' : ''}`}
    >
      {/* Drag Handle */}
      <button
        {...attributes}
        {...listeners}
        className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical size={18} />
      </button>

      {/* Icon */}
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white flex-shrink-0
        ${module.is_enabled
          ? 'bg-gradient-to-br from-accent-primary-light to-accent-secondary-light'
          : 'bg-gray-400 dark:bg-gray-600'}`}
      >
        <IconComponent size={20} />
      </div>

      {/* Name & Path */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-800 dark:text-white truncate">
          {module.label}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {module.path}
        </p>
      </div>

      {/* Tabs Button */}
      <button
        onClick={() => onManageTabs(module)}
        className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-accent-primary-lighter dark:hover:bg-accent-primary-darkest/30 hover:text-accent-primary dark:hover:text-accent-primary-light rounded-lg transition flex items-center gap-1.5"
      >
        <Layers size={14} />
        {tr('Zakładki')}
        {tabCount > 0 && (
          <span className="bg-accent-primary-light text-white text-[10px] px-1.5 py-0.5 rounded-full">
            {tabCount}
          </span>
        )}
      </button>

      {/* Toggle */}
      <button
        onClick={() => onToggle(module.id, !module.is_enabled)}
        className={`p-2 rounded-lg transition ${
          module.is_enabled
            ? 'text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20'
            : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
        }`}
        title={module.is_enabled ? tr('Wyłącz moduł') : tr('Włącz moduł')}
      >
        {module.is_enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
      </button>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {module.is_system && (
          <div className="p-2 text-gray-400" title={t('Moduł systemowy')}>
            <Lock size={16} />
          </div>
        )}
        <button
          onClick={() => onEdit(module)}
          className="p-2 text-gray-400 hover:text-accent-primary hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest/20 rounded-lg transition opacity-0 group-hover:opacity-100"
          title={t('Edytuj')}
        >
          <Pencil size={16} />
        </button>
        {tabCount > 0 && (
          <button
            onClick={() => onSaveTemplate(module)}
            className="p-2 text-gray-400 hover:text-accent-primary hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest/20 rounded-lg transition opacity-0 group-hover:opacity-100"
            title={tr('Zapisz jako szablon')}
          >
            <Icons.BookmarkPlus size={16} />
          </button>
        )}
        <button
          onClick={() => onDuplicate(module)}
          className="p-2 text-gray-400 hover:text-accent-primary hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest/20 rounded-lg transition opacity-0 group-hover:opacity-100"
          title={tr('Duplikuj moduł')}
        >
          <Icons.Copy size={16} />
        </button>
        {!module.is_system && (
          <button
            onClick={() => onDelete(module)}
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition opacity-0 group-hover:opacity-100"
            title={t('Usuń')}
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

// Moduły podstawowe - nie można ich edytować ani usuwać w tym widoku
const CORE_MODULE_KEYS = ['dashboard', 'programs', 'calendar'];
// Moduły wtopione w inny moduł (istnieją tylko technicznie) — nie pokazuj jako osobne.
const MERGED_INTO_OTHER = ['sermons']; // Kazania są zakładką w Nauczaniu

export default function ModuleManager() {
  const t = useT();
  const {
    modules,
    tabs,
    loading,
    error,
    addModule,
    updateModule,
    deleteModule,
    updateModuleOrder,
    toggleModule,
    addTab,
    updateTab,
    deleteTab,
    updateTabOrder
  } = useModules();

  // Filtruj moduły - ukryj core modules (Pulpit, Programy, Kalendarz)
  const managableModules = modules.filter(m => !CORE_MODULE_KEYS.includes(m.key) && !MERGED_INTO_OTHER.includes(m.key));

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingModule, setEditingModule] = useState(null);
  const [tabManagerOpen, setTabManagerOpen] = useState(false);
  const [managingModule, setManagingModule] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [createDefaults, setCreateDefaults] = useState(null); // prefill przy tworzeniu z szablonu
  const [pendingTemplate, setPendingTemplate] = useState(null); // zakładki do dołożenia po utworzeniu
  const [userTemplates, setUserTemplates] = useState([]); // szablony zapisane przez usera (app_settings)
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');

  const ALLOWED_TAB_TYPES = new Set([...WIDGET_TYPES, 'board', 'custom', 'empty']);

  // AI: „opisz moduł" → wygeneruj spec (nazwa/ikona/zakładki) i wejdź w edytor z prefillem.
  const handleAiGenerate = async () => {
    const prompt = aiPrompt.trim();
    if (!prompt || aiBusy) return;
    setAiBusy(true); setAiError('');
    try {
      const text = await callAi('builder_module', prompt);
      const clean = String(text).replace(/```json|```/g, '').trim();
      const spec = JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1));
      const tabs = (spec.tabs || [])
        .filter((tb) => ALLOWED_TAB_TYPES.has(tb.type))
        .map((tb) => ({ component_type: tb.type, label: tb.label || tb.type, icon: iconForType(tb.type) }));
      if (!spec.name || tabs.length === 0) throw new Error(tr('AI nie zwróciło poprawnego modułu.'));
      setAiOpen(false); setAiPrompt('');
      setTemplatePickerOpen(false);
      setEditingModule(null);
      setPendingTemplate({ tabs });
      setCreateDefaults({ label: spec.name, icon: spec.icon || 'Sparkles' });
      setEditorOpen(true);
    } catch (e) {
      setAiError(e.message || tr('Nie udało się wygenerować modułu.'));
    } finally {
      setAiBusy(false);
    }
  };

  React.useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', 'custom_module_templates').maybeSingle()
      .then(({ data }) => { try { setUserTemplates(JSON.parse(data?.value || '[]')); } catch { setUserTemplates([]); } });
  }, []);

  const persistUserTemplates = async (list) => {
    setUserTemplates(list);
    await supabase.from('app_settings').upsert({ key: 'custom_module_templates', value: JSON.stringify(list) }, { onConflict: 'key' });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = managableModules.findIndex((m) => m.id === active.id);
      const newIndex = managableModules.findIndex((m) => m.id === over.id);
      const reorderedManagable = arrayMove(managableModules, oldIndex, newIndex);

      // Zachowaj core modules na początku, dodaj przeorgnizowane moduły
      const coreModules = modules.filter(m => CORE_MODULE_KEYS.includes(m.key));
      const reordered = [...coreModules, ...reorderedManagable];
      updateModuleOrder(reordered);
    }
  };

  const handleAddModule = () => {
    setTemplatePickerOpen(true);
  };

  // Wybór szablonu (lub pusty moduł) → otwiera edytor modułu; zakładki dokładane po zapisie.
  const handlePickTemplate = (template) => {
    setTemplatePickerOpen(false);
    setEditingModule(null);
    if (template) {
      setPendingTemplate(template);
      setCreateDefaults({ label: template.name, icon: template.icon });
    } else {
      setPendingTemplate(null);
      setCreateDefaults(null);
    }
    setEditorOpen(true);
  };

  const handleEditModule = (module) => {
    setEditingModule(module);
    setEditorOpen(true);
  };

  // Duplikuj moduł — kopia (jako moduł custom) + wszystkie jego zakładki.
  const handleDuplicateModule = async (module) => {
    const existing = new Set(modules.map((m) => m.key));
    let key = `${module.key}_copy`, i = 2;
    while (existing.has(key)) key = `${module.key}_copy${i++}`;
    const result = await addModule({
      key, label: `${module.label} (kopia)`, icon: module.icon,
      path: `/${key}`, resource_key: `module:${key}`, is_enabled: module.is_enabled,
    });
    if (result.success && result.data?.id) {
      for (const tab of (tabs[module.id] || [])) {
        await addTab(result.data.id, { key: tab.key, label: tab.label, icon: tab.icon, component_type: tab.component_type, layout: tab.layout });
      }
    }
  };

  // Zapisz moduł jako własny szablon (do palety „Nowy moduł").
  const handleSaveTemplate = async (module) => {
    const moduleTabs = tabs[module.id] || [];
    const tpl = {
      key: `user_${module.key}_${Date.now().toString(36)}`,
      name: module.label,
      icon: module.icon,
      description: `${moduleTabs.length} ${tr('zakładek')}: ${moduleTabs.map((t) => t.label).join(', ')}`.slice(0, 140),
      tabs: moduleTabs.map((t) => ({ component_type: t.component_type, label: t.label, icon: t.icon, layout: t.layout })),
      custom: true,
    };
    await persistUserTemplates([...userTemplates.filter((t) => t.name !== tpl.name || !t.custom), tpl]);
    alert(tr('Zapisano jako szablon — dostępny w „Dodaj moduł".'));
  };

  const handleSaveModule = async (moduleData) => {
    if (editingModule) {
      const result = await updateModule(editingModule.id, moduleData);
      if (!result.success) throw new Error(result.error);
    } else {
      const result = await addModule(moduleData);
      if (!result.success) throw new Error(result.error);
      // Szablon: dołóż zestaw zakładek do nowo utworzonego modułu (klucze unikalne).
      if (pendingTemplate && result.data?.id) {
        const used = new Set();
        for (const tpl of pendingTemplate.tabs) {
          let k = tpl.key || tpl.component_type;
          while (used.has(k)) k = `${tpl.component_type}_${Math.random().toString(36).slice(2, 5)}`;
          used.add(k);
          await addTab(result.data.id, {
            key: k, label: tpl.label, icon: tpl.icon,
            component_type: tpl.component_type, layout: tpl.layout,
          });
        }
      }
    }
    setPendingTemplate(null);
    setCreateDefaults(null);
    invalidateModuleLabels(); // odśwież nazwy w nagłówkach modułów na żywo
  };

  const handleDeleteModule = (module) => {
    if (module.is_system) return;
    setDeleteConfirm(module);
  };

  const confirmDelete = async () => {
    if (deleteConfirm) {
      await deleteModule(deleteConfirm.id);
      setDeleteConfirm(null);
    }
  };

  const handleManageTabs = (module) => {
    setManagingModule(module);
    setTabManagerOpen(true);
  };

  const existingKeys = modules.filter(m => m.id !== editingModule?.id).map(m => m.key);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-accent-primary-light" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400">
        <p className="font-medium">{t('Błąd ładowania modułów')}</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-800 dark:text-white">
            {tr('Zarządzanie modułami')}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {tr('Dodawaj, edytuj i zmieniaj kolejność modułów aplikacji')}
          </p>
        </div>
        <button
          onClick={handleAddModule}
          className="px-4 py-2 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-xl hover:shadow-lg hover:shadow-accent-primary-light/30 transition font-medium flex items-center gap-2"
        >
          <Plus size={18} />
          {tr('Dodaj moduł')}
        </button>
      </div>

      {/* Info Banner */}
      <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
        <p className="text-sm text-amber-800 dark:text-amber-300">
          <strong>{t('Wskazówka:')}</strong> {tr('Kliknij ołówek, aby zmienić nazwę i ikonę dowolnego modułu (także systemowego) — nowa nazwa pojawi się w menu i w nagłówku modułu.')} {tr('Przeciągnij moduły, aby zmienić kolejność. Moduły systemowe można wyłączyć, ale nie usunąć.')}
        </p>
      </div>

      {/* Modules List */}
      {managableModules.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={managableModules.map(m => m.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {managableModules.map((module) => (
                <SortableModuleItem
                  key={module.id}
                  module={module}
                  onEdit={handleEditModule}
                  onDelete={handleDeleteModule}
                  onToggle={toggleModule}
                  onManageTabs={handleManageTabs}
                  onDuplicate={handleDuplicateModule}
                  onSaveTemplate={handleSaveTemplate}
                  tabCount={(tabs[module.id] || []).length}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
          <Layers size={48} className="mx-auto mb-4 opacity-50" />
          <p>{t('Brak modułów')}</p>
          <p className="text-sm mt-1">{t('Kliknij "Dodaj moduł" aby dodać pierwszy')}</p>
        </div>
      )}

      {/* Template Picker Modal */}
      {templatePickerOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[130]">
          <div className="absolute inset-0" onClick={() => setTemplatePickerOpen(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[85vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between mb-1">
              <h4 className="font-bold text-lg text-gray-800 dark:text-white">{tr('Nowy moduł')}</h4>
              <button onClick={() => setTemplatePickerOpen(false)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><Icons.X size={18} /></button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{tr('Zacznij od gotowego szablonu (moduł + zestaw zakładek) albo zbuduj od zera.')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button onClick={() => { setTemplatePickerOpen(false); setAiError(''); setAiOpen(true); }}
                className="flex items-start gap-3 p-4 rounded-xl border border-accent-primary/40 bg-accent-primary/5 hover:border-accent-primary hover:shadow-md text-left">
                <span className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 bg-gradient-to-br from-accent-primary to-accent-secondary"><Icons.Sparkles size={20} /></span>
                <div>
                  <div className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{tr('Zbuduj z AI')}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{tr('Opisz moduł, a AI dobierze zakładki')}</div>
                </div>
              </button>
              <button onClick={() => handlePickTemplate(null)}
                className="flex items-start gap-3 p-4 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-accent-primary/50 hover:bg-accent-primary/5 text-left">
                <span className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 bg-gray-100 dark:bg-gray-800 shrink-0"><Icons.Plus size={20} /></span>
                <div>
                  <div className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{tr('Pusty moduł')}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{tr('Zbuduj zakładka po zakładce z palety elementów')}</div>
                </div>
              </button>
              {[...MODULE_TEMPLATES, ...userTemplates].map((tpl) => {
                const TplIcon = Icons[tpl.icon] || Icons.Square;
                return (
                  <div key={tpl.key} className="group relative">
                    <button onClick={() => handlePickTemplate(tpl)}
                      className="w-full flex items-start gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-accent-primary/50 hover:shadow-md text-left">
                      <span className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 bg-gradient-to-br from-accent-primary to-accent-secondary"><TplIcon size={20} /></span>
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-800 dark:text-gray-100 text-sm flex items-center gap-1.5">{tpl.custom ? tpl.name : tr(tpl.name)}{tpl.custom && <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-accent-primary/10 text-accent-primary">{tr('własny')}</span>}</div>
                        <div className="text-xs text-gray-400 mt-0.5 line-clamp-2">{tpl.custom ? tpl.description : tr(tpl.description)}</div>
                        <div className="text-[11px] text-accent-primary mt-1">{tpl.tabs.length} {tr('zakładek')}</div>
                      </div>
                    </button>
                    {tpl.custom && (
                      <button onClick={() => { if (confirm(tr('Usunąć ten szablon?'))) persistUserTemplates(userTemplates.filter((x) => x.key !== tpl.key)); }}
                        title={tr('Usuń szablon')} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10"><Icons.Trash2 size={14} /></button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* AI Module Generator Modal */}
      {aiOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[140]">
          <div className="absolute inset-0" onClick={() => !aiBusy && setAiOpen(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-9 h-9 rounded-xl flex items-center justify-center text-white bg-gradient-to-br from-accent-primary to-accent-secondary"><Icons.Sparkles size={18} /></span>
              <h4 className="font-bold text-lg text-gray-800 dark:text-white">{tr('Zbuduj moduł z AI')}</h4>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{tr('Opisz do czego moduł ma służyć — AI dobierze nazwę, ikonę i zakładki. Zestaw potwierdzisz w kolejnym kroku.')}</p>
            <textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} rows={3} autoFocus
              placeholder={tr('np. Moduł dla zespołu fotografów: harmonogram sesji, galeria zdjęć, sprzęt i lista kontaktów')}
              className="w-full text-sm bg-gray-100 dark:bg-gray-800 rounded-xl px-3 py-2.5 outline-none resize-none" />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {[tr('Zespół fotografów'), tr('Kawiarnia / kawiarenka'), tr('Grupa wolontariuszy'), tr('Biblioteka zasobów')].map((s) => (
                <button key={s} onClick={() => setAiPrompt(s)} disabled={aiBusy} className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-accent-primary/50">{s}</button>
              ))}
            </div>
            {aiError && <div className="mt-3 text-sm text-red-500 bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2">{aiError}</div>}
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setAiOpen(false)} disabled={aiBusy} className="text-sm text-gray-500 px-4 py-2">{tr('Anuluj')}</button>
              <button onClick={handleAiGenerate} disabled={aiBusy || !aiPrompt.trim()}
                className="text-sm bg-gradient-to-r from-accent-primary to-accent-secondary text-white px-4 py-2 rounded-lg disabled:opacity-50 flex items-center gap-2">
                {aiBusy ? <Icons.Loader2 size={15} className="animate-spin" /> : <Icons.Sparkles size={15} />} {aiBusy ? tr('Generuję…') : tr('Generuj')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Module Editor Modal */}
      {editorOpen && (
        <ModuleEditor
          module={editingModule || createDefaults}
          onClose={() => { setEditorOpen(false); setCreateDefaults(null); setPendingTemplate(null); }}
          onSave={handleSaveModule}
          existingKeys={existingKeys}
        />
      )}

      {/* Tab Manager Modal */}
      {tabManagerOpen && managingModule && (
        <TabManager
          module={managingModule}
          tabs={tabs[managingModule.id] || []}
          onClose={() => {
            setTabManagerOpen(false);
            setManagingModule(null);
          }}
          onAddTab={addTab}
          onUpdateTab={updateTab}
          onDeleteTab={deleteTab}
          onReorderTabs={updateTabOrder}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[130]">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h4 className="font-bold text-lg text-gray-800 dark:text-white mb-2">
              {tr('Usunąć moduł?')}
            </h4>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Czy na pewno chcesz usunąć moduł "{deleteConfirm.label}"?
              Zostaną również usunięte wszystkie zakładki tego modułu.
              Tej operacji nie można cofnąć.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                Anuluj
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition"
              >
                {tr('Usuń')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
