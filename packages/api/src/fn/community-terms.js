// Zasady społeczności (EULA z zakazem treści obraźliwych — wytyczna App Store 1.2).
// POST {}            → stan akceptacji bieżącej wersji,
// POST {accept:true} → zapis akceptacji.
// Przed migracją 089 (brak kolumn) zwraca accepted:true — aplikacja nie może zablokować ludzi
// z powodu brakującej kolumny.
// Brak wpisu w FN_CAPABILITY => preHandler = requireUser (każdy zalogowany).
export const name = 'community-terms';
export const method = 'POST';

// Zmiana wersji wymusza ponowną akceptację w aplikacji.
export const TERMS_VERSION = '2026-10';

export default async function handler(req, reply) {
  if (!req.db || !req.tenant) return reply.code(404).send({ error: 'Nieznany tenant' });
  try {
    if (req.body?.accept === true) {
      await req.db.query(
        'UPDATE app_users SET terms_accepted_at = now(), terms_version = $2 WHERE id = $1',
        [req.user.id, TERMS_VERSION]);
      return reply.send({ version: TERMS_VERSION, accepted: true });
    }
    const { rows } = await req.db.query(
      'SELECT terms_accepted_at, terms_version FROM app_users WHERE id = $1', [req.user.id]);
    const r = rows[0] || {};
    return reply.send({
      version: TERMS_VERSION,
      accepted: !!r.terms_accepted_at && r.terms_version === TERMS_VERSION,
      accepted_at: r.terms_accepted_at || null,
    });
  } catch (err) {
    if (err?.code === '42703') return reply.send({ version: TERMS_VERSION, accepted: true });
    throw err;
  }
}
