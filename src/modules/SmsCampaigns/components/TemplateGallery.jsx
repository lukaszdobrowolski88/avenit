import React, { useState } from 'react';
import { Plus, Edit, Trash2, Sparkles, MessageSquare, Save, X, Loader2 } from 'lucide-react';
import { useSmsTemplates } from '../hooks/useSmsTemplates';
import { SENDER_MAX, BODY_MAX } from '../constants';
import { smsAnalysis } from '../utils/smsEncoding';

export default function TemplateGallery({ onUseTemplate }) {
  const { templates, loading, createTemplate, updateTemplate, deleteTemplate } = useSmsTemplates();
  const [editing, setEditing] = useState(null);
  const [showEditor, setShowEditor] = useState(false);

  const handleNew = () => { setEditing(null); setShowEditor(true); };
  const handleEdit = (t) => { setEditing(t); setShowEditor(true); };
  const handleDelete = async (t) => {
    if (t.is_system) { alert('Nie można usunąć szablonu systemowego.'); return; }
    if (!confirm(`Usunąć szablon "${t.name}"?`)) return;
    try { await deleteTemplate(t.id); } catch (e) { alert(e.message); }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Ładowanie...</div>;

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={handleNew} className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-accent-primary-light to-accent-secondary-light text-white text-sm rounded-lg shadow">
          <Plus size={16} /> Nowy szablon
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map(t => {
          const a = smsAnalysis(t.body || '');
          return (
            <div key={t.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-lg transition-all">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent-primary-light to-accent-secondary-light flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-white" />
                </div>
                {t.is_system ? (
                  <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-400 flex items-center gap-1">
                    <Sparkles size={10} /> Systemowy
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
              {t.default_sender && (
                <p className="text-xs text-gray-500 mb-1">Nadawca: <span className="font-mono">{t.default_sender}</span></p>
              )}
              <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-3 mt-1">{t.body}</p>
              <p className="text-xs text-gray-400 mt-2">
                {a.charCount} znaków · {a.parts || 1} {(a.parts || 1) === 1 ? 'część' : 'części'} ({a.encoding})
              </p>

              <button
                onClick={() => onUseTemplate(t)}
                className="w-full mt-3 py-2 text-sm font-medium text-accent-primary bg-accent-primary-lightest dark:bg-accent-primary-darkest/20 hover:bg-accent-primary-lighter rounded-lg"
              >
                Użyj szablonu
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
            } catch (e) { alert(e.message); }
          }}
        />
      )}
    </div>
  );
}

function TemplateEditor({ template, onClose, onSave }) {
  const [form, setForm] = useState({
    name: template?.name || '',
    default_sender: template?.default_sender || '',
    body: template?.body || '',
  });
  const [saving, setSaving] = useState(false);
  const a = smsAnalysis(form.body);

  const handleSave = async () => {
    if (!form.name || !form.body) { alert('Wypełnij wszystkie pola'); return; }
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-lg w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            {template ? 'Edytuj szablon' : 'Nowy szablon SMS'}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Nazwa szablonu"
            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"
          />
          <input
            value={form.default_sender}
            maxLength={SENDER_MAX}
            onChange={e => setForm(f => ({ ...f, default_sender: e.target.value }))}
            placeholder="Domyślny nadawca (opcjonalnie)"
            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-mono"
          />
          <textarea
            value={form.body}
            maxLength={BODY_MAX}
            onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
            placeholder="Treść SMS-a..."
            rows={4}
            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-sm resize-none"
          />
          <p className="text-xs text-gray-500">
            {a.charCount} znaków · {a.parts || 1} {(a.parts || 1) === 1 ? 'część' : 'części'} ({a.encoding})
          </p>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">Anuluj</button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-accent-primary text-white rounded-lg disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Zapisz
          </button>
        </div>
      </div>
    </div>
  );
}
