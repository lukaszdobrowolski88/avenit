import React, { useState, useEffect } from 'react';
import { X, Hash, BarChart3, PieChart, BatteryMedium, Table2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { getColumnType } from '../lib/columnTypes';

const TYPES = [
  { type: 'number', label: 'Liczba', icon: Hash },
  { type: 'chart', label: 'Wykres', icon: BarChart3 },
  { type: 'battery', label: 'Bateria', icon: BatteryMedium },
  { type: 'table', label: 'Tabela', icon: Table2 },
];

export default function WidgetConfigModal({ initial, boards, onSave, onClose }) {
  const [w, setW] = useState(initial || { type: 'number', title: '', boardId: boards[0]?.id, aggregation: 'count', chartType: 'bar', size: 'small' });
  const [cols, setCols] = useState([]);

  useEffect(() => {
    if (!w.boardId) return;
    supabase.from('board_columns').select('*').eq('board_id', w.boardId).order('display_order').then(({ data }) => setCols(data || []));
  }, [w.boardId]);

  const set = (patch) => setW(prev => ({ ...prev, ...patch }));
  const groupable = cols.filter(c => getColumnType(c.type).groupable);
  const numberCols = cols.filter(c => c.type === 'number' || c.type === 'rating');
  const selectedCol = cols.find(c => c.id === w.columnId);

  const save = () => {
    const title = w.title || TYPES.find(t => t.type === w.type)?.label;
    onSave({ id: w.id || `w_${Math.random().toString(36).slice(2, 9)}`, ...w, title });
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{initial ? 'Edytuj widżet' : 'Nowy widżet'}</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X size={18} /></button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-gray-500">Tytuł</span>
            <input value={w.title} onChange={(e) => set({ title: e.target.value })} placeholder="np. Zadania wg statusu"
              className="mt-1 w-full text-sm bg-gray-100 dark:bg-gray-700/50 rounded-lg px-3 py-2 outline-none" />
          </label>

          <div>
            <span className="text-xs text-gray-500">Typ widżetu</span>
            <div className="grid grid-cols-4 gap-2 mt-1">
              {TYPES.map(t => (
                <button key={t.type} onClick={() => set({ type: t.type })}
                  className={`flex flex-col items-center gap-1 py-2 rounded-lg border text-xs ${w.type === t.type ? 'border-accent-primary bg-accent-primary/10 text-accent-primary' : 'border-gray-200 dark:border-gray-600 text-gray-500'}`}>
                  <t.icon size={18} /> {t.label}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="text-xs text-gray-500">Tablica</span>
            <select value={w.boardId} onChange={(e) => set({ boardId: e.target.value, columnId: undefined })}
              className="mt-1 w-full text-sm bg-gray-100 dark:bg-gray-700/50 rounded-lg px-3 py-2 outline-none">
              {boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>

          {(w.type === 'chart' || w.type === 'battery') && (
            <label className="block">
              <span className="text-xs text-gray-500">Grupuj wg kolumny</span>
              <select value={w.columnId || ''} onChange={(e) => set({ columnId: e.target.value })}
                className="mt-1 w-full text-sm bg-gray-100 dark:bg-gray-700/50 rounded-lg px-3 py-2 outline-none">
                <option value="">— wybierz —</option>
                {(w.type === 'battery' ? groupable.filter(c => ['status', 'priority'].includes(c.type)) : groupable).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}

          {w.type === 'chart' && (
            <div>
              <span className="text-xs text-gray-500">Rodzaj wykresu</span>
              <div className="flex gap-2 mt-1">
                {[{ k: 'bar', label: 'Słupkowy', icon: BarChart3 }, { k: 'pie', label: 'Kołowy', icon: PieChart }].map(o => (
                  <button key={o.k} onClick={() => set({ chartType: o.k })}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-sm ${w.chartType === o.k ? 'border-accent-primary bg-accent-primary/10 text-accent-primary' : 'border-gray-200 dark:border-gray-600 text-gray-500'}`}>
                    <o.icon size={15} /> {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {w.type === 'number' && (
            <>
              <label className="block">
                <span className="text-xs text-gray-500">Agregacja</span>
                <select value={w.aggregation} onChange={(e) => set({ aggregation: e.target.value })}
                  className="mt-1 w-full text-sm bg-gray-100 dark:bg-gray-700/50 rounded-lg px-3 py-2 outline-none">
                  <option value="count">Liczba elementów</option>
                  <option value="sum">Suma kolumny liczbowej</option>
                  <option value="avg">Średnia kolumny liczbowej</option>
                </select>
              </label>
              {(w.aggregation === 'sum' || w.aggregation === 'avg') && (
                <label className="block">
                  <span className="text-xs text-gray-500">Kolumna liczbowa</span>
                  <select value={w.columnId || ''} onChange={(e) => set({ columnId: e.target.value })}
                    className="mt-1 w-full text-sm bg-gray-100 dark:bg-gray-700/50 rounded-lg px-3 py-2 outline-none">
                    <option value="">— wybierz —</option>
                    {numberCols.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
              )}
            </>
          )}

          <label className="block">
            <span className="text-xs text-gray-500">Rozmiar</span>
            <select value={w.size} onChange={(e) => set({ size: e.target.value })}
              className="mt-1 w-full text-sm bg-gray-100 dark:bg-gray-700/50 rounded-lg px-3 py-2 outline-none">
              <option value="small">Mały</option><option value="medium">Średni</option><option value="large">Duży</option>
            </select>
          </label>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="text-sm text-gray-500 px-4 py-2">Anuluj</button>
          <button onClick={save} className="text-sm bg-accent-primary text-white px-4 py-2 rounded-lg">Zapisz</button>
        </div>
      </div>
    </div>
  );
}
