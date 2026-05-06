import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

export interface FolderRow {
  id: string;
  name: string;
  parent_id: string | null;
  ministry_key: string | null;
}

export interface FileRow {
  id: string;
  name: string;
  storage_path: string;
  file_size: number;
  mime_type: string;
  folder_id: string | null;
  ministry_key: string | null;
  description: string | null;
  download_count: number;
  created_at: string;
}

export const useFolders = (parentId: string | null) =>
  useQuery({
    queryKey: ['materials', 'folders', parentId],
    queryFn: async (): Promise<FolderRow[]> => {
      let q = supabase
        .from('materials_folders')
        .select('id, name, parent_id, ministry_key')
        .order('name', { ascending: true });
      if (parentId === null) q = q.is('parent_id', null);
      else q = q.eq('parent_id', parentId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as FolderRow[];
    },
  });

export const useFiles = (folderId: string | null) =>
  useQuery({
    queryKey: ['materials', 'files', folderId],
    queryFn: async (): Promise<FileRow[]> => {
      let q = supabase.from('materials_files').select('*').order('name', { ascending: true });
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
          .select('id, name, parent_id, ministry_key')
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

export const getDownloadUrl = async (storagePath: string): Promise<string | null> => {
  const { data, error } = await supabase.storage
    .from('materials')
    .createSignedUrl(storagePath, 60 * 60);
  if (error) return null;
  return data?.signedUrl ?? null;
};
