import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, GripVertical, Pencil, Trash2, Lock } from 'lucide-react';
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
import TabEditor from './TabEditor';

// Sortable Tab Item
function SortableTabItem({ tab, onEdit, onDelete }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: tab.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 1
  };

  const IconComponent = Icons[tab.icon] || Icons.Square;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl group transition-shadow
        ${isDragging ? 'shadow-xl ring-2 ring-pink-500/30' : 'hover:shadow-md'}`}
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
      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-pink-500 to-orange-500 flex items-center justify-center text-white flex-shrink-0">
        <IconComponent size={18} />
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-800 dark:text-white truncate">
          {tab.label}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {tab.key}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {tab.is_system ? (
          <div className="p-2 text-gray-400" title="Zakładka systemowa">
            <Lock size={16} />
          </div>
        ) : (
          <>
            <button
              onClick={() => onEdit(tab)}
              className="p-2 text-gray-400 hover:text-pink-600 hover:bg-pink-50 dark:hover:bg-pink-900/20 rounded-lg transition opacity-0 group-hover:opacity-100"
              title="Edytuj"
            >
              <Pencil size={16} />
            </button>
            <button
              onClick={() => onDelete(tab)}
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

export default function TabManager({
  module,
  tabs = [],
  onClose,
  onAddTab,
  onUpdateTab,
  onDeleteTab,
  onReorderTabs
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTab, setEditingTab] = useState(null);
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

    if (active.id !== over.id) {
      const oldIndex = tabs.findIndex((t) => t.id === active.id);
      const newIndex = tabs.findIndex((t) => t.id === over.id);
      const reordered = arrayMove(tabs, oldIndex, newIndex);
      onReorderTabs(module.id, reordered);
    }
  };

  const handleAddTab = () => {
    setEditingTab(null);
    setEditorOpen(true);
  };

  const handleEditTab = (tab) => {
    setEditingTab(tab);
    setEditorOpen(true);
  };

  const handleSaveTab = async (tabData) => {
    if (editingTab) {
      await onUpdateTab(editingTab.id, module.id, tabData);
    } else {
      await onAddTab(module.id, tabData);
    }
  };

  const handleDeleteTab = async (tab) => {
    if (tab.is_system) return;
    setDeleteConfirm(tab);
  };

  const confirmDelete = async () => {
    if (deleteConfirm) {
      await onDeleteTab(deleteConfirm.id, module.id);
      setDeleteConfirm(null);
    }
  };

  const ModuleIcon = Icons[module.icon] || Icons.Square;
  const existingKeys = tabs.filter(t => t.id !== editingTab?.id).map(t => t.key);

  if (!document.body) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[140]">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-2xl border border-white/20 dark:border-gray-700 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-orange-500 flex items-center justify-center text-white">
              <ModuleIcon size={20} />
            </div>
            <div>
              <h3 className="font-bold text-xl text-gray-800 dark:text-white">
                Zakładki modułu
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {module.label}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto">
          {/* Add Button */}
          <button
            onClick={handleAddTab}
            className="w-full mb-4 p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-gray-500 dark:text-gray-400 hover:border-pink-500 hover:text-pink-500 dark:hover:border-pink-500 dark:hover:text-pink-400 transition flex items-center justify-center gap-2"
          >
            <Plus size={20} />
            Dodaj zakładkę
          </button>

          {/* Tabs List */}
          {tabs.length > 0 ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={tabs.map(t => t.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {tabs.map((tab) => (
                    <SortableTabItem
                      key={tab.id}
                      tab={tab}
                      onEdit={handleEditTab}
                      onDelete={handleDeleteTab}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="text-center py-12 text-gray-400">
              <p>Brak zakładek w tym module</p>
              <p className="text-sm mt-1">Kliknij "Dodaj zakładkę" aby dodać pierwszą</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-gradient-to-r from-pink-600 to-orange-600 text-white rounded-xl hover:shadow-lg hover:shadow-pink-500/30 transition font-medium"
          >
            Gotowe
          </button>
        </div>
      </div>

      {/* Tab Editor Modal */}
      {editorOpen && (
        <TabEditor
          tab={editingTab}
          moduleId={module.id}
          onClose={() => setEditorOpen(false)}
          onSave={handleSaveTab}
          existingKeys={existingKeys}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[170]">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h4 className="font-bold text-lg text-gray-800 dark:text-white mb-2">
              Usunąć zakładkę?
            </h4>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Czy na pewno chcesz usunąć zakładkę "{deleteConfirm.label}"? Tej operacji nie można cofnąć.
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
    </div>,
    document.body
  );
}
