import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { supabase, tenantWebBase } from '../../lib/supabase';

export interface FolderRow {
  id: string;
  name: string;
  parent_id: string | null;
  team_type: string | null;
}

export interface FileRow {
  id: string;
  name: string;
  storage_path: string;
  file_size: number;
  mime_type: string;
  folder_id: string | null;
  team_type: string | null;
  description: string | null;
  download_count: number;
  created_at: string;
  uploaded_by?: string | null;
}

// Przestrzeń plików jak na webie: kolumna team_type = klucz modułu zespołu ('worship',
// 'media', 'homegroups'…), null = pliki ogólne. (Wcześniej mobile pytał o nieistniejącą
// kolumnę ministry_key → błąd 42703 i pusty ekran.)
const scopeTeam = (q: any, teamType: string | null) =>
  teamType ? q.eq('team_type', teamType) : q.is('team_type', null);

export const useFolders = (parentId: string | null, teamType: string | null = null) =>
  useQuery({
    queryKey: ['materials', 'folders', teamType, parentId],
    queryFn: async (): Promise<FolderRow[]> => {
      let q = scopeTeam(
        supabase
          .from('materials_folders')
          .select('id, name, parent_id, team_type')
          .order('name', { ascending: true }),
        teamType,
      );
      if (parentId === null) q = q.is('parent_id', null);
      else q = q.eq('parent_id', parentId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as FolderRow[];
    },
  });

export const useFiles = (folderId: string | null, teamType: string | null = null) =>
  useQuery({
    queryKey: ['materials', 'files', teamType, folderId],
    queryFn: async (): Promise<FileRow[]> => {
      let q = scopeTeam(
        supabase.from('materials_files').select('*').order('name', { ascending: true }),
        teamType,
      );
      if (folderId === null) q = q.is('folder_id', null);
      else q = q.eq('folder_id', folderId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as FileRow[];
    },
  });

export const useFolderPath = (folderId: string | null) =>
  useQuery({
    queryKey: ['materials', 'path', folderId],
    queryFn: async (): Promise<FolderRow[]> => {
      if (!folderId) return [];
      const path: FolderRow[] = [];
      let cur: string | null = folderId;
      for (let i = 0; i < 10 && cur; i++) {
        const result = await supabase
          .from('materials_folders')
          .select('id, name, parent_id, team_type')
          .eq('id', cur)
          .maybeSingle();
        const row = result.data as FolderRow | null;
        if (result.error || !row) break;
        path.unshift(row);
        cur = row.parent_id;
      }
      return path;
    },
    enabled: !!folderId,
  });

export interface SharedFile {
  id: string;
  name: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  folder_id: string | null;
  created_at: string | null;
  shared_label: string | null;
}

// „Udostępnione mi" — przez fn my-shared-materials (przynależności i dopasowanie serwerowo).
export const useSharedMaterials = () =>
  useQuery({
    queryKey: ['materials', 'shared'],
    queryFn: async (): Promise<SharedFile[]> => {
      const { data, error } = await supabase.functions.invoke('my-shared-materials', { body: {} });
      if (error) throw error;
      return (((data as any)?.files ?? []) as SharedFile[]);
    },
  });

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

export const fileIconType = (
  mime: string,
): 'pdf' | 'image' | 'audio' | 'video' | 'doc' | 'other' => {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.includes('word') || mime.includes('document') || mime.includes('text')) return 'doc';
  return 'other';
};

// Wybór dowolnego pliku z telefonu (obraz/PDF/dokument).
export const pickDocument = async (): Promise<DocumentPicker.DocumentPickerAsset | null> => {
  const res = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets?.length) return null;
  return res.assets[0];
};

// Upload pliku do bieżącego folderu Materiałów. Storage: bucket `materials` (zapis =
// requireUser, więc członek może), metadane: materials_files (T(null)). Ścieżka i pola
// jak web (useMaterials): global/<ts>_<rand>_<nazwa>, team_type null = plik globalny.
export const useUploadMaterial = (
  folderId: string | null,
  userEmail: string | null,
  teamType: string | null = null,
) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (asset: DocumentPicker.DocumentPickerAsset) => {
      const name = asset.name || `plik-${Date.now()}`;
      const mime = asset.mimeType || 'application/octet-stream';
      const sanitized = name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const storagePath = `${teamType ?? 'global'}/${Date.now()}_${Math.random().toString(36).slice(2, 11)}_${sanitized}`;

      const response = await fetch(asset.uri);
      const arrayBuffer = await response.arrayBuffer();
      const size = asset.size ?? arrayBuffer.byteLength;
      if (size > 50 * 1024 * 1024) throw new Error('Plik przekracza limit 50 MB.');

      const { error: upErr } = await supabase.storage
        .from('materials')
        .upload(storagePath, arrayBuffer, { contentType: mime });
      if (upErr) throw upErr;

      const { error: insErr } = await (supabase.from('materials_files') as any)
        .insert({
          name,
          storage_path: storagePath,
          file_size: size,
          mime_type: mime,
          folder_id: folderId,
          team_type: teamType,
          uploaded_by: userEmail,
        })
        .select('id');
      if (insErr) {
        // Wpis się nie zapisał — sprzątnij wysłany plik, żeby nie wisiał bez opisu.
        await supabase.storage.from('materials').remove([storagePath]).catch(() => undefined);
        throw insErr;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['materials', 'files', teamType, folderId] }),
  });
};

// Zmiana nazwy / usunięcie pliku — jak web (useMaterials.js). Serwer pozwala tylko na
// własne pliki (uploaded_by), chyba że rola daje res:materials_files:update|delete.
export const useRenameMaterial = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { data, error } = await (supabase.from('materials_files') as any)
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('id');
      if (error) throw error;
      if (Array.isArray(data) && data.length === 0) throw new Error('Możesz zmieniać nazwy tylko własnych plików.');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['materials', 'files'] }),
  });
};

export const useDeleteMaterial = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: Pick<FileRow, 'id' | 'storage_path'>) => {
      // Najpierw wiersz (to jego chroni serwer), dopiero potem plik w storage.
      const { data, error } = await (supabase.from('materials_files') as any).delete().eq('id', file.id).select('id');
      if (error) throw error;
      if (Array.isArray(data) && data.length === 0) throw new Error('Możesz usuwać tylko własne pliki.');
      if (file.storage_path) {
        await supabase.storage.from('materials').remove([file.storage_path]).catch(() => undefined);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['materials', 'files'] }),
  });
};

export const getDownloadUrl = async (storagePath: string): Promise<string | null> => {
  // Backend serwuje pliki publicznie pod GET /storage/<bucket>/<path>, ale WYŁĄCZNIE na
  // subdomenie tenanta (rozwiązuje tenant z subdomeny) — nie na api.*. Shim nie ma
  // `createSignedUrl` (istniał tylko w typach, nie w runtime), więc budujemy publiczny
  // URL na hoście tenanta — tak jak web (getPublicUrl).
  const base = tenantWebBase();
  if (!base) return null;
  const clean = String(storagePath).replace(/^\//, '');
  return `${base}/storage/materials/${clean}`;
};
