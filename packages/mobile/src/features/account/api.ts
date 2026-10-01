import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';

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

  // RN: fetch(uri) → arrayBuffer → upload (najbardziej niezawodne).
  const response = await fetch(asset.uri);
  const arrayBuffer = await response.arrayBuffer();
  const { error } = await supabase.storage
    .from('public-assets')
    .upload(fileName, arrayBuffer, { contentType: mime, upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('public-assets').getPublicUrl(fileName);
  return data.publicUrl;
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
