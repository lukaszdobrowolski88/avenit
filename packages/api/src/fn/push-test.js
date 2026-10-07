// Test powiadomień push — WYŁĄCZNIE do samego siebie (zalogowany). Sprawdza cały łańcuch
// serwer → Expo (telefony) / VAPID (przeglądarki) i zwraca zrozumiałą diagnozę, np. brak
// zapisanych urządzeń albo brak kluczy APNs w projekcie EAS.
// Dawny „test” w profilu pokazywał tylko lokalne powiadomienie przeglądarki — nie mówił,
// czy serwer potrafi cokolwiek dostarczyć.
import { sendPushCore } from './send-push.js';

export const name = 'push-test';
export const rateLimit = { max: 5, timeWindow: '1 minute' };

// Komunikat Expo/web-push → podpowiedź dla człowieka.
export function explainPushError(msg) {
  const m = String(msg || '');
  if (/APNs credentials/i.test(m)) return 'Brak kluczy Apple (APNs) w projekcie EAS — iPhone nie dostanie powiadomień, dopóki administrator ich nie doda.';
  if (/FCM|google|firebase/i.test(m)) return 'Brak kluczy Google (FCM) w projekcie EAS — Android nie dostanie powiadomień, dopóki administrator ich nie doda.';
  if (/DeviceNotRegistered/i.test(m)) return 'Telefon nie jest już zarejestrowany (aplikacja odinstalowana albo wylogowana) — zaloguj się ponownie w aplikacji.';
  if (/(^|\D)(404|410)(\D|$)|expired|unsubscribed/i.test(m)) return 'Subskrypcja przeglądarki wygasła — włącz powiadomienia ponownie w tej przeglądarce.';
  if (/(^|\D)403(\D|$)|vapid/i.test(m)) return 'Przeglądarka odrzuciła klucz serwera (VAPID) — włącz powiadomienia ponownie.';
  return m ? `Nie udało się dostarczyć: ${m.slice(0, 160)}` : 'Nie udało się dostarczyć.';
}

export default async function handler(req, reply) {
  if (!req.db || !req.user?.email) return reply.code(401).send({ error: 'Brak sesji' });
  const { status, body } = await sendPushCore(req.db, {
    user_email: req.user.email,
    title: 'Test powiadomień Avenit',
    body: 'Jeśli to widzisz — powiadomienia działają.',
    link: '/',
    tag: 'push-test',
  });
  if (status !== 200) return reply.code(status).send(body);
  const mobile = body.channels.mobile;
  const web = body.channels.web;
  const problems = [...(mobile.results || []), ...(web.results || [])]
    .filter((r) => r.success === false)
    .map((r) => explainPushError(r.error));
  return reply.send({
    sent: body.sent,
    failed: body.failed,
    devices: { phones: (mobile.results || []).length, browsers: (web.results || []).length },
    problems: [...new Set(problems)],
  });
}
