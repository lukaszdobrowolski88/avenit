import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import ParticipantTile from './ParticipantTile';
import { arrangeTiles, paginate, pageSizeFor, gridColumns } from './callLogic';
import { tr } from '../../../i18n';

function useViewportWidth() {
  const [w, setW] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1280));
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return w;
}

function Pager({ page, pages, onPage }) {
  if (pages <= 1) return null;
  const btn = 'w-9 h-9 rounded-full inline-flex items-center justify-center bg-white/10 hover:bg-white/20 text-white disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70';
  return (
    <nav className="flex items-center justify-center gap-3 pt-2" aria-label={tr('Strony uczestników')}>
      <button type="button" className={btn} onClick={() => onPage(page - 1)} disabled={page === 0} aria-label={tr('Poprzednia strona')}>
        <ChevronLeft size={18} aria-hidden="true" />
      </button>
      <span className="text-xs text-white/70 tabular-nums" aria-live="polite">{tr('Strona {n} z {m}', { n: page + 1, m: pages })}</span>
      <button type="button" className={btn} onClick={() => onPage(page + 1)} disabled={page >= pages - 1} aria-label={tr('Następna strona')}>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </nav>
  );
}

// Scena rozmowy: siatka kafelków ze stronami (renderujemy tylko widoczną stronę — reszta nie
// pobiera obrazu), udostępniony ekran na pierwszym planie, w rozmowie 1:1 własny podgląd w rogu.
export default function CallStage({ snapshot }) {
  const width = useViewportWidth();
  const [page, setPage] = useState(0);
  const { participants, speakerIds } = snapshot;
  const byId = useMemo(() => new Map(participants.map((p) => [p.id, p])), [participants]);
  const speaking = useMemo(() => new Set(speakerIds), [speakerIds]);
  const sharer = participants.find((p) => p.screenOn);

  const pageSize = sharer ? (width < 640 ? 3 : 6) : pageSizeFor(width);
  const ordered = useMemo(() => arrangeTiles(participants.map((p) => p.id), speakerIds, pageSize), [participants, speakerIds, pageSize]);
  const { page: cur, pages, items } = paginate(ordered, page, pageSize);
  useEffect(() => { if (cur !== page) setPage(cur); }, [cur, page]);

  // 1:1 bez udostępniania ekranu: rozmówca na całej scenie, ja w rogu.
  if (!sharer && participants.length === 2) {
    const me = participants.find((p) => p.isLocal);
    const other = participants.find((p) => !p.isLocal);
    return (
      <div className="relative flex-1 min-h-0 p-3 sm:p-4">
        <ParticipantTile p={other} speaking={speaking.has(other.id)} className="w-full h-full" />
        {me && (
          <div className="absolute right-5 bottom-5 sm:right-7 sm:bottom-7 w-28 sm:w-44 aspect-[3/4] sm:aspect-video shadow-2xl rounded-2xl">
            <ParticipantTile p={me} compact speaking={speaking.has(me.id)} className="w-full h-full" />
          </div>
        )}
      </div>
    );
  }

  const tiles = items.map((id) => byId.get(id)).filter(Boolean);

  if (sharer) {
    return (
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3 p-3 sm:p-4">
        <ParticipantTile p={sharer} screen className="flex-1 min-h-[40vh] lg:min-h-0" />
        <div className="flex flex-col gap-2 lg:w-60 min-h-0">
          <div className="grid grid-cols-3 lg:grid-cols-1 gap-2 min-h-0 lg:overflow-hidden">
            {tiles.map((p) => (
              <ParticipantTile key={p.id} p={p} compact speaking={speaking.has(p.id)} className="aspect-video" />
            ))}
          </div>
          <Pager page={cur} pages={pages} onPage={setPage} />
        </div>
      </div>
    );
  }

  const cols = gridColumns(tiles.length, width);
  const rows = Math.max(1, Math.ceil(tiles.length / cols));
  return (
    <div className="flex-1 min-h-0 flex flex-col p-3 sm:p-4">
      <div
        className="flex-1 min-h-0 grid gap-2 sm:gap-3"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
      >
        {tiles.map((p) => (
          <ParticipantTile key={p.id} p={p} compact={tiles.length > 9} speaking={speaking.has(p.id)} className="w-full h-full" />
        ))}
      </div>
      <Pager page={cur} pages={pages} onPage={setPage} />
    </div>
  );
}
