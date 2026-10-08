import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { makeResolver } from '@avenit/shared/src/permissions/resolve.js';
import { presetGrantRows } from '@avenit/shared/src/permissions/presets.js';
import { ministryGrants } from '@avenit/shared/src/permissions/ministry.js';
import { canModuleScoped } from '@avenit/shared/src/permissions/moduleScope.js';

// Lider Mediów z rolą bazową „członek” (jak w zgłoszeniu: nie mógł dodawać w Grafiku/wydarzeniach/zadaniach).
const h = vi.hoisted(() => ({ perms: null }));
vi.mock('../contexts/PermissionsContext', () => ({ usePermissions: () => h.perms }));

const grants = [
  ...presetGrantRows(),
  ...ministryGrants([{ ministry_key: 'media', role: 'leader' }]).map((g) => ({ role: null, user_id: 'u1', capability: g.capability, allowed: true })),
];
const resolver = makeResolver(grants, { role: 'czlonek', userId: 'u1', isAdmin: false });
h.perms = {
  can: resolver.can,
  canModule: (moduleKey, table, op) => canModuleScoped(resolver.can, moduleKey, table, op),
};

const { useCan } = await import('./Can');
const run = (cap, scope) => renderHook(() => useCan(cap, scope)).result.current;

describe('useCan z zakresem służby', () => {
  it('bez zakresu — jak dotąd (prawo globalne)', () => {
    expect(run('res:events:create')).toBe(false);
    expect(run('res:board_columns:create')).toBe(false);
    expect(run('module:media')).toBe(true);
  });

  it('wydarzenia: kalendarz własnej służby tak, cudzej nie', () => {
    expect(run('res:events:create', { module: 'media' })).toBe(true);
    expect(run('res:events:update', { module: 'media' })).toBe(true);
    expect(run('res:events:create', { module: 'worship' })).toBe(false);
  });

  it('tablica: struktura tablicy Mediów (także z importu po source_kind), nie Projektów', () => {
    expect(run('res:board_columns:create', { board: { module_key: 'media' } })).toBe(true);
    expect(run('res:board_groups:delete', { board: { module_key: null, source_kind: 'media_tasks' } })).toBe(true);
    expect(run('res:board_columns:create', { board: { module_key: null, source_kind: null } })).toBe(false);
    expect(run('res:board_columns:create', { board: null })).toBe(false); // tablica jeszcze się ładuje
    expect(run('res:board_items:create', { board: null })).toBe(true); // globalnie (preset członka)
  });

  it('capability spoza wspólnych tabel ignoruje zakres', () => {
    expect(run('res:members:read', { module: 'media' })).toBe(false);
    expect(run('res:media_team:delete', { module: 'media' })).toBe(true);
  });
});
