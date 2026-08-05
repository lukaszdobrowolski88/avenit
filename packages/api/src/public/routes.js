// Publiczne (bez logowania) trasy. Tenant rozpoznawany po hoście przez contextPlugin
// (req.db/req.tenant). Dostęp do przypisań do służby autoryzuje SAM TOKEN (losowy UUID
// z linku w mailu) — zaproszony jest niezalogowany, więc nie może iść przez /api/db.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function publicPageRoutes(app) {
  // Odczyt przypisań po tokenie (wspólny token = wszystkie służby osoby na tę datę).
  // Zwraca tylko to, co potrzebne stronie akceptacji — bez e-maili i innych danych.
  app.get('/api/public/assignment/:token', { preHandler: app.requireTenant }, async (req, reply) => {
    if (reply.sent) return;
    const token = String(req.params.token || '');
    if (!UUID_RE.test(token)) return reply.code(404).send({ error: 'Nieprawidłowy token' });
    try {
      const { rows } = await req.db.query(
        `SELECT program_id, role_key, assigned_name, assigned_by_name, status
           FROM schedule_assignments WHERE token = $1`,
        [token]
      );
      if (!rows.length) return reply.code(404).send({ error: 'Nie znaleziono przypisania' });
      const { rows: progRows } = await req.db.query(
        `SELECT date, title FROM programs WHERE id = $1`, [rows[0].program_id]
      );
      return reply.send({
        assignments: rows.map((r) => ({
          role_key: r.role_key,
          assigned_name: r.assigned_name,
          assigned_by_name: r.assigned_by_name,
          status: r.status,
        })),
        status: rows[0].status,
        program: progRows[0] ? { date: progRows[0].date, title: progRows[0].title } : null,
      });
    } catch (err) {
      req.log?.error?.({ err }, 'public assignment fetch failed');
      return reply.code(500).send({ error: 'Błąd serwera' });
    }
  });

  // Akceptacja/odrzucenie po tokenie (obejmuje wszystkie służby osoby — wspólny token).
  app.post('/api/public/assignment/:token/respond', { preHandler: app.requireTenant }, async (req, reply) => {
    if (reply.sent) return;
    const token = String(req.params.token || '');
    if (!UUID_RE.test(token)) return reply.code(404).send({ error: 'Nieprawidłowy token' });
    const action = String(req.body?.action || '');
    if (action !== 'accept' && action !== 'reject') return reply.code(400).send({ error: 'Nieprawidłowa akcja' });
    try {
      const { rows } = await req.db.query(
        `SELECT program_id, role_key, assigned_name, status FROM schedule_assignments WHERE token = $1`,
        [token]
      );
      if (!rows.length) return reply.code(404).send({ error: 'Nie znaleziono przypisania' });
      // Idempotencja: jeśli już odpowiedziano, zwróć bieżący status (strona pokaże „już odpowiedziano").
      if (rows[0].status !== 'pending') {
        return reply.send({ ok: true, status: rows[0].status, already: true });
      }
      const newStatus = action === 'accept' ? 'accepted' : 'rejected';
      await req.db.query(
        `UPDATE schedule_assignments SET status = $1, responded_at = now()
          WHERE token = $2 AND status = 'pending'`,
        [newStatus, token]
      );
      // Odrzucenie: usuń osobę ze WSZYSTKICH jej ról w grafiku programu (programs.zespol).
      if (action === 'reject') {
        const { rows: progRows } = await req.db.query(
          `SELECT zespol FROM programs WHERE id = $1`, [rows[0].program_id]
        );
        const zespol = progRows[0]?.zespol;
        if (zespol && typeof zespol === 'object') {
          const updated = { ...zespol };
          for (const r of rows) {
            const names = String(updated[r.role_key] || '').split(',').map((s) => s.trim()).filter(Boolean);
            updated[r.role_key] = names.filter((n) => n !== r.assigned_name).join(', ');
          }
          await req.db.query(
            `UPDATE programs SET zespol = $1::jsonb WHERE id = $2`,
            [JSON.stringify(updated), rows[0].program_id]
          );
        }
      }
      return reply.send({ ok: true, status: newStatus });
    } catch (err) {
      req.log?.error?.({ err }, 'public assignment respond failed');
      return reply.code(500).send({ error: 'Błąd serwera' });
    }
  });

  app.get('/api/public/module-page/:slug', { preHandler: app.requireTenant }, async (req, reply) => {
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
