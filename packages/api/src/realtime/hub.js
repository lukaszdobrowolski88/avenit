// Hub realtime: subskrypcje per tenant+tabela, zdarzenia emitowane z warstwy
// zapisu Data API (zamiast supabase postgres_changes).
// Protokół (JSON po WS):
//   klient -> { type: 'subscribe', table: 'messages', event: '*' }
//   klient -> { type: 'unsubscribe', table: 'messages' }
//   serwer -> { type: 'postgres_changes', table, eventType: 'INSERT'|'UPDATE'|'DELETE', new: {...} }
//
// Bezpieczeństwo (2026-10): zdarzenie niesie CAŁY wiersz, więc subskrypcja tabeli wymaga
// prawa ODCZYTU tej tabeli (jak /api/db) — wcześniej każdy zalogowany mógł zasubskrybować
// dowolną tabelę (także '*') i dostawać cudze dane. Wiersze tabel osobistych
// (ownership.js) trafiają tylko do właściciela.

import { realtimeVisible } from '../dataapi/ownership.js';

const clients = new Set(); // { socket, tenant, userId, email, isAdmin, authorize, tables:Set }

// ctx: { tenant, userId, email, isAdmin, authorize(table) => Promise<boolean> }
export function registerClient(socket, ctx) {
  const client = { socket, ...ctx, tables: new Set() };
  clients.add(client);

  socket.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return; // ignoruj nieprawidłowe ramki
    }
    try {
      if (msg.type === 'subscribe' && msg.table) {
        const table = String(msg.table);
        const ok = table === '*' ? !!client.isAdmin : await client.authorize(table);
        if (ok) client.tables.add(table);
        else socket.send(JSON.stringify({ type: 'error', table, message: 'Brak dostępu do tej tabeli' }));
      }
      if (msg.type === 'unsubscribe' && msg.table) client.tables.delete(String(msg.table));
      if (msg.type === 'ping') socket.send(JSON.stringify({ type: 'pong' }));
    } catch {
      // błąd autoryzacji/wysyłki — subskrypcja po prostu nie powstaje
    }
  });
  socket.on('close', () => clients.delete(client));
  socket.on('error', () => clients.delete(client));
  return client;
}

const OP_TO_EVENT = { insert: 'INSERT', upsert: 'INSERT', update: 'UPDATE', delete: 'DELETE' };

// opts.audience: Set e-maili (małymi literami), do których wolno wysłać zmianę — np. uczestnicy
// rozmowy w Komunikatorze. Brak (null/undefined) = bez ograniczenia odbiorców.
// opts.redact(row, client): wiersz w wersji dla danego odbiorcy (np. ankieta anonimowa — e-mail
// głosującego tylko dla niego samego); null = nie wysyłaj temu odbiorcy.
export function emitChange(tenantSlug, table, op, rows, opts = {}) {
  const eventType = OP_TO_EVENT[op] || 'UPDATE';
  const list = rows?.length ? rows : [null];
  const audience = opts.audience || null;
  const redact = typeof opts.redact === 'function' ? opts.redact : null;
  for (const client of clients) {
    if (client.tenant !== tenantSlug) continue;
    if (!client.tables.has(table) && !client.tables.has('*')) continue;
    if (audience && !audience.has(String(client.email ?? '').toLowerCase())) continue;
    for (const raw of list) {
      // Tabela osobista: tylko wiersze tego klienta (null = tabela zwykła, bez filtra).
      if (realtimeVisible(table, raw, client) === false) continue;
      let row = raw;
      if (redact && raw) {
        try { row = redact(raw, client); } catch { row = null; }
        if (!row) continue;
      }
      try {
        client.socket.send(
          JSON.stringify({
            type: 'postgres_changes',
            table,
            eventType,
            new: eventType === 'DELETE' ? null : row,
            old: eventType === 'DELETE' ? row : null,
          })
        );
      } catch {
        clients.delete(client);
        break;
      }
    }
  }
}

export function connectedCount() {
  return clients.size;
}
