// Lista tablic (Projekty / zakładka „Tablica” modułu) — czysta logika filtrów, testy obok.
import { taskBoardModuleKey } from '@avenit/shared/src/lib/taskLinks.js';

const lower = (v) => String(v ?? '').trim().toLowerCase();

// Prywatna tablica: tylko właściciel (awaryjnie twórca) i edytorzy — ta sama reguła co serwer
// (dataapi/boardsScope.js), bez względu na wielkość liter w e-mailu.
export function canSeeBoard(board, email) {
  if (!board) return false;
  if (board.visibility !== 'private') return true;
  const me = lower(email);
  if (!me) return false;
  if (lower(board.owner_email || board.created_by) === me) return true;
  return (board.editors || []).some((e) => lower(e) === me);
}

// Właściciel tablicy (owner_email, awaryjnie twórca) — tylko on (i admin) zmienia udostępnianie
// (visibility, editors) i publiczny formularz (form_enabled/form_token); serwer odrzuca resztę (403).
export function isBoardOwner(board, email) {
  const me = lower(email);
  return !!me && !!board && lower(board.owner_email || board.created_by) === me;
}

// Tablica zadań służby / Kalendarza (źródło zakładki „Zadania”) — nie archiwizujemy jej, nie usuwamy
// i nie robimy z niej szablonu, bo moduł straciłby swoje zadania.
export const isSystemTaskBoard = (board) => !!taskBoardModuleKey(board) || board?.source_kind === 'tasks';

// archived: false → aktywne, true → archiwum. Szablony nigdy nie trafiają na listę tablic.
export function filterBoards(boards, { archived = false, email = '' } = {}) {
  return (boards || []).filter((b) => b && !b.is_template && !!b.is_archived === !!archived && canSeeBoard(b, email));
}

// Szablony użytkowników (boards.is_template) widoczne dla mnie, alfabetycznie.
export function filterTemplates(boards, email = '') {
  return (boards || [])
    .filter((b) => b && b.is_template && canSeeBoard(b, email))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pl'));
}

// Grupy folderów: najpierw foldery alfabetycznie, na końcu tablice bez folderu.
export function groupByFolder(list) {
  const folders = [...new Set(list.map((b) => b.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pl'));
  return [
    ...folders.map((f) => ({ folder: f, list: list.filter((b) => b.folder === f) })),
    { folder: null, list: list.filter((b) => !b.folder) },
  ].filter((g) => g.list.length > 0);
}
