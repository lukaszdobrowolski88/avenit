import { saveAs } from 'file-saver';
import { cellToText, findLabel } from './columnTypes';

// ── Eksport tablicy do CSV ───────────────────────────────────────────
function esc(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportBoardCsv(board, columns, items) {
  const cols = columns.filter(c => c.type !== 'files');
  const header = ['Element', ...cols.map(c => c.name)];
  const rows = items.filter(it => !it.parent_item_id).map(it =>
    [it.name, ...cols.map(c => cellToText(c, it.cells?.[c.id]))]);
  const csv = [header, ...rows].map(r => r.map(esc).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  saveAs(blob, `${(board?.name || 'tablica').replace(/[^\w\-]+/g, '_')}.csv`);
}

// ── Parsowanie CSV (obsługa cudzysłowów) ─────────────────────────────
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return { header: [], records: [] };
  const header = rows[0].map(h => h.trim());
  const records = rows.slice(1).filter(r => r.some(v => v.trim() !== ''))
    .map(r => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
  return { header, records };
}

// Zbuduj cells (columnId → wartość) z rekordu CSV, mapując po nazwie kolumny.
export function buildCellsFromRecord(record, columns) {
  const cells = {};
  for (const col of columns) {
    if (col.type === 'files' || col.type === 'formula' || col.type === 'mirror') continue;
    const raw = record[col.name];
    if (raw == null || raw === '') continue;
    if (col.type === 'status' || col.type === 'priority') {
      const l = (col.settings?.labels || []).find(x => x.title.toLowerCase() === raw.toLowerCase());
      if (l) cells[col.id] = l.id;
    } else if (col.type === 'dropdown') {
      const ids = raw.split(',').map(t => (col.settings?.options || []).find(o => o.title.toLowerCase() === t.trim().toLowerCase())?.id).filter(Boolean);
      if (ids.length) cells[col.id] = ids;
    } else if (col.type === 'checkbox') {
      cells[col.id] = /^(true|tak|✓|1|yes)$/i.test(raw);
    } else if (col.type === 'number' || col.type === 'rating' || col.type === 'progress') {
      const n = Number(raw.replace(',', '.').replace(/[^\d.-]/g, '')); if (!isNaN(n)) cells[col.id] = n;
    } else if (col.type === 'date') {
      cells[col.id] = raw.slice(0, 10);
    } else if (col.type === 'people') {
      // pomiń — brak pewnego mapowania na osoby
    } else if (col.type === 'link') {
      cells[col.id] = { url: raw, text: '' };
    } else {
      cells[col.id] = raw;
    }
  }
  return cells;
}
