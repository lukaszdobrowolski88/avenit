// Mostek: siatka grafiku zespołowego (programs.produkcja = { roleKey: "Imię1, Imię2", ... })
// ↔ wspólna tabela schedule_assignments + silnik powiadomień (send-assignment-invites).
// Dzięki temu MediaTeam / Małe SchWro / Atmosfera mają DOKŁADNIE ten sam mechanizm wysyłki
// (mail + push + akceptacja/odrzucenie + dedup) co Grupa Uwielbienia — bez przebudowy siatek.
// Przypisania powstają „na wysyłce": przycisk synchronizuje produkcję → schedule_assignments.

// Wartość komórki (TableMultiSelect zapisuje listę full_name po przecinku) → tablica imion.
export function parseNames(value) {
  if (!value) return [];
  return String(value).split(',').map((s) => s.trim()).filter(Boolean);
}

// Z produkcji + definicji kolumn-ról + listy członków wyprowadź przypisania.
// roleColumns: [{ key, label }]; members: [{ full_name, email }]. Dopasowanie po full_name.
// Zwraca [{ roleKey, roleLabel, name, email|null }] (email null = osoba bez adresu → nie wyśle).
export function deriveAssignments(produkcja, roleColumns, members) {
  const byName = new Map((members || []).map((m) => [m.full_name, m]));
  const out = [];
  for (const col of roleColumns || []) {
    for (const name of parseNames(produkcja?.[col.key])) {
      const m = byName.get(name);
      out.push({ roleKey: col.key, roleLabel: col.label, name, email: m?.email || null });
    }
  }
  return out;
}

// Wiersz schedule_assignments dla danej osoby/roli (lub null).
export function assignmentFor(assignments, programId, teamType, roleKey, name) {
  return (assignments || []).find(
    (a) => a.program_id === programId && a.team_type === teamType
      && a.role_key === roleKey && a.assigned_name === name
  ) || null;
}

// Ile RÓŻNYCH osób (z e-mailem) czeka na powiadomienie (brak email_sent_at, status pending).
export function countToNotify(derived, assignments, programId, teamType) {
  const emails = new Set();
  for (const d of derived) {
    if (!d.email) continue;
    const a = assignmentFor(assignments, programId, teamType, d.roleKey, d.name);
    if (!a || (!a.email_sent_at && a.status === 'pending')) emails.add(d.email.toLowerCase());
  }
  return emails.size;
}

// Podsumowanie statusów akceptacji dla programu (do wyświetlenia w grafiku).
export function statusSummary(assignments, programId, teamType) {
  let accepted = 0, rejected = 0, pending = 0, sent = 0;
  for (const a of assignments || []) {
    if (a.program_id !== programId || a.team_type !== teamType) continue;
    if (a.status === 'accepted') accepted++;
    else if (a.status === 'rejected') rejected++;
    else pending++;
    if (a.email_sent_at) sent++;
  }
  return { accepted, rejected, pending, sent, total: accepted + rejected + pending };
}
