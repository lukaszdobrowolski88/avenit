import React, { useState, useEffect } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { findLabel, resolveOptions, cellToText } from '../../lib/columnTypes';
import { fetchBoardItemsFull, fetchBoardColumnsCached } from '../../lib/relationCache';
import { boardColor } from '../../lib/palette';
import { StatusPill } from '../../../../components/ui/DataTable';
import { tr } from '../../../../i18n';

// Jedno zapytanie na tablicę źródłową naraz: każdy wiersz z kolumną Lustro montuje się w tym
// samym momencie i bez tego 50 wierszy = 50 równoległych zapytań (cache relationCache zapełnia
// się dopiero po pierwszej odpowiedzi). Po zakończeniu wpis znika — dalej obsługuje TTL relationCache.
const inflight = new Map(); // targetBoardId → Promise<{ items, cols }>
function loadSource(boardId) {
  let p = inflight.get(boardId);
  if (!p) {
    p = Promise.all([fetchBoardItemsFull(boardId), fetchBoardColumnsCached(boardId)])
      .then(([items, cols]) => ({ items: items || [], cols: cols || [] }))
      .finally(() => inflight.delete(boardId));
    inflight.set(boardId, p);
  }
  return p;
}

const ROW = 'w-full h-full flex items-center gap-1 px-2 overflow-hidden';

// Kolumna Lustro — odbija wartość kolumny z połączonych elementów (przez kolumnę
// „Połącz tablice" na tym samym elemencie). Tylko do odczytu.
export default function MirrorCell({ column, item, columns }) {
  const through = (columns || []).find(c => c.id === column?.settings?.throughColumnId && c.type === 'connect_board');
  const targetBoardId = through?.settings?.targetBoardId;
  const targetColId = column?.settings?.targetColumnId;
  const linkedIds = ((item?.cells?.[through?.id]) || []).map(l => l.id);

  const [data, setData] = useState(null); // { items, cols } | null (ładowanie / błąd = pusto)

  useEffect(() => {
    let alive = true;
    setData(null);
    if (!targetBoardId) return undefined;
    loadSource(targetBoardId)
      .then((d) => { if (alive) setData(d); })
      // Błąd sieci: komórka zostaje pusta (bez wiecznego „…”); kolejne otwarcie tablicy spróbuje ponownie.
      .catch(() => { if (alive) setData(null); });
    return () => { alive = false; };
  }, [targetBoardId]);

  if (!through || !targetColId) {
    // Podpowiedź konfiguracji tylko po najechaniu na wiersz — nie w każdym wierszu tabeli.
    return (
      <div className={`${ROW} text-[11px] text-gray-400 dark:text-gray-500 opacity-0 group-hover/row:opacity-100 transition-opacity`}
        title={tr('Wskaż kolumnę połączenia i kolumnę źródłową w ustawieniach kolumny.')}>
        <ArrowRightLeft size={12} aria-hidden="true" /> {tr('skonfiguruj')}
      </div>
    );
  }
  if (!data) return <div className={ROW} />;

  const targetCol = data.cols.find(c => c.id === targetColId);
  if (!targetCol) return <div className={ROW} />;

  const byId = new Map(data.items.map(i => [i.id, i]));
  const values = linkedIds.map(id => byId.get(id)).filter(Boolean).map(li => li.cells?.[targetColId]);

  // Renderowanie zależne od typu kolumny źródłowej — pigułki jak w komórkach Status / Lista wyboru.
  if (targetCol.type === 'status' || targetCol.type === 'priority') {
    const labels = values.map(v => findLabel(targetCol, v)).filter(Boolean);
    return (
      <div className={ROW}>
        {labels.map((l, i) => <StatusPill key={i} color={boardColor(l.color)} className="shrink-0 max-w-full overflow-hidden">{l.title}</StatusPill>)}
      </div>
    );
  }
  if (targetCol.type === 'dropdown') {
    const opts = values.flatMap(v => resolveOptions(targetCol, v));
    return (
      <div className={ROW}>
        {opts.map((o, i) => <StatusPill key={i} color={boardColor(o.color)} className="shrink-0 max-w-full overflow-hidden">{o.title}</StatusPill>)}
      </div>
    );
  }
  const text = values.map(v => cellToText(targetCol, v)).filter(Boolean).join(', ');
  return <div className={`${ROW} text-sm text-gray-600 dark:text-gray-300`}><span className="truncate tabular-nums">{text}</span></div>;
}
