import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, GripVertical, Pencil, Trash2, Lock } from 'lucide-react';
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
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import EmptyState from '../../../components/EmptyState';
import ModuleLayoutBuilder from './ModuleBuilder/ModuleLayoutBuilder';
import { useT } from '../../../i18n';
import { tr } from '../../../i18n';

// Sortable Tab Item
function SortableTabItem({ tab, onEdit, onDelete, onDuplicate, onOpenBuilder }) {
  const t = useT();
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
        ${isDragging ? 'shadow-xl ring-2 ring-accent-primary-light/30' : 'hover:shadow-md'}`}
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
      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent-primary-light to-accent-secondary-light flex items-center justify-center text-white flex-shrink-0">
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
        {tab.component_type === 'custom' && (
          <button
            onClick={() => onOpenBuilder(tab)}
            className="p-2 text-accent-primary hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest/20 rounded-lg transition"
            title={t('Otwórz kreator')}
          >
            <Icons.LayoutDashboard size={16} />
          </button>
        )}
        {tab.is_system ? (
          <div className="p-2 text-gray-400" title={t('Zakładka systemowa')}>
            <Lock size={16} />
          </div>
        ) : (
          <>
            <button
              onClick={() => onEdit(tab)}
              className="p-2 text-gray-400 hover:text-accent-primary hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest/20 rounded-lg transition opacity-0 group-hover:opacity-100"
              title={t('Edytuj')}
            >
              <Pencil size={16} />
            </button>
            <button
              onClick={() => onDuplicate(tab)}
              className="p-2 text-gray-400 hover:text-accent-primary hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest/20 rounded-lg transition opacity-0 group-hover:opacity-100"
              title={tr('Duplikuj zakładkę')}
            >
              <Icons.Copy size={16} />
            </button>
            <button
              onClick={() => onDelete(tab)}
              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition opacity-0 group-hover:opacity-100"
              title={t('Usuń')}
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
  const t = useT();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTab, setEditingTab] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [builderTab, setBuilderTab] = useState(null);

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

  const handleDuplicateTab = async (tab) => {
    const keys = new Set(tabs.map((x) => x.key));
    let key = `${tab.key}_copy`, i = 2;
    while (keys.has(key)) key = `${tab.key}_copy${i++}`;
    await onAddTab(module.id, { key, label: `${tab.label} (kopia)`, icon: tab.icon, component_type: tab.component_type, layout: tab.layout });
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

  // Zapis układu z kreatora graficznego do kolumny app_module_tabs.layout.
  const handleSaveLayout = async (layout) => {
    if (!builderTab) return { success: false };
    return await onUpdateTab(builderTab.id, module.id, { layout });
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

  return (
    <>
      <Modal
        isOpen
        // Esc/X nie zamykają okna, gdy na wierzchu jest pełnoekranowy kreator (utrata zmian).
        onClose={() => { if (!builderTab) onClose(); }}
        closeOnBackdrop={false}
        zIndex={140}
        size="lg"
        icon={ModuleIcon}
        title={tr('Zakładki modułu')}
        subtitle={module.label}
        footer={<Button onClick={onClose}>Gotowe</Button>}
      >
        <div className="p-6">
          {/* Add Button */}
          <button
            onClick={handleAddTab}
            className="w-full mb-4 p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-gray-500 dark:text-gray-400 hover:border-accent-primary-light hover:text-accent-primary-light dark:hover:border-accent-primary-light dark:hover:text-accent-primary-light transition flex items-center justify-center gap-2"
          >
            <Plus size={20} />
            {tr('Dodaj zakładkę')}
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
                      onDuplicate={handleDuplicateTab}
                      onOpenBuilder={setBuilderTab}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <EmptyState
              compact
              icon={Icons.Layers}
              title={t('Brak zakładek w tym module')}
              subtitle={t('Kliknij "Dodaj zakładkę" aby dodać pierwszą')}
            />
          )}
        </div>
      </Modal>

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

      {/* Kreator graficzny (pełnoekranowa nakładka) */}
      {builderTab && createPortal(
        <ModuleLayoutBuilder
          tab={builderTab}
          moduleId={module.id}
          moduleName={module.label}
          moduleKey={module.key}
          onClose={() => setBuilderTab(null)}
          onSave={handleSaveLayout}
          onSaveMeta={(meta) => onUpdateTab(builderTab.id, module.id, meta)}
        />,
        document.body
      )}

      {/* Delete Confirmation */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        closeOnBackdrop={false}
        zIndex={170}
        size="sm"
        title={tr('Usunąć zakładkę?')}
        footer={<>
          <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>Anuluj</Button>
          <Button variant="danger" onClick={confirmDelete}>{tr('Usuń')}</Button>
        </>}
      >
        <div className="p-6">
          <p className="text-gray-600 dark:text-gray-400">
            Czy na pewno chcesz usunąć zakładkę "{deleteConfirm?.label}"? Tej operacji nie można cofnąć.
          </p>
        </div>
      </Modal>
    </>
  );
}
