import { supabase } from '../../../lib/supabase';

// Wywołanie fn social. Błąd serwera → wyjątek z komunikatem (i listą problemów walidacji w `details`).
export async function socialCall(action, body = {}) {
  const { data, error } = await supabase.functions.invoke('social', { body: { action, ...body }, silent: true });
  if (error) {
    const ctx = error.context || {};
    const e = new Error(ctx.error || error.message || 'Błąd modułu Social Media');
    e.code = ctx.code;
    e.details = ctx.details;
    e.status = error.status;
    throw e;
  }
  if (data?.error) {
    const e = new Error(data.error);
    e.code = data.code;
    e.details = data.details;
    throw e;
  }
  return data;
}

export const socialApi = {
  status: () => socialCall('status'),
  connect: () => socialCall('connect'),
  removeAccount: (id) => socialCall('account_remove', { id }),
  list: (params) => socialCall('list', params).then((d) => d.posts || []),
  get: (id) => socialCall('get', { id }).then((d) => d.post),
  save: (post) => socialCall('save', post).then((d) => d.post),
  approve: (id, extra = {}) => socialCall('approve', { id, ...extra }).then((d) => d.post),
  reject: (id, note) => socialCall('reject', { id, note }).then((d) => d.post),
  unschedule: (id) => socialCall('unschedule', { id }).then((d) => d.post),
  reschedule: (id, scheduledAt) => socialCall('reschedule', { id, scheduled_at: scheduledAt }).then((d) => d.post),
  publishNow: (id) => socialCall('publish_now', { id }).then((d) => d.post),
  retry: (id, targetId) => socialCall('retry', { id, target_id: targetId }).then((d) => d.post),
  remove: (id) => socialCall('delete', { id }),
  duplicate: (id) => socialCall('duplicate', { id }).then((d) => d.post),
  slots: () => socialCall('slots').then((d) => d.slots || []),
  saveSlots: (slots, accountId = null) => socialCall('slots_save', { slots, account_id: accountId }).then((d) => d.slots || []),
  queuePreview: (accountIds, id) => socialCall('queue_preview', { account_ids: accountIds, id }).then((d) => d.next_slot),
};

// Wgranie pliku do bucketu social-media → obiekt mediów posta (z wymiarami / długością wideo).
export async function uploadSocialMedia(file) {
  const kind = String(file.type || '').startsWith('video/') ? 'video' : 'image';
  const ext = (String(file.name || '').split('.').pop() || (kind === 'video' ? 'mp4' : 'jpg')).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
  const dir = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '');
  const path = `${dir}/plik.${ext}`;
  const meta = await readMediaMeta(file, kind);
  const { error } = await supabase.storage.from('social-media').upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw new Error(error.message || 'Nie udało się wgrać pliku');
  const { data } = supabase.storage.from('social-media').getPublicUrl(path);
  return { path, url: data?.publicUrl || '', mime: file.type || '', kind, size: file.size || null, name: file.name || null, alt: null, ...meta };
}

function readMediaMeta(file, kind) {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.URL?.createObjectURL) { resolve({}); return; }
    const url = URL.createObjectURL(file);
    const done = (meta) => { URL.revokeObjectURL(url); resolve(meta); };
    if (kind === 'video') {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => done({ width: v.videoWidth || null, height: v.videoHeight || null, duration: Number.isFinite(v.duration) ? Math.round(v.duration * 10) / 10 : null });
      v.onerror = () => done({});
      v.src = url;
    } else {
      const img = new Image();
      img.onload = () => done({ width: img.naturalWidth || null, height: img.naturalHeight || null });
      img.onerror = () => done({});
      img.src = url;
    }
  });
}

// Adres pliku do podglądu (media posta trzymają ścieżkę; adres liczy przeglądarka).
export function mediaSrc(m) {
  if (!m?.path) return m?.url || '';
  const { data } = supabase.storage.from('social-media').getPublicUrl(m.path);
  return data?.publicUrl || m.url || '';
}
