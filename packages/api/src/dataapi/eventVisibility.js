// Widoczność wydarzeń (events.visibility_segments) — kontekst zalogowanego.
//
// Jeden kontekst dla /api/db (SELECT, count, złączenia — querybuilder.eventVisibilityClause)
// i realtime (server.js filtruje zmiany wydarzeń per subskrybent tym samym predykatem).
// Fail-closed: brak membera => segmenty grupowe (grupa/służba/tag/home_group) po prostu nie łapią.

// Wydarzenie z ograniczonym audytorium: niepusta lista segmentów bez segmentu „wszyscy”.
export function isRestrictedEvent(row) {
  const segs = row?.visibility_segments;
  if (!Array.isArray(segs) || !segs.length) return false;
  return !segs.some((s) => s && s.type === 'everyone');
}

// user: { email, role, campus_id, member_id }. Błędy (brak tabel/kolumn w tenancie) → pusty kontekst.
export async function loadVisibilityContext(db, user) {
  const email = user?.email || '';
  const memberId = user?.member_id ?? null;
  let ministries = [], tags = [];
  const homeGroupIds = new Set();
  if (memberId != null) {
    try {
      const { rows: mem } = await db.query(`SELECT home_group_id, ministries, tags FROM members WHERE id = $1`, [memberId]);
      if (mem[0]) {
        if (mem[0].home_group_id != null) homeGroupIds.add(String(mem[0].home_group_id));
        ministries = Array.isArray(mem[0].ministries) ? mem[0].ministries : [];
        tags = Array.isArray(mem[0].tags) ? mem[0].tags : [];
      }
    } catch { /* brak kolumn/tabeli w tenancie — kontekst pusty (fail-closed) */ }
  }
  // Członkostwo w grupach domowych z modułu Grupy domowe (po e-mailu) — źródło niezależne
  // od members.home_group_id. Rola per grupa (member/leader/coordinator) → grupy, w których
  // user jest liderem/koordynatorem (leaderGroupIds), do granularnych segmentów widoczności.
  const leaderGroupIds = new Set();
  try {
    const { rows: hgm } = await db.query(
      `SELECT group_id, role, is_leader FROM home_group_members WHERE lower(email) = lower($1)`, [email]
    );
    for (const r of hgm) {
      if (r.group_id == null) continue;
      homeGroupIds.add(String(r.group_id));
      if (r.role === 'leader' || r.role === 'coordinator' || r.is_leader === true) leaderGroupIds.add(String(r.group_id));
    }
  } catch { /* brak tabeli — pomijamy */ }
  // Koordynator = rola nadrzędna nad liderami (globalna, z katalogu liderów home_group_leaders).
  let isCoordinator = false;
  try {
    const { rows: co } = await db.query(
      `SELECT 1 FROM home_group_leaders WHERE lower(email) = lower($1) AND role = 'coordinator' LIMIT 1`, [email]
    );
    isCoordinator = co.length > 0;
  } catch { /* brak tabeli — pomijamy */ }
  return {
    role: user?.role, campusId: user?.campus_id ?? null, email,
    memberId, homeGroupIds: [...homeGroupIds], leaderGroupIds: [...leaderGroupIds], isCoordinator, ministries, tags,
  };
}
