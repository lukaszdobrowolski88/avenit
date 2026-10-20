// Mobilka (packages/mobile/src/lib/storageUrls.ts): które pliki Plików otwierać podpisanym linkiem
// (audyt uprawnień r6 — po r5 przestrzenie wrażliwe kończyły się w aplikacji 403).
import { describe, it, expect } from 'vitest';
import { materialNeedsSignature, materialsPathFromUrl, plainStorageUrl } from '../../packages/mobile/src/lib/storageUrls';
import { buildSignedUrl } from '../../packages/mobile/src/features/messenger/logic';
import { isSignedMaterialsPath } from '@avenit/shared/src/lib/materialsAccess.js';

describe('mobilka — adresy plików z magazynu', () => {
  it('podpis tylko dla przestrzeni wrażliwych — ta sama reguła co serwer i web', () => {
    for (const p of ['finance/1_faktura.pdf', '/members/x.pdf', 'care/a/b.pdf', 'giving/k.pdf']) {
      expect(materialNeedsSignature(p)).toBe(true);
      expect(isSignedMaterialsPath(p.replace(/^\//, ''))).toBe(true);
    }
    for (const p of ['worship/plan.pdf', 'global/r.pdf', 'homegroups/x.pdf', 'general/y.pdf', '', null]) {
      expect(materialNeedsSignature(p)).toBe(false);
    }
  });

  it('ścieżka z adresu materiału wydarzenia; inne buckety — null', () => {
    expect(materialsPathFromUrl('https://schwro.avenit.pl/storage/materials/finance/1_a%20b.pdf')).toBe('finance/1_a b.pdf');
    expect(materialsPathFromUrl('https://schwro.avenit.pl/storage/materials/worship/x.pdf?w=200')).toBe('worship/x.pdf');
    expect(materialsPathFromUrl('https://schwro.avenit.pl/storage/public-assets/finance/x.pdf')).toBe(null);
    expect(materialsPathFromUrl(null)).toBe(null);
  });

  it('zwykły adres na hoście kościoła i podpisany link z odpowiedzi serwera', () => {
    expect(plainStorageUrl('https://schwro.avenit.pl/', 'materials', '/worship/Pieśń 1.pdf'))
      .toBe('https://schwro.avenit.pl/storage/materials/worship/Pie%C5%9B%C5%84%201.pdf');
    expect(buildSignedUrl('https://schwro.avenit.pl', '/storage/materials/finance/f.pdf?exp=1&sig=ab'))
      .toBe('https://schwro.avenit.pl/storage/materials/finance/f.pdf?exp=1&sig=ab');
  });
});
