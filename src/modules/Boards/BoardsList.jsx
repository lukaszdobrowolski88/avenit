import React, { useEffect, useState } from 'react';
import {
  Plus, Table2, MoreHorizontal, Trash2, Copy, Loader2, LayoutGrid, CalendarRange, CheckSquare, Users, X,
} from 'lucide-react';
import { useBoards } from './hooks/useBoards';
import { BOARD_TEMPLATES } from './lib/templates';
import Popover from './components/Popover';

const CARD_COLORS = ['#6366f1', '#00c875', '#e2445c', '#fdab3d', '#a25ddc', '#0086c0', '#ff5ac4'];
const TPL_ICON = { LayoutGrid, CalendarRange, CheckSquare, Users };

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
  const { boards, loading, fetchBoards, createFromTemplate, deleteBoard, duplicateBoard } = useBoards(userEmail, userName);
  const [creating, setCreating] = useState(false);
  const [chooser, setChooser] = useState(false);

  useEffect(() => { fetchBoards(moduleKey); }, [fetchBoards, moduleKey]);

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
