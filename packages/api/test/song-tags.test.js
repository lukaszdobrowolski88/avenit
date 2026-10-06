// Słownik tagów pieśni: wspólny dla liderów (app_settings `song_tags`), bez duplikatów.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTagOp, parseTags } from '../src/fn/song-tags.js';

test('add: bez duplikatów (wielkość liter) i posortowane', () => {
  assert.deepEqual(applyTagOp(['uwielbienie', 'Kolęda'], { action: 'add', tag: '  Adwent ' }).tags, ['Adwent', 'Kolęda', 'uwielbienie']);
  assert.deepEqual(applyTagOp(['Kolęda'], { action: 'add', tag: 'kolęda' }).tags, ['Kolęda']);
  assert.ok(applyTagOp([], { action: 'add', tag: '   ' }).error);
});

test('remove i rename (scalanie z istniejącym)', () => {
  assert.deepEqual(applyTagOp(['a', 'B', 'c'], { action: 'remove', tag: 'b' }).tags, ['a', 'c']);
  assert.deepEqual(applyTagOp(['wolne', 'Szybkie'], { action: 'rename', tag: 'wolne', to: 'szybkie' }).tags, ['szybkie']);
  assert.deepEqual(applyTagOp(['x'], { action: 'rename', tag: 'x', to: 'Y' }).tags, ['Y']);
});

test('merge — przeniesienie tagów z przeglądarki', () => {
  assert.deepEqual(applyTagOp(['a'], { action: 'merge', tags: ['A', 'b', '', null] }).tags, ['a', 'b']);
  assert.ok(applyTagOp([], { action: 'drop' }).error);
});

test('parseTags czyta text, jsonb i podwójnie zakodowany JSON', () => {
  assert.deepEqual(parseTags('["a","b"]'), ['a', 'b']);
  assert.deepEqual(parseTags(JSON.stringify('["a"]')), ['a']);
  assert.deepEqual(parseTags(['x']), ['x']);
  assert.deepEqual(parseTags(null), []);
  assert.deepEqual(parseTags('nie-json'), []);
});
