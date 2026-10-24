import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { supabase, tenantWebBase } from '../../lib/supabase';

// Social Media — ten sam kontrakt co web (fn social, src/modules/Social/lib/socialApi.js):
// status, listy postów, zapis z intencją (szkic / do akceptacji / kolejka / teraz / termin),
// akceptacja, komentarze i historia. Uprawnienia liczy serwer (social/service.js).

export type PostStatus = 'draft' | 'pending_approval' | 'scheduled' | 'publishing' | 'published' | 'partial' | 'failed';
export type TargetStatus = 'pending' | 'publishing' | 'processing' | 'published' | 'failed';
export type Provider = 'facebook' | 'instagram';
export type View = 'queue' | 'approval' | 'drafts' | 'sent';
export type Intent = 'draft' | 'submit' | 'schedule' | 'queue' | 'now';

export interface SocialMedia {
  path: string;
  url?: string;
  mime: string;
  kind: 'image' | 'video';
  width?: number | null;
  height?: number | null;
  size?: number | null;
  duration?: number | null;
  alt?: string | null;
  name?: string | null;
}

export interface SocialAccount {
  id: string;
  provider: Provider;
  name: string;
  username?: string | null;
  avatar_url?: string | null;
  status: 'active' | 'error' | 'revoked';
  last_error?: string | null;
  connected_by?: string | null;
}

export interface TargetOptions { format?: string; first_comment?: string; share_to_feed?: boolean; link?: string }

export interface SocialTarget {
  id: string;
  account_id: string | null;
  provider: Provider;
  account_name: string | null;
  content: string | null;
  media: SocialMedia[] | null;
  options: TargetOptions;
  status: TargetStatus;
  attempts: number;
  permalink: string | null;
  error: string | null;
  published_at: string | null;
}

export interface SocialPost {
  id: string;
  content: string;
  media: SocialMedia[];
  status: PostStatus;
  scheduled_at: string | null;
  published_at: string | null;
  tags: string[];
  review_note: string | null;
  created_by: string | null;
  approved_by: string | null;
  updated_at: string;
  targets: SocialTarget[];
}

export interface SocialAccess {
  view?: boolean; create?: boolean; update_all?: boolean; delete_all?: boolean; publish?: boolean; manage?: boolean; admin?: boolean;
}

export interface SocialStatus {
  accounts: SocialAccount[];
  access: SocialAccess;
  counts: { queue: number; approval: number; drafts: number; failed: number };
  meta: { configured: boolean };
  me: { email: string | null };
}

export interface Activity { id: string; kind: string; actor: string | null; note: string | null; created_at: string }

export class SocialApiError extends Error {
  code?: string;
  details?: string[];
}

export const socialCall = async <T = any>(action: string, body: Record<string, unknown> = {}): Promise<T> => {
  const { data, error } = await supabase.functions.invoke('social', { body: { action, ...body }, silent: true } as never);
  const payload = (error as any)?.context ?? data;
  if (error || payload?.error) {
    const e = new SocialApiError(payload?.error || (error as any)?.message || 'Błąd modułu Social Media');
    e.code = payload?.code;
    e.details = payload?.details;
    throw e;
  }
  return data as T;
};

export const socialKeys = {
  status: ['social', 'status'] as const,
  list: (view: View) => ['social', 'list', view] as const,
  post: (id: string) => ['social', 'post', id] as const,
  activity: (id: string) => ['social', 'activity', id] as const,
  slots: ['social', 'slots'] as const,
};

export const useSocialStatus = () =>
  useQuery({ queryKey: socialKeys.status, queryFn: () => socialCall<SocialStatus>('status'), staleTime: 15_000 });

export const useSocialPosts = (view: View) =>
  useQuery({ queryKey: socialKeys.list(view), queryFn: () => socialCall<{ posts: SocialPost[] }>('list', { view }).then((d) => d.posts || []) });

export const useSocialPost = (id?: string) =>
  useQuery({ queryKey: socialKeys.post(id || ''), enabled: !!id, queryFn: () => socialCall<{ post: SocialPost }>('get', { id }).then((d) => d.post) });

export const useActivity = (id?: string) =>
  useQuery({ queryKey: socialKeys.activity(id || ''), enabled: !!id, queryFn: () => socialCall<{ activity: Activity[] }>('activity', { id }).then((d) => d.activity || []) });

