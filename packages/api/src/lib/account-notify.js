// Powiadomienie e-mail o zmianie konta (blokada/odblokowanie/rola/reset 2FA).
// Sterowane ustawieniem app_settings 'account_change_emails' (domyślnie 'on'). Best-effort.
export async function notifyAccountChange(db, { email, name, subject, intro }) {
  if (!email) return;
  try {
    const { rows } = await db.query(`SELECT value FROM app_settings WHERE key = 'account_change_emails'`);
    if ((rows[0]?.value || 'on') === 'off') return;
    const { sendAccountNoticeEmail } = await import('./email.js');
    await sendAccountNoticeEmail(email, { name, subject, intro });
  } catch {
    /* powiadomienie best-effort — nie blokuj operacji */
  }
}
