import React, { useState, useEffect } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { findLabel, resolveOptions, cellToText } from '../../lib/columnTypes';
import { fetchBoardItemsFull, fetchBoardColumnsCached } from '../../lib/relationCache';

// Kolumna Lustro — odbija wartość kolumny z połączonych elementów (przez kolumnę
// „Połącz tablice" na tym samym elemencie). Tylko do odczytu.
export default function MirrorCell({ column, item, columns }) {
  const through = (columns || []).find(c => c.id === column?.settings?.throughColumnId && c.type === 'connect_board');
  const targetBoardId = through?.settings?.targetBoardId;
  const targetColId = column?.settings?.targetColumnId;
  const linkedIds = ((item?.cells?.[through?.id]) || []).map(l => l.id);

  const [data, setData] = useState(null); // { items, cols }

  useEffect(() => {
    let alive = true;
    if (!targetBoardId) { setData(null); return; }
    Promise.all([fetchBoardItemsFull(targetBoardId), fetchBoardColumnsCached(targetBoardId)])
      .then(([items, cols]) => { if (alive) setData({ items, cols }); });
    return () => { alive = false; };
  }, [targetBoardId]);

  if (!through || !targetColId) {
    return <div className="w-full h-full flex items-center px-2 text-[11px] text-gray-300 dark:text-gray-600 gap-1"><ArrowRightLeft size={12} /> skonfiguruj</div>;
  }
  if (!data) return <div className="w-full h-full flex items-center px-2 text-xs text-gray-400">…</div>;

  const targetCol = data.cols.find(c => c.id === targetColId);
  if (!targetCol) return <div className="w-full h-full flex items-center px-2 text-[11px] text-gray-300 dark:text-gray-600">—</div>;

  const values = linkedIds.map(id => data.items.find(i => i.id === id)).filter(Boolean).map(li => li.cells?.[targetColId]);

  // Renderowanie zależne od typu kolumny źródłowej
  if (targetCol.type === 'status' || targetCol.type === 'priority') {
    const labels = values.map(v => findLabel(targetCol, v)).filter(Boolean);
    return (
      <div className="w-full h-full flex items-center gap-1 px-2 flex-wrap overflow-hidden">
        {labels.length === 0 ? <Dash /> : labels.map((l, i) => (
          <span key={i} className="text-[11px] px-2 py-0.5 rounded-full text-white whitespace-nowrap" style={{ backgroundColor: l.color }}>{l.title}</span>
        ))}
      </div>
    );
  }
  if (targetCol.type === 'dropdown') {
    const opts = values.flatMap(v => resolveOptions(targetCol, v));
    return (
      <div className="w-full h-full flex items-center gap-1 px-2 flex-wrap overflow-hidden">
        {opts.length === 0 ? <Dash /> : opts.map((o, i) => (
          <span key={i} className="text-[11px] px-2 py-0.5 rounded-full text-white whitespace-nowrap" style={{ backgroundColor: o.color }}>{o.title}</span>
        ))}
      </div>
    );
  }
  const text = values.map(v => cellToText(targetCol, v)).filter(Boolean).join(', ');
  return <div className="w-full h-full flex items-center px-2 text-sm text-gray-600 dark:text-gray-300 truncate">{text || <Dash />}</div>;
}

function Dash() { return <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>; }