export interface SharePrefill { content: string; media: SocialMedia[]; source_type: string; source_id: string; link: string; title?: string }

// Gotowy szkic z wydarzenia / kazania („Udostępnij w social media”).
export const useSharePrefill = (kind?: string, id?: string) =>
  useQuery({
    queryKey: ['social', 'prefill', kind || '', id || ''],
    enabled: !!kind && !!id,
    staleTime: Infinity,
    queryFn: () => socialCall<{ prefill: SharePrefill }>('share_prefill', { kind, id }).then((d) => d.prefill),
  });

export const useSlots = () =>
  useQuery({ queryKey: socialKeys.slots, queryFn: () => socialCall<{ slots: { account_id: string | null; weekday: number; time: string }[] }>('slots').then((d) => d.slots || []) });

// Odświeżenie wszystkiego modułu po akcji.
export const useInvalidateSocial = () => {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['social'] });
};

// Realtime: zmiana postów/kanałów (worker, inne urządzenie) → przeładowanie zapytań modułu.
export const useSocialRealtime = () => {
  const qc = useQueryClient();
  useEffect(() => {
    const name = 'social:mobile';
    for (const c of supabase.getChannels()) if (c.topic === `realtime:${name}`) supabase.removeChannel(c);
    let t: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => qc.invalidateQueries({ queryKey: ['social'] }), 400);
    };
    const channel = supabase
      .channel(name)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'social_posts' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'social_accounts' }, bump)
      .subscribe();
    return () => {
      if (t) clearTimeout(t);
      supabase.removeChannel(channel);
    };
  }, [qc]);
};

export const socialApi = {
  save: (body: Record<string, unknown>) => socialCall<{ post: SocialPost }>('save', body).then((d) => d.post),
  approve: (id: string, extra: Record<string, unknown> = {}) => socialCall<{ post: SocialPost }>('approve', { id, ...extra }).then((d) => d.post),
  reject: (id: string, note: string) => socialCall<{ post: SocialPost }>('reject', { id, note }).then((d) => d.post),
  unschedule: (id: string) => socialCall<{ post: SocialPost }>('unschedule', { id }).then((d) => d.post),
  publishNow: (id: string) => socialCall<{ post: SocialPost }>('publish_now', { id }).then((d) => d.post),
  retry: (id: string, targetId?: string) => socialCall<{ post: SocialPost }>('retry', { id, target_id: targetId }).then((d) => d.post),
  remove: (id: string) => socialCall('delete', { id }),
  duplicate: (id: string) => socialCall<{ post: SocialPost }>('duplicate', { id }).then((d) => d.post),
  queuePreview: (accountIds: string[], id?: string) => socialCall<{ next_slot: string | null }>('queue_preview', { account_ids: accountIds, id }).then((d) => d.next_slot),
  comment: (id: string, body: string) => socialCall<{ activity: Activity[] }>('comment', { id, body }).then((d) => d.activity || []),
  commentDelete: (commentId: string) => socialCall<{ activity: Activity[] }>('comment_delete', { comment_id: commentId }).then((d) => d.activity || []),
};

export const hashtagGroups = async (): Promise<{ id: string; name: string; hashtags: string }[]> => {
  const { data, error } = await supabase.from('social_hashtag_groups').select('id, name, hashtags').order('name');
  if (error) throw error;
  return (data as any[]) || [];
};

// Adres pliku posta (publiczny storage na subdomenie kościoła; miniatura przez ?w=).
export const mediaUri = (m: Pick<SocialMedia, 'path' | 'url'>, width?: number) => {
  const base = tenantWebBase();
  const url = base ? `${base}/storage/social-media/${m.path}` : m.url || supabase.storage.from('social-media').getPublicUrl(m.path).data.publicUrl;
  return width ? `${url}?w=${width}` : url;
};

export const MAX_FILE = 50 * 1024 * 1024;
export class FileTooLarge extends Error {}

const randomDir = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

// Zdjęcia / wideo z galerii albo aparatu → wgranie do bucketu social-media.
export const pickMedia = async (source: 'library' | 'camera', limit: number): Promise<ImagePicker.ImagePickerAsset[]> => {
  const perm = source === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return [];
  const opts: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images', 'videos'],
    quality: 0.85,
    exif: false,
    // iOS: HEIC → JPEG (Instagram i Facebook nie przyjmują HEIC).
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    videoMaxDuration: 180,
  };
  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync(opts)
    : await ImagePicker.launchImageLibraryAsync({ ...opts, allowsMultipleSelection: limit > 1, selectionLimit: Math.max(1, limit), orderedSelection: true });
  if (result.canceled) return [];
  return (result.assets || []).slice(0, limit);
};

