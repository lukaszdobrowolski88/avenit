import { describe, it, expect } from 'vitest';
import { parseNames, deriveAssignments, assignmentFor, countToNotify, statusSummary } from './scheduleBridge';

const members = [
  { full_name: 'Jan Kowalski', email: 'jan@x.pl' },
  { full_name: 'Anna Nowak', email: 'anna@x.pl' },
  { full_name: 'Bez Maila', email: '' },
];
const cols = [{ key: 'naglosnienie', label: 'Nagłośnienie' }, { key: 'propresenter', label: 'Prezentacja' }];

describe('scheduleBridge', () => {
  it('parseNames rozbija listę po przecinku', () => {
    expect(parseNames('Jan Kowalski, Anna Nowak')).toEqual(['Jan Kowalski', 'Anna Nowak']);
    expect(parseNames('')).toEqual([]);
    expect(parseNames(null)).toEqual([]);
  });

  it('deriveAssignments mapuje imiona na role + e-mail (label z kolumny)', () => {
    const produkcja = { naglosnienie: 'Jan Kowalski', propresenter: 'Anna Nowak, Bez Maila', absencja: 'x' };
    const d = deriveAssignments(produkcja, cols, members);
    expect(d).toEqual([
      { roleKey: 'naglosnienie', roleLabel: 'Nagłośnienie', name: 'Jan Kowalski', email: 'jan@x.pl' },
      { roleKey: 'propresenter', roleLabel: 'Prezentacja', name: 'Anna Nowak', email: 'anna@x.pl' },
      { roleKey: 'propresenter', roleLabel: 'Prezentacja', name: 'Bez Maila', email: null },
    ]);
  });

  it('countToNotify liczy RÓŻNE osoby z e-mailem bez wysłanego powiadomienia', () => {
    const produkcja = { naglosnienie: 'Jan Kowalski', propresenter: 'Anna Nowak, Bez Maila' };
    const derived = deriveAssignments(produkcja, cols, members);
    // brak przypisań → wszyscy z e-mailem (Jan, Anna) = 2; Bez Maila pominięty
    expect(countToNotify(derived, [], 1, 'media')).toBe(2);
    // Jan już wysłany → zostaje Anna = 1
    const assignments = [
      { program_id: 1, team_type: 'media', role_key: 'naglosnienie', assigned_name: 'Jan Kowalski', status: 'pending', email_sent_at: '2026-08-19' },
    ];
    expect(countToNotify(derived, assignments, 1, 'media')).toBe(1);
  });

  it('assignmentFor i statusSummary', () => {
    const assignments = [
      { program_id: 1, team_type: 'media', role_key: 'naglosnienie', assigned_name: 'Jan Kowalski', status: 'accepted', email_sent_at: 't' },
      { program_id: 1, team_type: 'media', role_key: 'propresenter', assigned_name: 'Anna Nowak', status: 'rejected', email_sent_at: 't' },
      { program_id: 1, team_type: 'media', role_key: 'propresenter', assigned_name: 'X', status: 'pending', email_sent_at: null },
    ];
    expect(assignmentFor(assignments, 1, 'media', 'naglosnienie', 'Jan Kowalski').status).toBe('accepted');
    expect(assignmentFor(assignments, 1, 'media', 'x', 'y')).toBeNull();
    expect(statusSummary(assignments, 1, 'media')).toEqual({ accepted: 1, rejected: 1, pending: 1, sent: 2, total: 3 });
  });
});
