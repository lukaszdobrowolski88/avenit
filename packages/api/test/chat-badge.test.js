// Komunikator — plakietka ikony aplikacji mobilnej (liczba rozmów z nieprzeczytanymi): zapytanie
// na PRAWDZIWYM SQL (PGlite), fn chat-badge i pole `badge` w pushu Expo.
//   PGLITE_MODULE=/ścieżka/node_modules/@electric-sql/pglite/dist/index.js node --test test/chat-badge.test.js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { unreadBadgeCount } from '../src/dataapi/komunikatorBadge.js';
import badgeHandler from '../src/fn/chat-badge.js';
import { sendPushCore } from '../src/fn/send-push.js';

let PGlite = null;
try {
  ({ PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite'));
} catch { PGlite = null; }
const skip = PGlite ? false : 'brak @electric-sql/pglite (ustaw PGLITE_MODULE)';

const C1 = '11111111-1111-1111-1111-111111111111';
const C2 = '22222222-2222-2222-2222-222222222222';
const C3 = '33333333-3333-3333-3333-333333333333';
const C4 = '44444444-4444-4444-4444-444444444444';

let db;
before(async () => {
  if (skip) return;
  const pg = new PGlite();
  db = {
    async query(sql, params) {
      const r = await pg.query(sql, params);
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    },
  };
  await pg.exec(`
    CREATE TABLE conversation_participants (conversation_id uuid, user_email text, joined_at timestamptz DEFAULT now(),
      last_read_at timestamptz, archived boolean DEFAULT false);
    CREATE TABLE messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid, sender_email text,
      message_type text DEFAULT 'text', deleted_at timestamptz, created_at timestamptz DEFAULT now());
    -- Ola: C1 nieprzeczytana (cudza po przeczytaniu), C2 przeczytana, C3 tylko moja i systemowa,
    -- C4 w archiwum (nieprzeczytana). Ewa: C1 bez last_read_at — liczy się od dołączenia.
    INSERT INTO conversation_participants (conversation_id, user_email, joined_at, last_read_at, archived) VALUES
      ('${C1}', 'Ola@x.pl', now() - interval '10 days', now() - interval '2 hours', false),
      ('${C2}', 'ola@x.pl', now() - interval '10 days', now(), false),
      ('${C3}', 'ola@x.pl', now() - interval '10 days', now() - interval '5 hours', false),
      ('${C4}', 'ola@x.pl', now() - interval '10 days', now() - interval '5 hours', true),
      ('${C1}', 'ewa@x.pl', now() - interval '30 minutes', NULL, false);
    INSERT INTO messages (conversation_id, sender_email, message_type, deleted_at, created_at) VALUES
      ('${C1}', 'jan@x.pl', 'text', NULL, now() - interval '1 hour'),
      ('${C1}', 'jan@x.pl', 'text', NULL, now() - interval '50 minutes'),
      ('${C2}', 'jan@x.pl', 'text', NULL, now() - interval '1 hour'),
      ('${C3}', 'OLA@x.pl', 'text', NULL, now() - interval '1 hour'),
      ('${C3}', 'jan@x.pl', 'system', NULL, now() - interval '1 hour'),
      ('${C3}', 'jan@x.pl', 'text', now(), now() - interval '1 hour'),
      ('${C4}', 'jan@x.pl', 'text', NULL, now() - interval '1 hour');
  `);
});

test('plakietka: rozmowy z cudzą nieprzeczytaną wiadomością, bez archiwum, usuniętych i systemowych', { skip }, async () => {
  assert.equal(await unreadBadgeCount(db, 'ola@x.pl'), 1); // tylko C1 (dwie wiadomości = jedna rozmowa)
  assert.equal(await unreadBadgeCount(db, 'OLA@X.PL'), 1);
  // Ewa dołączyła 30 min temu — wcześniejsze wiadomości jej nie liczą się.
  assert.equal(await unreadBadgeCount(db, 'ewa@x.pl'), 0);
  assert.equal(await unreadBadgeCount(db, 'nikt@x.pl'), 0);
  assert.equal(await unreadBadgeCount(db, null), 0);
});

test('plakietka: błąd bazy → 0 (push i tak wychodzi)', async () => {
  assert.equal(await unreadBadgeCount({ query: async () => { throw new Error('x'); } }, 'ola@x.pl'), 0);
});

test('fn chat-badge: liczba dla zalogowanej osoby', { skip }, async () => {
  let sent;
  const reply = { send(b) { sent = b; return this; } };
  await badgeHandler({ db, user: { email: 'ola@x.pl' } }, reply);
  assert.deepEqual(sent, { count: 1 });
});

test('push Expo: badge przekazany do wiadomości (liczba ≥ 0), bez niego — pole puste', async () => {
  const pool = {
    async query(sql) {
      if (/FROM push_tokens/.test(sql)) return { rows: [{ id: 1, expo_token: 'ExponentPushToken[abc]', platform: 'ios' }] };
      if (/FROM push_subscriptions/.test(sql)) return { rows: [] };
      return { rows: [] };
    },
  };
  const bodies = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return { json: async () => ({ data: [{ status: 'ok', id: 't1' }] }) };
  };
  try {
    await sendPushCore(pool, { user_email: 'ola@x.pl', title: 'Jan', body: 'Hej', badge: 3 });
    await sendPushCore(pool, { user_email: 'ola@x.pl', title: 'Jan', body: 'Hej' });
    await sendPushCore(pool, { user_email: 'ola@x.pl', title: 'Jan', body: 'Hej', badge: -1 });
  } finally {
    globalThis.fetch = origFetch;
  }
  assert.equal(bodies[0][0].badge, 3);
  assert.equal(bodies[1][0].badge, undefined);
  assert.equal(bodies[2][0].badge, undefined);
});
