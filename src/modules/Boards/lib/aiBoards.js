import { callAi } from '../../AI/lib/aiApi';
import { cellToText } from './columnTypes';

// Wyciągnij JSON z odpowiedzi AI (zdejmij ewentualne ```json ... ``` i tekst wokół).
export function parseAiJson(text) {
  if (!text) return null;
  let s = String(text).trim();
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  // Wytnij od pierwszego { lub [ do ostatniego } lub ]
  const first = Math.min(...['{', '['].map(c => { const i = s.indexOf(c); return i < 0 ? Infinity : i; }));
  const last = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (first !== Infinity && last > first) s = s.slice(first, last + 1);
  try { return JSON.parse(s); } catch { return null; }
}

// Wygeneruj specyfikację tablicy z opisu (Vibe-like).
export async function generateBoardSpec(prompt) {
  const text = await callAi('board_generate', prompt);
  const spec = parseAiJson(text);
  if (!spec || !Array.isArray(spec.columns)) throw new Error('AI zwróciło nieprawidłową strukturę tablicy.');
  return spec;
}

// Wygeneruj automatyzację z opisu (AI Workflows-like). Kontekst = kolumny tablicy.
export async function generateAutomationSpec(prompt, columns) {
  const context = {
    columns: (columns || []).map(c => ({
      id: c.id, name: c.name, type: c.type,
      labels: (c.settings?.labels || []).map(l => ({ id: l.id, title: l.title })),
      options: (c.settings?.options || []).map(o => ({ id: o.id, title: o.title })),
    })),
  };
  const text = await callAi('board_automation', prompt, context);
  const spec = parseAiJson(text);
  if (!spec || !spec.trigger || !Array.isArray(spec.actions)) throw new Error('AI zwróciło nieprawidłową automatyzację.');
  return spec;
}

// AI Sidekick — odpowiedź na pytanie w języku naturalnym o dane tablicy.
export async function askBoard(question, { board, columns, items }) {
  const cols = (columns || []).filter(c => c.type !== 'files');
  const rows = (items || []).filter(it => !it.parent_item_id).slice(0, 150).map(it => {
    const row = { element: it.name };
    for (const c of cols) {
      const t = cellToText(c, it.cells?.[c.id]);
      if (t) row[c.name] = t;
    }
    return row;
  });
  const context = { tablica: board?.name || '', liczba_elementow: rows.length, kolumny: cols.map(c => c.name), elementy: rows };
  return callAi('ask_data', question, context);
}
