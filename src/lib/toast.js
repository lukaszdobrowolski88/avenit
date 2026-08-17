// Globalna warstwa feedbacku (błąd/sukces/info) — wołalna z DOWOLNEGO miejsca, także
// spoza drzewa Reacta (hooki, funkcje pomocnicze), tak jak globalne tr().
// Zastępuje ciche `console.error`/`setError` i część `alert()`.
//   import { toast } from '../lib/toast';
//   toast.error('Nie udało się zapisać');  toast.success('Zapisano');
let _id = 0;
const listeners = new Set();
let _queue = []; // bufor toastów zanim <Toaster/> się zasubskrybuje

function emit(t) {
  const toastObj = { id: ++_id, ...t };
  if (listeners.size === 0) { _queue.push(toastObj); }
  else listeners.forEach((l) => l(toastObj));
  return toastObj.id;
}

// message może być stringiem lub obiektem {title, message, action:{label,onClick}, duration}
const norm = (msg, opts) => (typeof msg === 'string' ? { message: msg, ...opts } : { ...msg, ...opts });

export const toast = {
  error: (msg, opts) => emit({ type: 'error', ...norm(msg, opts) }),
  success: (msg, opts) => emit({ type: 'success', ...norm(msg, opts) }),
  info: (msg, opts) => emit({ type: 'info', ...norm(msg, opts) }),
};

export function subscribeToasts(fn) {
  listeners.add(fn);
  if (_queue.length) { const q = _queue; _queue = []; q.forEach(fn); }
  return () => listeners.delete(fn);
}
