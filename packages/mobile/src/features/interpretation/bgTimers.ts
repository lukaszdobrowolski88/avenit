// Timery, które działają też przy wygaszonym ekranie Androida (czysta logika — testy w
// src/lib/mobileInterpretation.test.js).
//
// React Native na Androidzie wstrzymuje setTimeout/setInterval, gdy aktywność jest w tle (ekran
// zgaszony) — nawet jeśli proces trzyma usługa pierwszoplanowa. Wtedy staje ping sygnalizacji
// LiveKit, ponawianie połączenia i odpytywanie stanu. Timer „hybrydowy” ustawia zwykły timer RN
// (na wierzchu działa jak dotąd), a dodatkowo odpala zaległe wpisy przy każdym tick() — wołanym
// z natywnego zdarzenia onTick usługi słuchania (zdarzenia natywne docierają do JS także w tle).
// Każdy wpis odpala się raz (który pierwszy: timer RN czy tick); setInterval po długiej przerwie
// nie nadrabia zaległych wywołań — odpala raz i liczy od nowa.

export interface TimerHost {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  now: () => number;
}

type Fn = (...args: unknown[]) => void;

interface Entry {
  id: number;
  due: number;
  interval: number | null;
  fn: Fn;
  args: unknown[];
  handle: unknown;
}

// Własne identyfikatory poza zakresem RN (tam rosną od 1) — clear* z obcym id trafia do RN.
export const HYBRID_ID_BASE = 0x40000000;

export interface HybridTimers {
  setTimeout: (fn: Fn, ms?: number, ...args: unknown[]) => number;
  setInterval: (fn: Fn, ms?: number, ...args: unknown[]) => number;
  clearTimeout: (id: unknown) => void;
  clearInterval: (id: unknown) => void;
  tick: () => void;
  size: () => number;
}

export function createHybridTimers(host: TimerHost): HybridTimers {
  let seq = HYBRID_ID_BASE;
  const entries = new Map<number, Entry>();

  const arm = (e: Entry) => {
    e.handle = host.setTimeout(() => fire(e.id), Math.max(0, e.due - host.now()));
  };

  // Odpal wpis (stan aktualizujemy PRZED wywołaniem — callback może sam go wyczyścić / dodać nowy).
  function fire(id: number) {
    const e = entries.get(id);
    if (!e) return;
    if (e.handle != null) host.clearTimeout(e.handle);
    e.handle = null;
    if (e.interval == null) entries.delete(id);
    else {
      e.due = host.now() + e.interval;
      arm(e);
    }
    e.fn(...e.args);
  }

  const add = (fn: Fn, ms: number | undefined, args: unknown[], repeat: boolean): number => {
    const delay = Math.max(0, Number(ms) || 0);
    const id = ++seq;
    const e: Entry = { id, due: host.now() + delay, interval: repeat ? Math.max(1, delay) : null, fn, args, handle: null };
    entries.set(id, e);
    arm(e);
    return id;
  };

  const clear = (id: unknown) => {
    const e = typeof id === 'number' ? entries.get(id) : undefined;
    if (!e) {
      // Timer sprzed podmiany (zwykły timer RN) — czyścimy go tam.
      if (id != null) host.clearTimeout(id);
      return;
    }
    entries.delete(e.id);
    if (e.handle != null) host.clearTimeout(e.handle);
    e.handle = null;
  };

  return {
    setTimeout: (fn, ms, ...args) => add(fn, ms, args, false),
    setInterval: (fn, ms, ...args) => add(fn, ms, args, true),
    clearTimeout: clear,
    clearInterval: clear,
    tick: () => {
      const now = host.now();
      const due = [...entries.values()].filter((e) => e.due <= now).sort((a, b) => a.due - b.due || a.id - b.id);
      let firstError: unknown = null;
      for (const e of due) {
        try {
          fire(e.id);
        } catch (err) {
          if (firstError == null) firstError = err;
        }
      }
      if (firstError != null) throw firstError;
    },
    size: () => entries.size,
  };
}
