// Ściana modlitwy (web + ewentualnie mobile) — zwraca prośby BEZ e-maili. Wcześniej web
// czytał prayer_requests.* (user_email) + prayer_interactions.user_email wprost i budował
// listę e-maili modlących się — każdy zalogowany widział cudze adresy (także autora wpisu
// anonimowego). Tu e-maile są używane WYŁĄCZNIE serwerowo do policzenia flag; na zewnątrz
// wychodzą tylko: is_author, i_am_praying, avatar_url (dla nie-anonimowych) oraz licznik.
// Wpisy „leaders_only" filtrowane serwerowo (nie-lider/nie-autor ich nie dostaje).
//
// Brak wpisu w FN_CAPABILITY => preHandler = requireUser (każdy zalogowany).
import { isPrayerLeader } from '../dataapi/prayerScope.js';

export const name = 'prayer-wall';
export const method = 'POST';

const lc = (v) => String(v || '').toLowerCase();

export default async function handler(req, reply) {
  if (!req.db || !req.tenant) return reply.code(404).send({ error: 'Nieznany tenant' });
  const empty = { requests: [] };
  const email = lc(req.user?.email);
  if (!email) return reply.send(empty);

  try {
    // Widoczność leaders_only — capability jak w /api/db (prayerScope.js).
    const isLeader = await isPrayerLeader(req.db, req.tenant.db_name, req.user);

    // Prośby: bez archived (chyba że moje). user_email pobierany do obliczeń, NIE zwracany.
    const { rows: reqs } = await req.db.query(
      `SELECT id, content, category, visibility, is_anonymous, is_active, status,
              answered_testimony, created_at, updated_at, user_name, requester_name, user_email
         FROM prayer_requests
        WHERE status <> 'archived' OR lower(user_email) = $1
        ORDER BY created_at DESC`,
      [email]
    );

    // Zablokowani autorzy i prośby, które zgłosiłem, znikają z mojej ściany (wytyczna App Store 1.2).
    const blocked = new Set();
    const reported = new Set();
    try {
      const { rows } = await req.db.query(
        'SELECT lower(blocked_email) AS e FROM user_blocks WHERE lower(blocker_email) = $1', [email]);
      for (const r of rows) blocked.add(r.e);
    } catch { /* brak tabeli przed 088 */ }
    try {
      const { rows } = await req.db.query(
        `SELECT target_id FROM message_reports WHERE content_type = 'prayer' AND lower(reporter_email) = $1`, [email]);
      for (const r of rows) reported.add(String(r.target_id));
    } catch { /* brak kolumn przed 089 */ }

    // leaders_only — nie wysyłaj treści nie-liderom, którzy nie są autorami.
    const visible = reqs.filter(
      (r) => (r.visibility !== 'leaders_only' || isLeader || lc(r.user_email) === email)
        && !blocked.has(lc(r.user_email)) && !reported.has(String(r.id))
    );

    // Liczniki + „czy ja się modlę" per prośba (bez array-castów — agregat po całości).
    const countMap = new Map();
    const mineSet = new Set();
    try {
      const { rows } = await req.db.query(
        `SELECT request_id, COUNT(*)::int AS n, bool_or(lower(user_email) = $1) AS mine
           FROM prayer_interactions GROUP BY request_id`,
        [email]
      );
      for (const r of rows) {
        countMap.set(String(r.request_id), r.n);
        if (r.mine) mineSet.add(String(r.request_id));
      }
    } catch { /* brak tabeli — liczniki 0 */ }

    // Avatary — po e-mailu autora (tylko nie-anonimowi). Mapujemy serwerowo.
    const avatarMap = new Map();
    try {
      const { rows } = await req.db.query(
        'SELECT lower(email) AS email, avatar_url FROM app_users WHERE avatar_url IS NOT NULL'
      );
      for (const r of rows) avatarMap.set(r.email, r.avatar_url);
    } catch { /* brak kolumny avatar_url — bez avatarów */ }

    // Podpis autora: prośby z mobilki zapisywały się bez user_name („Ktoś ze wspólnoty” mimo
    // nieanonimowego wpisu) — dociągamy imię i nazwisko z konta albo kartoteki po e-mailu.
    const nameMap = new Map();
    const unnamed = [...new Set(visible.filter((r) => !r.user_name && r.user_email).map((r) => lc(r.user_email)))];
    if (unnamed.length) {
      try {
        const { rows } = await req.db.query(
          `SELECT lower(email) AS email, NULLIF(trim(coalesce(full_name, name, '')), '') AS n
             FROM app_users WHERE lower(email) = ANY($1)`, [unnamed]);
        for (const r of rows) if (r.n && !r.n.includes('@')) nameMap.set(r.email, r.n);
      } catch { /* bez nazw z kont */ }
      try {
        const { rows } = await req.db.query(
          `SELECT lower(email) AS email, NULLIF(trim(concat_ws(' ', first_name, last_name)), '') AS n
             FROM members WHERE lower(email) = ANY($1)`, [unnamed]);
        for (const r of rows) if (r.n && !nameMap.has(r.email)) nameMap.set(r.email, r.n);
      } catch { /* bez kartoteki */ }
    }

    const requests = visible.map((r) => {
      const isAnon = !!r.is_anonymous;
      const mine = lc(r.user_email) === email;
      // Anonimowość ukrywa tożsamość tylko przed INNYMI — autor widzi własne dane
      // (potrzebne do bezstratnej edycji wpisu anonimowego). To nie jest wyciek:
      // dla cudzych klientów is_author=false => poniżej zwracamy null.
      const hideIdentity = isAnon && !mine;
      return {
        id: r.id,
        content: r.content,
        category: r.category,
        visibility: r.visibility,
        is_anonymous: isAnon,
        is_active: r.is_active,
        status: r.status,
        answered_testimony: r.answered_testimony,
        created_at: r.created_at,
        updated_at: r.updated_at,
        // Tożsamość — ukryta przed innymi dla anonimowych; NIGDY e-mail.
        user_name: hideIdentity ? null : (r.user_name ?? nameMap.get(lc(r.user_email)) ?? null),
        requester_name: hideIdentity ? null : (r.requester_name ?? null),
        // Avatar to sygnał tożsamości — chowamy dla każdego wpisu anonimowego (także autorowi).
        avatar_url: isAnon ? null : (avatarMap.get(lc(r.user_email)) ?? null),
        prayer_count: countMap.get(String(r.id)) ?? 0,
        i_am_praying: mineSet.has(String(r.id)),
        is_author: mine,
      };
    });

    return reply.send({ requests });
  } catch (e) {
    req.log?.error?.(e, 'prayer-wall failed');
    return reply.send({ requests: [] });
  }
}
