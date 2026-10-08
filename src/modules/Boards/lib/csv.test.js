import { describe, it, expect } from 'vitest';
import { parseCsv, buildCellsFromRecord, parseDateText } from './csv';

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

describe('import CSV — daty w formacie z eksportu', () => {
  it('parseDateText przyjmuje ISO i dd.mm.yyyy', () => {
    expect(parseDateText('2026-10-12')).toBe('2026-10-12');
    expect(parseDateText('2026-10-12T08:00:00Z')).toBe('2026-10-12');
    expect(parseDateText('12.10.2026')).toBe('2026-10-12');
    expect(parseDateText('1.2.2026')).toBe('2026-02-01');
    expect(parseDateText('jutro')).toBe(null);
  });
  it('kolumny daty i osi czasu wracają do zapisu z bazy', () => {
    const cols = [{ id: 'd', name: 'Termin', type: 'date' }, { id: 't', name: 'Okres', type: 'timeline' }];
    expect(buildCellsFromRecord({ Termin: '14.10.2026', Okres: '01.01 – 05.01.2026' }, cols))
      .toEqual({ d: '2026-10-14', t: { start: '2026-01-01', end: '2026-01-05' } });
    expect(buildCellsFromRecord({ Termin: 'bzdura' }, cols)).toEqual({});
  });
});
