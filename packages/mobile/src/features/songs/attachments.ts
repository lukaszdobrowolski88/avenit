import * as DocumentPicker from 'expo-document-picker';
import { supabase, tenantWebBase } from '../../lib/supabase';
import type { SongAttachment } from './library';

// Materiały pieśni (jak SongForm na webie): bucket public-assets, ścieżka
// song_attachments/<czas>_<los>.<rozszerzenie>, limit 20 MB.

const MAX = 20 * 1024 * 1024;
const TYPES = [
  'application/pdf',
  'image/*',
  'audio/*',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/octet-stream', // .pro / .pro6 (ProPresenter)
];

export class FileTooLarge extends Error {}

export const pickAndUploadSongFile = async (): Promise<SongAttachment | null> => {
  const result = await DocumentPicker.getDocumentAsync({ type: TYPES, copyToCacheDirectory: true, multiple: false });
  if (result.canceled || !result.assets?.length) return null;
  const a = result.assets[0];
  if (a.size && a.size > MAX) throw new FileTooLarge('Plik jest za duży (maks. 20 MB).');
  const ext = (a.name?.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const path = `song_attachments/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
  // FormData w React Native wysyła plik tylko jako {uri, name, type}.
  const file = { uri: a.uri, name: a.name || `plik.${ext}`, type: a.mimeType || 'application/octet-stream' };
  const { error } = await supabase.storage.from('public-assets').upload(path, file as never, { upsert: false });
  if (error) throw new Error((error as any)?.message || 'Nie udało się wysłać pliku.');
  const base = tenantWebBase();
  const url = base ? `${base}/storage/public-assets/${path}` : supabase.storage.from('public-assets').getPublicUrl(path).data.publicUrl;
  return { type: 'file', name: a.name || `Plik.${ext}`, url, description: '', date: new Date().toISOString() };
};

export const isAudio = (a: SongAttachment) => /\.(mp3|m4a|wav|aac|ogg)(\?|$)/i.test(a.url) || /\.(mp3|m4a|wav|aac|ogg)$/i.test(a.name);
export const isImage = (a: SongAttachment) => /\.(png|jpe?g|gif|webp|heic)(\?|$)/i.test(a.url);
export const isPdf = (a: SongAttachment) => /\.pdf(\?|$)/i.test(a.url) || /\.pdf$/i.test(a.name);
