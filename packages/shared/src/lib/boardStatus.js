// Czy etykieta statusu oznacza „zrobione” — JEDNA reguła dla webu, serwera i mobilki (wcześniej trzy
// różne wyrażenia). Pierwszeństwo ma jawna flaga etykiety `done` (ustawiana w edytorze etykiet),
// a dla starych tablic bez flagi — nazwa etykiety.
const DONE_RE = /gotow|zrobion|ukończ|ukoncz|zakończ|zakoncz|wykonan|done|complete|finished/i;

export function isDoneLabel(label) {
  if (!label) return false;
  if (label.done === true) return true;
  if (label.done === false) return false;
  return DONE_RE.test(String(label.title || ''));
}

// Etykieta „zrobione” kolumny statusu (do „Oznacz jako gotowe”): jawna flaga, potem nazwa.
export function doneLabelOf(column) {
  const labels = column?.settings?.labels || [];
  return labels.find((l) => l?.done === true) || labels.find(isDoneLabel) || null;
}
