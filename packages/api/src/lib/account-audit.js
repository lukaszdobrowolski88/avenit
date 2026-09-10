// Zapis zdarzenia konta do tenantowego logu (account_events, migracja 028).
// Best-effort: audyt NIGDY nie blokuje rejestracji/zatwierdzenia (błąd łykany).
export async function logAccountEvent(db, { email, action, actor, detail } = {}) {
  try {
    await db.query(
      'INSERT INTO account_events (email, action, actor, detail) VALUES ($1,$2,$3,$4)',
      [email || null, action, actor || null, detail || null]
    );
  } catch {
    /* audyt best-effort — pomijamy błąd */
  }
}
