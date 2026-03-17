import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';

// Domyślne ikony dla typów folderów
const FOLDER_ICONS = {
  inbox: 'Inbox',
  sent: 'Send',
  drafts: 'FileEdit',
  trash: 'Trash2',
  spam: 'AlertTriangle',
  archive: 'Archive',
  custom: 'Folder'
};

export default function useFolders(accountId) {
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Pobierz foldery dla konta
  const fetchFolders = useCallback(async () => {
    if (!accountId) {
      setFolders([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('mail_folders')
        .select('*')
        .eq('account_id', accountId)
        .order('position', { ascending: true });

      if (fetchError) throw fetchError;
      setFolders(data || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching folders:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  // Pobierz przy zmianie konta
  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  // Utwórz nowy folder
  const createFolder = useCallback(async (name, parentId = null, color = null) => {
    if (!accountId) return null;

    try {
      const maxPosition = folders.reduce((max, f) => Math.max(max, f.position || 0), 0);

      const { data, error: createError } = await supabase
        .from('mail_folders')
        .insert({
          account_id: accountId,
          name,
          type: 'custom',
          icon: FOLDER_ICONS.custom,
          parent_id: parentId,
          position: maxPosition + 1,
          color
        })
        .select()
        .single();

      if (createError) throw createError;

      await fetchFolders();
      return data;
    } catch (err) {
      console.error('Error creating folder:', err);
      setError(err.message);
      return null;
    }
  }, [accountId, folders, fetchFolders]);

  // Zmień nazwę folderu
  const renameFolder = useCallback(async (folderId, newName) => {
    try {
      const { error: updateError } = await supabase
        .from('mail_folders')
        .update({ name: newName })
        .eq('id', folderId);

      if (updateError) throw updateError;

      await fetchFolders();
      return true;
    } catch (err) {
      console.error('Error renaming folder:', err);
      setError(err.message);
      return false;
    }
  }, [fetchFolders]);

  // Zmień kolor folderu
  const updateFolderColor = useCallback(async (folderId, color) => {
    try {
      const { error: updateError } = await supabase
        .from('mail_folders')
        .update({ color })
        .eq('id', folderId);

      if (updateError) throw updateError;

      await fetchFolders();
      return true;
    } catch (err) {
      console.error('Error updating folder color:', err);
      setError(err.message);
      return false;
    }
  }, [fetchFolders]);

  // Usuń folder (tylko custom)
  const deleteFolder = useCallback(async (folderId) => {
    try {
      const folder = folders.find(f => f.id === folderId);
      if (!folder || folder.type !== 'custom') {
        throw new Error('Nie można usunąć folderu systemowego');
      }

      const { error: deleteError } = await supabase
        .from('mail_folders')
        .delete()
        .eq('id', folderId);

      if (deleteError) throw deleteError;

      await fetchFolders();
      return true;
    } catch (err) {
      console.error('Error deleting folder:', err);
      setError(err.message);
      return false;
    }
  }, [folders, fetchFolders]);

  // Aktualizuj licznik nieprzeczytanych
  const updateUnreadCount = useCallback(async (folderId, count) => {
    try {
      const { error: updateError } = await supabase
        .from('mail_folders')
        .update({ unread_count: count })
        .eq('id', folderId);

      if (updateError) throw updateError;

      // Aktualizuj lokalnie bez ponownego pobierania
      setFolders(prev => prev.map(f =>
        f.id === folderId ? { ...f, unread_count: count } : f
      ));

      return true;
    } catch (err) {
      console.error('Error updating unread count:', err);
      return false;
    }
  }, []);

  // Przelicz liczniki dla wszystkich folderów
  const recalculateCounts = useCallback(async () => {
    if (!accountId) return;

    try {
      // Pobierz liczbę wiadomości per folder
      const { data: counts, error: countError } = await supabase
        .from('mail_messages')
        .select('folder_id, is_read')
        .eq('account_id', accountId)
        .is('deleted_at', null);

      if (countError) throw countError;

      // Oblicz per folder
      const folderCounts = {};
      counts.forEach(msg => {
        if (!folderCounts[msg.folder_id]) {
          folderCounts[msg.folder_id] = { total: 0, unread: 0 };
        }
        folderCounts[msg.folder_id].total++;
        if (!msg.is_read) {
          folderCounts[msg.folder_id].unread++;
        }
      });

      // Aktualizuj każdy folder
      for (const folder of folders) {
        const fc = folderCounts[folder.id] || { total: 0, unread: 0 };
        if (folder.unread_count !== fc.unread || folder.total_count !== fc.total) {
          await supabase
            .from('mail_folders')
            .update({
              unread_count: fc.unread,
              total_count: fc.total
            })
            .eq('id', folder.id);
        }
      }

      await fetchFolders();
    } catch (err) {
      console.error('Error recalculating counts:', err);
    }
  }, [accountId, folders, fetchFolders]);

  // Pomocnicze gettery
  const inboxFolder = folders.find(f => f.type === 'inbox');
  const sentFolder = folders.find(f => f.type === 'sent');
  const draftsFolder = folders.find(f => f.type === 'drafts');
  const trashFolder = folders.find(f => f.type === 'trash');
  const spamFolder = folders.find(f => f.type === 'spam');
  const archiveFolder = folders.find(f => f.type === 'archive');
  const customFolders = folders.filter(f => f.type === 'custom');

  // Pobierz folder po typie
  const getFolderByType = useCallback((type) => {
    return folders.find(f => f.type === type);
  }, [folders]);

  // Całkowita liczba nieprzeczytanych
  const totalUnread = folders.reduce((sum, f) => sum + (f.unread_count || 0), 0);

  return {
    folders,
    loading,
    error,
    refetch: fetchFolders,
    createFolder,
    renameFolder,
    updateFolderColor,
    deleteFolder,
    updateUnreadCount,
    recalculateCounts,
    // Pomocnicze
    inboxFolder,
    sentFolder,
    draftsFolder,
    trashFolder,
    spamFolder,
    archiveFolder,
    customFolders,
    getFolderByType,
    totalUnread,
    FOLDER_ICONS
  };
}
