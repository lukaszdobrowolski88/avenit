import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';

export default function useMaterials(folderId = null, ministryKey = null) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  // Pobierz pliki
  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('materials_files')
        .select('*')
        .order('name');

      // Filtruj po folderze
      if (folderId) {
        query = query.eq('folder_id', folderId);
      } else {
        query = query.is('folder_id', null);
      }

      // Filtruj po ministry_key
      if (ministryKey) {
        query = query.eq('ministry_key', ministryKey);
      } else {
        query = query.is('ministry_key', null);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      setFiles(data || []);
    } catch (err) {
      console.error('Error fetching files:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [folderId, ministryKey]);

  // Upload pojedynczego pliku
  const uploadFile = useCallback(async (file) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Nie jesteś zalogowany');

      // Limit 50MB
      if (file.size > 50 * 1024 * 1024) {
        throw new Error(`Plik "${file.name}" przekracza limit 50MB`);
      }

      // Generuj unikalną ścieżkę
      const fileExt = file.name.split('.').pop();
      const timestamp = Date.now();
      const random = Math.random().toString(36).substr(2, 9);
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const storagePath = ministryKey
        ? `${ministryKey}/${timestamp}_${random}_${sanitizedName}`
        : `global/${timestamp}_${random}_${sanitizedName}`;

      // Upload do storage
      const { error: uploadError } = await supabase.storage
        .from('materials')
        .upload(storagePath, file);

      if (uploadError) throw uploadError;

      // Zapisz metadane do bazy
      const { data, error: insertError } = await supabase
        .from('materials_files')
        .insert({
          name: file.name,
          storage_path: storagePath,
          file_size: file.size,
          mime_type: file.type || 'application/octet-stream',
          folder_id: folderId,
          ministry_key: ministryKey,
          uploaded_by: user.email
        })
        .select()
        .single();

      if (insertError) throw insertError;

      return data;
    } catch (err) {
      console.error('Error uploading file:', err);
      throw err;
    }
  }, [folderId, ministryKey]);

  // Upload wielu plików z progress
  const uploadFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList);
    if (files.length === 0) return [];

    setUploading(true);
    setUploadProgress(0);

    const uploadedFiles = [];
    const totalFiles = files.length;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const uploaded = await uploadFile(file);
          uploadedFiles.push(uploaded);
        } catch (err) {
          console.error(`Error uploading ${file.name}:`, err);
          // Kontynuuj z pozostałymi plikami
        }
        setUploadProgress(Math.round(((i + 1) / totalFiles) * 100));
      }

      await fetchFiles();
      return uploadedFiles;
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }, [uploadFile, fetchFiles]);

  // Usuń plik
  const deleteFile = useCallback(async (fileId, storagePath) => {
    try {
      // Usuń z storage
      const { error: storageError } = await supabase.storage
        .from('materials')
        .remove([storagePath]);

      if (storageError) {
        console.warn('Error removing from storage:', storageError);
      }

      // Usuń z bazy
      const { error: deleteError } = await supabase
        .from('materials_files')
        .delete()
        .eq('id', fileId);

      if (deleteError) throw deleteError;

      await fetchFiles();
    } catch (err) {
      console.error('Error deleting file:', err);
      throw err;
    }
  }, [fetchFiles]);

  // Pobierz plik (inkrementuje licznik pobrań)
  const downloadFile = useCallback(async (file) => {
    try {
      // Inkrementuj licznik pobrań
      await supabase
        .from('materials_files')
        .update({ download_count: (file.download_count || 0) + 1 })
        .eq('id', file.id);

      // Pobierz URL
      const { data } = supabase.storage
        .from('materials')
        .getPublicUrl(file.storage_path);

      // Otwórz w nowej karcie lub pobierz
      window.open(data.publicUrl, '_blank');
    } catch (err) {
      console.error('Error downloading file:', err);
      throw err;
    }
  }, []);

  // Pobierz URL pliku
  const getFileUrl = useCallback((storagePath) => {
    const { data } = supabase.storage
      .from('materials')
      .getPublicUrl(storagePath);
    return data.publicUrl;
  }, []);

  // Wyszukaj pliki
  const searchFiles = useCallback(async (query) => {
    if (!query || query.length < 2) {
      await fetchFiles();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let dbQuery = supabase
        .from('materials_files')
        .select('*')
        .ilike('name', `%${query}%`)
        .order('name');

      // Filtruj po ministry_key
      if (ministryKey) {
        dbQuery = dbQuery.eq('ministry_key', ministryKey);
      } else {
        dbQuery = dbQuery.is('ministry_key', null);
      }

      const { data, error: searchError } = await dbQuery;

      if (searchError) throw searchError;

      setFiles(data || []);
    } catch (err) {
      console.error('Error searching files:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [ministryKey, fetchFiles]);

  // Aktualizuj opis pliku
  const updateFileDescription = useCallback(async (fileId, description) => {
    try {
      const { error: updateError } = await supabase
        .from('materials_files')
        .update({ description, updated_at: new Date().toISOString() })
        .eq('id', fileId);

      if (updateError) throw updateError;

      await fetchFiles();
    } catch (err) {
      console.error('Error updating file description:', err);
      throw err;
    }
  }, [fetchFiles]);

  // Przenieś plik do innego folderu
  const moveFile = useCallback(async (fileId, newFolderId) => {
    try {
      const { error: updateError } = await supabase
        .from('materials_files')
        .update({ folder_id: newFolderId, updated_at: new Date().toISOString() })
        .eq('id', fileId);

      if (updateError) throw updateError;

      await fetchFiles();
    } catch (err) {
      console.error('Error moving file:', err);
      throw err;
    }
  }, [fetchFiles]);

  // Pobierz pliki przy zmianie folderu
  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  return {
    files,
    loading,
    error,
    uploading,
    uploadProgress,
    fetchFiles,
    uploadFile,
    uploadFiles,
    deleteFile,
    downloadFile,
    getFileUrl,
    searchFiles,
    updateFileDescription,
    moveFile
  };
}