export const uploadAsset = async (a: ImagePicker.ImagePickerAsset): Promise<SocialMedia> => {
  if (a.fileSize && a.fileSize > MAX_FILE) throw new FileTooLarge('Plik jest za duży (najwyżej 50 MB).');
  const kind: 'image' | 'video' = a.type === 'video' || /^video\//.test(a.mimeType || '') ? 'video' : 'image';
  const fromName = (a.fileName || a.uri).split('?')[0].split('.').pop() || '';
  let ext = (fromName || (kind === 'video' ? 'mp4' : 'jpg')).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
  if (ext === 'heic' || ext === 'heif') ext = 'jpg';
  const mime = a.mimeType && !/heic|heif/i.test(a.mimeType) ? a.mimeType : kind === 'video' ? (ext === 'mov' ? 'video/quicktime' : 'video/mp4') : 'image/jpeg';
  const path = `${randomDir()}/plik.${ext || 'bin'}`;
  const file = { uri: a.uri, name: `plik.${ext}`, type: mime };
  const { error } = await supabase.storage.from('social-media').upload(path, file as never, { upsert: false });
  if (error) throw new Error((error as any)?.message || 'Nie udało się wysłać pliku.');
  return {
    path, mime, kind,
    width: a.width || null, height: a.height || null, size: a.fileSize || null,
    duration: a.duration ? Math.round(a.duration / 100) / 10 : null, alt: null, name: a.fileName || null,
  };
};

// ── Pomysły i biblioteka mediów (migracja 124; CRUD przez /api/db w zakresie modułu) ─────────
export type IdeaColumn = 'idea' | 'progress' | 'ready';
export const IDEA_COLUMNS: { key: IdeaColumn; label: string }[] = [
  { key: 'idea', label: 'Pomysły' },
  { key: 'progress', label: 'W przygotowaniu' },
  { key: 'ready', label: 'Gotowe do publikacji' },
];

export interface SocialIdea {
  id: string;
  title: string;
  content: string;
  media: SocialMedia[];
  tags: string[];
  column_key: IdeaColumn;
  position: number;
  post_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface LibraryItem extends SocialMedia { id: string; source: string; tags: string[]; created_at: string }

const dbError = (error: unknown) => new Error((error as any)?.message || 'Nie udało się zapisać');

export const useIdeas = (enabled = true) =>
  useQuery({
    queryKey: ['social', 'ideas'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from('social_ideas').select('*').order('created_at', { ascending: false }).limit(300);
      if (error) throw dbError(error);
      return (data as SocialIdea[]) || [];
    },
  });

export const ideasApi = {
  create: async (row: Partial<SocialIdea>) => {
    const { error } = await supabase.from('social_ideas').insert({ ...row, position: Date.now() / -1000 });
    if (error) throw dbError(error);
  },
  update: async (id: string, patch: Partial<SocialIdea>) => {
    const { error } = await supabase.from('social_ideas').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw dbError(error);
  },
  remove: async (id: string) => {
    const { error } = await supabase.from('social_ideas').delete().eq('id', id);
    if (error) throw dbError(error);
  },
  get: async (id: string): Promise<SocialIdea | null> => {
    const { data, error } = await supabase.from('social_ideas').select('*').eq('id', id).maybeSingle();
    if (error) throw dbError(error);
    return (data as SocialIdea) || null;
  },
};

export const useLibrary = (enabled: boolean) =>
  useQuery({
    queryKey: ['social', 'library'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from('social_media_items').select('*').order('created_at', { ascending: false }).limit(300);
      if (error) throw dbError(error);
      return (data as LibraryItem[]) || [];
    },
  });

export const libraryToMedia = (it: LibraryItem): SocialMedia => ({
  path: it.path, mime: it.mime || '', kind: it.kind === 'video' ? 'video' : 'image',
  width: it.width ?? null, height: it.height ?? null, size: it.size ?? null, duration: it.duration ?? null, alt: it.alt ?? null, name: it.name ?? null,
});
