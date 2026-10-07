import { describe, it, expect } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import DialogHost from './DialogHost';
import { confirmDialog, dialogFlags } from '../lib/dialog';

describe('dialogFlags (rozpoznanie usuwania niezależnie od języka)', () => {
  it('PL / EN / UK — usuwanie', () => {
    expect(dialogFlags('Czy na pewno chcesz usunąć tego członka?')).toEqual({ danger: true, isDelete: true });
    expect(dialogFlags('Are you sure you want to delete this member?')).toEqual({ danger: true, isDelete: true });
    expect(dialogFlags('Remove this file?')).toEqual({ danger: true, isDelete: true });
    expect(dialogFlags('Ви впевнені, що хочете видалити цього учасника?')).toEqual({ danger: true, isDelete: true });
  });

  it('nieodwracalne, ale nie usuwanie → danger bez „Usuń”', () => {
    expect(dialogFlags('This cannot be undone. Continue?')).toEqual({ danger: true, isDelete: false });
    expect(dialogFlags('Tej operacji nie można cofnąć — nieodwracalne.')).toEqual({ danger: true, isDelete: false });
    expect(dialogFlags('Цю дію незворотно. Продовжити?')).toEqual({ danger: true, isDelete: false });
  });

  it('zwykłe pytanie → bez danger', () => {
    expect(dialogFlags('Wysłać SMS do 12 odbiorców?')).toEqual({ danger: false, isDelete: false });
    expect(dialogFlags('Send the program to 5 people?')).toEqual({ danger: false, isDelete: false });
  });

  it('jawne opcje mają pierwszeństwo nad treścią', () => {
    expect(dialogFlags({ title: 'Archive?', danger: true })).toEqual({ danger: true, isDelete: false });
    expect(dialogFlags({ title: 'Archive?', danger: true, isDelete: true })).toEqual({ danger: true, isDelete: true });
    expect(dialogFlags({ title: 'Usunąć z listy?', danger: false })).toEqual({ danger: false, isDelete: false });
  });
});

describe('DialogHost', () => {
  it('usuwanie: czerwony „Usuń”, fokus startowy na „Anuluj”, Enter na fokusie anuluje', async () => {
    render(<DialogHost />);
    let p;
    act(() => { p = confirmDialog('Delete this member?'); });
    const cancel = screen.getByRole('button', { name: 'Anuluj' });
    const del = screen.getByRole('button', { name: /Usuń/ });
    expect(del.className).toContain('bg-red-600');
    expect(document.activeElement).toBe(cancel);
    act(() => { fireEvent.click(cancel); });
    await expect(p).resolves.toBe(false);
  });

  it('zwykłe pytanie: przycisk „Kontynuuj” (zamiast ogólnego „Potwierdź”) z fokusem', async () => {
    render(<DialogHost />);
    let p;
    act(() => { p = confirmDialog('Wysłać program do 5 osób?'); });
    const ok = screen.getByRole('button', { name: 'Kontynuuj' });
    expect(document.activeElement).toBe(ok);
    act(() => { fireEvent.click(ok); });
    await expect(p).resolves.toBe(true);
  });

  it('niebezpieczne, ale nie usuwanie: „Tak, kontynuuj”', async () => {
    render(<DialogHost />);
    let p;
    act(() => { p = confirmDialog({ title: 'Zablokować użytkownika?', danger: true }); });
    expect(screen.getByRole('button', { name: 'Tak, kontynuuj' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Anuluj' }));
    act(() => { fireEvent.keyDown(document, { key: 'Escape' }); });
    await expect(p).resolves.toBe(false);
  });
});
