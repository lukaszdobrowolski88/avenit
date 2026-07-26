// Publiczny zapis odpowiedzi RSVP po tokenie (bez logowania).
// GET-podobne pobranie: POST { token } bez answer → zwraca dane zaproszenia.
// Zapis: POST { token, answer: 'yes'|'no'|'maybe', guests? }.
export const name = 'rsvp-respond';
export const isPublic = true;

const VALID = ['yes', 'no', 'maybe'];

export default async function handler(req, reply) {
  if (!req.db) return reply.code(404).send({ error: 'Nieznany tenant' });
  const { token, answer, guests } = req.body || {};
  if (!token) return reply.code(400).send({ error: 'Brak tokenu zaproszenia' });

  try {
    if (answer && VALID.includes(answer)) {
      const g = Math.max(0, parseInt(guests, 10) || 0);
      await req.db.query(
        `UPDATE rsvp_invitations SET status = $1, guests_count = $2, responded_at = now() WHERE token = $3`,
        [answer, g, token]
      );
    }

    const { rows } = await req.db.query(
      `SELECT i.name, i.status, i.guests_count, i.responded_at,
              c.title, c.description, c.event_date, c.event_time, c.location, c.event_type
         FROM rsvp_invitations i
         JOIN rsvp_campaigns c ON c.id = i.campaign_id
        WHERE i.token = $1`,
      [token]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Nie znaleziono zaproszenia' });
    const r = rows[0];
    return reply.send({
      campaign: {
        title: r.title, description: r.description, event_date: r.event_date,
        event_time: r.event_time, location: r.location, event_type: r.event_type,
      },
      invitation: {
        name: r.name, status: r.status, guests_count: r.guests_count, responded_at: r.responded_at,
      },
    });
  } catch (err) {
    req.log.error({ err }, 'rsvp-respond error');
    return reply.code(500).send({ error: 'Błąd zapisu odpowiedzi' });
  }
}
