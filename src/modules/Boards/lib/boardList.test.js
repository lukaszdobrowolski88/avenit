import { describe, it, expect } from 'vitest';
import { filterBoards, filterTemplates, groupByFolder, canSeeBoard, isBoardOwner, isSystemTaskBoard } from './boardList';

const B = [
  { id: 1, name: 'Aktywna', is_archived: false },
  { id: 2, name: 'Stara', is_archived: true },
  { id: 3, name: 'Szablon', is_template: true },
  { id: 4, name: 'Prywatna cudza', visibility: 'private', owner_email: 'inny@x.pl' },
  { id: 5, name: 'Prywatna moja', visibility: 'private', owner_email: 'Ja@X.pl' },
  { id: 6, name: 'Edytor', visibility: 'private', owner_email: 'inny@x.pl', editors: ['JA@x.pl'] },
  { id: 7, name: 'Szablon prywatny', is_template: true, visibility: 'private', owner_email: 'inny@x.pl' },
];

describe('filterBoards (archiwum)', () => {
  it('aktywne: bez archiwum, szablonów i cudzych prywatnych', () => {
    expect(filterBoards(B, { email: 'ja@x.pl' }).map((b) => b.id)).toEqual([1, 5, 6]);
  });
  it('archiwum: tylko zarchiwizowane', () => {
    expect(filterBoards(B, { archived: true, email: 'ja@x.pl' }).map((b) => b.id)).toEqual([2]);
  });
  it('szablony widoczne dla mnie, alfabetycznie', () => {
    expect(filterTemplates(B, 'ja@x.pl').map((b) => b.id)).toEqual([3]);
  });
});

describe('właściciel i widoczność', () => {
  it('isBoardOwner bez względu na wielkość liter, awaryjnie created_by', () => {
    expect(isBoardOwner({ owner_email: 'Ja@X.pl' }, 'ja@x.pl')).toBe(true);
    expect(isBoardOwner({ owner_email: null, created_by: 'ja@x.pl' }, 'JA@x.pl')).toBe(true);
    expect(isBoardOwner({ owner_email: 'inny@x.pl' }, 'ja@x.pl')).toBe(false);
    expect(isBoardOwner({ owner_email: 'ja@x.pl' }, '')).toBe(false);
  });
  it('canSeeBoard: prywatna dla właściciela i edytorów', () => {
    expect(canSeeBoard(B[3], 'ja@x.pl')).toBe(false);
    expect(canSeeBoard(B[5], 'ja@x.pl')).toBe(true);
  });
  it('tablica zadań służby / Kalendarza jest systemowa', () => {
    expect(isSystemTaskBoard({ source_kind: 'media_tasks', module_key: 'media' })).toBe(true);
    expect(isSystemTaskBoard({ source_kind: 'tasks' })).toBe(true);
    expect(isSystemTaskBoard({ module_key: 'media' })).toBe(false);
  });
});

describe('groupByFolder', () => {
  it('foldery alfabetycznie, potem bez folderu', () => {
    const g = groupByFolder([{ id: 1, folder: 'Zeta' }, { id: 2 }, { id: 3, folder: 'Alfa' }]);
    expect(g.map((x) => x.folder)).toEqual(['Alfa', 'Zeta', null]);
  });
});
