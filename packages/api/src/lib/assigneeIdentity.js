// Osoba z grafiku ↔ konto w aplikacji (push z zaproszeniem/przypomnieniem i odpowiedź
// „Akceptuję / Odrzucam” prosto z aplikacji).
// Grafik zapisuje osobę z listy zespołu (worship_team, media_team…) razem z e-mailem z tej
// listy, a konto (app_users) bywa założone na inny adres (np. prywatny zamiast kościelnego).
// Konta tej osoby, od najpewniejszego powiązania:
//  1. ten sam e-mail,
//  2. wiersz zespołu z user_id (migracja 026),
//  3. app_users.member_id → kartoteka members o tym e-mailu,
//  4. to samo imię i nazwisko — tylko gdy w bazie jest DOKŁADNIE jedno takie konto i jedna
//     taka osoba w zespole (przy imiennikach nie zgadujemy).
// Każde źródło w osobnym try: kolumny i tabele różnią się między tenantami.

export const TEAM_MEMBER_TABLE = {
  worship: 'worship_team', media: 'media_team', atmosfera: 'atmosfera_members',
  kids: 'kids_teachers', mc: 'custom_mc_members',
};
const KEY_RE = /^[a-z0-9_]+$/;
export function teamTableFor(teamType) {
  if (!teamType || !KEY_RE.test(String(teamType))) return null;
  return TEAM_MEMBER_TABLE[teamType] || `custom_${teamType}_members`;
}
const norm = (s) => String(s ?? '').trim().toLowerCase();

export async function accountEmailsForAssignee(db, { email, name, teamType } = {}) {
  const e = norm(email);
  const n = norm(name);
  const out = new Set(e ? [e] : []);
  const add = (rows) => rows.forEach((r) => { if (r?.email) out.add(norm(r.email)); });
  const table = teamTableFor(teamType);

  // 2. Wiersz zespołu powiązany z kontem (po e-mailu z grafiku; bez e-maila — po imieniu).
  if (table && (e || n)) {
    try {
      const { rows } = await db.query(
        `SELECT DISTINCT lower(u.email) AS email
           FROM "${table}" t JOIN app_users u ON u.id = t.user_id
          WHERE u.email IS NOT NULL
            AND (($1 <> '' AND lower(t.email) = $1) OR ($1 = '' AND lower(trim(t.full_name)) = $2))`,
        [e, n]
      );
      add(rows);
    } catch { /* tabela zespołu bez user_id */ }
  }

  // 3. Konto powiązane z kartoteką członka o tym e-mailu.
  if (e) {
    try {
      const { rows } = await db.query(
        `SELECT DISTINCT lower(u.email) AS email
           FROM app_users u JOIN members m ON u.member_id::text = m.id::text
          WHERE u.email IS NOT NULL AND lower(m.email) = $1`,
        [e]
      );
      add(rows);
    } catch { /* tenant bez app_users.member_id */ }
  }

  // 4. Jedyne konto o tym imieniu i nazwisku (i jedyna taka osoba w zespole).
  if (n) {
    try {
      const { rows } = await db.query(
        `SELECT min(lower(u.email)) AS email FROM app_users u
          WHERE u.email IS NOT NULL AND lower(trim(u.full_name)) = $1
         HAVING count(*) = 1`,
        [n]
      );
      if (rows.length) {
        let uniqueInTeam = true;
        if (table) {
          const { rows: c } = await db.query(`SELECT count(*)::int AS n FROM "${table}" WHERE lower(trim(full_name)) = $1`, [n]);
          uniqueInTeam = (c[0]?.n ?? 0) <= 1;
        }
        if (uniqueInTeam) add(rows);
      }
    } catch { /* brak kolumny full_name */ }
  }

  return [...out];
}

// Czy zalogowane konto (e-mail sesji) to osoba z tego przypisania.
export async function isAccountForAssignee(db, accountEmail, assignee) {
  const me = norm(accountEmail);
  if (!me) return false;
  if (me === norm(assignee?.email)) return true;
  const emails = await accountEmailsForAssignee(db, assignee);
  return emails.includes(me);
}
