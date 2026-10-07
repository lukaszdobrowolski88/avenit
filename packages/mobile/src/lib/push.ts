import * as Notifications from 'expo-notifications';
import { getActiveConversation, playReceiveSound } from './sounds';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { respondToAssignment } from './assignments';
import { showError } from './errors';

// Wywołanie funkcji backendu Avenit (/api/fn/*) przez klienta (tenant z logowania, odświeżanie
// tokenu). Błąd (np. 403, brak sieci) RZUCA — wcześniej surowy fetch bez sprawdzania statusu
// kończył się cichym „sukcesem”.
async function callFn(name: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw error;
  return data;
}

// Powiadomienie przy OTWARTEJ aplikacji: własny dźwięk przyjścia zamiast systemowego; w otwartej
// właśnie rozmowie bez banera (wiadomość i tak pojawia się w wątku).
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as { conversation_id?: string } | null;
    const inThisThread = !!data?.conversation_id && data.conversation_id === getActiveConversation();
    playReceiveSound();
    return {
      shouldPlaySound: false,
      shouldSetBadge: true,
      shouldShowAlert: !inThisThread,
      shouldShowBanner: !inThisThread,
      shouldShowList: true,
    };
  },
});

export const ASSIGNMENT_CATEGORY = 'assignment_invite';
export const RSVP_INVITE_CATEGORY = 'rsvp_invite';

// Kategorie używane przez moduł Push Campaigns (zsynchronizowane z
// src/modules/PushCampaigns/constants.js).  Etykiety są sztywne i wymagają
// re-deploya appki przy zmianie — campaign editor pozwala je nadpisać tylko
// dla webu, gdzie mapujemy je w runtime na notification.actions[].
export const PUSH_CAMPAIGN_CATEGORIES = [
  { id: 'cm_open_link', actions: [
    { identifier: 'open_link', buttonTitle: 'Otwórz', options: { opensAppToForeground: true } },
  ]},
  { id: 'cm_external_url', actions: [
    { identifier: 'external_url', buttonTitle: 'Otwórz', options: { opensAppToForeground: true } },
  ]},
  { id: 'cm_form', actions: [
    { identifier: 'open_form', buttonTitle: 'Wypełnij', options: { opensAppToForeground: true } },
    { identifier: 'dismiss',   buttonTitle: 'Później',  options: { opensAppToForeground: false } },
  ]},
  { id: 'cm_rsvp_yes_no', actions: [
    { identifier: 'rsvp_yes', buttonTitle: 'Potwierdzam', options: { opensAppToForeground: false } },
    { identifier: 'rsvp_no',  buttonTitle: 'Nie mogę',    options: { opensAppToForeground: false, isDestructive: true } },
  ]},
];

let categoryRegistered = false;

export const registerNotificationCategories = async () => {
  if (categoryRegistered) return;
  try {
    await Notifications.setNotificationCategoryAsync(ASSIGNMENT_CATEGORY, [
      {
        identifier: 'accept',
        buttonTitle: 'Akceptuję',
        options: { opensAppToForeground: false },
      },
      {
        identifier: 'reject',
        buttonTitle: 'Odrzucam',
        options: { opensAppToForeground: false, isDestructive: true },
      },
    ]);

    for (const category of PUSH_CAMPAIGN_CATEGORIES) {
      await Notifications.setNotificationCategoryAsync(category.id, category.actions as any);
    }

    // Moduł Obecność (RSVP) — inline Będę / Nie będę po tokenie zaproszenia.
    await Notifications.setNotificationCategoryAsync(RSVP_INVITE_CATEGORY, [
      { identifier: 'rsvp_yes', buttonTitle: 'Będę', options: { opensAppToForeground: false } },
      { identifier: 'rsvp_no', buttonTitle: 'Nie będę', options: { opensAppToForeground: false, isDestructive: true } },
    ]);

    categoryRegistered = true;
  } catch (e) {
    console.warn('[push] register category failed:', (e as Error)?.message);
  }
};

// Mapowanie identyfikatora przycisku Expo na typ akcji push_campaign_actions.
const CAMPAIGN_ACTION_MAP: Record<string, { type: 'deep_link' | 'inline_rsvp' | 'open_form' | 'external_url'; value?: string }> = {
  open_link:    { type: 'deep_link' },
  external_url: { type: 'external_url' },
  open_form:    { type: 'open_form' },
  dismiss:      { type: 'deep_link', value: '/' },
  rsvp_yes:     { type: 'inline_rsvp', value: 'yes' },
  rsvp_no:      { type: 'inline_rsvp', value: 'no' },
};

/**
 * Obsługa akcji z push_campaigns — wywoływana z _layout.tsx.  Zwraca
 * { handled, navigateTo? }: handled=true gdy wykonaliśmy inline-akcję
 * lub samo trackowanie; navigateTo zawiera ścieżkę gdy chcemy też przejść.
 */
