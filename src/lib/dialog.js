// Okna potwierdzenia / pytania w stylu aplikacji zamiast systemowych confirm()/prompt() przeglądarki
// (szare okienka „schwro.avenit.pl says…” wyglądały obco i blokowały całą kartę).
// Wołalne z dowolnego miejsca, jak toast — zwracają Promise:
//   if (!(await confirmDialog(tr('Czy na pewno chcesz usunąć…?')))) return;
//   const name = await promptDialog(tr('Nazwa folderu'), ''); // null = anulowano
//   const scope = await choiceDialog({ title, choices: [{ value: 'one', label: 'Tylko tę' }, …] });
// Opcje (zamiast tekstu): { title, message, confirmLabel, cancelLabel, danger, isDelete, defaultValue, placeholder }.
// Przy operacji niebezpiecznej domyślny fokus jest na „Anuluj” (odruchowy Enter niczego nie usunie).
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

// Usuwanie/kasowanie → czerwony przycisk „Usuń”; inne operacje nieodwracalne → czerwony
// „Tak, kontynuuj”. Tekst trafia tu już PRZETŁUMACZONY (tr), więc rozpoznajemy PL, EN i UK.
// Pewniej jest podać to jawnie: confirmDialog({ title, message, danger: true, confirmLabel: tr('Usuń osobę') })
// (danger: true — operacja niebezpieczna; isDelete: true/false — czy to usuwanie; danger: false wyłącza oba).
const DELETE_RE = /usu[nń]|usunię|skasow|wykasow|\bdelet|\bremov|\berase|видал|вилуч|стерти|стерт/i;
const DANGER_RE = new RegExp(`${DELETE_RE.source}|nieodwracal|trwale|bezpowrotn|cannot be undone|can't be undone|can not be undone|irreversib|permanent|незворот|назавжди|остаточно`, 'i');

export function dialogFlags(msg) {
  const text = typeof msg === 'string' ? msg : `${msg?.title || ''} ${msg?.message || ''}`;
  const o = msg && typeof msg === 'object' ? msg : {};
  const danger = o.danger != null ? Boolean(o.danger) : DANGER_RE.test(text);
  const isDelete = o.isDelete != null ? Boolean(o.isDelete) : (danger && DELETE_RE.test(text));
  return { danger: danger || isDelete, isDelete };
}

export function confirmDialog(msg) {
  return open('confirm', msg, dialogFlags(msg));
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
