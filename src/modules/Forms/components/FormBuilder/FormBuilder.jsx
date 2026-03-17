import { useState, useEffect, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import {
  ChevronLeft,
  Save,
  Eye,
  Globe,
  Lock,
  Settings,
  Link as LinkIcon,
  Check
} from 'lucide-react';
import FieldPalette from './FieldPalette';
import FieldCanvas from './FieldCanvas';
import FieldEditor from './FieldEditor';
import FormPreview from '../FormPreview';
import FormSettings from '../FormSettings';
import { createField, FIELD_TYPES } from '../../utils/fieldTypes';

export default function FormBuilder({
  form,
  onSave,
  onClose,
  onPublish,
  onUnpublish
}) {
  const [title, setTitle] = useState(form?.title || 'Nowy formularz');
  const [description, setDescription] = useState(form?.description || '');
  const [fields, setFields] = useState(form?.fields || []);
  const [settings, setSettings] = useState(form?.settings || {});
  const [selectedFieldId, setSelectedFieldId] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [copied, setCopied] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }
    })
  );

  useEffect(() => {
    if (form) {
      setTitle(form.title || 'Nowy formularz');
      setDescription(form.description || '');
      setFields(form.fields || []);
      setSettings(form.settings || {});
    }
  }, [form?.id]);

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    if (active.data.current?.fromPalette) {
      const fieldType = active.id.replace('palette-', '');
      const newField = createField(fieldType);

      if (newField) {
        if (over.id === 'canvas') {
          setFields(prev => [...prev, newField]);
        } else {
          const overIndex = fields.findIndex(f => f.id === over.id);
          if (overIndex >= 0) {
            setFields(prev => {
              const newFields = [...prev];
              newFields.splice(overIndex, 0, newField);
              return newFields;
            });
          } else {
            setFields(prev => [...prev, newField]);
          }
        }
        setSelectedFieldId(newField.id);
      }
    } else if (active.id !== over.id && over.id !== 'canvas') {
      const oldIndex = fields.findIndex(f => f.id === active.id);
      const newIndex = fields.findIndex(f => f.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        setFields(arrayMove(fields, oldIndex, newIndex));
      }
    }
  };

  const handleRemoveField = useCallback((fieldId) => {
    setFields(prev => prev.filter(f => f.id !== fieldId));
    if (selectedFieldId === fieldId) {
      setSelectedFieldId(null);
    }
  }, [selectedFieldId]);

  const handleDuplicateField = useCallback((fieldId) => {
    const field = fields.find(f => f.id === fieldId);
    if (!field) return;

    const duplicatedField = {
      ...JSON.parse(JSON.stringify(field)),
      id: `field-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      label: `${field.label} (kopia)`
    };

    const fieldIndex = fields.findIndex(f => f.id === fieldId);
    setFields(prev => {
      const newFields = [...prev];
      newFields.splice(fieldIndex + 1, 0, duplicatedField);
      return newFields;
    });
    setSelectedFieldId(duplicatedField.id);
  }, [fields]);

  const handleUpdateField = useCallback((updates) => {
    if (!selectedFieldId) return;

    setFields(prev => prev.map(field =>
      field.id === selectedFieldId
        ? { ...field, ...updates }
        : field
    ));
  }, [selectedFieldId]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const result = await onSave({
        title,
        description,
        fields,
        settings
      });

      if (result.success) {
        setLastSaved(new Date());
      }
    } finally {
      setIsSaving(false);
    }
  };

  const copyFormLink = () => {
    if (!form?.id) return;
    const link = `${window.location.origin}/form/${form.id}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const selectedField = fields.find(f => f.id === selectedFieldId);

  const getDragOverlayContent = () => {
    if (!activeId) return null;

    if (activeId.startsWith('palette-')) {
      const typeId = activeId.replace('palette-', '');
      const fieldType = FIELD_TYPES[typeId];
      if (!fieldType) return null;

      const Icon = fieldType.icon;
      return (
        <div className="p-3 bg-white dark:bg-gray-800 border-2 border-pink-500 rounded-xl shadow-2xl flex items-center gap-3 w-64">
          <div className="w-10 h-10 bg-pink-50 dark:bg-pink-900/30 rounded-lg flex items-center justify-center">
            <Icon size={20} className="text-pink-600" />
          </div>
          <div>
            <p className="font-medium text-sm text-gray-800 dark:text-gray-200">
              {fieldType.label}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {fieldType.description}
            </p>
          </div>
        </div>
      );
    }

    const field = fields.find(f => f.id === activeId);
    if (!field) return null;

    const fieldType = FIELD_TYPES[field.type];
    const Icon = fieldType?.icon;

    return (
      <div className="p-4 bg-white dark:bg-gray-800 border-2 border-pink-500 rounded-xl shadow-2xl">
        <div className="flex items-center gap-2">
          {Icon && <Icon size={18} className="text-pink-600" />}
          <span className="font-medium text-gray-900 dark:text-white">
            {field.label}
          </span>
        </div>
      </div>
    );
  };

  if (showPreview) {
    return (
      <FormPreview
        title={title}
        description={description}
        fields={fields}
        settings={settings}
        onClose={() => setShowPreview(false)}
      />
    );
  }

  if (showSettings) {
    return (
      <FormSettings
        settings={settings}
        onUpdate={setSettings}
        onClose={() => setShowSettings(false)}
      />
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <ChevronLeft size={20} />
            </button>

            <div className="min-w-0">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-lg font-semibold bg-transparent border-none focus:outline-none focus:ring-0 text-gray-900 dark:text-white w-full"
                placeholder="Nazwa formularza"
              />
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                {form?.status === 'published' ? (
                  <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                    <Globe size={12} />
                    Opublikowany
                  </span>
                ) : form?.status === 'closed' ? (
                  <span className="text-gray-500">Zamknięty</span>
                ) : (
                  <span className="text-yellow-600 dark:text-yellow-400">Wersja robocza</span>
                )}
                {lastSaved && (
                  <span className="ml-2">
                    Zapisano {lastSaved.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {form?.status === 'published' && (
              <button
                onClick={copyFormLink}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                {copied ? <Check size={16} className="text-green-500" /> : <LinkIcon size={16} />}
                {copied ? 'Skopiowano!' : 'Kopiuj link'}
              </button>
            )}

            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <Settings size={16} />
              <span className="hidden sm:inline">Ustawienia</span>
            </button>

            <button
              onClick={() => setShowPreview(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <Eye size={16} />
              <span className="hidden sm:inline">Podgląd</span>
            </button>

            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
            >
              <Save size={16} />
              <span className="hidden sm:inline">{isSaving ? 'Zapisywanie...' : 'Zapisz'}</span>
            </button>

            {form?.status === 'published' ? (
              <button
                onClick={onUnpublish}
                className="flex items-center gap-2 px-4 py-2 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-lg hover:bg-yellow-200 dark:hover:bg-yellow-900/50 transition-colors"
              >
                <Lock size={16} />
                <span className="hidden sm:inline">Cofnij</span>
              </button>
            ) : (
              <button
                onClick={async () => {
                  await handleSave();
                  onPublish();
                }}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-pink-500 to-orange-500 text-white rounded-lg hover:shadow-lg hover:shadow-pink-500/25 transition-all"
              >
                <Globe size={16} />
                <span className="hidden sm:inline">Opublikuj</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 flex overflow-hidden">
          <div className="w-64 flex-shrink-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-y-auto p-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
              Dodaj pola
            </h2>
            <FieldPalette />
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto">
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 mb-4">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="text-2xl font-bold bg-transparent border-none focus:outline-none focus:ring-0 text-gray-900 dark:text-white w-full mb-2"
                  placeholder="Tytuł formularza"
                />
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-transparent border-none focus:outline-none focus:ring-0 text-gray-600 dark:text-gray-400 resize-none"
                  placeholder="Opis formularza (opcjonalny)"
                  rows={2}
                />
              </div>

              <FieldCanvas
                fields={fields}
                selectedFieldId={selectedFieldId}
                onSelectField={setSelectedFieldId}
                onRemoveField={handleRemoveField}
                onDuplicateField={handleDuplicateField}
              />
            </div>
          </div>

          <div className="w-80 flex-shrink-0 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 overflow-y-auto p-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
              Ustawienia pola
            </h2>
            <FieldEditor
              field={selectedField}
              onUpdate={handleUpdateField}
            />
          </div>
        </div>

        <DragOverlay>
          {getDragOverlayContent()}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
