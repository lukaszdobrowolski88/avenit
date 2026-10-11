// Konta (app_users) — tabela czytelna dla każdego zalogowanego (imiona, e-maile i awatary
// potrzebne w Komunikatorze, wybieraczach osób, grafiku). Telefon i metadane logowania innych
// osób (audyt 2026-10, runda 4) widzi tylko obsługa: administrator albo ktoś z dostępem do
// Członków lub kampanii (SMS/e-mail/push — wybór odbiorców). Własny wiersz — zawsze pełny.

export const PRIVATE_ACCOUNT_FIELDS = ['phone', 'last_login_at', 'failed_login_count', 'locked_until', 'invited_at'];
const STAFF_CAPS = ['module:members', 'module:sms_campaigns', 'module:mailing', 'module:push_campaigns'];

export const seesAccountDetails = (resolver) => !resolver || STAFF_CAPS.some((c) => resolver.can(c));

// Usuwa prywatne pola z cudzych wierszy (mutuje). resolver null = admin/legacy — bez zmian.
// Własny wiersz rozpoznajemy po id albo e-mailu (zapytania profilu bywają bez kolumny id).
// Wiersz bez id i e-maila nie da się przypisać — traktujemy jak cudzy.
export function redactAccounts(rows, resolver, me = {}) {
  if (seesAccountDetails(resolver)) return rows;
  const myId = String(me.id ?? '');
  const myEmail = String(me.email ?? '').toLowerCase();
  for (const row of rows || []) {
    if (!row) continue;
    const own = (myId && row.id != null && String(row.id) === myId)
      || (myEmail && row.email != null && String(row.email).toLowerCase() === myEmail);
    if (own) continue;
    for (const f of PRIVATE_ACCOUNT_FIELDS) if (f in row) delete row[f];
  }
  return rows;
}
