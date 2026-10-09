import '../global.css';
// Przed pierwszym renderem pól: odstęp liter nie „przecieka” między polami (iOS 26).
import '../src/lib/text-input-kern-fix';
import { useEffect, useRef } from 'react';
import { AppState, View, type AppStateStatus } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import * as Notifications from 'expo-notifications';
import { ThemeProvider, useTheme } from '../src/contexts/ThemeContext';
import { AuthProvider } from '../src/contexts/AuthContext';
import { CampusProvider } from '../src/contexts/CampusContext';
import { I18nProvider } from '../src/i18n';
import { ErrorBoundary } from '../src/components/shared/ErrorBoundary';
import { ToastHost } from '../src/components/ui/ToastHost';
import { QUERY_CACHE_BUSTER, queryClient, queryPersister } from '../src/lib/query-client';
import { useAppFonts } from '../src/lib/fonts';
import { supabase } from '../src/lib/supabase';
import {
  registerPushToken,
  registerNotificationCategories,
  handleAssignmentAction,
  handleCampaignAction,
  handleRsvpInviteAction,
} from '../src/lib/push';
import { navigateFromDeepLink, openTask, taskFromNotificationData } from '../src/lib/deep-links';
import { updatePresence } from '../src/lib/presence';

SplashScreen.preventAutoHideAsync();

// Powiadomienie o zadaniu (przypisanie, wzmianka w komentarzu) — odśwież listy zadań, tablice
// zespołów, pulpit i dzwonek. Klucze bez dopasowania (np. ekran nieotwarty) nic nie kosztują.
const refreshTaskQueries = (itemId?: string | null) => {
  queryClient.invalidateQueries({ queryKey: ['my-work'] });
  queryClient.invalidateQueries({ queryKey: ['team', 'board'] });
  queryClient.invalidateQueries({ queryKey: ['notifications'] });
  queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  queryClient.invalidateQueries({ queryKey: ['agenda-tasks'] });
  // Ekran zadania (szczegóły, komentarze, dziennik) — klucze ['task', id, …].
  if (itemId) queryClient.invalidateQueries({ queryKey: ['task', itemId] });
};

