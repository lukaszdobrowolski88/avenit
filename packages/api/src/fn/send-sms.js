// Port edge function send-sms: wysyłka pojedynczego SMS-a przez SMSAPI.pl.
// Oryginał: supabase/functions/send-sms/index.ts.
//
// Input (JSON): { phone, message, sender?, campaign_id?, recipient_id?, variant? }
// Output:       { sent: 0|1, smsapi_id?, points?, parts?, error? }
//
// Konfiguracja: tabela `integration_settings` (klucze smsapi_*) z fallbackiem na ENV.
import { getSmsConfig, normalizePhone, sendSmsViaSmsapi } from '../lib/sms.js';

export const name = 'send-sms';

// Rdzeń logiki — wołany też bezpośrednio (in-process) z sms-campaign-dispatch
// zamiast fan-outu po HTTP jak w Supabase.
// Zwraca { status, body } — body w kształcie identycznym jak oryginalna funkcja.
export async function sendSmsCore(pool, body) {
  const config = await getSmsConfig(pool);

  if (!config.token) {
    return { status: 500, body: { sent: 0, error: 'SMSAPI token not configured (set in app settings)' } };
  }

  if (!body) return { status: 400, body: { sent: 0, error: 'invalid JSON body' } };

  const { phone, message, sender } = body;
  if (!message || !String(message).trim()) {
    return { status: 400, body: { sent: 0, error: 'message is required' } };
  }

  const normalized = normalizePhone(phone);
  if (!normalized) {
    return { status: 400, body: { sent: 0, error: 'invalid_phone' } };
  }

  const finalSender = (sender && String(sender).trim()) || config.defaultSender;

  const result = await sendSmsViaSmsapi({
    token: config.token,
    apiUrl: config.apiUrl,
    phone: normalized,
    message: String(message),
    sender: finalSender,
  });

  if (!result.ok) {
    return { status: 200, body: { sent: 0, error: result.error || 'send failed' } };
  }

  return {
    status: 200,
    body: {
      sent: 1,
      smsapi_id: result.smsapi_id,
      points: result.points,
      parts: result.parts,
    },
  };
}

export default async function handler(req, reply) {
  try {
    const { status, body } = await sendSmsCore(req.db, req.body);
    return reply.code(status).send(body);
  } catch (err) {
    req.log.error({ err }, 'send-sms error');
    return reply.code(500).send({ sent: 0, error: err.message });
  }
}
