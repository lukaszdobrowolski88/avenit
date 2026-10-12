// Pasek zakładek mobilki: odczyt zakładki i „czy coś jest otwarte nad zakładkami” ze stanu
// nawigacji — także w kształcie expo-router 57 (dodatkowa warstwa „__root” w korzeniu).
import { describe, expect, it } from 'vitest';
import { readTabsState } from '../../packages/mobile/src/lib/navigation';

const tabs = (index, names = ['dashboard', 'calendar', 'messenger', 'modules', 'account']) => ({
  name: '(tabs)',
  state: { index, routes: names.map((name) => ({ name })) },
});
const app = (routes, index = routes.length - 1) => ({ name: '(app)', state: { index, routes } });

describe('readTabsState', () => {
  it('stary kształt: (app) w korzeniu', () => {
    const root = { index: 0, routes: [app([tabs(1)])] };
    expect(readTabsState(root)).toEqual({ onTabs: true, active: 'calendar' });
  });

  it('expo-router 57: (app) pod __root', () => {
    const root = { index: 0, routes: [{ name: '__root', state: { index: 0, routes: [app([tabs(2)])] } }] };
    expect(readTabsState(root)).toEqual({ onTabs: true, active: 'messenger' });
  });

  it('ekran na wspólnym stosie nad zakładkami: onTabs=false, aktywna = zakładka pod spodem', () => {
    const root = { routes: [{ name: '__root', state: { routes: [app([tabs(3), { name: 'events/[id]' }])] } }] };
    expect(readTabsState(root)).toEqual({ onTabs: false, active: 'modules' });
  });

  it('bez stanu: zapas z segmentów ścieżki', () => {
    expect(readTabsState(undefined, ['(app)', '(tabs)', 'account'])).toEqual({ onTabs: true, active: 'account' });
    expect(readTabsState(undefined, ['(app)', 'events', '[id]'])).toEqual({ onTabs: false, active: 'dashboard' });
  });
});
