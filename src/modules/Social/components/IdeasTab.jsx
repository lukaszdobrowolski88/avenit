import React, { useEffect, useMemo, useState } from 'react';
import { Lightbulb, Plus, Pencil, Trash2, PenSquare, Film, CheckCircle2 } from 'lucide-react';
import Button from '../../../components/Button';
import Modal from '../../../components/Modal';
import Spinner from '../../../components/Spinner';
import ActionMenu from '../../../components/ActionMenu';
import { useCan } from '../../../components/Can';
import { supabase } from '../../../lib/supabase';
import { tr } from '../../../i18n';
import { toast } from '../../../lib/toast';
import { confirmDialog } from '../../../lib/dialog';
import { mediaSrc } from '../lib/socialApi';
import { snippet } from '../lib/socialUi';
import MediaPicker from './MediaPicker';

export const IDEA_COLUMNS = [
  { key: 'idea', label: 'Pomysły' },
  { key: 'progress', label: 'W przygotowaniu' },
  { key: 'ready', label: 'Gotowe do publikacji' },
];
const inputCls = 'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent-primary/40';

// Pomysły pogrupowane w kolumny (kolejność w kolumnie: position, potem najnowsze).
export function groupIdeas(ideas) {
  const m = Object.fromEntries(IDEA_COLUMNS.map((c) => [c.key, []]));
  for (const i of ideas || []) (m[i.column_key] || m.idea).push(i);
  for (const k of Object.keys(m)) m[k].sort((a, b) => (a.position - b.position) || String(b.created_at).localeCompare(String(a.created_at)));
  return m;
}

function IdeaEditor({ idea, onClose, onSaved }) {
  const [form, setForm] = useState({ title: '', content: '', media: [], tags: [], column_key: 'idea', ...idea });
  const [tags, setTags] = useState((idea.tags || []).join(', '));
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const save = async () => {
    if (!form.title.trim() && !form.content.trim()) { toast.error(tr('Wpisz tytuł albo treść pomysłu.')); return; }
    const row = {
      title: form.title.trim().slice(0, 200), content: form.content, media: form.media || [], column_key: form.column_key,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 20), updated_at: new Date().toISOString(),
    };
    const q = form.id
      ? supabase.from('social_ideas').update(row).eq('id', form.id).select().single()
      : supabase.from('social_ideas').insert({ ...row, position: Date.now() / -1000 }).select().single();
    const { data, error } = await q;
    if (error) { toast.error(error.message); return; }
    onSaved(data);
    onClose();
  };
  return (
    <Modal isOpen onClose={onClose} size="lg" icon={Lightbulb} title={form.id ? tr('Edytuj pomysł') : tr('Nowy pomysł')} closeOnBackdrop={false}
      footer={<><Button variant="secondary" onClick={onClose}>{tr('Anuluj')}</Button><Button onClick={save}>{tr('Zapisz')}</Button></>}>
      <div className="p-6 space-y-4">
        <input value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder={tr('Tytuł, np. Świadectwo z obozu')} className={inputCls} aria-label={tr('Tytuł')} autoFocus />
        <textarea value={form.content} onChange={(e) => set({ content: e.target.value })} rows={6} placeholder={tr('Szkic treści, notatki, linki…')} className={inputCls} aria-label={tr('Treść')} />
        <MediaPicker media={form.media || []} onChange={(m) => set({ media: m })} />
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block"><span className="text-sm font-medium text-gray-700 dark:text-gray-200">{tr('Etykiety')}</span>
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder={tr('np. młodzież, świadectwa')} className={`mt-1 ${inputCls}`} /></label>
          <label className="block"><span className="text-sm font-medium text-gray-700 dark:text-gray-200">{tr('Kolumna')}</span>
            <select value={form.column_key} onChange={(e) => set({ column_key: e.target.value })} className={`mt-1 ${inputCls}`}>
              {IDEA_COLUMNS.map((c) => <option key={c.key} value={c.key}>{tr(c.label)}</option>)}
            </select></label>
        </div>
      </div>
    </Modal>
  );
}

