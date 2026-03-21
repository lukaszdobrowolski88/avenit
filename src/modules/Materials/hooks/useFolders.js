import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';

export default function useFolders(ministryKey = null) {
  const [folders, setFolders] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Buduje strukturę drzewa z płaskiej listy folderów
  const buildTree = useCallback((flatFolders, parentId = null) => {
    return flatFolders
      .filter(f => f.parent_id === parentId)
      .map(folder => ({
        ...folder,
        children: buildTree(flatFolders, folder.id)
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  }, []);

  // Pobierz foldery
  const fetchFolders = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('materials_folders')
        .select('*')
        .order('name');

      // Filtruj po ministry_key
      if (ministryKey) {
        query = query.eq('ministry_key', ministryKey);
      } else {
        query = query.is('ministry_key', null);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      const tree = buildTree(data || []);
      setFolders(tree);
    } catch (err) {
      console.error('Error fetching folders:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [ministryKey, buildTree]);

  // Utwórz folder
  const createFolder = useCallback(async (name, parentId = null) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Nie jesteś zalogowany');

      const { data, error: insertError } = await supabase
        .from('materials_folders')
        .insert({
          name: name.trim(),
          parent_id: parentId,
          ministry_key: ministryKey,
          created_by: user.email
        })
        .select()
        .single();

      if (insertError) throw insertError;

      await fetchFolders();
      return data;
    } catch (err) {
      console.error('Error creating folder:', err);
      throw err;
    }
  }, [ministryKey, fetchFolders]);

  // Zmień nazwę folderu
  const renameFolder = useCallback(async (folderId, newName) => {
    try {
      const { error: updateError } = await supabase
        .from('materials_folders')
        .update({ name: newName.trim(), updated_at: new Date().toISOString() })
        .eq('id', folderId);

      if (updateError) throw updateError;

      await fetchFolders();
    } catch (err) {
      console.error('Error renaming folder:', err);
      throw err;
    }
  }, [fetchFolders]);

  // Usuń folder (kaskadowo usuwa podfoldery i pliki)
  const deleteFolder = useCallback(async (folderId) => {
    try {
      // Najpierw pobierz wszystkie pliki z tego folderu i podfolderów
      const { data: files } = await supabase
        .from('materials_files')
        .select('storage_path')
        .eq('folder_id', folderId);

      // Usuń pliki ze storage
      if (files && files.length > 0) {
        const paths = files.map(f => f.storage_path);
        await supabase.storage.from('materials').remove(paths);
      }

      // Usuń folder (kaskadowo usunie podfoldery przez ON DELETE CASCADE)
      const { error: deleteError } = await supabase
        .from('materials_folders')
        .delete()
        .eq('id', folderId);

      if (deleteError) throw deleteError;

      // Jeśli usunięty folder był zaznaczony, odznacz go
      if (selectedFolderId === folderId) {
        setSelectedFolderId(null);
      }

      await fetchFolders();
    } catch (err) {
      console.error('Error deleting folder:', err);
      throw err;
    }
  }, [fetchFolders, selectedFolderId]);

  // Przenieś folder do innego rodzica
  const moveFolder = useCallback(async (folderId, newParentId) => {
    try {
      const { error: updateError } = await supabase
        .from('materials_folders')
        .update({ parent_id: newParentId, updated_at: new Date().toISOString() })
        .eq('id', folderId);

      if (updateError) throw updateError;

      await fetchFolders();
    } catch (err) {
      console.error('Error moving folder:', err);
      throw err;
    }
  }, [fetchFolders]);

  // Znajdź folder po ID (przeszukuje drzewo rekursywnie)
  const findFolderById = useCallback((folderId, folderList = folders) => {
    for (const folder of folderList) {
      if (folder.id === folderId) return folder;
      if (folder.children?.length > 0) {
        const found = findFolderById(folderId, folder.children);
        if (found) return found;
      }
    }
    return null;
  }, [folders]);

  // Pobierz ścieżkę do folderu (breadcrumbs)
  const getFolderPath = useCallback((folderId, flatFolders) => {
    const path = [];
    let currentId = folderId;

    while (currentId) {
      const folder = flatFolders.find(f => f.id === currentId);
      if (folder) {
        path.unshift(folder);
        currentId = folder.parent_id;
      } else {
        break;
      }
    }

    return path;
  }, []);

  // Pobierz foldery przy pierwszym renderze
  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  return {
    folders,
    selectedFolderId,
    setSelectedFolderId,
    loading,
    error,
    fetchFolders,
    createFolder,
    renameFolder,
    deleteFolder,
    moveFolder,
    findFolderById,
    getFolderPath
  };
}
