// Domyślny pulpit kościoła (app_settings.dashboard_default_layout):
//  • użytkownik bez własnego układu → układ kościoła; z własnym → zostaje własny;
//  • wiersz założony przez mobilkę (layout = {}) to NIE własny układ weba;
//  • nieznane widżety pomijane, brakujące dopisane; „Przywróć domyślne” = układ kościoła;
//  • „Ustaw jako domyślny dla wszystkich” zapisuje app_settings (z zachowaniem mobile_layout).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import {
  DEFAULT_LAYOUT, DASHBOARD_DEFAULT_LAYOUT_KEY, WIDGET_DEFINITIONS, parseTenantDefault, resolveLayout,
} from '../utils/layoutDefaults';
import { DEFAULT_DASHBOARD_LAYOUT } from '../../../../packages/api/src/admin/tenant-defaults.js';

const db = { own: null, tenant: null, upserts: [] };

vi.mock('../../../lib/supabase', () => {
  const from = (table) => {
    const q = { table, filters: {} };
    const chain = {
      select: () => chain,
      eq: (col, val) => { q.filters[col] = val; return chain; },
      maybeSingle: () => {
        if (table === 'user_dashboard_layouts') {
          return Promise.resolve({ data: db.own === null ? null : { layout: db.own }, error: null });
        }
        if (table === 'app_settings' && q.filters.key === 'dashboard_default_layout') {
          return Promise.resolve({ data: db.tenant === null ? null : { value: db.tenant }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      upsert: (row, opts) => { db.upserts.push({ table, row, opts }); return Promise.resolve({ error: null }); },
    };
    return chain;
  };
  return { supabase: { from } };
});

import { useDashboardLayout } from './useDashboardLayout';

const TENANT = [
  { widgetId: 'welcome', order: 0, size: 'large', visible: true },
  { widgetId: 'ministry', order: 1, size: 'small', visible: true },
  { widgetId: 'quickAccess', order: 2, size: 'medium', visible: false },
  { widgetId: 'nieistniejacy', order: 3, size: 'small', visible: true },
];
const OWN = [
  { widgetId: 'birthdays', order: 0, size: 'large', visible: true },
  { widgetId: 'welcome', order: 1, size: 'large', visible: false },
];

const ids = (l) => l.map((w) => w.widgetId);

beforeEach(() => {
  localStorage.clear();
  db.own = null; db.tenant = null; db.upserts = [];
});

describe('useDashboardLayout — domyślny układ kościoła', () => {
  it('użytkownik bez własnego układu dostaje układ kościoła', async () => {
    db.tenant = JSON.stringify({ layout: TENANT, mobile_layout: null });
    const { result } = renderHook(() => useDashboardLayout('a@x.pl'));
    await waitFor(() => expect(result.current.layout[2]?.widgetId).toBe('quickAccess'));
    const l = result.current.layout;
    expect(ids(l).slice(0, 3)).toEqual(['welcome', 'ministry', 'quickAccess']);
    expect(l.find((w) => w.widgetId === 'ministry').size).toBe('small');
    expect(l.find((w) => w.widgetId === 'quickAccess').visible).toBe(false);
    expect(ids(l)).not.toContain('nieistniejacy');
    expect(l).toHaveLength(Object.keys(WIDGET_DEFINITIONS).length); // brakujące dopisane
    expect(db.upserts).toHaveLength(0); // sam odczyt nie zakłada wiersza użytkownika
  });

  it('użytkownik z własnym układem zachowuje swój', async () => {
    db.tenant = JSON.stringify({ layout: TENANT, mobile_layout: null });
    db.own = OWN;
    const { result } = renderHook(() => useDashboardLayout('a@x.pl'));
    await waitFor(() => expect(result.current.layout[0]?.widgetId).toBe('birthdays'));
    expect(result.current.layout[0].size).toBe('large');
    expect(result.current.layout.find((w) => w.widgetId === 'welcome').visible).toBe(false);
  });

  it('wiersz z mobilki (layout = {}) → układ kościoła', async () => {
    db.tenant = JSON.stringify({ layout: TENANT, mobile_layout: null });
    db.own = {};
    const { result } = renderHook(() => useDashboardLayout('a@x.pl'));
    await waitFor(() => expect(result.current.layout[2]?.widgetId).toBe('quickAccess'));
  });

  it('brak ustawienia kościoła → domyślny układ z kodu', async () => {
    const { result } = renderHook(() => useDashboardLayout('a@x.pl'));
    await waitFor(() => expect(result.current.tenantDefault).toBeNull());
    expect(result.current.layout).toEqual(DEFAULT_LAYOUT);
  });

  it('„Przywróć domyślne” wraca do układu kościoła', async () => {
    db.tenant = JSON.stringify({ layout: TENANT, mobile_layout: null });
    db.own = OWN;
    const { result } = renderHook(() => useDashboardLayout('a@x.pl'));
    await waitFor(() => expect(result.current.tenantDefault).not.toBeNull());
    act(() => { result.current.resetLayout(); });
    await waitFor(() => expect(result.current.layout[2]?.widgetId).toBe('quickAccess'));
    const up = db.upserts.find((u) => u.table === 'user_dashboard_layouts');
    expect(ids(up.row.layout).slice(0, 3)).toEqual(['welcome', 'ministry', 'quickAccess']);
  });

  it('„Ustaw jako domyślny dla wszystkich” zapisuje app_settings i zachowuje mobile_layout', async () => {
    const mobile = { v: 1, sections: [] };
    db.tenant = JSON.stringify({ layout: TENANT, mobile_layout: mobile });
    db.own = OWN;
    const { result } = renderHook(() => useDashboardLayout('a@x.pl'));
    await waitFor(() => expect(result.current.layout[0]?.widgetId).toBe('birthdays'));
    await act(async () => { await result.current.saveAsTenantDefault(); });
    const up = db.upserts.find((u) => u.table === 'app_settings');
    expect(up.row.key).toBe(DASHBOARD_DEFAULT_LAYOUT_KEY);
    expect(up.opts).toEqual({ onConflict: 'key' });
    const v = JSON.parse(up.row.value);
    expect(v.layout[0].widgetId).toBe('birthdays');
    expect(v.mobile_layout).toEqual(mobile);
  });
});

describe('parseTenantDefault / resolveLayout', () => {
  it('toleruje śmieci, gołą tablicę i podwójny JSON', () => {
    expect(parseTenantDefault(null)).toBeNull();
    expect(parseTenantDefault('{zepsute')).toBeNull();
    expect(parseTenantDefault(JSON.stringify(TENANT)).layout).toEqual(TENANT);
    expect(parseTenantDefault(JSON.stringify(JSON.stringify({ layout: TENANT }))).layout).toEqual(TENANT);
    expect(resolveLayout(null, parseTenantDefault('{"layout":[]}'))).toEqual(DEFAULT_LAYOUT);
  });

  it('układ seedowany dla nowych kościołów używa tylko istniejących widżetów (komplet 13)', () => {
    const known = Object.keys(WIDGET_DEFINITIONS);
    expect(DEFAULT_DASHBOARD_LAYOUT.every((w) => known.includes(w.widgetId))).toBe(true);
    expect(ids(DEFAULT_DASHBOARD_LAYOUT).sort()).toEqual([...known].sort());
    expect(resolveLayout(null, { layout: DEFAULT_DASHBOARD_LAYOUT })).toEqual(DEFAULT_DASHBOARD_LAYOUT);
  });
});
