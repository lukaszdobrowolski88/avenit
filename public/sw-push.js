// Service Worker dla Push Notifications
// Obsługuje:
//   - notyfikacje z dynamicznymi przyciskami akcji (data.actions)
//   - tracking otwarć i kliknięć przycisków przez /api/fn/push-event-track
//   - inline akcje (RSVP) przez /api/fn/push-action-handler
//   - deep linki w obrębie origin

const TRACK_URL = '/api/fn/push-event-track';
const ACTION_URL = '/api/fn/push-action-handler';

self.addEventListener('push', function(event) {
  let data = {
    title: 'Nowe powiadomienie',
    body: 'Masz nową wiadomość',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    image: undefined,
    tag: 'default',
    actions: [],
    data: {}
  };

  try {
    if (event.data) {
      const payload = event.data.json();
      data = {
        title: payload.title || data.title,
        body: payload.body || data.body,
        icon: payload.icon || data.icon,
        badge: payload.badge || data.badge,
        image: payload.image || data.image,
        tag: payload.tag || data.tag,
        actions: Array.isArray(payload.actions) ? payload.actions.slice(0, 2) : [],
        data: payload.data || {}
      };
    }
  } catch (e) {
    console.error('[SW Push] Błąd parsowania danych push:', e);
  }

  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    image: data.image,
    tag: data.tag,
    data: data.data,
    actions: data.actions,
    vibrate: [200, 100, 200],
    requireInteraction: true,
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const data = event.notification.data || {};
  const action = event.action; // pusty string dla taps w body, "<type>:<value>" dla button

  event.waitUntil(handleClick(action, data));
});

async function handleClick(action, data) {
  const { campaign_id, recipient_id, link, actions } = data;

  // Brak action -> tap w body powiadomienia.
  if (!action) {
    await trackEvent(data, 'opened');
    return openClient(link || '/');
  }

  const [actionType, ...rest] = action.split(':');
  const actionValue = rest.join(':');
  const actionDef = (actions || []).find(a =>
    a.action_type === actionType && (String(a.action_value || '') === actionValue)
  );

  // Inline RSVP — wykonaj akcję bez otwierania okna.
  if (actionType === 'inline_rsvp') {
    await fetch(ACTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaign_id,
        recipient_id,
        user_email: data.user_email,
        action_id: actionDef?.id,
        action_type: actionType,
        action_value: actionValue,
      }),
    }).catch(err => console.error('[SW Push] action-handler:', err));
    return;
  }

  // External URL — otwórz nowe okno.
  if (actionType === 'external_url') {
    await trackEvent(data, 'action_clicked', actionDef?.id);
    return clients.openWindow(actionValue);
  }

  // Deep link / open_form — przejdź w obrębie origin.
  if (actionType === 'deep_link' || actionType === 'open_form') {
    await trackEvent(data, 'action_clicked', actionDef?.id);
    const target = actionType === 'open_form' ? `/forms/${actionValue}` : (actionValue || link || '/');
    return openClient(target);
  }

  // Fallback — open default link.
  await trackEvent(data, 'opened');
  return openClient(link || '/');
}

async function trackEvent(data, event, actionId) {
  if (!data?.campaign_id || !data?.recipient_id) return;
  try {
    await fetch(TRACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaign_id: data.campaign_id,
        recipient_id: data.recipient_id,
        event,
        action_id: actionId,
      }),
    });
  } catch (err) {
    console.error('[SW Push] track error:', err);
  }
}

async function openClient(url) {
  const list = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const c of list) {
    if (c.url.includes(self.location.origin) && 'focus' in c) {
      c.navigate(url);
      return c.focus();
    }
  }
  if (clients.openWindow) return clients.openWindow(url);
}

self.addEventListener('notificationclose', function() {
  // Brak akcji - opcjonalnie tracking dismissed.
});

self.addEventListener('pushsubscriptionchange', function(event) {
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: self.VAPID_PUBLIC_KEY
    })
    .then(function(subscription) {
      return fetch('/api/push/resubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oldEndpoint: event.oldSubscription?.endpoint,
          newSubscription: subscription.toJSON()
        })
      });
    })
  );
});
