// Publiczne (bez logowania) trasy. Tenant rozpoznawany po hoście przez contextPlugin
// (req.db/req.tenant). Dostęp do przypisań do służby autoryzuje SAM TOKEN (losowy UUID
// z linku w mailu) — zaproszony jest niezalogowany, więc nie może iść przez /api/db.
// Wyjątek: /api/assignment/:id/respond — ta sama odpowiedź z aplikacji (zalogowany, własny wiersz).
import { applyOps } from '../fn/event-assignments-patch.js';
import { emitChange } from '../realtime/hub.js';
import { isAccountForAssignee } from '../lib/assigneeIdentity.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_RE = /^[0-9A-Za-z-]{1,64}$/;
const csvNames = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

// Identyfikatory porównujemy z kolumną w JEJ typie (`id = $1` — Postgres przyjmuje typ parametru
// z kolumny: uuid albo integer zależnie od tenanta) zamiast rzutowania kolumny na tekst, które
// omijało indeks (pełny skan, przy FOR UPDATE w transakcji). Id w złym formacie dla typu kolumny → błąd
// 22P02/22003 → traktujemy jak brak wiersza (404).
export const isInvalidIdError = (err) => err?.code === '22P02' || err?.code === '22003';

// Limity per IP dla tras po tokenie (zgadywanie tokenów / zalewanie odpowiedziami).
export const PUBLIC_RATE_LIMITS = {
  assignmentRead: { max: 60, timeWindow: '10 minutes' },
  assignmentRespond: { max: 20, timeWindow: '10 minutes' },
  selfRespond: { max: 60, timeWindow: '10 minutes' },
  modulePage: { max: 120, timeWindow: '1 minute' },
};
const limited = (key) => ({ config: { rateLimit: PUBLIC_RATE_LIMITS[key] } });

// Odrzucenie: zmiany grafiku wydarzenia (events.assignments) zdejmujące osobę z jej ról.
// Zwraca ops dla applyOps — tylko pola, w których ta osoba faktycznie jest.
export function rejectOps(assignments, rows) {
  const cur = new Map();
  for (const r of rows || []) {
    const section = assignments?.[r.team_type];
    if (!section || typeof section !== 'object' || Array.isArray(section)) continue;
    const k = `${r.team_type}\u0000${r.role_key}`;
    const names = cur.has(k) ? cur.get(k).names : csvNames(section[r.role_key]);
    if (!names.includes(r.assigned_name)) continue;
    cur.set(k, { team: r.team_type, key: r.role_key, names: names.filter((n) => n !== r.assigned_name) });
  }
  return [...cur.values()].map(({ team, key, names }) => ({ team, key, value: names.join(', ') }));
}

