// Podsumowania kolumn per-grupa (jak stopka grupy w Monday).
import { findLabel, isCellEmpty, formatDuration } from './columnTypes';

// Zwraca obiekt opisujący podsumowanie kolumny dla zbioru elementów.
// { kind: 'battery'|'number'|'count', ... }
export function summarizeColumn(column, items) {
  const values = items.map(it => it.cells?.[column.id]);
  switch (column.type) {
    case 'status':
    case 'priority': {
      const buckets = {};
      let total = 0;
      for (const v of values) {
        if (v == null) continue;
        const l = findLabel(column, v);
        const color = l ? l.color : '#c4c4c4';
        buckets[color] = (buckets[color] || 0) + 1;
        total++;
      }
      const segments = Object.entries(buckets).map(([color, count]) => ({ color, count, pct: total ? (count / total) * 100 : 0 }));
      return { kind: 'battery', segments, total };
    }
    case 'vote': {
      const sum = values.reduce((a, v) => a + (Array.isArray(v) ? v.length : 0), 0);
      return { kind: 'number', sum, avg: 0, count: items.length };
    }
    case 'time_tracking': {
      const sum = values.reduce((a, v) => a + (v?.seconds || 0), 0);
      return { kind: 'duration', text: formatDuration(sum) };
    }
    case 'number':
    case 'rating':
    case 'progress': {
      const nums = values.filter(v => typeof v === 'number');
      const sum = nums.reduce((a, b) => a + b, 0);
      return { kind: 'number', sum, avg: nums.length ? sum / nums.length : 0, count: nums.length };
    }
    default: {
      const filled = values.filter(v => !isCellEmpty(column.type, v)).length;
      return { kind: 'count', filled, total: values.length };
    }
  }
}

// Bateria (pasek udziału) — komponent renderujący segmenty
export function batterySegments(summary) {
  return summary?.segments || [];
}
