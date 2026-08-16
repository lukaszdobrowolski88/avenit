import React, { useMemo } from 'react';
import { Avatar } from '../components/cells/PeopleCell';
import { applyView } from '../lib/viewData';
import { findLabel } from '../lib/columnTypes';

// Widok Obciążenie — ile elementów przypada na osobę (z rozbiciem na statusy).
export default function WorkloadView({ data, config, onOpenItem }) {
  const peopleCols = data.columns.filter(c => c.type === 'people');
  const statusCol = data.columns.find(c => c.type === 'status' || c.type === 'priority');
  const items = useMemo(() => applyView(data.items, data.columns, config), [data.items, data.columns, config]);

  const { rows, unassigned, max } = useMemo(() => {
    const byEmail = new Map();
    let unassignedCount = 0;
    for (const it of items) {
      const assignees = [];
      for (const c of peopleCols) for (const p of (it.cells?.[c.id] || [])) assignees.push(p);
      if (assignees.length === 0) { unassignedCount++; continue; }
      const seen = new Set();
      for (const p of assignees) {
        if (seen.has(p.email)) continue; seen.add(p.email);
        if (!byEmail.has(p.email)) byEmail.set(p.email, { person: p, items: [] });
        byEmail.get(p.email).items.push(it);
      }
    }
    const rows = [...byEmail.values()].sort((a, b) => b.items.length - a.items.length);
    const max = Math.max(1, ...rows.map(r => r.items.length));
    return { rows, unassigned: unassignedCount, max };
  }, [items, peopleCols, statusCol]);

  if (peopleCols.length === 0) {
    return <div className="text-center py-16 text-gray-400 text-sm">Dodaj kolumnę typu „Osoby", aby zobaczyć obciążenie zespołu.</div>;
  }

  const statusBreakdown = (list) => {
    if (!statusCol) return null;
    const buckets = {};
    for (const it of list) {
      const l = findLabel(statusCol, it.cells?.[statusCol.id]);
      const color = l ? l.color : '#c4c4c4';
      buckets[color] = (buckets[color] || 0) + 1;
    }
    return Object.entries(buckets);
  };

  return (
    <div className="space-y-2">
      {rows.map(({ person, items: list }) => {
        const seg = statusBreakdown(list);
        return (
          <div key={person.email} className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-3">
            <Avatar person={person} size={32} />
            <div className="w-40 shrink-0 min-w-0">
              <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{person.name || person.email}</div>
              <div className="text-[11px] text-gray-400">{list.length} elementów</div>
            </div>
            <div className="flex-1">
              <div className="h-6 rounded-full overflow-hidden flex bg-gray-100 dark:bg-gray-700/50" style={{ width: `${(list.length / max) * 100}%`, minWidth: 40 }}>
                {seg ? seg.map(([color, n], i) => (
                  <div key={i} style={{ width: `${(n / list.length) * 100}%`, backgroundColor: color }} title={`${n}`} />
                )) : <div className="w-full bg-accent-primary" />}
              </div>
            </div>
          </div>
        );
      })}
      {unassigned > 0 && (
        <div className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-3">
          <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400 text-xs">?</div>
          <div className="w-40 text-sm text-gray-500 dark:text-gray-400">Nieprzypisane</div>
          <div className="flex-1"><div className="h-6 rounded-full bg-gray-200 dark:bg-gray-600" style={{ width: `${(unassigned / max) * 100}%`, minWidth: 40 }} /></div>
          <span className="text-xs text-gray-400">{unassigned}</span>
        </div>
      )}
      {rows.length === 0 && unassigned === 0 && <div className="text-center py-12 text-gray-400 text-sm">Brak elementów.</div>}
    </div>
  );
}
