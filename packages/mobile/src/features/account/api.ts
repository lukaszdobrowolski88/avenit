import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { supabase, tenantWebBase } from '../../lib/supabase';

// ── Profil (app_users) ──────────────────────────────────────────────────────
// publicUser z backendu nie zwraca avatar_url/phone — doczytujemy je z app_users.
// Zapis własnego profilu: dataapi allowSelfUpdate przepuszcza update na własnym wierszu
// (po e-mailu) dla kolumn z selfUpdateColumns (full_name/name/avatar_url/phone).
export interface MyProfile {
  email: string;
  full_name: string | null;
  name: string | null;
  avatar_url: string | null;
  phone: string | null;
}

export const useMyProfile = (email: string | null) =>
  useQuery({
    queryKey: ['my-profile', email],
    enabled: !!email,
    queryFn: async (): Promise<MyProfile | null> => {
      const { data, error } = await supabase
        .from('app_users')
        .select('email, full_name, name, avatar_url, phone')
        .eq('email', email)
        .maybeSingle();
      if (error) return null;
      return (data as unknown as MyProfile) ?? null;
    },
  });

// Profil zmienia się też na webie (zdjęcie, imię), a ekrany zakładek zostają zamontowane
// i cache jest trwały — bez tego zdjęcie ustawione w przeglądarce nie docierało do apki.
// Odświeża profil przy wejściu na ekran i przy powrocie apki z tła. Tylko w komponentach
// ekranów (useFocusEffect wymaga nawigacji) — np. nie w ikonie paska zakładek.
export const useRefreshProfileOnFocus = (email: string | null) => {
  const qc = useQueryClient();
  const refresh = useCallback(() => {
    if (email) qc.invalidateQueries({ queryKey: ['my-profile', email] });
  }, [qc, email]);
  useFocusEffect(refresh);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);
};

export const useUpdateProfile = (email: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: { full_name?: string; name?: string; avatar_url?: string }) => {
      if (!email) throw new Error('Brak zalogowanego konta');
      const { error } = await (supabase.from('app_users') as any).update(patch).eq('email', email);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-profile', email] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};

// Wybór zdjęcia z galerii (zwraca null przy braku zgody/anulowaniu).
export const pickAvatar = async (): Promise<ImagePicker.ImagePickerAsset | null> => {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
    exif: false,
  });
  if (result.canceled || !result.assets?.length) return null;
  return result.assets[0];
};

// Upload avatara do public-assets (bucket avatarów/logo, jak web) → publiczny URL.
export const uploadAvatar = async (
  asset: ImagePicker.ImagePickerAsset,
  keySeed: string,
): Promise<string> => {
  const extMatch = asset.uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  const ext = (asset.mimeType?.split('/')[1] || extMatch?.[1] || 'jpg').toLowerCase();
  const mime = asset.mimeType ?? `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  const safeSeed = keySeed.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);
  const fileName = `avatar-${safeSeed}-${Date.now()}.${ext}`;

  // FormData w React Native wysyła plik tylko jako {uri, name, type} — ArrayBuffer przepadał
  // i serwer odpowiadał „Brak pliku” (zdjęcia nie dało się zmienić).
  const file = { uri: asset.uri, name: fileName, type: mime };
  const { error } = await supabase.storage
    .from('public-assets')
    .upload(fileName, file as never, { contentType: mime, upsert: true });
  if (error) throw error;
  // Pliki serwuje host kościoła (nie api.* — tam serwer nie zna tenanta), jak na webie.
  const base = tenantWebBase();
  return base
    ? `${base}/storage/public-assets/${fileName}`
    : supabase.storage.from('public-assets').getPublicUrl(fileName).data.publicUrl;
};

// ── 2FA (TOTP) ───────────────────────────────────────────────────────────────
export const use2FAStatus = () =>
  useQuery({
    queryKey: ['2fa-status'],
    queryFn: () => supabase.auth.twoFactorStatus(),
  });

export const useBackupCodes = (enabled: boolean) =>
  useQuery({
    queryKey: ['2fa-backup-codes'],
    enabled,
    queryFn: () => supabase.auth.getBackupCodes(),
  });

// ── Sesje (urządzenia) ────────────────────────────────────────────────────────
export const useSessions = () =>
  useQuery({
    queryKey: ['sessions'],
    queryFn: async () => (await supabase.auth.getSessions()).sessions ?? [],
  });

// ── Kalendarz Google / Outlook (fn calendar-sync, Faza 2) ───────────────────
// Apka pokazuje tylko stan; łączenie konta (OAuth) odbywa się w przeglądarce (Mój profil na webie).
export interface CalendarSyncProvider {
  available: boolean;
  connection: { status: string; account_email: string | null } | null;
  target: { enabled: boolean; status: string; synced: number; last_error: string | null } | null;
}
export const useCalendarSyncStatus = (enabled: boolean) =>
  useQuery({
    queryKey: ['calendar-sync-status'],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<'google' | 'microsoft', CalendarSyncProvider> | null> => {
      const { data, error } = await supabase.functions.invoke('calendar-sync', { body: { action: 'status' } });
      if (error) return null; // starszy serwer bez funkcji — wiersz pokazuje tylko link
      return (data as { providers?: Record<'google' | 'microsoft', CalendarSyncProvider> })?.providers ?? null;
    },
  });

// Jednoliniowy opis stanu dla wiersza ustawień (klucze PL — tłumaczone przez t()).
export function calendarSyncSummary(
  providers: Record<'google' | 'microsoft', CalendarSyncProvider> | null | undefined,
  t: (k: string, v?: Record<string, string | number>) => string,
): string {
  if (!providers) return t('Połącz Google lub Outlook — w przeglądarce');
  const parts: string[] = [];
  (['google', 'microsoft'] as const).forEach((p) => {
    const s = providers[p];
    if (!s?.connection) return;
    const name = p === 'google' ? 'Google' : 'Outlook';
    if (s.connection.status === 'revoked' || s.target?.status === 'error') parts.push(t('{name}: błąd — połącz ponownie', { name }));
    else if (s.target && !s.target.enabled) parts.push(t('{name}: wstrzymane', { name }));
    else parts.push(t('{name}: {n} wydarzeń', { name, n: s.target?.synced ?? 0 }));
  });
  return parts.length ? parts.join(' · ') : t('Połącz Google lub Outlook — w przeglądarce');
}
