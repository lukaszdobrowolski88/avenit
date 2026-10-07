import React, { useState } from 'react';
import { Plus, Edit, Trash2, Sparkles, Bell, Save } from 'lucide-react';
import { usePushTemplates } from '../hooks/usePushTemplates';
import { PUSH_CATEGORIES } from '../constants';
import { tr } from '../../../i18n';
import { toast } from '../../../lib/toast';
import { confirmDialog } from '../../../lib/dialog';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import Spinner from '../../../components/Spinner';

export default function TemplateGallery({ onUseTemplate }) {
  const { templates, loading, createTemplate, updateTemplate, deleteTemplate } = usePushTemplates();
  const [editing, setEditing] = useState(null);
  const [showEditor, setShowEditor] = useState(false);

  const handleNew = () => { setEditing(null); setShowEditor(true); };
  const handleEdit = (t) => { setEditing(t); setShowEditor(true); };
  const handleDelete = async (t) => {
    if (t.is_system) { toast.error(tr('Nie można usunąć szablonu systemowego.')); return; }
    if (!await confirmDialog(tr('Usunąć szablon "{name}"?', { name: t.name }))) return;
    try { await deleteTemplate(t.id); } catch (e) { toast.error(e.message); }
  };

  if (loading) return <Spinner center label={tr('Ładowanie...')} />;

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={handleNew} className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-accent-primary-light to-accent-secondary-light text-white text-sm rounded-lg shadow">
          <Plus size={16} /> {tr('Nowy szablon')}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map(t => {
          const cat = PUSH_CATEGORIES.find(c => c.id === t.category_id);
          const Icon = cat?.icon || Bell;
          return (
            <div key={t.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-lg transition-all">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent-primary-light to-accent-secondary-light flex items-center justify-center">
                  <Icon className="w-5 h-5 text-white" />
                </div>
                {t.is_system ? (
                  <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-400 flex items-center gap-1">
                    <Sparkles size={10} /> {tr('Systemowy')}
                  </span>
                ) : (
                  <div className="flex gap-1">
                    <button onClick={() => handleEdit(t)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                      <Edit size={14} className="text-gray-500" />
                    </button>
                    <button onClick={() => handleDelete(t)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                      <Trash2 size={14} className="text-red-500" />
                    </button>
                  </div>
                )}
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{t.name}</h3>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{t.title}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-1">{t.body}</p>

              <button
                onClick={() => onUseTemplate(t)}
                className="w-full mt-3 py-2 text-sm font-medium text-accent-primary bg-accent-primary-lightest dark:bg-accent-primary-darkest/20 hover:bg-accent-primary-lighter rounded-lg"
              >
                {tr('Użyj szablonu')}
              </button>
            </div>
          );
        })}
      </div>

      {showEditor && (
        <TemplateEditor
          template={editing}
          onClose={() => setShowEditor(false)}
          onSave={async (data) => {
            try {
              if (editing) await updateTemplate(editing.id, data);
              else await createTemplate(data);
              setShowEditor(false);
            } catch (e) { toast.error(e.message); }
          }}
        />
      )}
    </div>
  );
}

function TemplateEditor({ template, onClose, onSave }) {
  const [form, setForm] = useState({
    name: template?.name || '',
    title: template?.title || '',
    body: template?.body || '',
    icon: template?.icon || '',
    category_id: template?.category_id || 'cm_open_link',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.name || !form.title || !form.body) { toast.error(tr('Wypełnij wszystkie pola')); return; }
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      closeOnBackdrop={false}
      title={template ? tr('Edytuj szablon') : tr('Nowy szablon')}
      size="md"
      footer={<>
        <Button variant="secondary" onClick={onClose}>{tr('Anuluj')}</Button>
        <Button icon={Save} onClick={handleSave} loading={saving}>{tr('Zapisz')}</Button>
      </>}
    >
      <div className="p-6 space-y-3">
        <input
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder={tr('Nazwa szablonu')}
          className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"
        />
        <input
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          placeholder={tr('Tytuł powiadomienia')}
          className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium"
        />
        <textarea
          value={form.body}
          onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
          placeholder={tr('Treść...')}
          rows={3}
          className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-sm resize-none"
        />
        <select
          value={form.category_id}
          onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
          className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"
        >
          {PUSH_CATEGORIES.map(c => <option key={c.id} value={c.id}>{tr(c.label)}</option>)}
        </select>
      </div>
    </Modal>
  );
}
