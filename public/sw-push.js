// Service Worker dla Push Notifications
// Ten plik musi być w public/ aby być dostępny z root domeny

self.addEventListener('push', function(event) {
  console.log('[SW Push] Otrzymano push notification');

  let data = {
    title: 'Nowe powiadomienie',
    body: 'Masz nową wiadomość',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    tag: 'default',
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
        tag: payload.tag || data.tag,
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
    tag: data.tag,
    data: data.data,
    vibrate: [200, 100, 200],
    requireInteraction: true,
    actions: [
      { action: 'open', title: 'Otwórz' },
      { action: 'close', title: 'Zamknij' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Obsługa kliknięcia w powiadomienie
self.addEventListener('notificationclick', function(event) {
  console.log('[SW Push] Kliknięto powiadomienie:', event.action);

  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  // Domyślna akcja lub akcja 'open' - otwórz link
  const urlToOpen = event.notification.data?.link || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {
        // Sprawdź czy aplikacja jest już otwarta
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            // Nawiguj do odpowiedniego URL i fokusuj
            client.navigate(urlToOpen);
            return client.focus();
          }
        }
        // Jeśli nie ma otwartego okna, otwórz nowe
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Obsługa zamknięcia powiadomienia (bez kliknięcia)
self.addEventListener('notificationclose', function(event) {
  console.log('[SW Push] Zamknięto powiadomienie bez kliknięcia');
});

// Obsługa subskrypcji push
self.addEventListener('pushsubscriptionchange', function(event) {
  console.log('[SW Push] Zmiana subskrypcji push');

  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: self.VAPID_PUBLIC_KEY
    })
    .then(function(subscription) {
      // Wyślij nową subskrypcję do serwera
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

console.log('[SW Push] Service Worker załadowany');
