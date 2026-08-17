import { describe, it, expect } from 'vitest';
import { parseCsv, buildCellsFromRecord } from './csv';

describe('parseCsv', () => {
  it('nagłówek + rekordy', () => {
    const { header, records } = parseCsv('Element,Status\nZadanie 1,Gotowe\nZadanie 2,Do');
    expect(header).toEqual(['Element', 'Status']);
    expect(records).toEqual([{ Element: 'Zadanie 1', Status: 'Gotowe' }, { Element: 'Zadanie 2', Status: 'Do' }]);
  });
  it('cudzysłowy: przecinki i nowe linie w polu', () => {
    const { records } = parseCsv('A,B\n"ma, przecinek","dwie\nlinie"');
    expect(records[0].A).toBe('ma, przecinek');
    expect(records[0].B).toBe('dwie\nlinie');
  });
  it('escaped cudzysłów ("")', () => {
    const { records } = parseCsv('A\n"cytat ""w środku"""');
    expect(records[0].A).toBe('cytat "w środku"');
  });
  it('pomija puste wiersze', () => {
    expect(parseCsv('A\nx\n\n\ny').records).toEqual([{ A: 'x' }, { A: 'y' }]);
  });
});

describe('buildCellsFromRecord', () => {
  const cols = [
    { id: 's', name: 'Status', type: 'status', settings: { labels: [{ id: 'done', title: 'Gotowe' }] } },
    { id: 'n', name: 'Kwota', type: 'number' },
    { id: 'c', name: 'Zrobione', type: 'checkbox' },
    { id: 'f', name: 'Plik', type: 'files' },
  ];
  it('mapuje status po tytule, liczbę, checkbox; pomija files', () => {
    const cells = buildCellsFromRecord({ Status: 'gotowe', Kwota: '1 234,50 zł', Zrobione: 'tak', Plik: 'x' }, cols);
    expect(cells.s).toBe('done');
    expect(cells.n).toBe(1234.5);
    expect(cells.c).toBe(true);
    expect('f' in cells).toBe(false);
  });
  it('checkbox: fałszywe wartości', () => {
    expect(buildCellsFromRecord({ Zrobione: 'nie' }, cols).c).toBe(false);
  });
});
