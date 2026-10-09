import { describe, it, expect } from 'vitest';
import { summarizeColumn } from './summaries';

const mk = (cells) => ({ cells });

describe('summarizeColumn', () => {
  it('number → suma/średnia/liczba (ignoruje puste)', () => {
    const col = { id: 'n', type: 'number' };
    const s = summarizeColumn(col, [mk({ n: 10 }), mk({ n: 20 }), mk({})]);
    expect(s).toMatchObject({ kind: 'number', sum: 30, count: 2 });
    expect(s.avg).toBe(15);
  });

  it('status → bez paska (zwykłe zliczenie, stopka go nie pokazuje)', () => {
    const col = { id: 's', type: 'status', settings: { labels: [{ id: 'a', title: 'A', color: '#1' }] } };
    const s = summarizeColumn(col, [mk({ s: 'a' }), mk({})]);
    expect(s.kind).toBe('count');
    expect(s.filled).toBe(1);
  });

  it('domyślnie → count wypełnionych', () => {
    const col = { id: 't', type: 'text' };
    const s = summarizeColumn(col, [mk({ t: 'x' }), mk({ t: '' }), mk({})]);
    expect(s).toMatchObject({ kind: 'count', filled: 1, total: 3 });
  });
});
