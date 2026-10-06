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

// ── Grafik na wydarzeniu: atomowe zmiany events.assignments (fn event-assignments-patch) ──
// Klient NIE wysyła już całego obiektu assignments (ostatni zapis kasował cudze przypisania),
// tylko listę zmienionych ścieżek [służba, pole]. value null = usuń pole; key null = cała sekcja.
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const sameVal = (a, b) => (isObj(a) || isObj(b) || Array.isArray(a) || Array.isArray(b)
  ? JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
  : (a ?? null) === (b ?? null));

// Różnica dwóch stanów assignments → ops [{ team, key, value }] tylko dla zmienionych pól.
export function diffAssignmentOps(prev, next) {
  const p = isObj(prev) ? prev : {};
  const n = isObj(next) ? next : {};
  const ops = [];
  for (const team of new Set([...Object.keys(p), ...Object.keys(n)])) {
    const before = p[team];
    const after = n[team];
    if (!(team in n)) { ops.push({ team, key: null, value: null }); continue; }
    if (!isObj(after)) {
      if (!sameVal(before, after)) ops.push({ team, key: null, value: after ?? null });
      continue;
    }
    const b = isObj(before) ? before : {};
    for (const key of new Set([...Object.keys(b), ...Object.keys(after)])) {
      if (!(key in after)) { if (key in b) ops.push({ team, key, value: null }); continue; }
      if (!sameVal(b[key], after[key])) ops.push({ team, key, value: after[key] ?? null });
    }
  }
  return ops;
}

// Serwer przyjmuje maks. 50 zmian na wywołanie.
export function chunkOps(ops, size = 50) {
  const out = [];
  for (let i = 0; i < (ops || []).length; i += size) out.push(ops.slice(i, i + size));
  return out;
}

// Ponowne przypisanie osoby, która ma już wiersz w schedule_assignments (np. odrzuciła).
// Zwraca pola do zapisania obok danych bazowych. Gdy przypisanie trzeba potwierdzić od nowa
// (odrzucone, zmieniony e-mail, wcześniej zaakceptowane pod innym adresem) — zerujemy
// email_sent_at i wymieniamy token, żeby „Wyślij” znów objął tę osobę, a stary link z maila
// przestał działać. Zaakceptowane / już wysłane pod tym samym adresem zostają bez zmian.
export function reassignFields(existing, { assignedEmail, isSelfAssignment, newToken }) {
  const now = new Date().toISOString();
  if (isSelfAssignment) return { status: 'accepted', responded_at: now };
  const sameEmail = String(existing?.assigned_email || '').toLowerCase() === String(assignedEmail || '').toLowerCase();
  if (existing && sameEmail && (existing.status === 'accepted' || existing.status === 'pending')) {
    return {}; // nic się nie zmieniło dla zaproszonego — nie wysyłamy drugi raz
  }
  const reset = { status: 'pending', responded_at: null, email_sent_at: null };
  if (newToken) reset.token = newToken; // nowy token unieważnia stary link „Odrzucam/Akceptuję”
  return reset;
}

// Statusy przypisań jednej służby na wydarzeniu (komórka „Wyślij” w grafiku).
// toSend = oczekujące z e-mailem, do których nie wyszedł jeszcze mail;
// noEmail = oczekujące bez e-maila (nie dostaną zaproszenia — trzeba je pokazać, nie pomijać po cichu).
export function eventInviteSummary(assignments, eventId, teamType) {
  let accepted = 0, rejected = 0, pending = 0, toSend = 0;
  const noEmail = [];
  for (const a of assignments || []) {
    if (a.event_id !== eventId || a.team_type !== teamType) continue;
    if (a.status === 'accepted') accepted++;
    else if (a.status === 'rejected') rejected++;
    else {
      pending++;
      if (!a.email_sent_at) {
        if (a.assigned_email) toSend++;
        else if (!noEmail.includes(a.assigned_name)) noEmail.push(a.assigned_name);
      }
    }
  }
  return { accepted, rejected, pending, toSend, noEmail };
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

// ── Czy wydarzenie należy do służby ──
// Jedno źródło prawdy dla Grafiku (ScheduleTab), zakładki „Wydarzenia” modułu (EventsTab, sekcja
// „Służymy na”) i „Służb” na wydarzeniu — żeby wszędzie była ta sama lista nabożeństw.
// 0) wydarzenie ma już przypisania tej służby → zawsze należy (nie gubimy danych po zmianie typu/reguły);
// dalej priorytet: override per wydarzenie (events.team_types) → reguła typu (app_settings
// event_type_teams: [{ module_key, event_type, teams: [...] }]) → moduł-służba (module_key === teamType).
const csvList = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
export function eventIncludesTeam(ev, teamType, rules = []) {
  if (!ev || !teamType) return false;
  let all = ev.assignments;
  if (typeof all === 'string') { try { all = JSON.parse(all); } catch { all = null; } }
  const asg = isObj(all) ? all[teamType] : null;
  if (isObj(asg) && Object.entries(asg).some(([k, v]) => k !== 'notatki' && k !== 'absencja' && csvList(v).length)) return true;
  if (ev.team_types != null) return csvList(ev.team_types).includes(teamType);
  const rule = (rules || []).find((r) => (r?.module_key || '') === (ev.module_key || '') && r?.event_type === ev.event_type);
  if (rule && Array.isArray(rule.teams) && rule.teams.length) return rule.teams.includes(teamType);
  return (ev.module_key || '') === teamType; // brak reguły → służba = moduł wydarzenia
}
