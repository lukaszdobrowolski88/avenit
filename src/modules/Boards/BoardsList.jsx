import React, { useEffect, useState } from 'react';
import {
  Plus, Table2, MoreHorizontal, Trash2, Copy, Loader2, LayoutGrid, CalendarRange, CheckSquare, Users, X,
  Folder as FolderIcon, ChevronRight, ChevronDown, Lock, Globe, UserPlus,
} from 'lucide-react';
import { tr } from '../../i18n';
import { useCan } from '../../components/Can';
import Modal from '../../components/Modal';
import { useBoards } from './hooks/useBoards';
import { BOARD_TEMPLATES } from './lib/templates';
import { generateBoardSpec } from './lib/aiBoards';
import { Sparkles } from 'lucide-react';
import Popover from './components/Popover';

const CARD_COLORS = ['#6366f1', '#00c875', '#e2445c', '#fdab3d', '#a25ddc', '#0086c0', '#ff5ac4'];
const TPL_ICON = { LayoutGrid, CalendarRange, CheckSquare, Users };

const AI_SUGGESTIONS = [
  'Planowanie konferencji młodzieżowej z budżetem i zadaniami',
  'Proces rekrutacji i opieki nad nowymi wolontariuszami',
  'Organizacja niedzielnego nabożeństwa: służby, próby, multimedia',
  'Kampania pomocy charytatywnej — zadania, terminy, odpowiedzialni',
];