const groupBy = (rows, col) => {
  const m = new Map();
  for (const r of rows) { const k = String(r[col]); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
  return m;
};

// Jedna semantyka odpowiedzi dla maila i aplikacji: zmiana statusu (tylko z 'pending',
// UPDATE … RETURNING) i — przy odrzuceniu — zdjęcie osoby z grafiku w TEJ SAMEJ transakcji,
// z blokadą wiersza wydarzenia (FOR UPDATE) i zmianą tylko jej pól (applyOps). Grafik zmienia
// się wyłącznie, gdy status faktycznie się zmienił (wyścig „Akceptuję” + „Odrzucam” nie wymaże
// osoby, która zdążyła zaakceptować).
// whereSql: warunek wyboru wierszy, parametry od $2 (params). Zwraca { updated, status, events }.
export async function respondToAssignments(db, { action, whereSql, params }) {
  const newStatus = action === 'accept' ? 'accepted' : 'rejected';
  const client = await db.connect();
  const changedEvents = [];
  let updated = [];
  try {
    await client.query('BEGIN');
    ({ rows: updated } = await client.query(
      `UPDATE schedule_assignments SET status = $1, responded_at = now()
        WHERE ${whereSql} AND status = 'pending'
        RETURNING id, program_id, event_id, team_type, role_key, assigned_name`,
      [newStatus, ...params]
    ));
    if (!updated.length) {
      await client.query('ROLLBACK');
      return { updated: 0, status: null, events: [] };
    }
    if (action === 'reject') {
      // Grafik na WYDARZENIU: events.assignments[team_type][role_key] (CSV imion).
      for (const [eventId, rows] of groupBy(updated.filter((r) => r.event_id != null), 'event_id')) {
        const { rows: ev } = await client.query('SELECT id, assignments FROM events WHERE id = $1 FOR UPDATE', [eventId]);
        if (!ev[0]) continue;
        const ops = rejectOps(ev[0].assignments, rows);
        if (!ops.length) continue;
        const next = applyOps(ev[0].assignments, ops);
        const { rows: upd } = await client.query(
          'UPDATE events SET assignments = $2::jsonb WHERE id = $1 RETURNING *', [ev[0].id, JSON.stringify(next)]
        );
        if (upd[0]) changedEvents.push(upd[0]);
      }
      // Grafik na PROGRAMIE (stary): programs.zespol[role_key].
      for (const [programId, rows] of groupBy(updated.filter((r) => r.event_id == null && r.program_id != null), 'program_id')) {
        const { rows: pr } = await client.query('SELECT id, zespol FROM programs WHERE id = $1 FOR UPDATE', [programId]);
        const zespol = pr[0]?.zespol;
        if (!zespol || typeof zespol !== 'object') continue;
        const next = { ...zespol };
        let changed = false;
        for (const r of rows) {
          const names = csvNames(next[r.role_key]);
          if (!names.includes(r.assigned_name)) continue;
          next[r.role_key] = names.filter((n) => n !== r.assigned_name).join(', ');
          changed = true;
        }
        if (changed) await client.query('UPDATE programs SET zespol = $2::jsonb WHERE id = $1', [pr[0].id, JSON.stringify(next)]);
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return { updated: updated.length, status: newStatus, events: changedEvents };
}

const emitEvents = (req, events) => {
  if (!events?.length) return;
  try { emitChange(req.tenant.slug, 'events', 'update', events); } catch { /* realtime nieobowiązkowy */ }
};

export default async function publicPageRoutes(app) {
  // Odczyt przypisań po tokenie (wspólny token = wszystkie służby osoby na tę datę).
  // Zwraca tylko to, co potrzebne stronie akceptacji — bez e-maili i innych danych.
  app.get('/api/public/assignment/:token', { preHandler: app.requireTenant, ...limited('assignmentRead') }, async (req, reply) => {
    if (reply.sent) return;
    const token = String(req.params.token || '');
    if (!UUID_RE.test(token)) return reply.code(404).send({ error: 'Nieprawidłowy token' });
    try {
      const { rows } = await req.db.query(
        `SELECT program_id, event_id, role_key, role_label, assigned_name, assigned_by_name, status
           FROM schedule_assignments WHERE token = $1`,
        [token]
      );
      if (!rows.length) return reply.code(404).send({ error: 'Nie znaleziono przypisania' });
      // Kontekst (data/tytuł): wydarzenie (events) lub program (programs). Zwracamy pod `program`
      // dla zgodności ze stroną odpowiedzi (pokazuje date/title niezależnie od źródła).
      let ctx = null;
      if (rows[0].event_id) {
        const { rows: evRows } = await req.db.query(`SELECT date, title FROM events WHERE id = $1`, [rows[0].event_id]);
        ctx = evRows[0] ? { date: evRows[0].date, title: evRows[0].title } : null;
      } else {
        const { rows: progRows } = await req.db.query(`SELECT date, title FROM programs WHERE id = $1`, [rows[0].program_id]);
        ctx = progRows[0] ? { date: progRows[0].date, title: progRows[0].title } : null;
      }
      return reply.send({
        assignments: rows.map((r) => ({
          role_key: r.role_key,
          role_label: r.role_label || null,
          assigned_name: r.assigned_name,
          assigned_by_name: r.assigned_by_name,
          status: r.status,
        })),
        status: rows[0].status,
        program: ctx,
      });
    } catch (err) {
      req.log?.error?.({ err }, 'public assignment fetch failed');
      return reply.code(500).send({ error: 'Błąd serwera' });
    }
  });

  // Akceptacja/odrzucenie po tokenie (obejmuje wszystkie służby osoby — wspólny token).
  app.post('/api/public/assignment/:token/respond', { preHandler: app.requireTenant, ...limited('assignmentRespond') }, async (req, reply) => {
    if (reply.sent) return;
    const token = String(req.params.token || '');
    if (!UUID_RE.test(token)) return reply.code(404).send({ error: 'Nieprawidłowy token' });
    const action = String(req.body?.action || '');
    if (action !== 'accept' && action !== 'reject') return reply.code(400).send({ error: 'Nieprawidłowa akcja' });
    try {
      const result = await respondToAssignments(req.db, { action, whereSql: 'token = $2', params: [token] });
      if (!result.updated) {
        // Nic się nie zmieniło: brak tokenu albo już odpowiedziano (idempotencja — strona pokaże „już odpowiedziano").
        const { rows } = await req.db.query('SELECT status FROM schedule_assignments WHERE token = $1 LIMIT 1', [token]);
        if (!rows.length) return reply.code(404).send({ error: 'Nie znaleziono przypisania' });
        return reply.send({ ok: true, status: rows[0].status, already: true });
      }
      emitEvents(req, result.events);
      return reply.send({ ok: true, status: result.status });
    } catch (err) {
      req.log?.error?.({ err }, 'public assignment respond failed');
      return reply.code(500).send({ error: 'Błąd serwera' });
    }
  });

  // Ta sama odpowiedź z APLIKACJI (Pulpit → Moja służba): zalogowany, tylko własny wiersz
  // (assigned_email = e-mail sesji). Odrzucenie zdejmuje z grafiku tak samo jak link z maila —
  // członek nie ma prawa edytować wydarzenia, więc robi to serwer, nie klient.
  app.post('/api/assignment/:id/respond', { preHandler: [app.requireUser, app.block2FAPending], ...limited('selfRespond') }, async (req, reply) => {
    if (reply.sent) return;
    const id = String(req.params.id || '');
    if (!ID_RE.test(id)) return reply.code(404).send({ error: 'Nie znaleziono przypisania' });
    const action = String(req.body?.action || '');
    if (action !== 'accept' && action !== 'reject') return reply.code(400).send({ error: 'Nieprawidłowa akcja' });
    const email = String(req.user?.email || '');
    if (!email) return reply.code(403).send({ error: 'Brak e-maila w sesji' });
    try {
      // Własny wiersz = konto tej osoby z grafiku — także gdy konto ma inny e-mail niż lista
      // zespołu (powiązania w lib/assigneeIdentity.js). Cudze przypisanie = 404, jak brak wiersza.
      const { rows: own } = await req.db.query(
        'SELECT assigned_email, assigned_name, team_type, status FROM schedule_assignments WHERE id = $1', [id]
      );
      const a = own[0];
      if (!a || !(await isAccountForAssignee(req.db, email, { email: a.assigned_email, name: a.assigned_name, teamType: a.team_type }))) {
        return reply.code(404).send({ error: 'Nie znaleziono przypisania' });
      }
      const result = await respondToAssignments(req.db, { action, whereSql: 'id = $2', params: [id] });
      if (!result.updated) return reply.send({ ok: true, status: a.status, already: true });
      emitEvents(req, result.events);
      return reply.send({ ok: true, status: result.status });
    } catch (err) {
      if (isInvalidIdError(err)) return reply.code(404).send({ error: 'Nie znaleziono przypisania' });
      req.log?.error?.({ err }, 'assignment self respond failed');
      return reply.code(500).send({ error: 'Błąd serwera' });
    }
  });

  app.get('/api/public/module-page/:slug', { preHandler: app.requireTenant, ...limited('modulePage') }, async (req, reply) => {
    if (reply.sent) return;
    const slug = String(req.params.slug || '');
    if (!/^[a-z0-9-]{1,64}$/.test(slug)) return reply.code(404).send({ error: 'Nie znaleziono' });
    try {
      const { rows } = await req.db.query(
        `SELECT t.label AS tab_label, t.layout, m.label AS module_label, m.icon AS module_icon
           FROM app_module_tabs t
           JOIN app_modules m ON m.id = t.module_id
          WHERE t.public_slug = $1 AND t.is_public = true AND t.component_type = 'custom'
          LIMIT 1`,
        [slug]
      );
      if (!rows.length) return reply.code(404).send({ error: 'Strona nie znaleziona lub nieopublikowana' });
      const r = rows[0];
      return reply.send({
        tabLabel: r.tab_label,
        moduleLabel: r.module_label,
        moduleIcon: r.module_icon,
        layout: r.layout || { version: 1, root: [], settings: {} },
      });
    } catch (err) {
      req.log?.error?.({ err }, 'public module-page failed');
      return reply.code(500).send({ error: 'Błąd serwera' });
    }
  });
}
