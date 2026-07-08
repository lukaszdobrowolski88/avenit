// Hub realtime: subskrypcje per tenant+tabela, zdarzenia emitowane z warstwy
// zapisu Data API (zamiast supabase postgres_changes).
// Protokół (JSON po WS):
//   klient -> { type: 'subscribe', table: 'messages', event: '*' }
//   klient -> { type: 'unsubscribe', table: 'messages' }
//   serwer -> { type: 'postgres_changes', table, eventType: 'INSERT'|'UPDATE'|'DELETE', new: {...} }

const clients = new Set(); // { socket, tenant, userId, tables:Set }

export function registerClient(socket, tenant, userId) {
  const client = { socket, tenant, userId, tables: new Set() };
  clients.add(client);

  socket.on('message', (raw) => {
    try {
      const msg = JSON.parse(String(raw));
      if (msg.type === 'subscribe' && msg.table) client.tables.add(String(msg.table));
      if (msg.type === 'unsubscribe' && msg.table) client.tables.delete(String(msg.table));
      if (msg.type === 'ping') socket.send(JSON.stringify({ type: 'pong' }));
    } catch {
      // ignoruj nieprawidłowe ramki
    }
  });
  socket.on('close', () => clients.delete(client));
  socket.on('error', () => clients.delete(client));
  return client;
}

const OP_TO_EVENT = { insert: 'INSERT', upsert: 'INSERT', update: 'UPDATE', delete: 'DELETE' };

export function emitChange(tenantSlug, table, op, rows) {
  const eventType = OP_TO_EVENT[op] || 'UPDATE';
  const payloads = (rows?.length ? rows : [null]).map((row) => ({
    type: 'postgres_changes',
    table,
    eventType,
    new: eventType === 'DELETE' ? null : row,
    old: eventType === 'DELETE' ? row : null,
  }));
  for (const client of clients) {
    if (client.tenant !== tenantSlug) continue;
    if (!client.tables.has(table) && !client.tables.has('*')) continue;
    for (const payload of payloads) {
      try {
        client.socket.send(JSON.stringify(payload));
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
