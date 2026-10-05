import * as DocumentPicker from 'expo-document-picker';
import { supabase, tenantWebBase } from '../../lib/supabase';

// Załączniki PDF przy pieśni w planie (jak „Załączniki PDF do programu” na webie):
// bucket public-assets, ścieżka program_attachments/…, limit 10 MB, wpis {name, url, date}.

export interface PlanAttachment {
  name: string;
  url: string;
  date?: string;
}

const MAX = 10 * 1024 * 1024;

export class AttachmentTooLarge extends Error {}

export const pickAndUploadPdf = async (): Promise<PlanAttachment | null> => {
  const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false });
  if (result.canceled || !result.assets?.length) return null;
  const a = result.assets[0];
  if (a.size && a.size > MAX) throw new AttachmentTooLarge('Plik jest za duży (maks. 10 MB).');
  const path = `program_attachments/${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`;
  // FormData w React Native wysyła plik tylko jako {uri, name, type} (ArrayBuffer by przepadł).
  const file = { uri: a.uri, name: a.name || 'zalacznik.pdf', type: 'application/pdf' };
  const { error } = await supabase.storage.from('public-assets').upload(path, file as never, { contentType: 'application/pdf', upsert: false });
  if (error) throw new Error((error as any)?.message || 'Nie udało się wysłać pliku.');
  // Pliki serwuje host kościoła (nie api.*) — jak web (window.location.origin).
  const base = tenantWebBase();
  const url = base ? `${base}/storage/public-assets/${path}` : supabase.storage.from('public-assets').getPublicUrl(path).data.publicUrl;
  return { name: a.name || 'Załącznik.pdf', url, date: new Date().toISOString() };
};
