// Testy resolvera uprawnień + spójności katalog↔registry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { can, fieldDenied, makeResolver } from '@avenit/shared/src/permissions/resolve.js';
import { ROLE_PRESETS, presetGrantRows } from '@avenit/shared/src/permissions/presets.js';
import { MODULES, allCapabilities, crudCapability } from '@avenit/shared/src/permissions/catalog.js';
import { REGISTRY } from '../src/dataapi/registry.js';

const rows = (arr) => arr.map((g) => ({ role: g.role ?? null, user_id: g.user_id ?? null, capability: g.capability, allowed: g.allowed }));

test('deny domyślny: brak grantu = brak dostępu', () => {
  assert.equal(can([], { role: 'czlonek' }, 'res:members:create'), false);
});

test('is_admin = zawsze true', () => {
  assert.equal(can([], { role: 'superadmin', isAdmin: true }, 'res:app_permissions:delete'), true);
});

test('wildcard: res:*:read pozwala na res:members:read', () => {
  const g = rows([{ role: 'koordynator', capability: 'res:*:read', allowed: true }]);
  assert.equal(can(g, { role: 'koordynator' }, 'res:members:read'), true);
  assert.equal(can(g, { role: 'koordynator' }, 'res:members:create'), false);
});

test('exact bije wildcard: allow res:*:read + deny res:finance_transactions:read', () => {
  const g = rows([
    { role: 'lider', capability: 'res:*:read', allowed: true },
    { role: 'lider', capability: 'res:finance_transactions:read', allowed: false },
  ]);
  assert.equal(can(g, { role: 'lider' }, 'res:members:read'), true);
  assert.equal(can(g, { role: 'lider' }, 'res:finance_transactions:read'), false);
});

test('override użytkownika bije rolę', () => {
  const g = rows([
    { role: 'czlonek', capability: 'res:members:read', allowed: false },
    { user_id: 'u1', capability: 'res:members:read', allowed: true },
  ]);
  assert.equal(can(g, { role: 'czlonek', userId: 'u1' }, 'res:members:read'), true);
  assert.equal(can(g, { role: 'czlonek', userId: 'u2' }, 'res:members:read'), false);
});

test('pola: opt-out — domyślnie widoczne, jawny zakaz ukrywa', () => {
  const g = rows([{ role: 'lider', capability: 'field:members:phone:read', allowed: false }]);
  assert.equal(fieldDenied(g, { role: 'lider' }, 'members', 'phone', 'read'), true);
  assert.equal(fieldDenied(g, { role: 'lider' }, 'members', 'email', 'read'), false);
  assert.equal(fieldDenied([], { role: 'czlonek' }, 'members', 'phone', 'read'), false);
});

test('preset koordynator: pełny CRUD, ale bez zarządzania uprawnieniami', () => {
  const g = rows(presetGrantRows());
  const sub = { role: 'koordynator' };
  assert.equal(can(g, sub, 'res:members:delete'), true);
  assert.equal(can(g, sub, 'action:mail:send'), true);
  assert.equal(can(g, sub, 'action:settings:manage_permissions'), false);
  assert.equal(can(g, sub, 'action:settings:manage_roles'), false);
});

test('preset lider: bez finansów (zapis) i bez ustawień', () => {
  const g = rows(presetGrantRows());
  const sub = { role: 'lider' };
  assert.equal(can(g, sub, 'res:members:read'), true);
  assert.equal(can(g, sub, 'res:members:create'), true);
  assert.equal(can(g, sub, 'res:finance_transactions:update'), false);
  assert.equal(can(g, sub, 'module:settings'), false);
  assert.equal(can(g, sub, 'tab:media:finances'), false);
});

test('preset czlonek: tylko minimum', () => {
  const g = rows(presetGrantRows());
  const sub = { role: 'czlonek' };
  assert.equal(can(g, sub, 'module:calendar'), true);
  assert.equal(can(g, sub, 'res:prayer_requests:create'), true);
  assert.equal(can(g, sub, 'res:members:read'), false);
  assert.equal(can(g, sub, 'module:finance'), false);
});

test('rada_starszych preset: pełny dostęp przez *', () => {
  const g = rows(presetGrantRows());
  assert.equal(can(g, { role: 'rada_starszych' }, 'action:settings:manage_permissions'), true);
  assert.equal(can(g, { role: 'rada_starszych' }, 'res:app_settings:delete'), true);
});

test('makeResolver: closure can + pola', () => {
  const r = makeResolver(rows(presetGrantRows()), { role: 'czlonek' });
  assert.equal(r.can('module:calendar'), true);
  assert.equal(r.fieldReadable('members', 'phone'), true);
});

test('crudCapability: mapuje op Data API', () => {
  assert.equal(crudCapability('members', 'select'), 'res:members:read');
  assert.equal(crudCapability('members', 'insert'), 'res:members:create');
  assert.equal(crudCapability('members', 'update'), 'res:members:update');
  assert.equal(crudCapability('members', 'delete'), 'res:members:delete');
});

test('spójność: każdy zasób module:X z registry ma pozycję w katalogu', () => {
  const catalogResources = new Set(MODULES.flatMap((m) => m.resources));
  const missing = [];
  for (const [table, rule] of Object.entries(REGISTRY)) {
    const res = rule.resource;
    if (typeof res === 'string' && res.startsWith('module:')) {
      // zasób danych = nazwa tabeli; musi być w katalogu (albo świadomie pominięty)
      if (!catalogResources.has(table)) missing.push(table);
    }
  }
  assert.deepEqual(missing, [], `Tabele module:X spoza katalogu: ${missing.join(', ')}`);
});

test('spójność: każdy zasób katalogu istnieje w registry', () => {
  const missing = MODULES.flatMap((m) => m.resources).filter((r) => !REGISTRY[r] && r !== 'checkins');
  assert.deepEqual(missing, [], `Zasoby katalogu spoza registry: ${missing.join(', ')}`);
});

test('allCapabilities: brak duplikatów i niepusty', () => {
  const caps = allCapabilities();
  assert.ok(caps.length > 100);
  assert.equal(caps.length, new Set(caps).size);
});
