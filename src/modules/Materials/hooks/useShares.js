import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';

// Udostępnianie plików/folderów osobom / grupom / grupom domowym + widok „Udostępnione mi".
export default function useShares() {
  const [email, setEmail] = useState('');
  const [targets, setTargets] = useState({ people: [], groups: [], homeGroups: [] });
  const [sharedFiles, setSharedFiles] = useState([]);
  const [loadingShared, setLoadingShared] = useState(false);
  const [sharedFileIds, setSharedFileIds] = useState(new Set());   // pliki które KTOŚ udostępnił (wskaźnik)
  const [editableFileIds, setEditableFileIds] = useState(new Set()); // pliki udostępnione MI z prawem edycji

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setEmail((data?.user?.email || '').toLowerCase())).catch(() => {}); }, []);

  // Zbiór wszystkich plików z jakimkolwiek udostępnieniem (do ikonki „udostępniony").
  const fetchSharedFileIds = useCallback(async () => {
    try { const { data } = await supabase.from('materials_shares').select('file_id'); setSharedFileIds(new Set((data || []).map((r) => r.file_id).filter(Boolean))); } catch { /* brak */ }
  }, []);
  useEffect(() => { fetchSharedFileIds(); }, [fetchSharedFileIds]);

  // Odbiorcy do wyboru w oknie udostępniania.
  const fetchTargets = useCallback(async () => {
    const out = { people: [], groups: [], homeGroups: [] };
    try { const { data } = await supabase.from('app_users').select('email, full_name, name').order('full_name'); out.people = (data || []).filter((u) => u.email).map((u) => ({ id: u.email, label: u.full_name || u.name || u.email })); } catch { /* pusto */ }
    try { const { data } = await supabase.from('home_groups').select('id, name').order('name'); out.homeGroups = (data || []).map((g) => ({ id: g.id, label: g.name })); } catch { /* pusto */ }
    try { const { data } = await supabase.from('groups').select('id, name').eq('is_active', true).order('name'); out.groups = (data || []).map((g) => ({ id: g.id, label: g.name })); } catch { /* pusto */ }
    setTargets(out);
    return out;
  }, []);

  const fetchSharesFor = useCallback(async (item) => {
    try {
      let q = supabase.from('materials_shares').select('*');
      q = item.file_id ? q.eq('file_id', item.file_id) : q.eq('folder_id', item.folder_id);
      const { data } = await q.order('created_at', { ascending: false });
      return data || [];
    } catch { return []; }
  }, []);

  const createShares = useCallback(async (item, selected, permission = 'view') => {
    const rows = selected.map((t) => ({
      file_id: item.file_id || null, folder_id: item.folder_id || null,
      target_type: t.type, target_id: String(t.id), target_label: t.label || null,
      permission: permission === 'edit' ? 'edit' : 'view', created_by: email || null,
    }));
    if (rows.length === 0) return;
    const { error } = await supabase.from('materials_shares').insert(rows);
    if (error) throw error;
    fetchSharedFileIds();
  }, [email, fetchSharedFileIds]);

  const removeShare = useCallback(async (shareId) => {
    const { error } = await supabase.from('materials_shares').delete().eq('id', shareId);
    if (error) throw error;
  }, []);

  // „Udostępnione mi": pliki udostępnione bezpośrednio + pliki w udostępnionych folderach.
  const fetchSharedWithMe = useCallback(async () => {
    if (!email) return;
    setLoadingShared(true);
    try {
      // Grupy domowe użytkownika (po e-mailu).
      let homeGroupIds = [];
      try { const { data } = await supabase.from('home_group_members').select('group_id').ilike('email', email); homeGroupIds = [...new Set((data || []).map((r) => r.group_id).filter(Boolean))]; } catch { /* brak */ }
      // Grupy członkowskie użytkownika (members → group_members).
      let groupIds = [];
      try {
        const { data: mem } = await supabase.from('members').select('id').ilike('email', email);
        const memberIds = (mem || []).map((m) => m.id).filter(Boolean);
        if (memberIds.length) { const { data: gm } = await supabase.from('group_members').select('group_id').in('member_id', memberIds); groupIds = [...new Set((gm || []).map((r) => r.group_id).filter(Boolean))]; }
      } catch { /* brak */ }

      // Zbierz udostępnienia pasujące do użytkownika.
      const shareRows = [];
      try { const { data } = await supabase.from('materials_shares').select('*').eq('target_type', 'user').ilike('target_id', email); shareRows.push(...(data || [])); } catch { /* brak */ }
      if (homeGroupIds.length) { try { const { data } = await supabase.from('materials_shares').select('*').eq('target_type', 'home_group').in('target_id', homeGroupIds.map(String)); shareRows.push(...(data || [])); } catch { /* brak */ } }
      if (groupIds.length) { try { const { data } = await supabase.from('materials_shares').select('*').eq('target_type', 'group').in('target_id', groupIds.map(String)); shareRows.push(...(data || [])); } catch { /* brak */ } }

      const fileIds = [...new Set(shareRows.filter((s) => s.file_id).map((s) => s.file_id))];
      const folderIds = [...new Set(shareRows.filter((s) => s.folder_id).map((s) => s.folder_id))];

      const files = {};
      if (fileIds.length) { try { const { data } = await supabase.from('materials_files').select('*').in('id', fileIds); (data || []).forEach((f) => { files[f.id] = f; }); } catch { /* brak */ } }
      if (folderIds.length) { try { const { data } = await supabase.from('materials_files').select('*').in('folder_id', folderIds); (data || []).forEach((f) => { files[f.id] = f; }); } catch { /* brak */ } }

      // Prawo edycji: pliki udostępnione mi bezpośrednio z permission='edit' + pliki w folderach edit.
      const editable = new Set();
      shareRows.filter((s) => s.permission === 'edit' && s.file_id).forEach((s) => { if (files[s.file_id]) editable.add(s.file_id); });
      const editFolderIds = [...new Set(shareRows.filter((s) => s.permission === 'edit' && s.folder_id).map((s) => s.folder_id))];
      if (editFolderIds.length) { try { const { data } = await supabase.from('materials_files').select('id').in('folder_id', editFolderIds); (data || []).forEach((f) => editable.add(f.id)); } catch { /* brak */ } }
      setEditableFileIds(editable);

      setSharedFiles(Object.values(files).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pl')));
    } finally { setLoadingShared(false); }
  }, [email]);

  return { email, targets, fetchTargets, fetchSharesFor, createShares, removeShare, sharedFiles, loadingShared, fetchSharedWithMe, sharedFileIds, editableFileIds, fetchSharedFileIds };
}
