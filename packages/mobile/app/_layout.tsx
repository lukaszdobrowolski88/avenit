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
import { navigateFromDeepLink } from '../src/lib/deep-links';
import { updatePresence } from '../src/lib/presence';

SplashScreen.preventAutoHideAsync();

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
      if (s === 'active') updatePresence(email, 'online').catch(() => undefined);
      else updatePresence(email, 'away').catch(() => undefined);
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
        | { link?: string; assignmentId?: number | string; campaign_id?: string; recipient_id?: string; rsvp_token?: string }
        | null;
      const action = response.actionIdentifier;

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
        navigateFromDeepLink(router, data?.rsvp_token ? '/(app)/rsvp' : data?.link);
      }
    };
    responseSubRef.current = Notifications.addNotificationResponseReceivedListener(handle);
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handle(response);
    });
    return () => {
      responseSubRef.current?.remove();
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
