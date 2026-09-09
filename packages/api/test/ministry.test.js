// Testy wyprowadzania uprawnień z przynależności do służb (Faza 1 modelu ról).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { membershipCapabilities, ministryGrants } from '@avenit/shared/src/permissions/ministry.js';
import { can } from '@avenit/shared/src/permissions/resolve.js';
import { MODULES } from '@avenit/shared/src/permissions/catalog.js';

const hasCap = (caps, c) => caps.includes(c);

test('leader modułu systemowego: dostęp do modułu + usuwanie zasobów + akcje', () => {
  const media = MODULES.find((m) => m.key === 'media') || MODULES.find((m) => m.resources.length);
  const key = media.key;
  const caps = membershipCapabilities(key, 'leader');
  assert.ok(hasCap(caps, `module:${key}`));
  assert.ok(hasCap(caps, `tab:${key}:*`));
  const r = media.resources[0];
  assert.ok(hasCap(caps, `res:${r}:delete`), 'leader ma usuwanie');
  for (const a of media.actions || []) assert.ok(hasCap(caps, `action:${key}:${a.key}`));
});

test('member: współpraca bez usuwania i bez akcji', () => {
  const media = MODULES.find((m) => m.key === 'media') || MODULES.find((m) => m.resources.length);
  const key = media.key;
  const caps = membershipCapabilities(key, 'member');
  const r = media.resources[0];
  assert.ok(hasCap(caps, `res:${r}:read`));
  assert.ok(hasCap(caps, `res:${r}:update`));
  assert.ok(!hasCap(caps, `res:${r}:delete`), 'member NIE ma usuwania');
  for (const a of media.actions || []) assert.ok(!hasCap(caps, `action:${key}:${a.key}`), 'member NIE ma akcji');
});

test('moduł własny (kreator): zasoby custom_<key>_*', () => {
  const caps = membershipCapabilities('kobiety', 'leader');
  assert.ok(hasCap(caps, 'module:kobiety'));
  assert.ok(hasCap(caps, 'res:custom_kobiety_tasks:delete'));
  assert.ok(hasCap(caps, 'res:custom_kobiety_members:read'));
});

test('ministryGrants: płaskie granty allowed, bez duplikatów, działają w resolverze', () => {
  const grants = ministryGrants([
    { ministry_key: 'media', role: 'member' },
    { ministry_key: 'media', role: 'leader' }, // nakładka — dubel capability nie powiela
  ]);
  assert.ok(grants.every((g) => g.allowed === true));
  const keys = grants.map((g) => g.capability);
  assert.equal(keys.length, new Set(keys).size, 'brak duplikatów');
  // Resolver: osoba bez roli, tylko z grantem przynależności, dostaje dostęp do modułu.
  const rows = grants.map((g) => ({ role: null, user_id: 'u1', capability: g.capability, allowed: g.allowed }));
  assert.equal(can(rows, { role: 'czlonek', userId: 'u1' }, 'module:media'), true);
});

test('ministryGrants: puste/niepełne wejście nie wywala', () => {
  assert.deepEqual(ministryGrants(), []);
  assert.deepEqual(ministryGrants([{}, { role: 'leader' }]), []);
});