// Generator tablic z AI (styl monday Vibe): opisz → Claude buduje tablicę.
function AiBoardGenerator({ onGenerate, busy }) {
  const [prompt, setPrompt] = useState('');
  return (
    <div className="mb-6 rounded-2xl p-[1.5px] bg-gradient-to-r from-accent-primary via-purple-400 to-accent-secondary">
      <div className="rounded-2xl bg-white dark:bg-gray-800 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={18} className="text-accent-primary" />
          <span className="font-semibold text-gray-800 dark:text-gray-100">Zbuduj tablicę z AI</span>
          <span className="text-xs text-gray-400">— opisz proces, a Claude zbuduje gotową tablicę</span>
        </div>
        <div className="flex items-end gap-2">
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2}
            placeholder="np. Planowanie chrztu: zgłoszenia, przygotowania, terminy, osoby odpowiedzialne…"
            className="flex-1 bg-gray-100 dark:bg-gray-700/50 rounded-xl px-3 py-2 text-sm outline-none resize-none text-gray-800 dark:text-gray-100" />
          <button onClick={() => prompt.trim() && onGenerate(prompt.trim())} disabled={busy || !prompt.trim()}
            className="flex items-center gap-1.5 bg-gradient-to-r from-accent-primary to-accent-secondary text-white px-4 py-2.5 rounded-xl font-medium shadow-lg shadow-accent-primary/20 hover:opacity-90 disabled:opacity-50 shrink-0">
            {busy ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />} Generuj
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {AI_SUGGESTIONS.map(s => (
            <button key={s} onClick={() => setPrompt(s)} disabled={busy}
              className="text-xs px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-accent-primary/10 hover:text-accent-primary disabled:opacity-50">
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TemplateChooser({ onPick, onClose, busy }) {
  return (
    <Modal isOpen className="flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-5 max-h-[85vh] overflow-y-auto custom-scrollbar">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{tr('Wybierz szablon')}</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X size={18} /></button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {BOARD_TEMPLATES.map(t => {
            const Icon = TPL_ICON[t.icon] || LayoutGrid;
            return (
              <button key={t.key} disabled={busy} onClick={() => onPick(t)}
                className="flex items-start gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-accent-primary/50 hover:shadow-md text-left disabled:opacity-50">
                <span className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0" style={{ backgroundColor: t.color }}><Icon size={20} /></span>
                <div>
                  <div className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{t.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{t.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

// Mały modal z pojedynczym polem tekstowym — zamiennik natywnego prompt().
function InputModal({ title, label, initial = '', placeholder, onSubmit, onClose }) {
  const [val, setVal] = useState(initial);
  const submit = () => onSubmit(val);
  return (
    <Modal isOpen className="flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">{title}</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X size={18} /></button>
        </div>
        {label && <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</label>}
        <input autoFocus value={val} onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose(); }}
          placeholder={placeholder}
          className="w-full text-sm bg-gray-100 dark:bg-gray-700/50 rounded-xl px-3 py-2 outline-none text-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-accent-primary/40" />
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="text-sm text-gray-500 px-3 py-1.5">{tr('Anuluj')}</button>
          <button onClick={submit} className="text-sm bg-accent-primary text-white px-4 py-1.5 rounded-lg hover:opacity-90">{tr('Zapisz')}</button>
        </div>
      </div>
    </Modal>
  );
}

export default function BoardsList({ userEmail, userName, moduleKey = null, onOpenBoard }) {
  const { boards, loading, fetchBoards, createFromTemplate, createFromSpec, updateBoard, deleteBoard, duplicateBoard } = useBoards(userEmail, userName);
  // RBAC: członek współpracuje na elementach, ale nie tworzy/edytuje/usuwa tablic.
  const canCreate = useCan('res:boards:create');
  const canUpdate = useCan('res:boards:update');
  const canDelete = useCan('res:boards:delete');
  const canManageBoard = canUpdate || canCreate || canDelete;
  const [creating, setCreating] = useState(false);
  const [chooser, setChooser] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [collapsedFolders, setCollapsedFolders] = useState(() => new Set());
  const [inputModal, setInputModal] = useState(null);

  const folders = [...new Set(boards.map(b => b.folder).filter(Boolean))].sort();
  const grouped = [
    ...folders.map(f => ({ folder: f, list: boards.filter(b => b.folder === f) })),
    { folder: null, list: boards.filter(b => !b.folder) },
  ].filter(g => g.list.length > 0);
  const moveToFolder = (id, currentFolder) => setInputModal({
    title: tr('Przenieś do folderu'),
    label: tr('Nazwa folderu (puste = bez folderu):'),
    initial: currentFolder || '',
    placeholder: tr('np. Projekty 2026'),
    onSubmit: (name) => { updateBoard(id, { folder: name.trim() || null }); setInputModal(null); },
  });

  useEffect(() => { fetchBoards(moduleKey); }, [fetchBoards, moduleKey]);

  const handleAiGenerate = async (prompt) => {
    setAiBusy(true); setAiError('');
    try {
      const spec = await generateBoardSpec(prompt);
      const res = await createFromSpec(spec, { module_key: moduleKey, color: CARD_COLORS[boards.length % CARD_COLORS.length] });
      if (res.success) onOpenBoard(res.data.id);
      else setAiError(res.error || 'Nie udało się utworzyć tablicy.');
    } catch (e) {
      setAiError(e.message || 'Błąd generowania AI.');
    } finally { setAiBusy(false); }
  };

  const handleCreate = () => setChooser(true);

  const handlePick = async (template) => {
    setCreating(true);
    const res = await createFromTemplate(template, { module_key: moduleKey, name: template.key === 'blank' ? 'Nowa tablica' : template.name });
    setCreating(false);
    setChooser(false);
    if (res.success) onOpenBoard(res.data.id);
  };

  return (
    <div>
      {!moduleKey && canCreate && (
        <div className="flex justify-end mb-4">
          <button onClick={handleCreate} disabled={creating}
            className="flex items-center gap-2 bg-gradient-to-r from-accent-primary to-accent-secondary text-white px-4 py-2.5 rounded-xl font-medium shadow-md hover:shadow-lg hover:opacity-90 disabled:opacity-50">
            {creating ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />} {tr('Nowa tablica')}
          </button>
        </div>
      )}

      {canCreate && <AiBoardGenerator onGenerate={handleAiGenerate} busy={aiBusy} />}
      {aiError && <div className="mb-4 text-sm text-red-500 bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2">{aiError}</div>}

      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-400"><Loader2 className="animate-spin" size={26} /></div>
      ) : boards.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
          <LayoutGrid size={44} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 mb-4">{tr('Nie masz jeszcze żadnej tablicy.')}</p>
          {canCreate ? (
            <button onClick={handleCreate} disabled={creating}
              className="inline-flex items-center gap-2 bg-accent-primary text-white px-4 py-2 rounded-xl font-medium hover:opacity-90 disabled:opacity-50">
              <Plus size={18} /> {tr('Utwórz pierwszą tablicę')}
            </button>
          ) : (
            <p className="text-sm text-gray-400">{tr('Poproś lidera zespołu o utworzenie tablicy.')}</p>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {moduleKey && canCreate && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              <button onClick={handleCreate} disabled={creating}
                className="flex flex-col items-center justify-center gap-2 h-36 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-gray-400 hover:text-accent-primary hover:border-accent-primary/50">
                {creating ? <Loader2 size={22} className="animate-spin" /> : <Plus size={22} />}
                <span className="text-sm font-medium">{tr('Nowa tablica')}</span>
              </button>
            </div>
          )}
          {grouped.map(({ folder, list }) => {
            const isCollapsed = collapsedFolders.has(folder || '__none__');
            return (
              <div key={folder || '__none__'}>
                {folders.length > 0 && (
                  <button onClick={() => setCollapsedFolders(prev => { const n = new Set(prev); const k = folder || '__none__'; n.has(k) ? n.delete(k) : n.add(k); return n; })}
                    className="flex items-center gap-1.5 mb-2 text-sm font-semibold text-gray-600 dark:text-gray-300">
                    {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    <FolderIcon size={15} className="text-gray-400" /> {folder || 'Bez folderu'} <span className="text-gray-400 font-normal">{list.length}</span>
                  </button>
                )}
                {!isCollapsed && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {list.map(b => (
                      <div key={b.id} onClick={() => onOpenBoard(b.id)}
                        className="group relative h-36 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-lg transition-shadow flex flex-col">
                        <div className="flex items-start justify-between">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ backgroundColor: b.color || '#6366f1' }}>
                            <Table2 size={20} />
                          </div>
                          {canManageBoard && (
                          <Popover align="right" width={190} triggerClassName="shrink-0" trigger={
                            <button onClick={(e) => e.stopPropagation()} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 p-1"><MoreHorizontal size={18} /></button>
                          }>
                            {({ close }) => (
                              <div className="p-1.5" onClick={(e) => e.stopPropagation()}>
                                {canUpdate && <button onClick={() => { moveToFolder(b.id, b.folder); close(); }}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 text-sm text-gray-700 dark:text-gray-200"><FolderIcon size={14} /> {tr('Przenieś do folderu')}</button>}
                                {canUpdate && <button onClick={() => { updateBoard(b.id, { visibility: b.visibility === 'private' ? 'workspace' : 'private' }); close(); }}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 text-sm text-gray-700 dark:text-gray-200">
                                  {b.visibility === 'private' ? <><Globe size={14} /> {tr('Udostępnij zespołowi')}</> : <><Lock size={14} /> {tr('Ustaw jako prywatną')}</>}</button>}
                                {canUpdate && b.visibility === 'private' && (
                                  <button onClick={() => { setInputModal({
                                      title: tr('Edytorzy'),
                                      label: tr('E-maile oddzielone przecinkiem'),
                                      initial: (b.editors || []).join(', '),
                                      placeholder: 'jan@…, anna@…',
                                      onSubmit: (em) => { updateBoard(b.id, { editors: em.split(',').map(s => s.trim()).filter(Boolean) }); setInputModal(null); },
                                    }); close(); }}
                                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 text-sm text-gray-700 dark:text-gray-200"><UserPlus size={14} /> {tr('Edytorzy')} ({(b.editors || []).length})</button>
                                )}
                                {canCreate && <button onClick={() => { duplicateBoard(b.id); close(); }}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 text-sm text-gray-700 dark:text-gray-200"><Copy size={14} /> {tr('Duplikuj')}</button>}
                                {canDelete && <button onClick={() => { if (confirm(`Usunąć tablicę „${b.name}"?`)) deleteBoard(b.id); close(); }}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-sm text-red-600"><Trash2 size={14} /> {tr('Usuń')}</button>}
                              </div>
                            )}
                          </Popover>
                          )}
                        </div>
                        <h3 className="mt-3 font-semibold text-gray-800 dark:text-gray-100 line-clamp-2">{b.name}</h3>
                        {b.description && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{b.description}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {chooser && <TemplateChooser onPick={handlePick} onClose={() => setChooser(false)} busy={creating} />}
      {inputModal && <InputModal {...inputModal} onClose={() => setInputModal(null)} />}
    </div>
  );
}
