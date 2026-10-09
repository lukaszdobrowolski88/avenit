// Port edge function send-program-email: wysyłka programu (PDF) do zespołu.
// Oryginał: supabase/functions/send-program-email/index.ts (SendGrid).
//
// filePath (audyt 2026-10, runda 3): tylko plik PDF w buckecie "programs" BIEŻĄCEGO tenanta
// (np. "<programId>/Program-2026-10-12.pdf"). Ścieżki z "..", bezwzględne albo prowadzące
// do innego tenanta są odrzucane (400) — wcześniej dało się dołączyć cudzy plik do maila.
import { sendEmail } from '../lib/email.js';
import { readStorageFileBase64, storagePath } from '../storage/files.js';

export const name = 'send-program-email';

// Podmienialne w testach (bez prawdziwej poczty i dysku).
export const deps = { sendEmail, readStorageFileBase64 };

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

  if (!emailTo || emailTo.length === 0) {
    return reply.code(400).send({ error: 'Brak odbiorców (emailTo)' });
  }
  if (!htmlBody) {
    return reply.code(400).send({ error: 'Brak treści (htmlBody)' });
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
    to: emailTo,
    subject: subject || 'Program nabożeństwa',
    html: htmlBody,
    attachments,
  });

  return reply.send({ success: true, recipients: Array.isArray(emailTo) ? emailTo.length : 1 });
}
