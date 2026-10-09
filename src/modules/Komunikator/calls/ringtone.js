// Dzwonek generowany w kodzie (WebAudio) — bez plików binarnych.
//  • 'incoming' — łagodna para tonów (C5 → E5) z miękkim narastaniem, co ~2,6 s,
//  • 'ringback' — cichy pojedynczy ton u dzwoniącego („sygnał oczekiwania”), co ~3 s.
// Przeglądarki wstrzymują dźwięk do pierwszego gestu użytkownika — unlockAudio() wołamy
// przy pierwszym kliknięciu/klawiszu, żeby dzwonek zadziałał później także w tle.
let ctx = null;

function getCtx() {
  if (ctx) return ctx;
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try { ctx = new AC(); } catch { ctx = null; }
  return ctx;
}

export function unlockAudio() {
  const c = getCtx();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

const PATTERNS = {
  incoming: { notes: [523.25, 659.25], noteLen: 0.38, gap: 0.08, every: 2600, volume: 0.16 },
  ringback: { notes: [440], noteLen: 1.1, gap: 0, every: 3000, volume: 0.05 },
};

function playBurst(c, master, p) {
  const start = c.currentTime + 0.02;
  p.notes.forEach((freq, i) => {
    const t0 = start + i * (p.noteLen + p.gap);
    const osc = c.createOscillator();
    const env = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(1, t0 + 0.04);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + p.noteLen);
    osc.connect(env);
    env.connect(master);
    osc.start(t0);
    osc.stop(t0 + p.noteLen + 0.05);
  });
}

// Zwraca funkcję zatrzymującą. Bez WebAudio (testy, stara przeglądarka) — no-op.
export function startRingtone(variant = 'incoming') {
  const c = getCtx();
  const p = PATTERNS[variant] || PATTERNS.incoming;
  if (!c) return () => {};
  let master;
  try {
    if (c.state === 'suspended') c.resume().catch(() => {});
    master = c.createGain();
    master.gain.value = p.volume;
    master.connect(c.destination);
    playBurst(c, master, p);
  } catch {
    return () => {};
  }
  const timer = setInterval(() => {
    try { playBurst(c, master, p); } catch { /* ignore */ }
  }, p.every);
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    try {
      master.gain.setTargetAtTime(0.0001, c.currentTime, 0.05);
      setTimeout(() => { try { master.disconnect(); } catch { /* ignore */ } }, 300);
    } catch { /* ignore */ }
  };
}
