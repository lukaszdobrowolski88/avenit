// Okna potwierdzenia / pytania w stylu aplikacji zamiast systemowych confirm()/prompt() przeglądarki
// (szare okienka „schwro.avenit.pl says…” wyglądały obco i blokowały całą kartę).
// Wołalne z dowolnego miejsca, jak toast — zwracają Promise:
//   if (!(await confirmDialog(tr('Czy na pewno chcesz usunąć…?')))) return;
//   const name = await promptDialog(tr('Nazwa folderu'), ''); // null = anulowano
//   const scope = await choiceDialog({ title, choices: [{ value: 'one', label: 'Tylko tę' }, …] });
// Opcje (zamiast tekstu): { title, message, confirmLabel, cancelLabel, danger, defaultValue, placeholder }.
let _id = 0;
const listeners = new Set();
let _queue = []; // okna zgłoszone zanim <DialogHost/> się zasubskrybuje

function open(kind, msg, extra) {
  const opts = typeof msg === 'string' || msg == null ? { message: msg == null ? '' : String(msg) } : { ...msg };
  return new Promise((resolve) => {
    const d = { id: ++_id, kind, ...opts, ...extra, resolve };
    if (listeners.size === 0) _queue.push(d);
    else listeners.forEach((l) => l(d));
  });
}

// Usuwanie/kasowanie → czerwony przycisk „Usuń”; operacje nieodwracalne → czerwony „Potwierdź”.
const DELETE_RE = /usu[nń]|usunię|skasow/i;
const DANGER_RE = /usu[nń]|usunię|skasow|nieodwracal|trwale|bezpowrotn/i;

export function confirmDialog(msg) {
  const text = typeof msg === 'string' ? msg : `${msg?.title || ''} ${msg?.message || ''}`;
  const danger = typeof msg === 'object' && msg?.danger != null ? msg.danger : DANGER_RE.test(text);
  return open('confirm', msg, { danger, isDelete: DELETE_RE.test(text) });
}

export function promptDialog(msg, defaultValue = '') {
  return open('prompt', msg, typeof msg === 'object' && msg?.defaultValue != null ? {} : { defaultValue: defaultValue ?? '' });
}

// Wybór jednej z kilku akcji (np. „Tylko tę” / „Całą serię”); null = anulowano.
//   choices: [{ value, label, danger? }]
export function choiceDialog(opts) {
  return open('choice', opts, {});
}

export function subscribeDialogs(fn) {
  listeners.add(fn);
  if (_queue.length) { const q = _queue; _queue = []; q.forEach(fn); }
  return () => listeners.delete(fn);
}
