// Przekaźnik realtime worker → API. Hub (hub.js) żyje w procesie API i zna tylko jego gniazda,
// więc zmiany robione przez worker (nieodebrane połączenia, wygaszanie gości w poczekalni,
// skład kanałów, powiadomienia z kampanii) nie docierały do przeglądarek. Worker wysyła je
// przez Postgres NOTIFY na kanale RELAY_CHANNEL (baza platform), API słucha (LISTEN) i rozsyła
// lokalnym emitChange — z tymi samymi uprawnieniami, filtrami wierszy i listą odbiorców.
//
// NOTIFY ma limit ~8000 bajtów, dlatego zmiana jest dzielona na paczki (wiersze, a przy dużej
// liście odbiorców także odbiorcy — wysłanie tych samych wierszy do części odbiorców kilka razy
// daje to samo co raz do wszystkich). Wiersz, który sam się nie mieści, jest pomijany (zostaje
// klientowi odświeżenie po reconnect / okresowe sprawdzanie).
import pg from 'pg';

export const RELAY_CHANNEL = 'avenit_realtime';
export const MAX_PAYLOAD = 7500;

// → { messages: string[], skipped: number }
export function encodeRelayMessages(tenant, table, op, rows, opts = {}, max = MAX_PAYLOAD) {
  // Pusta lista = sygnał „tabela się zmieniła” (hub wysyła wtedy wiersz null) — też przekazujemy.
  const list = (rows || []).filter(Boolean);
  if (!tenant || !table) return { messages: [], skipped: 0 };
  const audience = opts.audience ? [...opts.audience].map((e) => String(e)) : null;
  // Pusta lista odbiorców = nikt — nic do wysłania.
  if (audience && !audience.length) return { messages: [], skipped: 0 };

  const encode = (r, a) => JSON.stringify({ t: tenant, tb: table, op, r, a });
  // Limit NOTIFY jest w BAJTACH (UTF-8) — polskie litery zajmują po 2.
  const size = (str) => Buffer.byteLength(str, 'utf8');
  // Odbiorcy w paczkach tak, by zostało miejsce na wiersze (połowa limitu).
  const audienceChunks = [];
  if (audience) {
    let chunk = [];
    for (const email of audience) {
      if (chunk.length && size(JSON.stringify([...chunk, email])) > max / 2) {
        audienceChunks.push(chunk);
        chunk = [];
      }
      chunk.push(email);
    }
    if (chunk.length) audienceChunks.push(chunk);
  } else {
    audienceChunks.push(null);
  }

  const messages = [];
  let skipped = 0;
  for (const a of audienceChunks) {
    if (!list.length) { messages.push(encode([], a)); continue; }
    let batch = [];
    for (const row of list) {
      if (size(encode([row], a)) > max) { if (a === audienceChunks[0]) skipped += 1; continue; }
      if (batch.length && size(encode([...batch, row], a)) > max) {
        messages.push(encode(batch, a));
        batch = [];
      }
      batch.push(row);
    }
    if (batch.length) messages.push(encode(batch, a));
  }
  return { messages, skipped };
}

// Ramka z NOTIFY → argumenty emitChange; null = nieprawidłowa.
export function decodeRelayMessage(payload) {
  try {
    const m = JSON.parse(String(payload));
    if (!m || typeof m.t !== 'string' || typeof m.tb !== 'string' || !Array.isArray(m.r)) return null;
    return {
      tenant: m.t,
      table: m.tb,
      op: String(m.op || 'update'),
      rows: m.r,
      opts: Array.isArray(m.a) ? { audience: new Set(m.a.map((e) => String(e).toLowerCase())) } : {},
    };
  } catch {
    return null;
  }
}

// Worker: emitChange → NOTIFY. Wysyłka w tle (realtime nie może zatrzymać zadania).
// Wiersze z redact (np. anonimowe głosy) zostają tylko w API — funkcji nie da się przesłać.
export function createRelayPublisher(pool, log = () => {}) {
  return (tenant, table, op, rows, opts = {}) => {
    if (typeof opts.redact === 'function') {
      log(`realtime relay: pominięto ${table} (redact działa tylko w API)`);
      return;
    }
    const { messages, skipped } = encodeRelayMessages(tenant, table, op, rows, opts);
    if (skipped) log(`realtime relay: ${table} — ${skipped} wierszy za dużych na NOTIFY`);
    for (const payload of messages) {
      pool.query('SELECT pg_notify($1, $2)', [RELAY_CHANNEL, payload])
        .catch((err) => log(`realtime relay: NOTIFY ${table} nieudane: ${err.message}`));
    }
  };
}

// API: stałe połączenie LISTEN z ponawianiem (restart Postgresa, zerwana sieć).
// onMessage({ tenant, table, op, rows, opts }). Zwraca stop().
export function startRelayListener({ connectionString, onMessage, log = () => {}, retryMs = 5000, Client = pg.Client }) {
  let client = null;
  let stopped = false;
  let timer = null;

  const retry = () => {
    if (stopped || timer) return;
    timer = setTimeout(() => { timer = null; connect(); }, retryMs);
  };

  async function connect() {
    if (stopped) return;
    const c = new Client({ connectionString });
    client = c;
    c.on('notification', (msg) => {
      if (msg.channel !== RELAY_CHANNEL) return;
      const decoded = decodeRelayMessage(msg.payload);
      if (!decoded) return;
      try { onMessage(decoded); } catch (err) { log(`realtime relay: błąd rozsyłania: ${err.message}`); }
    });
    c.on('error', (err) => {
      log(`realtime relay: połączenie zerwane: ${err.message}`);
      c.removeAllListeners('notification');
      c.end().catch(() => {});
      if (client === c) client = null;
      retry();
    });
    try {
      await c.connect();
      await c.query(`LISTEN ${RELAY_CHANNEL}`);
    } catch (err) {
      log(`realtime relay: nie udało się nasłuchiwać: ${err.message}`);
      c.end().catch(() => {});
      if (client === c) client = null;
      retry();
    }
  }

  connect();
  return async () => {
    stopped = true;
    clearTimeout(timer);
    const c = client;
    client = null;
    if (c) await c.end().catch(() => {});
  };
}
