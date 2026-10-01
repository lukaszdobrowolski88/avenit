// „Moja niedostępność" (Serve, member-facing) — wolontariusz zarządza WŁASNYMI wpisami
// volunteer_blockouts. member_id ustala SERWER z req.user (app_users.member_id → members.email),
// nigdy z parametru — dlatego nie da się czytać/zmieniać cudzych wpisów. Tabela jest kluczowana
// po member_id (brak user_email), więc bezpośredni odczyt z klienta i tak nie zawężałby do „moich".
// Web ma panel liderski (Serve/AvailabilityTab) dla wszystkich; to jest wariant self-service.
//
// Body: { action: 'list' | 'add' | 'delete', ... }.
//   add:    { start_date, end_date, reason? }  (daty YYYY-MM-DD, end >= start)
//   delete: { id }                              (usuwa tylko gdy member_id == mój)
//
// Brak wpisu w FN_CAPABILITY => preHandler = requireUser (każdy zalogowany).
export const name = 'my-blockouts';
export const method = 'POST';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function resolveMemberId(req) {
  // app_users.member_id (niezawodne) → members.email (fallback).
  try {
    const { rows } = await req.db.query('SELECT member_id FROM app_users WHERE id = $1', [req.user.id]);
    if (rows[0]?.member_id != null) return rows[0].member_id;
  } catch { /* brak kolumny — spróbuj po e-mailu */ }
  try {
    const { rows } = await req.db.query('SELECT id FROM members WHERE lower(email) = lower($1) LIMIT 1', [
      req.user.email,
    ]);
    return rows[0]?.id ?? null;
  } catch {
    return null;
  }
}

export default async function handler(req, reply) {
  if (!req.db || !req.tenant) return reply.code(404).send({ error: 'Nieznany tenant' });
  if (!req.user?.email) return reply.code(401).send({ error: 'Brak sesji' });

  const action = String(req.body?.action || 'list');
  const memberId = await resolveMemberId(req);

  // ── Lista moich niedostępności ──
  if (action === 'list') {
    if (memberId == null) return reply.send({ memberResolved: false, blockouts: [] });
    try {
      const { rows } = await req.db.query(
        `SELECT id,
                to_char(start_date, 'YYYY-MM-DD') AS start_date,
                to_char(end_date,   'YYYY-MM-DD') AS end_date,
                reason
           FROM volunteer_blockouts
          WHERE member_id = $1
          ORDER BY start_date DESC`,
        [memberId]
      );
      return reply.send({ memberResolved: true, blockouts: rows });
    } catch (e) {
      req.log?.error?.(e, 'my-blockouts list failed');
      return reply.send({ memberResolved: true, blockouts: [] });
    }
  }

  // Zapis/usuwanie wymagają powiązanego profilu członka.
  if (memberId == null) {
    return reply.code(400).send({ error: 'Twoje konto nie jest powiązane z profilem członka. Skontaktuj się z liderem.' });
  }

  // ── Dodanie własnej niedostępności ──
  if (action === 'add') {
    const start = String(req.body?.start_date || '');
    const end = String(req.body?.end_date || '');
    const reason = req.body?.reason ? String(req.body.reason).slice(0, 500) : null;
    if (!DATE_RE.test(start) || !DATE_RE.test(end)) {
      return reply.code(400).send({ error: 'Podaj zakres dat (od–do) w formacie RRRR-MM-DD.' });
    }
    if (end < start) {
      return reply.code(400).send({ error: 'Data „do" nie może być wcześniejsza niż „od".' });
    }
    // Kampus z profilu członka (opcjonalny).
    let campusId = null;
    try {
      const { rows } = await req.db.query('SELECT campus_id FROM members WHERE id = $1', [memberId]);
      campusId = rows[0]?.campus_id ?? null;
    } catch { /* brak kolumny — null */ }
    try {
      const { rows } = await req.db.query(
        `INSERT INTO volunteer_blockouts (member_id, start_date, end_date, reason, campus_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, to_char(start_date,'YYYY-MM-DD') AS start_date,
                   to_char(end_date,'YYYY-MM-DD') AS end_date, reason`,
        [memberId, start, end, reason, campusId]
      );
      return reply.send({ ok: true, blockout: rows[0] });
    } catch (e) {
      req.log?.error?.(e, 'my-blockouts add failed');
      return reply.code(500).send({ error: 'Nie udało się zapisać niedostępności.' });
    }
  }

  // ── Usunięcie WŁASNEJ niedostępności (ownership przez member_id w WHERE) ──
  if (action === 'delete') {
    const id = req.body?.id;
    if (!id) return reply.code(400).send({ error: 'Brak id.' });
    try {
      const { rowCount } = await req.db.query(
        'DELETE FROM volunteer_blockouts WHERE id = $1 AND member_id = $2',
        [id, memberId]
      );
      if (!rowCount) return reply.code(404).send({ error: 'Nie znaleziono wpisu.' });
      return reply.send({ ok: true });
    } catch (e) {
      req.log?.error?.(e, 'my-blockouts delete failed');
      return reply.code(500).send({ error: 'Nie udało się usunąć wpisu.' });
    }
  }

  return reply.code(400).send({ error: 'Nieznana akcja.' });
}
