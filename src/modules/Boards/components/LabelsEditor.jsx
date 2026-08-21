import React from 'react';
import { Plus, X } from 'lucide-react';
import { STATUS_COLORS, uid } from '../lib/constants';

// Edytor etykiet kolumny Status/Priorytet — dodaj / zmień nazwę / kolor (paleta + własny) / usuń.
// Wspólny dla nagłówka kolumny i widoku Kanban (sam wybór wartości robi komórka StatusCell).
export default function LabelsEditor({ column, onUpdateColumn }) {
  const labels = column?.settings?.labels || [];
  const setLabels = (next) => onUpdateColumn?.(column.id, { settings: { ...(column.settings || {}), labels: next } });

  const addLabel = () => {
    const used = labels.map(l => l.color);
    const color = STATUS_COLORS.find(c => !used.includes(c)) || STATUS_COLORS[labels.length % STATUS_COLORS.length];
    setLabels([...labels, { id: uid('lbl'), title: 'Nowa etykieta', color }]);
  };
  const patch = (id, p) => setLabels(labels.map(l => l.id === id ? { ...l, ...p } : l));
  const remove = (id) => setLabels(labels.filter(l => l.id !== id));

  return (
    <div className="space-y-2">
      {labels.length === 0 && <p className="text-xs text-gray-400">Brak etykiet — dodaj pierwszą.</p>}
      {labels.map(l => (
        <div key={l.id} className="flex items-center gap-2">
          <label className="relative w-6 h-6 rounded-md shrink-0 cursor-pointer ring-1 ring-black/5 dark:ring-white/10" style={{ backgroundColor: l.color }} title="Zmień kolor">
            <input type="color" value={l.color} onChange={(e) => patch(l.id, { color: e.target.value })}
              className="absolute inset-0 opacity-0 cursor-pointer" />
          </label>
          <input value={l.title} onChange={(e) => patch(l.id, { title: e.target.value })} placeholder="Nazwa etykiety"
            className="flex-1 min-w-0 text-sm bg-gray-100 dark:bg-gray-700/50 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-accent-primary/30 text-gray-800 dark:text-gray-100" />
          <button onClick={() => remove(l.id)} className="p-1 text-gray-400 hover:text-red-500 shrink-0" title="Usuń etykietę"><X size={15} /></button>
        </div>
      ))}
      <button onClick={addLabel} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-accent-primary px-1 py-1">
        <Plus size={15} /> Dodaj etykietę
      </button>
    </div>
  );
}