function RootEffects() {
  const router = useRouter();
  const responseSubRef = useRef<Notifications.EventSubscription | null>(null);

  // Rejestruj push token + presence przy każdym ustawieniu sesji.
  useEffect(() => {
    const register = (email?: string | null) => {
      if (!email) return;
      registerPushToken(email).catch((e) =>
        console.warn('[push] register failed:', (e as Error)?.message),
      );
      updatePresence(email, 'online').catch(() => undefined);
    };
    supabase.auth.getSession().then(({ data }) => register(data.session?.user?.email));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        register(session?.user?.email);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // AppState → presence: foreground=online, background=away.
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    const tick = async () => {
      const { data } = await supabase.auth.getSession();
      const email = data.session?.user?.email;
      if (email) updatePresence(email, 'online').catch(() => undefined);
    };
    const handleAppState = async (s: AppStateStatus) => {
      const { data } = await supabase.auth.getSession();
      const email = data.session?.user?.email;
      if (!email) return;
      if (s === 'active') {
        updatePresence(email, 'online').catch(() => undefined);
        // W tle połączenie realtime jest zerwane — wiadomości, które przyszły w tym czasie,
        // znamy tylko z powiadomień. Po powrocie odświeżamy rozmowy i otwarte wątki.
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
        queryClient.invalidateQueries({ queryKey: ['messages'] });
      } else updatePresence(email, 'away').catch(() => undefined);
    };
    tick();
    interval = setInterval(tick, 60_000);
    const sub = AppState.addEventListener('change', handleAppState);
    return () => {
      if (interval) clearInterval(interval);
      sub.remove();
    };
  }, []);

  // Kategorie notyfikacji (akcje accept/reject) — raz przy mount.
  useEffect(() => {
    registerNotificationCategories();
  }, []);

  // Listener notyfikacji — deep link + akcje.
  useEffect(() => {
    const handle = async (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data as
        | {
            link?: string;
            type?: string;
            item_id?: string | number;
            board_id?: string | number;
            assignmentId?: number | string;
            campaign_id?: string;
            recipient_id?: string;
            rsvp_token?: string;
          }
        | null;
      const action = response.actionIdentifier;

      // Wiadomość z czatu: wątek w pamięci podręcznej nie zna jeszcze tej wiadomości (realtime
      // było rozłączone) — odśwież go, zanim ekran się otworzy.
      const convId = (data as { conversation_id?: string } | null)?.conversation_id;
      if (convId) {
        queryClient.invalidateQueries({ queryKey: ['messages', convId] });
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      }

      // 1. Stary handler dla assignment_invite.
      const handledAssignment = await handleAssignmentAction(action, data ?? undefined);
      if (handledAssignment) {
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['assignments'] });
        queryClient.invalidateQueries({ queryKey: ['event-detail'] });
        queryClient.invalidateQueries({ queryKey: ['programs', 'myAssignments'] });
        return;
      }

      // 1b. RSVP (moduł Obecność) — inline Będę/Nie będę po tokenie.
      const handledRsvp = await handleRsvpInviteAction(action, data ?? undefined);
      if (handledRsvp) {
        queryClient.invalidateQueries({ queryKey: ['rsvp', 'mine'] });
        return;
      }

      // 2. Push Campaigns: tracking + akcje inline / deep link.
      if (data?.campaign_id && data?.recipient_id) {
        const result = await handleCampaignAction(action, data ?? undefined);
        if (result.handled) {
          if (result.navigateTo) navigateFromDeepLink(router, result.navigateTo);
          return;
        }
      }

      // 3. Default: open default link (lub ekran zaproszeń przy RSVP).
      if (action === Notifications.DEFAULT_ACTION_IDENTIFIER || !action) {
        // Zadanie ('task' / wzmianka w komentarzu zadania): wprost ekran zadania po item_id —
        // link weba bywa ścieżką modułu, której apka nie zna.
        const task = data?.rsvp_token ? null : taskFromNotificationData(data as Record<string, unknown> | null);
        if (task) {
          refreshTaskQueries(task.itemId);
          openTask(router, task.itemId, task.boardId);
          return;
        }
        navigateFromDeepLink(router, data?.rsvp_token ? '/(app)/rsvp' : data?.link);
      }
    };
    responseSubRef.current = Notifications.addNotificationResponseReceivedListener(handle);
    const receivedSub = Notifications.addNotificationReceivedListener((n) => {
      const data = n.request.content.data as Record<string, unknown> | null;
      const convId = typeof data?.conversation_id === 'string' ? data.conversation_id : null;
      if (convId) {
        queryClient.invalidateQueries({ queryKey: ['messages', convId] });
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
        return;
      }
      // Zadanie / wzmianka w zadaniu na pierwszym planie: odśwież zadania i dzwonek.
      const task = data?.type === 'task' || data?.type === 'mention' ? taskFromNotificationData(data) : null;
      if (task) {
        refreshTaskQueries(task.itemId);
        return;
      }
      // Każde inne powiadomienie serwera ma zwykle wpis w skrzynce — odśwież licznik dzwonka.
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handle(response);
    });
    return () => {
      responseSubRef.current?.remove();
      receivedSub.remove();
    };
  }, [router]);

  return null;
}

function RootNavigator() {
  const { isDark } = useTheme();

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <RootEffects />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="+not-found" />
      </Stack>
      <ToastHost />
    </>
  );
}

export default function RootLayout() {
  const fontsLoaded = useAppFonts();

  // Awaryjne schowanie ekranu startowego — gdyby cokolwiek utknęło, po 4 s i tak
  // odsłaniamy interfejs zamiast wisieć na splashu w nieskończoność.
  useEffect(() => {
    const t = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => undefined);
    }, 4000);
    return () => clearTimeout(t);
  }, []);

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#F6F4EE' }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{ persister: queryPersister, maxAge: 1000 * 60 * 60 * 24 * 7, buster: QUERY_CACHE_BUSTER }}
          >
            <I18nProvider>
              <ThemeProvider>
                <AuthProvider>
                  <CampusProvider>
                    <RootNavigator />
                  </CampusProvider>
                </AuthProvider>
              </ThemeProvider>
            </I18nProvider>
          </PersistQueryClientProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
