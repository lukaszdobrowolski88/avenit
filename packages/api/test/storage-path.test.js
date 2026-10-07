// Ścieżki plików nie mogą wyjść poza katalog swojego bucketu (ani tenanta).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeJoin } from '../src/storage/routes.js';

const base = '/data/storage';
test('zwykła ścieżka zostaje w buckecie', () => {
  assert.equal(safeJoin('schwro', 'finance', 'a/b.pdf', base), '/data/storage/schwro/finance/a/b.pdf');
});
test('wyjście do innego bucketu albo tenanta jest odrzucane', () => {
  assert.throws(() => safeJoin('schwro', 'public-assets', '../membership-declarations/x.pdf', base), (e) => e.status === 400);
  assert.throws(() => safeJoin('schwro', 'public-assets', '../../inny/public-assets/x.png', base), (e) => e.status === 400);
  assert.throws(() => safeJoin('schwro', 'finance', '..', base), (e) => e.status === 400);
});
