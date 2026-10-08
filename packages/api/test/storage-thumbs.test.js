// Miniatury zdjęć (?w=) — mniejszy plik obok oryginału, oryginał nietknięty, biała lista szerokości.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { thumbnailFor, safeJoin } from '../src/storage/routes.js';

// sharp jest w zależnościach API (obraz Dockera), ale bywa niezainstalowany lokalnie — wtedy pomijamy.
const sharp = await import('sharp').then((m) => m.default).catch(() => null);
const it = sharp ? test : test.skip;

async function setup() {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), 'thumbs-'));
  const target = safeJoin('schwro', 'public-assets', 'avatar-1.jpg', base);
  await fsp.mkdir(path.dirname(target), { recursive: true });
  await sharp({ create: { width: 1200, height: 1600, channels: 3, background: '#FFBE0B' } }).jpeg().toFile(target);
  return { base, target };
}

it('tworzy miniaturę WebP z krótszym bokiem = w i nie rusza oryginału', async () => {
  const { base, target } = await setup();
  const before = await fsp.stat(target);
  const thumb = await thumbnailFor('schwro', 'public-assets', 'avatar-1.jpg', target, 96, base);
  assert.ok(thumb.endsWith(path.join('.thumbs', 'public-assets', 'avatar-1.jpg@96.webp')));
  const meta = await sharp(thumb).metadata();
  assert.equal(meta.format, 'webp');
  assert.equal(Math.min(meta.width, meta.height), 96);
  assert.equal((await fsp.stat(target)).size, before.size);
  // drugi raz — ten sam plik z cache
  assert.equal(await thumbnailFor('schwro', 'public-assets', 'avatar-1.jpg', target, 96, base), thumb);
});

it('szerokość spoza białej listy i nie-obraz → null (serwujemy oryginał)', async () => {
  const { base, target } = await setup();
  assert.equal(await thumbnailFor('schwro', 'public-assets', 'avatar-1.jpg', target, 97, base), null);
  const pdf = safeJoin('schwro', 'public-assets', 'a.pdf', base);
  await fsp.writeFile(pdf, 'x');
  assert.equal(await thumbnailFor('schwro', 'public-assets', 'a.pdf', pdf, 96, base), null);
});

it('ścieżka miniatury nie wychodzi poza katalog tenanta', async () => {
  const { base, target } = await setup();
  assert.equal(await thumbnailFor('schwro', 'public-assets', '../../inny/x.jpg', target, 96, base), null);
});
