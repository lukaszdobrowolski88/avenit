// Port edge function send-program-email: wysyłka programu (PDF) do zespołu.
// Oryginał: supabase/functions/send-program-email/index.ts (SendGrid).
//
// filePath (audyt 2026-10, runda 3): tylko plik PDF w buckecie "programs" BIEŻĄCEGO tenanta
// (np. "<programId>/Program-2026-10-12.pdf"). Ścieżki z "..", bezwzględne albo prowadzące
// do innego tenanta są odrzucane (400) — wcześniej dało się dołączyć cudzy plik do maila.
import { sendEmail } from '../lib/email.js';
import { readStorageFileBase64, storagePath } from '../storage/files.js';

export const name = 'send-program-email';

// Odbiorcy (audyt 2026-10, runda 4): wcześniej dowolne adresy + dowolny HTML z serwera kościoła —
// każdy z action:programs:send_email (preset lidera) mógł rozsyłać phishing na zewnątrz. Teraz
// tylko adresy znane we wspólnocie (konta, członkowie, składy zespołów, grafik), z limitem.
export const MAX_RECIPIENTS = 100;
export const rateLimit = { max: 10, timeWindow: '10 minutes' };
const EMAIL_SOURCES = [
  ['app_users', 'email'], ['members', 'email'], ['worship_team', 'email'], ['media_team', 'email'],
  ['atmosfera_members', 'email'], ['kids_teachers', 'email'], ['mlodziezowka_members', 'email'],
  ['schedule_assignments', 'assigned_email'],
];

// Które z adresów (małe litery) są znane w bazie tenanta. Brak tabeli/kolumny — pomijamy źródło.
export async function churchEmails(db, emails) {
  const found = new Set();
  for (const [table, col] of EMAIL_SOURCES) {
    if (found.size === emails.length) break;
    try {
      const { rows } = await db.query(
        `SELECT DISTINCT lower(${col}) AS e FROM ${table} WHERE lower(${col}) = ANY($1::text[])`,
        [emails]
      );
      for (const r of rows) found.add(r.e);
    } catch { /* źródło niedostępne w tym tenancie */ }
  }
  return found;
}

// Podmienialne w testach (bez prawdziwej poczty i dysku).
export const deps = { sendEmail, readStorageFileBase64, churchEmails };

export const PROGRAMS_BUCKET = 'programs';

// Walidacja ścieżki załącznika: rzuca (status 400) albo zwraca znormalizowaną ścieżkę względną.
export function programAttachmentPath(tenantSlug, filePath, base) {
  const rel = String(filePath ?? '');
  if (!/\.pdf$/i.test(rel)) {
    const err = new Error('Nieprawidłowa ścieżka');
    err.status = 400;
    throw err;
  }
  storagePath(tenantSlug, PROGRAMS_BUCKET, rel, base); // rzuca przy wyjściu poza bucket tenanta
  return rel;
}

export default async function handler(req, reply) {
  const { emailTo, subject, htmlBody, filename, filePath } = req.body || {};

  const to = [...new Set((Array.isArray(emailTo) ? emailTo : [emailTo])
    .map((e) => String(e ?? '').trim().toLowerCase()).filter(Boolean))];
  if (to.length === 0) {
    return reply.code(400).send({ error: 'Brak odbiorców (emailTo)' });
  }
  if (to.length > MAX_RECIPIENTS) {
    return reply.code(400).send({ error: `Najwyżej ${MAX_RECIPIENTS} odbiorców naraz` });
  }
  if (!htmlBody) {
    return reply.code(400).send({ error: 'Brak treści (htmlBody)' });
  }
  const known = await deps.churchEmails(req.db, to);
  const unknown = to.filter((e) => !known.has(e));
  if (unknown.length) {
    return reply.code(403).send({ error: 'Program wysyłamy tylko do osób ze wspólnoty', unknown });
  }

  let attachmentPath = null;
  if (filePath) {
    try {
      attachmentPath = programAttachmentPath(req.tenant.slug, filePath);
    } catch {
      return reply.code(400).send({ error: 'Nieprawidłowa ścieżka załącznika' });
    }
  }

  const attachments = [];
  if (attachmentPath) {
    try {
      const contentBase64 = await deps.readStorageFileBase64(req.tenant.slug, PROGRAMS_BUCKET, attachmentPath);
      const safeName = String(filename || 'program.pdf').replace(/[\\/\0\r\n"]/g, '_').slice(0, 120);
      attachments.push({
        contentBase64,
        filename: /\.pdf$/i.test(safeName) ? safeName : `${safeName}.pdf`,
        type: 'application/pdf',
      });
    } catch (err) {
      req.log.warn({ err }, 'Nie udało się dołączyć PDF — wysyłam bez załącznika');
    }
  }

  await deps.sendEmail({
    to,
    subject: String(subject || 'Program nabożeństwa').replace(/[\r\n]+/g, ' ').slice(0, 200),
    html: htmlBody,
    attachments,
  });

  return reply.send({ success: true, recipients: to.length });
}
