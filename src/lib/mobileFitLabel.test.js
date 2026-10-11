import { describe, it, expect } from 'vitest';
import { fitLabelLines } from '../../packages/mobile/src/lib/fitLabel';

// Mobilka: podpisy w wąskich miejscach nie łamią słów w środku („Nieobecnośc/i”).
describe('fitLabelLines (mobilka)', () => {
  const tile = { width: 74, fontSize: 12 };
  it('jedno słowo — zawsze jedna linia (zmniejszenie zamiast łamania)', () => {
    for (const w of ['Nieobecności', 'Udostępnione', 'Hojność', 'Materiały']) expect(fitLabelLines(w, tile)).toBe(1);
  });
  it('kilka krótkich słów — łamanie między słowami (do 2 linii)', () => {
    expect(fitLabelLines('Moje zadania', tile)).toBe(2);
    expect(fitLabelLines('Baza pieśni i nut', tile)).toBe(2);
  });
  it('słowo dłuższe niż linia — jedna linia', () => {
    expect(fitLabelLines('Udostępnione materiały', tile)).toBe(1);
    expect(fitLabelLines('Przypisane osoby', { width: 84, fontSize: 13 })).toBe(2);
    expect(fitLabelLines('Odpowiedzialni koordynatorzy', { width: 84, fontSize: 13 })).toBe(1);
  });
});
