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
import ModuleEditor from './ModuleEditor';
import TabManager from './TabManager';

// Sortable Module Item
function SortableModuleItem({ module, onEdit, onDelete, onToggle, onManageTabs, tabCount }) {
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
        ${isDragging ? 'shadow-xl ring-2 ring-pink-500/30' : 'hover:shadow-md'}
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
          ? 'bg-gradient-to-br from-pink-500 to-orange-500'
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
        className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-pink-100 dark:hover:bg-pink-900/30 hover:text-pink-600 dark:hover:text-pink-400 rounded-lg transition flex items-center gap-1.5"
      >
        <Layers size={14} />
        Zakładki
        {tabCount > 0 && (
          <span className="bg-pink-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
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
        title={module.is_enabled ? 'Wyłącz moduł' : 'Włącz moduł'}
      >
        {module.is_enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
      </button>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {module.is_system ? (
          <div className="p-2 text-gray-400" title="Moduł systemowy">
            <Lock size={16} />
          </div>
        ) : (
          <>
            <button
              onClick={() => onEdit(module)}
              className="p-2 text-gray-400 hover:text-pink-600 hover:bg-pink-50 dark:hover:bg-pink-900/20 rounded-lg transition opacity-0 group-hover:opacity-100"
              title="Edytuj"
            >
              <Pencil size={16} />
            </button>
            <button
              onClick={() => onDelete(module)}
              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition opacity-0 group-hover:opacity-100"
              title="Usuń"
            >
              <Trash2 size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// Moduły podstawowe - nie można ich edytować ani usuwać w tym widoku
const CORE_MODULE_KEYS = ['dashboard', 'programs', 'calendar'];

export default function ModuleManager() {
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
  const managableModules = modules.filter(m => !CORE_MODULE_KEYS.includes(m.key));

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingModule, setEditingModule] = useState(null);
  const [tabManagerOpen, setTabManagerOpen] = useState(false);
  const [managingModule, setManagingModule] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

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
    setEditingModule(null);
    setEditorOpen(true);
  };

  const handleEditModule = (module) => {
    setEditingModule(module);
    setEditorOpen(true);
  };

  const handleSaveModule = async (moduleData) => {
    if (editingModule) {
      const result = await updateModule(editingModule.id, moduleData);
      if (!result.success) throw new Error(result.error);
    } else {
      const result = await addModule(moduleData);
      if (!result.success) throw new Error(result.error);
    }
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
        <Loader2 size={32} className="animate-spin text-pink-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400">
        <p className="font-medium">Błąd ładowania modułów</p>
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
            Zarządzanie modułami
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Dodawaj, edytuj i zmieniaj kolejność modułów aplikacji
          </p>
        </div>
        <button
          onClick={handleAddModule}
          className="px-4 py-2 bg-gradient-to-r from-pink-600 to-orange-600 text-white rounded-xl hover:shadow-lg hover:shadow-pink-500/30 transition font-medium flex items-center gap-2"
        >
          <Plus size={18} />
          Dodaj moduł
        </button>
      </div>

      {/* Info Banner */}
      <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
        <p className="text-sm text-amber-800 dark:text-amber-300">
          <strong>Wskazówka:</strong> Przeciągnij moduły, aby zmienić ich kolejność w menu bocznym.
          Moduły systemowe (z ikoną kłódki) nie mogą być usunięte, ale można je wyłączyć.
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
                  tabCount={(tabs[module.id] || []).length}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
          <Layers size={48} className="mx-auto mb-4 opacity-50" />
          <p>Brak modułów</p>
          <p className="text-sm mt-1">Kliknij "Dodaj moduł" aby dodać pierwszy</p>
        </div>
      )}

      {/* Module Editor Modal */}
      {editorOpen && (
        <ModuleEditor
          module={editingModule}
          onClose={() => setEditorOpen(false)}
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
              Usunąć moduł?
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
                Usuń
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
