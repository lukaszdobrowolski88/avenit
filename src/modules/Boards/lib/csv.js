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
// „2026-10-12…” albo „12.10.2026” (także 1.2.2026) → „2026-10-12”; inne → null.
export function parseDateText(raw) {
  const t = String(raw || '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

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
      // Eksport pisze daty jako dd.mm.yyyy (jak w tabeli) — import przyjmuje oba formaty.
      const iso = parseDateText(raw);
      if (iso) cells[col.id] = iso;
    } else if (col.type === 'timeline') {
      const [a, b] = raw.split(/\s*[–—→-]\s*/);
      const end = parseDateText(b);
      let start = parseDateText(a);
      // „01.01 – 05.01.2026” — rok tylko przy końcu.
      if (!start && end && /^\d{1,2}\.\d{1,2}\.?$/.test((a || '').trim())) start = parseDateText(`${a.trim().replace(/\.$/, '')}.${end.slice(0, 4)}`);
      if (start) cells[col.id] = { start, end: end || null };
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
