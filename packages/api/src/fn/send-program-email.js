// Port edge function send-program-email: wysyłka programu (PDF) do zespołu.
// Oryginał: supabase/functions/send-program-email/index.ts (SendGrid).
import { sendEmail } from '../lib/email.js';
import { readStorageFileBase64 } from '../storage/files.js';

export const name = 'send-program-email';

export default async function handler(req, reply) {
  const { emailTo, subject, htmlBody, filename, filePath } = req.body || {};

  if (!emailTo || emailTo.length === 0) {
    return reply.code(400).send({ error: 'Brak odbiorców (emailTo)' });
  }
  if (!htmlBody) {
    return reply.code(400).send({ error: 'Brak treści (htmlBody)' });
  }

  const attachments = [];
  if (filePath) {
    try {
      // filePath w formacie "<bucket-path>" — oryginał trzymał PDF-y w buckecie "programs".
      const contentBase64 = await readStorageFileBase64(req.tenant.slug, 'programs', filePath);
      attachments.push({
        contentBase64,
        filename: filename || 'program.pdf',
        type: 'application/pdf',
      });
    } catch (err) {
      req.log.warn({ err }, 'Nie udało się dołączyć PDF — wysyłam bez załącznika');
    }
  }

  await sendEmail({
    to: emailTo,
    subject: subject || 'Program nabożeństwa',
    html: htmlBody,
    attachments,
  });

  return reply.send({ success: true, recipients: Array.isArray(emailTo) ? emailTo.length : 1 });
}
