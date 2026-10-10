// Przekaźnik realtime worker → API (NOTIFY/LISTEN): podział na paczki, dekodowanie, rozsyłanie.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  RELAY_CHANNEL, encodeRelayMessages, decodeRelayMessage, createRelayPublisher, startRelayListener,
} from '../src/realtime/relay.js';
import { emitChange, registerClient, setRelay } from '../src/realtime/hub.js';

const row = (id, extra = {}) => ({ id, conversation_id: 'c1', status: 'missed', ...extra });

test('mała zmiana = jedna ramka; dekodowanie odtwarza wiersze i odbiorców', () => {
  const { messages, skipped } = encodeRelayMessages('schwro', 'calls', 'update', [row('k1')], { audience: new Set(['ja@x.pl', 'Ola@X.pl']) });
  assert.equal(messages.length, 1);
  assert.equal(skipped, 0);
  const d = decodeRelayMessage(messages[0]);
  assert.equal(d.tenant, 'schwro');
  assert.equal(d.table, 'calls');
  assert.equal(d.op, 'update');
  assert.deepEqual(d.rows, [row('k1')]);
  assert.deepEqual([...d.opts.audience].sort(), ['ja@x.pl', 'ola@x.pl']);
});

test('bez odbiorców = do wszystkich uprawnionych; pusta lista odbiorców = nic', () => {
  const all = encodeRelayMessages('t', 'notifications', 'insert', [row('n1')]);
  assert.deepEqual(decodeRelayMessage(all.messages[0]).opts, {});
  assert.equal(encodeRelayMessages('t', 'calls', 'update', [row('k1')], { audience: new Set() }).messages.length, 0);
});

test('pusta lista wierszy (sygnał „tabela się zmieniła”) też przechodzi', () => {
  const { messages } = encodeRelayMessages('t', 'boards', 'update', []);
  assert.equal(messages.length, 1);
  assert.deepEqual(decodeRelayMessage(messages[0]).rows, []);
});

test('duża zmiana: paczki mieszczą się w limicie, żaden wiersz nie ginie', () => {
  // Polskie znaki: limit liczony w bajtach UTF-8, nie w znakach (Postgres odrzucał za długie ramki).
  const rows = Array.from({ length: 200 }, (_, i) => row(`id-${i}`, { body: 'ząb żółć '.repeat(25) }));
  const { messages, skipped } = encodeRelayMessages('t', 'notifications', 'insert', rows, {}, 2000);
  assert.ok(messages.length > 1);
  assert.equal(skipped, 0);
  for (const m of messages) assert.ok(Buffer.byteLength(m) <= 2000, `ramka ${Buffer.byteLength(m)} B`);
  const ids = messages.flatMap((m) => decodeRelayMessage(m).rows.map((r) => r.id));
  assert.deepEqual(ids, rows.map((r) => r.id));
});

test('wielu odbiorców: dzieleni na paczki, każdy dostaje każdy wiersz', () => {
  const audience = new Set(Array.from({ length: 300 }, (_, i) => `osoba${i}@kosciol.pl`));
  const rows = [row('k1'), row('k2')];
  const { messages } = encodeRelayMessages('t', 'messages', 'update', rows, { audience }, 3000);
  assert.ok(messages.length > 1);
  const seen = new Map();
  for (const m of messages) {
    assert.ok(m.length <= 3000);
    const d = decodeRelayMessage(m);
    for (const e of d.opts.audience) for (const r of d.rows) seen.set(`${e}|${r.id}`, true);
  }
  assert.equal(seen.size, audience.size * rows.length);
});

test('wiersz większy niż limit jest pomijany i liczony', () => {
  const { messages, skipped } = encodeRelayMessages('t', 'messages', 'insert', [row('big', { content: 'x'.repeat(5000) }), row('ok')], {}, 2000);
  assert.equal(skipped, 1);
  assert.deepEqual(messages.flatMap((m) => decodeRelayMessage(m).rows.map((r) => r.id)), ['ok']);
});

test('nieprawidłowa ramka → null', () => {
  assert.equal(decodeRelayMessage('nie json'), null);
  assert.equal(decodeRelayMessage(JSON.stringify({ t: 'x' })), null);
});

