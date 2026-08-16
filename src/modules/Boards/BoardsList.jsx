import React, { useEffect, useState } from 'react';
import {
  Plus, Table2, MoreHorizontal, Trash2, Copy, Loader2, LayoutGrid, CalendarRange, CheckSquare, Users, X,
} from 'lucide-react';
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
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-5 max-h-[85vh] overflow-y-auto custom-scrollbar">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Wybierz szablon</h2>
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
    </div>
  );
}

export default function BoardsList({ userEmail, userName, moduleKey = null, onOpenBoard }) {
  const { boards, loading, fetchBoards, createFromTemplate, createFromSpec, deleteBoard, duplicateBoard } = useBoards(userEmail, userName);
  const [creating, setCreating] = useState(false);
  const [chooser, setChooser] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');

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
      {!moduleKey && (
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-accent-primary to-accent-secondary dark:from-accent-primary-light dark:to-accent-secondary-light bg-clip-text text-transparent">Projekty</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Tablice, zadania i procesy zespołów — w stylu Monday.</p>
          </div>
          <button onClick={handleCreate} disabled={creating}
            className="flex items-center gap-2 bg-gradient-to-r from-accent-primary to-accent-secondary text-white px-4 py-2.5 rounded-xl font-medium shadow-lg shadow-accent-primary/20 hover:opacity-90 disabled:opacity-50">
            {creating ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />} Nowa tablica
          </button>
        </div>
      )}

      <AiBoardGenerator onGenerate={handleAiGenerate} busy={aiBusy} />
      {aiError && <div className="mb-4 text-sm text-red-500 bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2">{aiError}</div>}

      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-400"><Loader2 className="animate-spin" size={26} /></div>
      ) : boards.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
          <LayoutGrid size={44} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 mb-4">Nie masz jeszcze żadnej tablicy.</p>
          <button onClick={handleCreate} disabled={creating}
            className="inline-flex items-center gap-2 bg-accent-primary text-white px-4 py-2 rounded-xl font-medium hover:opacity-90 disabled:opacity-50">
            <Plus size={18} /> Utwórz pierwszą tablicę
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {moduleKey && (
            <button onClick={handleCreate} disabled={creating}
              className="flex flex-col items-center justify-center gap-2 h-36 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-gray-400 hover:text-accent-primary hover:border-accent-primary/50">
              {creating ? <Loader2 size={22} className="animate-spin" /> : <Plus size={22} />}
              <span className="text-sm font-medium">Nowa tablica</span>
            </button>
          )}
          {boards.map(b => (
            <div key={b.id} onClick={() => onOpenBoard(b.id)}
              className="group relative h-36 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-lg transition-shadow flex flex-col">
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ backgroundColor: b.color || '#6366f1' }}>
                  <Table2 size={20} />
                </div>
                <Popover align="right" width={170} trigger={
                  <button onClick={(e) => e.stopPropagation()} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 p-1"><MoreHorizontal size={18} /></button>
                }>
                  {({ close }) => (
                    <div className="p-1.5" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => { duplicateBoard(b.id); close(); }}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 text-sm text-gray-700 dark:text-gray-200"><Copy size={14} /> Duplikuj</button>
                      <button onClick={() => { if (confirm(`Usunąć tablicę „${b.name}"?`)) deleteBoard(b.id); close(); }}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-sm text-red-600"><Trash2 size={14} /> Usuń</button>
                    </div>
                  )}
                </Popover>
              </div>
              <h3 className="mt-3 font-semibold text-gray-800 dark:text-gray-100 line-clamp-2">{b.name}</h3>
              {b.description && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{b.description}</p>}
            </div>
          ))}
        </div>
      )}

      {chooser && <TemplateChooser onPick={handlePick} onClose={() => setChooser(false)} busy={creating} />}
    </div>
  );
}