export const handleCampaignAction = async (
  actionIdentifier: string,
  data: Record<string, unknown> | null | undefined,
): Promise<{ handled: boolean; navigateTo?: string }> => {
  const campaignId = data?.campaign_id as string | undefined;
  const recipientId = data?.recipient_id as string | undefined;
  const link = data?.link as string | undefined;
  if (!campaignId || !recipientId) return { handled: false };

  const isDefault = !actionIdentifier ||
    actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER;

  // Tap na body — log opened + nawiguj do link.
  if (isDefault) {
    await trackEvent(campaignId, recipientId, 'opened').catch(() => undefined);
    return { handled: true, navigateTo: link };
  }

  const mapping = CAMPAIGN_ACTION_MAP[actionIdentifier];
  if (!mapping) return { handled: false };

  // Inline RSVP — nie otwieraj appki, wykonaj akcję serwerowo.
  if (mapping.type === 'inline_rsvp') {
    try {
      const userEmail = (await supabase.auth.getUser()).data.user?.email;
      await callFn('push-action-handler', {
        campaign_id: campaignId,
        recipient_id: recipientId,
        user_email: userEmail,
        action_type: 'inline_rsvp',
        action_value: mapping.value,
      });
    } catch (e) {
      console.warn('[push] inline rsvp failed:', (e as Error)?.message);
    }
    return { handled: true };
  }

  // Pozostałe — log action_clicked + zwróć ścieżkę do nawigacji.
  await trackEvent(campaignId, recipientId, 'action_clicked').catch(() => undefined);
  const actions = (data?.actions as Array<{ action_type: string; action_value?: string }>) || [];
  const matched = actions.find(a => a.action_type === mapping.type);
  if (mapping.type === 'external_url') {
    return { handled: true, navigateTo: matched?.action_value };
  }
  if (mapping.type === 'open_form') {
    return { handled: true, navigateTo: `/forms/${matched?.action_value}` };
  }
  // deep_link
  return { handled: true, navigateTo: matched?.action_value || link };
};

const trackEvent = async (
  campaignId: string,
  recipientId: string,
  event: 'opened' | 'action_clicked' | 'dismissed',
  actionId?: string,
) => {
  await callFn('push-event-track', {
    campaign_id: campaignId,
    recipient_id: recipientId,
    event,
    action_id: actionId,
  });
};

// Inline RSVP (moduł Obecność) — Będę/Nie będę wprost z powiadomienia (po tokenie).
export const handleRsvpInviteAction = async (
  actionIdentifier: string,
  data: Record<string, unknown> | null | undefined,
): Promise<boolean> => {
  const token = data?.rsvp_token as string | undefined;
  if (!token) return false;
  if (actionIdentifier !== 'rsvp_yes' && actionIdentifier !== 'rsvp_no') return false;
  const answer = actionIdentifier === 'rsvp_yes' ? 'yes' : 'no';
  try {
    await callFn('rsvp-respond', { token, answer });
  } catch (e) {
    console.warn('[push] rsvp invite action failed:', (e as Error)?.message);
    showError('Nie udało się zapisać odpowiedzi', e, 'Otwórz zaproszenie w aplikacji i spróbuj ponownie.');
  }
  return true;
};

export const handleAssignmentAction = async (
  actionIdentifier: string,
  data: Record<string, unknown> | null | undefined,
) => {
  if (actionIdentifier !== 'accept' && actionIdentifier !== 'reject') return false;
  const assignmentId = (data as { assignmentId?: number | string })?.assignmentId;
  if (!assignmentId) return false;
  // Ta sama droga co pulpit, web i link z maila: serwer zapisuje odpowiedź i przy odmowie
  // zdejmuje osobę z grafiku w jednej transakcji (bezpośredni update tabeli dawał 403/„duchy”).
  try {
    await respondToAssignment(String(assignmentId), actionIdentifier === 'accept' ? 'accepted' : 'rejected');
  } catch (e) {
    console.warn('[push] respond to assignment failed:', (e as Error)?.message);
    // Akcja z powiadomienia (apka mogła być w tle) — powiedz wprost, że się nie udało.
    showError('Nie udało się zapisać odpowiedzi', e, 'Otwórz zaproszenie w aplikacji i spróbuj ponownie.');
    return false;
  }
  return true;
};

export const registerPushToken = async (userEmail: string) => {
  // Android emulator z Google Play Services CAN odbierać FCM push.
  // iOS Simulator nie odbiera APNs — pomijamy.
  if (!Device.isDevice && Platform.OS === 'ios') {
    if (__DEV__) console.log('[push] iOS simulator — pomijam rejestrację tokenu');
    return;
  }

  const { status: existing } = (await Notifications.getPermissionsAsync()) as {
    status?: string;
  };
  let status = existing;
  if (status !== 'granted') {
    const { status: requested } = (await Notifications.requestPermissionsAsync()) as {
      status?: string;
    };
    status = requested;
  }
  if (status !== 'granted') {
    console.warn('[push] brak uprawnień do notyfikacji');
    return;
  }

  await registerNotificationCategories();

  // Android 8+: serwer wysyła na kanał 'default' (send-push: channelId) — bez utworzenia go
  // powiadomienia lądowały na kanale zapasowym Expo (bez wyskakującego banera i dźwięku).
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Powiadomienia',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 120, 200],
      lightColor: '#E9B949',
    }).catch(() => undefined);
  }

  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string | null } })?.eas
    ?.projectId;
  if (!projectId) {
    console.warn(
      '[push] missing EAS projectId in app.config.ts extra.eas.projectId — skip push registration (faza 6)',
    );
    return;
  }
  let token: string;
  try {
    const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
    token = tokenResult.data;
    if (__DEV__) console.log('[push] token push uzyskany');
  } catch (e: any) {
    console.warn(`[push] getExpoPushTokenAsync failed: ${e?.message}`);
    return;
  }

  // Tabela push_tokens (mobile-specific) — patrz migrations/create_push_tokens.sql.
  // Web push używa osobnej push_subscriptions (VAPID/web-push).
  const { error } = await (supabase.from('push_tokens') as any).upsert(
    {
      user_email: userEmail,
      expo_token: token,
      platform: Platform.OS,
      device_name: Device.modelName ?? null,
      app_version: Constants.expoConfig?.version ?? null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'expo_token' },
  );
  if (error) {
    if ((error as any).code === '42P01') {
      console.warn(
        '[push] tabela push_tokens nie istnieje — uruchom migracje migrations/create_push_tokens.sql',
      );
    } else {
      console.warn('[push] failed to upsert token', error);
    }
  }
};
