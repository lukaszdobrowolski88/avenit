// Każda funkcja serwera musi się dać zaimportować — registerFunctions po cichu pomija moduł
// z błędem (np. składni), więc bez tego testu zepsuta funkcja wychodzi dopiero na produkcji.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const dir = new URL('../src/fn/', import.meta.url);
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'index.js');

for (const f of files) {
  test(`fn/${f} się ładuje`, async () => {
    try {
      await import(new URL(f, dir));
    } catch (e) {
      assert.ok(!(e instanceof SyntaxError), `${f}: ${e.message}`);
    }
  });
}
