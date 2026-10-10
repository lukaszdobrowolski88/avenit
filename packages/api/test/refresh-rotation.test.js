// Rotacja refresh tokenów z odzyskaniem zgubionej odpowiedzi (migracja 100, src/auth/tokens.js):
// telefon uśpił aplikację w trakcie odświeżania → stary token przy kolejnym starcie nadal działa,
// dopóki jego następca nie został użyty; powtórka po użyciu następcy i token po wylogowaniu — odrzucone.
//
// PGlite: test pomija się, gdy modułu brak (PGLITE_MODULE=/…/@electric-sql/pglite/dist/index.js).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rotateRefreshToken, revokeRefreshToken, newRefreshToken, storeRefreshToken } from '../src/auth/tokens.js';

let PGlite = null;
try { ({ PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')); } catch { PGlite = null; }
const skip = PGlite ? false : 'brak @electric-sql/pglite (ustaw PGLITE_MODULE)';

let db;
before(async () => {
  if (skip) return;
  const pg = new PGlite();
  db = { query: async (sql, params) => { const r = await pg.query(sql, params); return { rows: r.rows }; } };
  await pg.exec(`CREATE TABLE refresh_tokens (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL,
    token_hash text UNIQUE NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz DEFAULT now(), revoked_at timestamptz, user_agent text)`);
  const sql = fs.readFileSync(new URL('../db/tenant-migrations/100_refresh_token_successor.sql', import.meta.url), 'utf8');
  await pg.exec(sql);
  await pg.exec(sql); // idempotentna
});

const rotate = (t) => rotateRefreshToken(db, 'refresh_tokens', 'user_id', t, 'test');
async function login(user = 'u1') {
  const t = newRefreshToken();
  await storeRefreshToken(db, 'refresh_tokens', 'user_id', user, t.hash, 'test');
  return t.token;
}

test('zwykła rotacja: nowy token, stary nie działa po użyciu nowego', { skip }, async () => {
  const t0 = await login();
  const r1 = await rotate(t0);
  assert.equal(r1.userId, 'u1');
  assert.ok(r1.token && r1.token !== t0);
  const r2 = await rotate(r1.token);
  assert.ok(r2.token);
  assert.equal(await rotate(t0), null, 'powtórka starego tokenu po użyciu następcy — odrzucona');
  // r1 → r2 (r2 jeszcze nieużyty): to wygląda jak zgubiona odpowiedź — odzyskanie jest poprawne.
  assert.equal((await rotate(r1.token)).recovered, true);
  assert.equal(await rotate(r2.token), null, 'r2 unieważniony przy odzyskaniu');
});

test('zgubiona odpowiedź (uśpiona aplikacja): stary token odzyskuje sesję — także kilka razy z rzędu', { skip }, async () => {
  const t0 = await login('u2');
  const lost1 = await rotate(t0); // odpowiedź nie dotarła do telefonu
  const rec1 = await rotate(t0);
  assert.equal(rec1.recovered, true);
  assert.equal(rec1.userId, 'u2');
  assert.equal(await rotate(lost1.token), null, 'zgubiony następca już nie działa');
  const rec2 = await rotate(t0); // znowu zgubiona
  assert.equal(rec2.recovered, true);
  assert.equal(await rotate(rec1.token), null);
  // Telefon w końcu zapisał rec2 i używa go normalnie.
  const ok = await rotate(rec2.token);
  assert.ok(ok.token);
  assert.equal(ok.recovered, undefined);
  assert.equal(await rotate(t0), null, 'po użyciu następcy stary token nie wraca');
});

test('wylogowanie i wygaśnięcie kończą sesję (bez odzyskiwania)', { skip }, async () => {
  const t0 = await login('u3');
  const r1 = await rotate(t0);
  await revokeRefreshToken(db, 'refresh_tokens', r1.token);
  assert.equal(await rotate(r1.token), null, 'wylogowany token');
  assert.equal(await rotate(t0), null, 'stary token po wylogowaniu następcy');
  const t1 = await login('u4');
  await db.query(`UPDATE refresh_tokens SET expires_at = now() - interval '1 minute'`);
  assert.equal(await rotate(t1), null);
  assert.equal(await rotate('nieistniejacy'), null);
});
