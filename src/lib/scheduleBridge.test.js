import { describe, it, expect } from 'vitest';
import {
  parseNames, deriveAssignments, assignmentFor, countToNotify, statusSummary,
  diffAssignmentOps, chunkOps, reassignFields, eventInviteSummary,
} from './scheduleBridge';

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

describe('diffAssignmentOps (atomowy zapis grafiku)', () => {
  it('wysyła tylko zmienione pola — nie dotyka innych służb', () => {
    const prev = { worship: { lider: 'Jan', piano: 'Anna' }, media: { foto: 'Ola' } };
    const next = { worship: { lider: 'Jan', piano: 'Anna, Piotr' }, media: { foto: 'Ola' } };
    expect(diffAssignmentOps(prev, next)).toEqual([{ team: 'worship', key: 'piano', value: 'Anna, Piotr' }]);
  });

  it('usunięte pole → value null; usunięta sekcja → key null', () => {
    const prev = { sec_1: { r_1: 'X' }, worship: { lider: 'Jan', notatki: 'a' } };
    const next = { worship: { lider: 'Jan' } };
    expect(diffAssignmentOps(prev, next)).toEqual([
      { team: 'sec_1', key: null, value: null },
      { team: 'worship', key: 'notatki', value: null },
    ]);
  });

  it('nowa sekcja i brak zmian', () => {
    expect(diffAssignmentOps(null, { kids: { osoba: 'Ala' } })).toEqual([{ team: 'kids', key: 'osoba', value: 'Ala' }]);
    const same = { worship: { lider: 'Jan' } };
    expect(diffAssignmentOps(same, { worship: { lider: 'Jan' } })).toEqual([]);
  });

  it('chunkOps dzieli na paczki po 50', () => {
    const ops = Array.from({ length: 120 }, (_, i) => ({ team: 't', key: `k${i}`, value: 'x' }));
    expect(chunkOps(ops).map((c) => c.length)).toEqual([50, 50, 20]);
    expect(chunkOps([])).toEqual([]);
  });
});

describe('reassignFields (ponowne przypisanie)', () => {
  it('po odrzuceniu zeruje wysyłkę i wymienia token', () => {
    const r = reassignFields({ status: 'rejected', assigned_email: 'a@x.pl' }, { assignedEmail: 'a@x.pl', newToken: 'T2' });
    expect(r).toEqual({ status: 'pending', responded_at: null, email_sent_at: null, token: 'T2' });
  });

  it('zmiana e-maila też wymusza nowe zaproszenie', () => {
    const r = reassignFields({ status: 'pending', assigned_email: 'a@x.pl' }, { assignedEmail: 'b@x.pl', newToken: 'T3' });
    expect(r.email_sent_at).toBeNull();
    expect(r.token).toBe('T3');
  });

  it('zaakceptowane / oczekujące pod tym samym adresem zostają bez zmian', () => {
    expect(reassignFields({ status: 'accepted', assigned_email: 'A@x.pl' }, { assignedEmail: 'a@x.pl' })).toEqual({});
    expect(reassignFields({ status: 'pending', assigned_email: 'a@x.pl' }, { assignedEmail: 'a@x.pl' })).toEqual({});
  });

  it('przypisanie siebie = od razu zaakceptowane', () => {
    const r = reassignFields({ status: 'rejected' }, { assignedEmail: 'a@x.pl', isSelfAssignment: true });
    expect(r.status).toBe('accepted');
    expect(r.responded_at).toBeTruthy();
  });
});

describe('eventInviteSummary', () => {
  it('liczy statusy, do wysłania i osoby bez e-maila', () => {
    const rows = [
      { event_id: 7, team_type: 'media', status: 'accepted', assigned_email: 'a@x', assigned_name: 'A' },
      { event_id: 7, team_type: 'media', status: 'pending', assigned_email: 'b@x', assigned_name: 'B', email_sent_at: null },
      { event_id: 7, team_type: 'media', status: 'pending', assigned_email: 'c@x', assigned_name: 'C', email_sent_at: 't' },
      { event_id: 7, team_type: 'media', status: 'pending', assigned_email: null, assigned_name: 'D' },
      { event_id: 7, team_type: 'media', status: 'rejected', assigned_email: 'e@x', assigned_name: 'E' },
      { event_id: 7, team_type: 'worship', status: 'pending', assigned_email: 'f@x', assigned_name: 'F' },
    ];
    expect(eventInviteSummary(rows, 7, 'media')).toEqual({ accepted: 1, rejected: 1, pending: 3, toSend: 1, noEmail: ['D'] });
  });
});