test('publisher: NOTIFY na kanale przekaźnika; redact zostaje w API', async () => {
  const queries = [];
  const pool = { query: async (sql, params) => { queries.push({ sql, params }); return { rows: [] }; } };
  const logs = [];
  const publish = createRelayPublisher(pool, (m) => logs.push(m));
  publish('t', 'calls', 'update', [row('k1')], { audience: new Set(['ja@x.pl']) });
  publish('t', 'poll_votes', 'delete', [row('v1')], { redact: () => null });
  await new Promise((r) => setImmediate(r));
  assert.equal(queries.length, 1);
  assert.equal(queries[0].sql, 'SELECT pg_notify($1, $2)');
  assert.equal(queries[0].params[0], RELAY_CHANNEL);
  assert.equal(decodeRelayMessage(queries[0].params[1]).table, 'calls');
  assert.ok(logs.some((m) => m.includes('poll_votes')));
});

// Atrapa pg.Client: LISTEN zapisany, powiadomienia emitowane ręcznie.
function fakeClientClass(instances) {
  return class FakeClient extends EventEmitter {
    constructor(opts) { super(); this.opts = opts; this.queries = []; this.ended = false; instances.push(this); }
    async connect() {}
    async query(sql) { this.queries.push(sql); return { rows: [] }; }
    async end() { this.ended = true; }
  };
}

test('listener: LISTEN, rozsyłanie ramek, ponowne połączenie po błędzie', async () => {
  const instances = [];
  const got = [];
  const stop = startRelayListener({
    connectionString: 'postgres://x', onMessage: (m) => got.push(m), retryMs: 5, Client: fakeClientClass(instances),
  });
  await new Promise((r) => setImmediate(r));
  assert.equal(instances.length, 1);
  assert.deepEqual(instances[0].queries, [`LISTEN ${RELAY_CHANNEL}`]);

  const [payload] = encodeRelayMessages('t', 'calls', 'update', [row('k1')]).messages;
  instances[0].emit('notification', { channel: RELAY_CHANNEL, payload });
  instances[0].emit('notification', { channel: 'inny', payload });
  instances[0].emit('notification', { channel: RELAY_CHANNEL, payload: 'śmieci' });
  assert.equal(got.length, 1);
  assert.equal(got[0].rows[0].id, 'k1');

  instances[0].emit('error', new Error('connection terminated'));
  assert.equal(instances[0].ended, true);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(instances.length, 2);
  assert.deepEqual(instances[1].queries, [`LISTEN ${RELAY_CHANNEL}`]);
  await stop();
  assert.equal(instances[1].ended, true);
});

test('hub: w trybie przekaźnika (worker) emitChange przekazuje dalej; w API rozsyła do gniazd z listy odbiorców', async () => {
  // Worker: przekaźnik zamiast lokalnego rozsyłania.
  const relayed = [];
  setRelay((...args) => relayed.push(args));
  emitChange('t', 'calls', 'update', [row('k1')], { audience: new Set(['ja@x.pl']) });
  setRelay(null);
  assert.equal(relayed.length, 1);
  assert.equal(relayed[0][1], 'calls');

  // API: ramka z NOTIFY → emitChange → tylko gniazdo uprawnionego odbiorcy.
  const sockets = ['ja@x.pl', 'obcy@x.pl'].map((email) => {
    const socket = new EventEmitter();
    socket.sent = [];
    socket.send = (raw) => socket.sent.push(JSON.parse(raw));
    registerClient(socket, { tenant: 't', userId: email, email, isAdmin: false, authorize: async () => true });
    socket.emit('message', JSON.stringify({ type: 'subscribe', table: 'calls' }));
    return socket;
  });
  await new Promise((r) => setImmediate(r));
  const [payload] = encodeRelayMessages('t', 'calls', 'update', [row('k1')], { audience: new Set(['ja@x.pl']) }).messages;
  const d = decodeRelayMessage(payload);
  emitChange(d.tenant, d.table, d.op, d.rows, d.opts);
  assert.equal(sockets[0].sent.length, 1);
  assert.equal(sockets[0].sent[0].eventType, 'UPDATE');
  assert.equal(sockets[0].sent[0].new.id, 'k1');
  assert.equal(sockets[1].sent.length, 0);
  for (const s of sockets) s.emit('close');
});
