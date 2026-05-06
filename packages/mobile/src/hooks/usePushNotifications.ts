import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Constants from 'expo-constants';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowInForeground: true,
  }),
});

export function usePushNotifications() {
  const { user } = useAuth();
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const notificationListener = useRef<Notifications.EventSubscription>();
  const responseListener = useRef<Notifications.EventSubscription>();

  useEffect(() => {
    if (!user) return;

    registerForPushNotifications().then(token => {
      if (token) {
        setExpoPushToken(token);
        saveTokenToDb(token);
      }
    });

    // Nasłuchuj na nowe notyfikacje (app w foreground)
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      // Opcjonalnie: badge, sound, etc.
    });

    // Nasłuchuj na kliknięcie notyfikacji
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      handleNotificationNavigation(data);
    });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [user]);

  async function registerForPushNotifications(): Promise<string | null> {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        return null;
      }

      // Android: ustaw kanał notyfikacji
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Domyślny',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#d97706',
        });
      }

      const projectId = Constants.default.expoConfig?.extra?.eas?.projectId;
      const token = await Notifications.getExpoPushTokenAsync({ projectId });
      return token.data;
    } catch (err) {
      console.error('Error registering push:', err);
      return null;
    }
  }

  async function saveTokenToDb(token: string) {
    try {
      const platform = Platform.OS; // 'ios' | 'android'

      // Upsert - aktualizuj istniejący lub dodaj nowy
      const { error } = await supabase
        .from('push_subscriptions')
        .upsert({
          user_id: user!.id,
          platform,
          expo_push_token: token,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,platform',
        });

      if (error) console.error('Error saving push token:', error);
    } catch (err) {
      console.error('Error saving push token:', err);
    }
  }

  return { expoPushToken };
}

function handleNotificationNavigation(data: any) {
  if (!data?.link) return;

  const link = data.link;

  // Mapuj linki web na ścieżki mobile
  if (link.includes('/komunikator') || link.includes('/chat')) {
    const conversationMatch = link.match(/conversation[=\/]([^&\/]+)/);
    if (conversationMatch) {
      router.push(`/(tabs)/chat/${conversationMatch[1]}`);
    } else {
      router.push('/(tabs)/chat');
    }
  } else if (link.includes('/programs')) {
    const idMatch = link.match(/programs\/(\d+)/);
    if (idMatch) {
      router.push(`/(tabs)/programs/${idMatch[1]}`);
    } else {
      router.push('/(tabs)/programs');
    }
  } else if (link.includes('/prayer')) {
    router.push('/(tabs)/prayer');
  } else if (link.includes('/calendar')) {
    router.push('/(tabs)/more/calendar');
  } else if (link.includes('/members')) {
    router.push('/(tabs)/more/members');
  } else {
    // Default: idź do dashboardu
    router.push('/(tabs)');
  }
}