// Tablica pomysłów (jak „Ideas” w Bufferze): zbieranie pomysłów, przeciąganie między kolumnami,
// „Utwórz post” → kompozytor z treścią i mediami pomysłu.
export default function IdeasTab({ onCreatePost, version }) {
  const canCreate = useCan('res:social_ideas:create');
  const canUpdate = useCan('res:social_ideas:update');
  const canDelete = useCan('res:social_ideas:delete');
  const [ideas, setIdeas] = useState(null);
  const [edit, setEdit] = useState(null);
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);

  useEffect(() => {
    supabase.from('social_ideas').select('*').order('created_at', { ascending: false }).limit(500)
      .then(({ data, error }) => { if (error) toast.error(error.message); setIdeas(data || []); });
  }, [version]);
  const cols = useMemo(() => groupIdeas(ideas), [ideas]);

  const upsertLocal = (row) => setIdeas((prev) => [row, ...(prev || []).filter((i) => i.id !== row.id)]);
  const moveTo = async (id, column) => {
    const idea = (ideas || []).find((i) => i.id === id);
    if (!idea || idea.column_key === column || !canUpdate) return;
    const position = Date.now() / -1000; // na górę kolumny
    upsertLocal({ ...idea, column_key: column, position });
    const { error } = await supabase.from('social_ideas').update({ column_key: column, position, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast.error(error.message); upsertLocal(idea); }
  };
  const remove = async (idea) => {
    if (!(await confirmDialog(tr('Usunąć pomysł „{name}”?', { name: idea.title || snippet(idea.content, 40) })))) return;
    const { error } = await supabase.from('social_ideas').delete().eq('id', idea.id);
    if (error) toast.error(error.message); else setIdeas((prev) => prev.filter((i) => i.id !== idea.id));
  };
  const toPost = (idea) => onCreatePost({
    content: idea.content || idea.title || '', media: idea.media || [], source_type: 'idea', source_id: idea.id,
  });

  if (ideas === null) return <Spinner center />;
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">{tr('Zbierajcie pomysły na posty całym zespołem. Przeciągnij kartę między kolumnami; „Utwórz post” otwiera kompozytor z treścią i zdjęciami pomysłu.')}</p>
      <div className="grid md:grid-cols-3 gap-4 items-start">
        {IDEA_COLUMNS.map((c) => (
          <section key={c.key}
            onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(c.key); } }}
            onDragLeave={() => setOver((k) => (k === c.key ? null : k))}
            onDrop={(e) => { e.preventDefault(); setOver(null); if (drag) moveTo(drag, c.key); setDrag(null); }}
            className={`rounded-2xl p-3 min-h-[240px] transition-colors ${over === c.key ? 'bg-accent-primary/10' : 'bg-gray-100/70 dark:bg-gray-800/50'}`}>
            <header className="flex items-center gap-2 px-1 mb-2">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{tr(c.label)}</h3>
              <span className="text-xs tabular-nums text-gray-400">{cols[c.key].length}</span>
              {canCreate && (
                <button type="button" onClick={() => setEdit({ column_key: c.key })} className="ml-auto icon-btn" aria-label={tr('Nowy pomysł w kolumnie {name}', { name: tr(c.label) })}><Plus size={16} /></button>
              )}
            </header>
            <div className="space-y-2">
              {cols[c.key].map((i) => {
                const first = (i.media || [])[0];
                return (
                  <article key={i.id} draggable={canUpdate} onDragStart={(e) => { e.dataTransfer.setData('text/plain', i.id); setDrag(i.id); }} onDragEnd={() => setDrag(null)}
                    className={`group rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700/60 p-3 ${canUpdate ? 'cursor-grab active:cursor-grabbing' : ''}`}>
                    {first && (
                      <div className="-mx-3 -mt-3 mb-2 aspect-[16/9] overflow-hidden rounded-t-xl bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
                        {first.kind === 'video' ? <Film size={22} className="text-gray-400" aria-hidden="true" /> : <img src={`${mediaSrc(first)}?w=384`} alt="" className="w-full h-full object-cover" loading="lazy" />}
                      </div>
                    )}
                    <div className="flex items-start gap-2">
                      <button type="button" onClick={() => canUpdate && setEdit(i)} className="flex-1 min-w-0 text-left">
                        {i.title && <p className="text-sm font-semibold text-gray-900 dark:text-white">{i.title}</p>}
                        {i.content && <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 line-clamp-3 whitespace-pre-wrap">{i.content}</p>}
                      </button>
                      <ActionMenu label={tr('Akcje pomysłu')} items={[
                        { key: 'post', icon: PenSquare, label: tr('Utwórz post'), onClick: () => toPost(i) },
                        canUpdate && { key: 'edit', icon: Pencil, label: tr('Edytuj'), onClick: () => setEdit(i) },
                        ...(canUpdate ? IDEA_COLUMNS.filter((x) => x.key !== i.column_key).map((x) => ({ key: `mv-${x.key}`, icon: Lightbulb, label: tr('Przenieś: {name}', { name: tr(x.label) }), onClick: () => moveTo(i.id, x.key) })) : []),
                        canDelete && { divider: true },
                        canDelete && { key: 'del', icon: Trash2, label: tr('Usuń'), danger: true, onClick: () => remove(i) },
                      ].filter(Boolean)} />
                    </div>
                    {(i.tags?.length > 0 || i.post_id) && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {i.post_id && <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"><CheckCircle2 size={11} aria-hidden="true" />{tr('Użyty w poście')}</span>}
                        {(i.tags || []).map((t) => <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">{t}</span>)}
                      </div>
                    )}
                  </article>
                );
              })}
              {!cols[c.key].length && <p className="text-xs text-gray-400 px-1 py-6 text-center">{c.key === 'idea' ? tr('Zapisz pierwszy pomysł — choćby jedno zdanie.') : tr('Przeciągnij tu kartę.')}</p>}
            </div>
          </section>
        ))}
      </div>
      {edit && <IdeaEditor idea={edit} onClose={() => setEdit(null)} onSaved={upsertLocal} />}
    </div>
  );
}
