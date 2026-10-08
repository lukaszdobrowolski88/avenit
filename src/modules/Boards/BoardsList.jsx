import React, { useEffect, useState } from 'react';
import {
  Plus, Table2, MoreHorizontal, Trash2, Copy, Loader2, LayoutGrid, CalendarRange, CheckSquare, Users,
  Folder as FolderIcon, ChevronRight, ChevronDown, Lock, Globe, UserPlus,
} from 'lucide-react';
import { tr } from '../../i18n';
import { useCan } from '../../components/Can';
import Modal from '../../components/Modal';
import Button from '../../components/Button';
import EmptyState from '../../components/EmptyState';
import Spinner from '../../components/Spinner';
import { useBoards } from './hooks/useBoards';
import { BOARD_TEMPLATES } from './lib/templates';
import { generateBoardSpec } from './lib/aiBoards';
import { Sparkles } from 'lucide-react';
import Popover from './components/Popover';
import { confirmDialog } from '../../lib/dialog';
import { AI_ENABLED } from '../../lib/features';

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
          <span className="font-semibold text-gray-800 dark:text-gray-100">{tr('Zbuduj tablicę z AI')}</span>
          <span className="text-xs text-gray-400">— {tr('opisz proces, a Claude zbuduje gotową tablicę')}</span>
        </div>
        <div className="flex items-end gap-2">
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2}
            placeholder={tr('np. Planowanie chrztu: zgłoszenia, przygotowania, terminy, osoby odpowiedzialne…')}
            className="flex-1 bg-gray-100 dark:bg-gray-700/50 rounded-xl px-3 py-2 text-sm outline-none resize-none text-gray-800 dark:text-gray-100" />
          <button onClick={() => prompt.trim() && onGenerate(prompt.trim())} disabled={busy || !prompt.trim()}
            className="flex items-center gap-1.5 bg-gradient-to-r from-accent-primary to-accent-secondary text-white px-4 py-2.5 rounded-xl font-medium shadow-lg shadow-accent-primary/20 hover:opacity-90 disabled:opacity-50 shrink-0">
            {busy ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />} {tr('Generuj')}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {AI_SUGGESTIONS.map(s => (
            <button key={s} onClick={() => setPrompt(tr(s))} disabled={busy}
              className="text-xs px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-accent-primary/10 hover:text-accent-primary disabled:opacity-50">
              {tr(s)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TemplateChooser({ onPick, onClose, busy }) {
  return (
    <Modal isOpen onClose={onClose} title={tr('Wybierz szablon')} size="lg">
      <div className="p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {BOARD_TEMPLATES.map(t => {
            const Icon = TPL_ICON[t.icon] || LayoutGrid;
            return (
              <button key={t.key} disabled={busy} onClick={() => onPick(t)}
                className="flex items-start gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-accent-primary/50 hover:shadow-md text-left disabled:opacity-50">
                <span data-tone={1} className="w-10 h-10 rounded-xl flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 shrink-0"><Icon size={20} /></span>
                <div>
                  <div className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{tr(t.name)}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{tr(t.description)}</div>
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
    <Modal
      isOpen
      onClose={onClose}
      title={title}
      size="sm"
      footer={<>
        <Button variant="secondary" onClick={onClose}>{tr('Anuluj')}</Button>
        <Button onClick={submit}>{tr('Zapisz')}</Button>
      </>}
    >
      <div className="p-6">
        {label && <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</label>}
        <input autoFocus value={val} onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder={placeholder}
          className="w-full text-sm bg-gray-100 dark:bg-gray-700/50 rounded-xl px-3 py-2 outline-none text-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-accent-primary/40" />
      </div>
    </Modal>
  );
}

export default function BoardsList({ userEmail, userName, moduleKey = null, onOpenBoard }) {
  const { boards, loading, fetchBoards, createFromTemplate, createFromSpec, updateBoard, deleteBoard, duplicateBoard } = useBoards(userEmail, userName);
  // RBAC: członek współpracuje na elementach, ale nie tworzy/edytuje/usuwa tablic.
  // W module (zakładka „Tablice”) — także prawa lidera tej służby (moduleScope.js).
  const scope = moduleKey ? { module: moduleKey } : undefined;
  const canCreate = useCan('res:boards:create', scope);
  const canUpdate = useCan('res:boards:update', scope);
  const canDelete = useCan('res:boards:delete', scope);
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
      else setAiError(res.error || tr('Nie udało się utworzyć tablicy.'));
    } catch (e) {
      setAiError(e.message || tr('Błąd generowania AI.'));
    } finally { setAiBusy(false); }
  };

  const handleCreate = () => setChooser(true);

  const handlePick = async (template) => {
    setCreating(true);
    const res = await createFromTemplate(template, { module_key: moduleKey, name: template.key === 'blank' ? tr('Nowa tablica') : tr(template.name) });
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

      {AI_ENABLED && canCreate && <AiBoardGenerator onGenerate={handleAiGenerate} busy={aiBusy} />}
      {aiError && <div className="mb-4 text-sm text-red-500 bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2">{aiError}</div>}

      {loading ? (
        <Spinner center />
      ) : boards.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
          <EmptyState
            icon={LayoutGrid}
            title={tr('Nie masz jeszcze żadnej tablicy.')}
            subtitle={canCreate ? undefined : tr('Poproś lidera zespołu o utworzenie tablicy.')}
            action={canCreate ? (
              <Button icon={Plus} onClick={handleCreate} disabled={creating}>{tr('Utwórz pierwszą tablicę')}</Button>
            ) : undefined}
          />
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
                    <FolderIcon size={15} className="text-gray-400" /> {folder || tr('Bez folderu')} <span className="text-gray-400 font-normal">{list.length}</span>
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
                                {canDelete && <button onClick={async () => { if (await confirmDialog(tr('Usunąć tablicę „{name}"?', { name: b.name }))) deleteBoard(b.id); close(); }}
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
