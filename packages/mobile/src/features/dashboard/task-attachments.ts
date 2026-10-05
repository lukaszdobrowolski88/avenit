import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { supabase, tenantWebBase } from '../../lib/supabase';
import type { TaskAttachment } from './api';

// Serwer Avenit przyjmuje pliki tylko do znanych bucketów (storage/routes.js — BUCKETS);
// dawny bucket „task_attachments” z Supabase nie istnieje, więc wysyłka kończyła się 404.
// Załączniki zadań trafiają do public-assets z prefiksem task_attachments/ (jak inne pliki weba).
const BUCKET = 'public-assets';
const PREFIX = 'task_attachments';

export interface PickedAsset {
  uri: string;
  fileName: string;
  mimeType: string;
  size?: number;
}

const guessExt = (uri: string, fallback = 'jpg'): string => {
  const m = uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  return (m?.[1] ?? fallback).toLowerCase();
};

const guessMime = (ext: string): string => {
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'heic':
      return 'image/heic';
    case 'gif':
      return 'image/gif';
    case 'pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
};

const fromImageAsset = (a: ImagePicker.ImagePickerAsset, fallbackExt = 'jpg'): PickedAsset => {
  const ext = guessExt(a.uri, a.mimeType?.split('/')[1] ?? fallbackExt);
  const mime = a.mimeType ?? guessMime(ext);
  return {
    uri: a.uri,
    fileName: a.fileName ?? `${Date.now()}.${ext}`,
    mimeType: mime,
    size: a.fileSize,
  };
};

export const pickImageForTask = async (): Promise<PickedAsset | null> => {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: false,
    quality: 0.85,
    exif: false,
  });
  if (result.canceled || !result.assets || result.assets.length === 0) return null;
  return fromImageAsset(result.assets[0]);
};

export const takePhotoForTask = async (): Promise<PickedAsset | null> => {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;
  const result = await ImagePicker.launchCameraAsync({
    quality: 0.85,
    exif: false,
  });
  if (result.canceled || !result.assets || result.assets.length === 0) return null;
  return fromImageAsset(result.assets[0]);
};

export const pickFileForTask = async (): Promise<PickedAsset | null> => {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets || result.assets.length === 0) return null;
  const a = result.assets[0];
  const ext = guessExt(a.uri, a.name?.split('.').pop() ?? 'bin');
  const mime = a.mimeType ?? guessMime(ext);
  return {
    uri: a.uri,
    fileName: a.name ?? `${Date.now()}.${ext}`,
    mimeType: mime,
    size: a.size ?? undefined,
  };
};

export const uploadTaskAttachment = async (
  taskId: string | null,
  asset: PickedAsset,
): Promise<TaskAttachment> => {
  const ext = guessExt(asset.uri, asset.mimeType.split('/')[1] ?? 'bin');
  const safeStem = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const storagePath = `${PREFIX}/${taskId ?? '_new'}/${safeStem}.${ext}`;

  // FormData w React Native wysyła plik tylko jako {uri, name, type} — ArrayBuffer przepadał.
  const file = { uri: asset.uri, name: asset.fileName, type: asset.mimeType };
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file as never, { contentType: asset.mimeType, upsert: false });
  if (uploadErr) throw uploadErr;

  // Pliki serwuje host kościoła (nie api.*), jak na webie.
  const base = tenantWebBase();
  const url = base ? `${base}/storage/${BUCKET}/${storagePath}` : supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
  return {
    url,
    name: asset.fileName,
    type: asset.mimeType,
    size: asset.size,
  };
};

export const deleteTaskAttachment = async (url: string): Promise<void> => {
  const m = url.match(/\/storage\/public-assets\/(task_attachments\/.+)$/);
  if (!m) return;
  await supabase.storage.from(BUCKET).remove([m[1]]);
};
