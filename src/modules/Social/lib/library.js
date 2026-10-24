import { supabase } from '../../../lib/supabase';
import { uploadSocialMedia } from './socialApi';

// Biblioteka mediów (migracja 124, social_media_items) — CRUD przez /api/db w zakresie modułu.

export const itemToMedia = (it) => ({
  path: it.path, mime: it.mime || '', kind: it.kind === 'video' ? 'video' : 'image',
  width: it.width || null, height: it.height || null, size: it.size || null, duration: it.duration || null,
  alt: it.alt || null, name: it.name || null,
});

export async function listLibrary() {
  const { data, error } = await supabase.from('social_media_items').select('*').order('created_at', { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function addToLibrary(media, source = 'upload') {
  const { data, error } = await supabase.from('social_media_items').insert({
    path: media.path, mime: media.mime || null, kind: media.kind === 'video' ? 'video' : 'image',
    width: media.width ? Math.round(media.width) : null, height: media.height ? Math.round(media.height) : null,
    size: media.size ? Math.round(media.size) : null, duration: media.duration || null, alt: media.alt || null, name: media.name || null,
    source,
  }).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateLibraryItem(id, patch) {
  const { error } = await supabase.from('social_media_items').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function removeLibraryItem(id) {
  const { error } = await supabase.from('social_media_items').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// Zdjęcia z modułu Pliki (te, które osoba widzi — filtruje serwer).
export async function listMaterialImages() {
  const { data, error } = await supabase.from('materials_files')
    .select('id, name, storage_path, mime_type, file_size, created_at')
    .ilike('mime_type', 'image/%')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data || []).filter((f) => f.storage_path);
}

// Import pliku z Plików: pobranie (z uprawnieniami osoby) i wgranie kopii do social-media —
// Meta pobiera media z publicznego bucketu social-media, a pliki z Plików bywają chronione.
export async function importMaterial(file) {
  const { data: blob, error } = await supabase.storage.from('materials').download(file.storage_path);
  if (error || !blob) throw new Error(error?.message || 'Nie udało się pobrać pliku.');
  const f = new File([blob], file.name || 'plik.jpg', { type: file.mime_type || blob.type || 'image/jpeg' });
  const media = await uploadSocialMedia(f);
  return addToLibrary(media, 'materials');
}
