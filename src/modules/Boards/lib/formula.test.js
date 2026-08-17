import { describe, it, expect } from 'vitest';
import { evalFormula } from './formula';

const cols = [{ id: 'a', name: 'Budżet', type: 'number' }, { id: 'b', name: 'Ocena', type: 'rating' }];
const item = { cells: { a: 10, b: 4 } };

describe('evalFormula', () => {
  it('arytmetyka + podstawienie {Nazwa}', () => {
    expect(evalFormula('{Budżet} * 2 + {Ocena}', item, cols)).toBe(24);
    expect(evalFormula('{Budżet} / 4', item, cols)).toBe(2.5);
    expect(evalFormula('({Budżet} + {Ocena}) * 10', item, cols)).toBe(140);
  });
  it('brakująca kolumna → 0', () => {
    expect(evalFormula('{Nieistnieje} + 1', item, cols)).toBe(1);
  });
  it('dzielenie przez zero → null (Infinity odrzucone)', () => {
    expect(evalFormula('{Budżet} / 0', item, cols)).toBeNull();
  });
  it('puste wyrażenie → null', () => {
    expect(evalFormula('', item, cols)).toBeNull();
    expect(evalFormula(null, item, cols)).toBeNull();
  });
  it('SANITYZACJA: próba wstrzyknięcia kodu → null (bezpieczeństwo)', () => {
    expect(evalFormula('{Budżet}; process.exit()', item, cols)).toBeNull();
    expect(evalFormula('constructor', item, cols)).toBeNull();
    expect(evalFormula('{Budżet}.toString()', item, cols)).toBeNull();
    expect(evalFormula('alert(1)', item, cols)).toBeNull();
  });
});
