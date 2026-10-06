import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOURS, TUTORIALS, HINTS, getChecklist, isTutorialAvailable } from './config';
import { KEY_ICONS } from '../components/navConfig';

// Strażnik samouczków (UXE-09): każdy selektor data-tour z TOURS musi istnieć w kodzie.
// Kroki z `match` (wyszukanie po tekście w module bez data-tour) są zwolnione z wymogu.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '..');
const CONFIG = path.join(HERE, 'config.js'); // sam config zawiera selektory — nie może się „potwierdzać”

function readSources(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) readSources(p, out);
    else if (/\.(jsx?|tsx?)$/.test(e.name) && !/\.test\./.test(e.name) && p !== CONFIG) out.push(fs.readFileSync(p, 'utf8'));
  }
  return out;
}

const sources = readSources(SRC).join('\n');
const known = new Set();
for (const m of sources.matchAll(/data-tour="([^"]+)"/g)) known.add(m[1]);
for (const m of sources.matchAll(/\btour:\s*'([^']+)'/g)) known.add(m[1]); // zakładki ResponsiveTabs

describe('onboarding/config — selektory samouczków', () => {
  for (const [tourId, steps] of Object.entries(TOURS)) {
    steps.forEach((step, i) => {
      it(`${tourId} #${i + 1} wskazuje istniejący element`, () => {
        if (step.match) {
          expect(step.match.selector).toBeTruthy();
          expect(step.match.text || step.match.placeholder).toBeTruthy();
          return;
        }
        const tour = step.selector.match(/data-tour="([^"]+)"/);
        const nav = step.selector.match(/data-nav-key="([^"]+)"/);
        if (tour) expect(known.has(tour[1]), `brak data-tour="${tour[1]}" w src`).toBe(true);
        else if (nav) expect(Object.keys(KEY_ICONS)).toContain(nav[1]);
        else throw new Error(`Nieznany selektor: ${step.selector}`);
      });
    });
  }

  it('menu wskazujemy po kluczu modułu, nie po ścieżce', () => {
    const all = Object.values(TOURS).flat().map((s) => s.selector || '');
    expect(all.some((s) => s.includes('data-tour="nav-'))).toBe(false);
  });

  it('każdy przewodnik w bibliotece ma swój tour', () => {
    TUTORIALS.forEach((tut) => expect(TOURS[tut.id], tut.id).toBeTruthy());
  });

  it('podpowiedzi wskazują istniejące elementy', () => {
    Object.values(HINTS).flat().forEach((h) => {
      const m = h.selector.match(/data-tour="([^"]+)"/);
      expect(m && known.has(m[1])).toBe(true);
    });
  });

  it('checklista admina prowadzi wprost do zakładek Ustawień', () => {
    const steps = getChecklist({ isAdmin: true });
    expect(steps.find((s) => s.id === 'team').action.to).toBe('/settings?tab=users');
    expect(steps.find((s) => s.id === 'modules').action.to).toBe('/settings?tab=modules');
  });
});

describe('isTutorialAvailable', () => {
  const tut = TUTORIALS.find((x) => x.id === 'finance-income');
  it('ukrywa przewodnik bez uprawnienia', () => {
    expect(isTutorialAvailable(tut, { can: () => false })).toBe(false);
    expect(isTutorialAvailable(tut, { can: () => true })).toBe(true);
  });
  it('ukrywa przewodnik po wyłączonym module', () => {
    const modules = [{ key: 'finance', is_enabled: false }];
    expect(isTutorialAvailable(tut, { can: () => true, modules })).toBe(false);
  });
  it('samouczek powitalny zawsze dostępny', () => {
    expect(isTutorialAvailable(TUTORIALS[0], { can: () => false })).toBe(true);
  });
});
