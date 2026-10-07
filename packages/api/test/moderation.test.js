import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskProfanity, filterUserContent } from '../src/lib/moderation.js';

test('maskuje polskie wulgaryzmy z odmianą i przedrostkami', () => {
  assert.equal(maskProfanity('co za kurwa'), 'co za k****');
  assert.equal(maskProfanity('Spierdalaj stąd'), 'S********* stąd');
  assert.equal(maskProfanity('zajebisty dzień'), 'z******** dzień');
  assert.equal(maskProfanity('ty cipo'), 'ty c***');
});

test('maskuje angielskie wulgaryzmy tylko jako całe słowa', () => {
  assert.equal(maskProfanity('what the fuck'), 'what the f***');
  assert.equal(maskProfanity('This is shit.'), 'This is s***.');
  assert.equal(maskProfanity('Izrael rozbił obóz w Shittim'), 'Izrael rozbił obóz w Shittim');
  assert.equal(maskProfanity('Scunthorpe'), 'Scunthorpe');
});

test('nie rusza zwykłych słów zawierających podobne litery', () => {
  for (const ok of ['participate', 'principal', 'ciotka przyjedzie', 'szmatka do kurzu', 'Hujar', 'Jebus — dawna nazwa Jerozolimy', 'pedałować na rowerze']) {
    assert.equal(maskProfanity(ok), ok, ok);
  }
});

test('filterUserContent działa tylko na kolumnach treści wskazanych tabel', () => {
  const q = { table: 'messages', op: 'insert', values: { content: 'kurwa mać', sender_email: 'kurwa@x.pl' } };
  filterUserContent(q);
  assert.equal(q.values.content, 'k**** mać');
  assert.equal(q.values.sender_email, 'kurwa@x.pl');

  const p = { table: 'prayer_requests', op: 'update', values: [{ content: 'chuj', category: 'chuj' }] };
  filterUserContent(p);
  assert.equal(p.values[0].content, 'c***');
  assert.equal(p.values[0].category, 'chuj');

  const other = { table: 'songs', op: 'insert', values: { title: 'kurwa' } };
  filterUserContent(other);
  assert.equal(other.values.title, 'kurwa');

  const sel = { table: 'messages', op: 'select', values: null };
  filterUserContent(sel);
});
