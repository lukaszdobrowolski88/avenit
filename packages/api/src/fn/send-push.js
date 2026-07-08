// Port edge function send-push: powiadomienie push do jednego użytkownika
// (mobile via Expo Push API + web via VAPID / web-push).
// Oryginał: supabase/functions/send-push/index.ts.
//
// Body:
//   user_email, title, body — wymagane
//   link?, tag?, icon?, big_image?, category_id?, data?, actions?,
//   campaign_id?, recipient_id?, variant?
//
// Response:
//   { message, sent, failed, channels: { mobile: {...}, web: {...} } }
import webpush from 'web-push';
import { config } from '../config.js';

export const name = 'send-push';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_BATCH_SIZE = 100;

// Rdzeń logiki — wołany też bezpośrednio (in-process) z push-campaign-dispatch
// zamiast fan-outu po HTTP jak w Supabase.
// Zwraca { status, body } — body w kształcie identycznym jak oryginalna funkcja.
export async function sendPushCore(pool, payload) {
  if (!payload?.user_email || !payload?.title || !payload?.body) {
    return { status: 400, body: { error: 'Brakuje wymaganych pól: user_email, title, body' } };
  }

  // Wspólne dane przekazywane do mobile + web.
  const sharedData = {
    ...(payload.data || {}),
    link: payload.link,
    campaign_id: payload.campaign_id,
    recipient_id: payload.recipient_id,
    variant: payload.variant,
    actions: payload.actions || [],
  };

  // === MOBILE (Expo) ===
  const mobileResult = await sendExpo(pool, payload, sharedData, config.EXPO_ACCESS_TOKEN);

  // === WEB (VAPID) ===
  const webResult = config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY
    ? await sendWeb(pool, payload, sharedData)
    : { sent: 0, failed: 0, results: [] };

  const totalSent = mobileResult.sent + webResult.sent;
  const totalFailed = mobileResult.failed + webResult.failed;

  return {
    status: 200,
    body: {
      message: `Wysłano ${totalSent} powiadomień, ${totalFailed} niepowodzeń`,
      sent: totalSent,
      failed: totalFailed,
      channels: {
        mobile: mobileResult,
        web: webResult,
      },
    },
  };
}

export default async function handler(req, reply) {
  try {
    const { status, body } = await sendPushCore(req.db, req.body);
    return reply.code(status).send(body);
  } catch (err) {
    req.log.error({ err }, 'send-push error');
    return reply.code(500).send({ error: err.message });
  }
}

// =============================================================
// MOBILE — Expo Push API
// =============================================================

async function sendExpo(pool, payload, sharedData, accessToken) {
  let tokens = [];
  try {
    const res = await pool.query(
      `SELECT id, expo_token, platform FROM push_tokens WHERE user_email = $1`,
      [payload.user_email]
    );
    tokens = res.rows;
  } catch {
    return { sent: 0, failed: 0, results: [], tickets: [] };
  }

  if (!tokens || tokens.length === 0) {
    return { sent: 0, failed: 0, results: [], tickets: [] };
  }

  // Expo wymaga tokenów w formacie ExponentPushToken[xxx] albo ExpoPushToken[xxx].
  const valid = tokens.filter((t) => /^Expo(nent)?PushToken\[/.test(t.expo_token));
  if (valid.length === 0) {
    return { sent: 0, failed: 0, results: [], tickets: [] };
  }

  const messages = valid.map((t) => ({
    to: t.expo_token,
    title: payload.title,
    body: payload.body,
    sound: 'default',
    priority: 'high',
    channelId: 'default',
    categoryId: payload.category_id,
    data: sharedData,
    badge: undefined,
  }));

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  let sent = 0;
  let failed = 0;
  const allTickets = [];
  const invalidTokens = [];

  for (let i = 0; i < messages.length; i += EXPO_BATCH_SIZE) {
    const batch = messages.slice(i, i + EXPO_BATCH_SIZE);
    const batchTokens = valid.slice(i, i + EXPO_BATCH_SIZE);

    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(batch),
      });

      const json = await res.json();
      const tickets = Array.isArray(json?.data) ? json.data : [];

      tickets.forEach((ticket, idx) => {
        const token = batchTokens[idx]?.expo_token;
        allTickets.push({ token, ticket });
        if (ticket.status === 'ok') {
          sent++;
        } else {
          failed++;
          if (ticket.details?.error === 'DeviceNotRegistered') {
            invalidTokens.push(token);
          }
        }
      });
    } catch (err) {
      console.error('Expo batch error:', err);
      failed += batch.length;
    }
  }

  // Czyszczenie martwych tokenów.
  if (invalidTokens.length > 0) {
    await pool.query(`DELETE FROM push_tokens WHERE expo_token = ANY($1::text[])`, [invalidTokens]);
  }

  return {
    sent,
    failed,
    tickets: allTickets,
    results: allTickets.map(({ token, ticket }) => ({
      token,
      success: ticket.status === 'ok',
      ticket_id: ticket.id,
      error: ticket.message,
    })),
  };
}

// =============================================================
// WEB — VAPID / web-push
// =============================================================

async function sendWeb(pool, payload, sharedData) {
  webpush.setVapidDetails(config.VAPID_EMAIL, config.VAPID_PUBLIC_KEY, config.VAPID_PRIVATE_KEY);

  let subs = [];
  try {
    const res = await pool.query(
      `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_email = $1`,
      [payload.user_email]
    );
    subs = res.rows;
  } catch {
    return { sent: 0, failed: 0, results: [] };
  }

  if (!subs || subs.length === 0) {
    return { sent: 0, failed: 0, results: [] };
  }

  // Web Notification API: max 2 actions, każdy musi mieć { action, title, icon? }.
  const webActions = (payload.actions || []).slice(0, 2).map((a, idx) => ({
    action: `${a.action_type}:${a.action_value ?? idx}`,
    title: a.label,
  }));

  const notificationPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || '/icon-192x192.png',
    badge: '/icon-192x192.png',
    image: payload.big_image,
    tag: payload.tag || 'default',
    actions: webActions,
    data: sharedData,
  });

  let sent = 0;
  let failed = 0;
  const results = [];

  await Promise.all(
    subs.map(async (sub) => {
      const subscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };
      try {
        await webpush.sendNotification(subscription, notificationPayload);
        sent++;
        results.push({ endpoint: sub.endpoint, success: true });
      } catch (err) {
        failed++;
        results.push({ endpoint: sub.endpoint, success: false, error: err.message });
        if (err.statusCode === 404 || err.statusCode === 410) {
          await pool.query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [sub.endpoint]);
        }
      }
    })
  );

  return { sent, failed, results };
}
