import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export const ASSIGNMENT_CATEGORY = 'assignment_invite';

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
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`${(supabase as any).supabaseUrl}/functions/v1/push-action-handler`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          campaign_id: campaignId,
          recipient_id: recipientId,
          user_email: userEmail,
          action_type: 'inline_rsvp',
          action_value: mapping.value,
        }),
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
  const { data: { session } } = await supabase.auth.getSession();
  await fetch(`${(supabase as any).supabaseUrl}/functions/v1/push-event-track`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({
      campaign_id: campaignId,
      recipient_id: recipientId,
      event,
      action_id: actionId,
    }),
  });
};

export const handleAssignmentAction = async (
  actionIdentifier: string,
  data: Record<string, unknown> | null | undefined,
) => {
  if (actionIdentifier !== 'accept' && actionIdentifier !== 'reject') return false;
  const assignmentId = (data as { assignmentId?: number | string })?.assignmentId;
  if (!assignmentId) return false;
  const status = actionIdentifier === 'accept' ? 'accepted' : 'rejected';
  const { error } = await (supabase.from('schedule_assignments') as any)
    .update({ status })
    .eq('id', assignmentId);
  if (error) {
    console.warn('[push] update assignment status failed:', error.message);
    return false;
  }
  return true;
};

export const registerPushToken = async (userEmail: string) => {
  // Android emulator z Google Play Services CAN odbierać FCM push.
  // iOS Simulator nie odbiera APNs — pomijamy.
  if (!Device.isDevice && Platform.OS === 'ios') {
    console.log('[push] iOS simulator — pomijam rejestrację tokenu');
    return;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (status !== 'granted') {
    const { status: requested } = await Notifications.requestPermissionsAsync();
    status = requested;
  }
  if (status !== 'granted') {
    console.warn('[push] brak uprawnień do notyfikacji');
    return;
  }

  await registerNotificationCategories();

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
    console.log(`[push] uzyskano token: ${token.substring(0, 30)}...`);
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
