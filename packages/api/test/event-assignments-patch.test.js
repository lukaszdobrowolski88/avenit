// Grafik: zmiana jednej ścieżki [służba, pole] nie rusza pozostałych służb.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOps, validateOps } from '../src/fn/event-assignments-patch.js';

test('zmiana pola jednej służby zostawia inne służby', () => {
  const before = { worship: { lider: 'Ania', notatki: 'x' }, media: { kamera: 'Bartek' } };
  const after = applyOps(before, [{ team: 'worship', key: 'notatki', value: 'y' }]);
  assert.deepEqual(after, { worship: { lider: 'Ania', notatki: 'y' }, media: { kamera: 'Bartek' } });
  assert.equal(before.worship.notatki, 'x'); // bez mutacji wejścia
});

test('null usuwa pole albo sekcję; brak sekcji tworzy ją', () => {
  assert.deepEqual(applyOps(null, [{ team: 'kids', key: 'sala', value: 'A' }]), { kids: { sala: 'A' } });
  assert.deepEqual(applyOps({ kids: { sala: 'A', b: 1 } }, [{ team: 'kids', key: 'sala', value: null }]), { kids: { b: 1 } });
  assert.deepEqual(applyOps({ kids: { sala: 'A' }, media: {} }, [{ team: 'kids', value: null }]), { media: {} });
});

test('walidacja ops', () => {
  assert.ok(validateOps([]));
  assert.ok(validateOps([{ team: "x'; drop", key: 'a', value: 1 }]));
  assert.ok(validateOps([{ team: 'worship', value: 'tekst' }]));
  assert.equal(validateOps([{ team: 'worship', key: 'role_1', value: 'Ania, Ola' }]), null);
});

test('klucze ról z polskimi literami i spacją są dozwolone', () => {
  assert.equal(validateOps([{ team: 'worship', key: 'Gitara basowa – ł', value: 'Ola' }]), 'Nieprawidłowe pole grafiku'); // półpauza spoza zbioru
  assert.equal(validateOps([{ team: 'worship', key: 'Gitara basowa ł', value: 'Ola' }]), null);
});
