import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// VAPID public key - wygeneruj parę kluczy przez: npx web-push generate-vapid-keys
// Ustaw w zmiennych środowiskowych
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

// Konwersja base64 URL-safe na Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications(userEmail) {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [permission, setPermission] = useState('default');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Sprawdź wsparcie przeglądarki
  useEffect(() => {
    const supported = 'serviceWorker' in navigator &&
                      'PushManager' in window &&
                      'Notification' in window;
    setIsSupported(supported);

    if (supported) {
      setPermission(Notification.permission);
    }
  }, []);

  // Rejestruj service worker i sprawdź subskrypcję
  useEffect(() => {
    if (!isSupported || !userEmail) {
      setLoading(false);
      return;
    }

    const initPush = async () => {
      try {
        // Rejestruj service worker dla push
        const registration = await navigator.serviceWorker.register('/sw-push.js', {
          scope: '/'
        });

        await navigator.serviceWorker.ready;

        // Sprawdź istniejącą subskrypcję
        const existingSubscription = await registration.pushManager.getSubscription();

        if (existingSubscription) {
          setSubscription(existingSubscription);
          setIsSubscribed(true);

          // Sprawdź czy subskrypcja jest zapisana w bazie
          const { data } = await supabase
            .from('push_subscriptions')
            .select('id')
            .eq('endpoint', existingSubscription.endpoint)
            .single();

          if (!data) {
            // Zapisz subskrypcję do bazy
            await saveSubscription(existingSubscription);
          }
        }
      } catch (err) {
        console.error('Błąd inicjalizacji push:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    initPush();
  }, [isSupported, userEmail]);

  // Zapisz subskrypcję do bazy
  const saveSubscription = useCallback(async (sub) => {
    if (!userEmail || !sub) return;

    const subscriptionJson = sub.toJSON();

    try {
      const { error: dbError } = await supabase
        .from('push_subscriptions')
        .upsert({
          user_email: userEmail,
          endpoint: subscriptionJson.endpoint,
          p256dh: subscriptionJson.keys.p256dh,
          auth: subscriptionJson.keys.auth,
          user_agent: navigator.userAgent
        }, {
          onConflict: 'endpoint'
        });

      if (dbError) throw dbError;
    } catch (err) {
      console.error('Błąd zapisu subskrypcji:', err);
      throw err;
    }
  }, [userEmail]);

  // Usuń subskrypcję z bazy
  const removeSubscription = useCallback(async (endpoint) => {
    try {
      const { error: dbError } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('endpoint', endpoint);

      if (dbError) throw dbError;
    } catch (err) {
      console.error('Błąd usunięcia subskrypcji:', err);
    }
  }, []);

  // Subskrybuj push notifications
  const subscribe = useCallback(async () => {
    if (!isSupported || !VAPID_PUBLIC_KEY) {
      setError('Push notifications nie są wspierane lub brak klucza VAPID');
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      // Poproś o pozwolenie
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);

      if (permissionResult !== 'granted') {
        setError('Powiadomienia zostały zablokowane');
        setLoading(false);
        return false;
      }

      // Pobierz rejestrację service worker
      const registration = await navigator.serviceWorker.ready;

      // Subskrybuj push
      const newSubscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });

      // Zapisz do bazy
      await saveSubscription(newSubscription);

      setSubscription(newSubscription);
      setIsSubscribed(true);

      return true;
    } catch (err) {
      console.error('Błąd subskrypcji push:', err);
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [isSupported, saveSubscription]);

  // Anuluj subskrypcję
  const unsubscribe = useCallback(async () => {
    if (!subscription) return true;

    setLoading(true);
    setError(null);

    try {
      await subscription.unsubscribe();
      await removeSubscription(subscription.endpoint);

      setSubscription(null);
      setIsSubscribed(false);

      return true;
    } catch (err) {
      console.error('Błąd anulowania subskrypcji:', err);
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [subscription, removeSubscription]);

  // Wyślij testowe powiadomienie (lokalne)
  const sendTestNotification = useCallback(async () => {
    if (permission !== 'granted') {
      setError('Brak pozwolenia na powiadomienia');
      return false;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification('Test powiadomienia', {
        body: 'To jest testowe powiadomienie push!',
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png',
        vibrate: [200, 100, 200],
        tag: 'test',
        data: { link: '/' }
      });
      return true;
    } catch (err) {
      console.error('Błąd wysyłania testowego powiadomienia:', err);
      setError(err.message);
      return false;
    }
  }, [permission]);

  return {
    isSupported,
    isSubscribed,
    permission,
    loading,
    error,
    subscribe,
    unsubscribe,
    sendTestNotification
  };
}

export default usePushNotifications;
