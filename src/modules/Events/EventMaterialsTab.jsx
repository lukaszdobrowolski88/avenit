// Zakładka „Materiały" na wydarzeniu (dowolny moduł). Łączy wydarzenie z plikami z systemu
// Materiałów/Pliki przez tabelę event_materials. Upload nowych + podpinanie istniejących,
// udostępnianie per plik (osoby/grupy/grupy domowe), widok lista/kafelki, podgląd w lightboxie,
// zmiana nazwy. Dla grup domowych upload trafia do folderu grupy (udostępniony członkom).
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, Trash2, Plus, FileText, X, Search, LayoutGrid, List as ListIcon, Pencil, Share2, Eye, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import Spinner from '../../components/Spinner';
import { ensureGroupFolder } from '../HomeGroups/homeGroupFolder';
import useShares from '../Materials/hooks/useShares';
import ShareModal from '../Materials/components/ShareModal';
import FilePreviewModal from '../Materials/components/FilePreviewModal';

const fileUrl = (path) => supabase.storage.from('materials').getPublicUrl(path).data.publicUrl;
const fmtSize = (b) => (!b ? '' : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const isImage = (m) => (m || '').startsWith('image/');

export default function EventMaterialsTab({ event, canManage }) {
  const teamType = event.module_key || null; // materiały tego modułu (null = ogólne/globalne)
  const isHomeGroup = event.module_key === 'homegroups';
  const [linked, setLinked] = useState(null);
  const [group, setGroup] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickList, setPickList] = useState(null);
  const [pickSearch, setPickSearch] = useState('');
  const [view, setView] = useState('grid'); // 'grid' | 'list'
  const [previewIdx, setPreviewIdx] = useState(null);
  const [shareItem, setShareItem] = useState(null);
  const [renameId, setRenameId] = useState(null);
  const [renameVal, setRenameVal] = useState('');
  const fileRef = useRef(null);
  const shares = useShares();

  const loadLinked = useCallback(async () => {
    const { data: links } = await supabase.from('event_materials').select('file_id').eq('event_id', event.id);
    const ids = [...new Set((links || []).map((l) => l.file_id).filter(Boolean))];
    if (!ids.length) { setLinked([]); return; }
    const { data: files } = await supabase.from('materials_files').select('*').in('id', ids);
    setLinked((files || []).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pl')));
  }, [event.id]);

  useEffect(() => { loadLinked(); }, [loadLinked]);
  useEffect(() => {
    if (!isHomeGroup || !event.home_group_id) { setGroup(null); return; }
    supabase.from('home_groups').select('id, name, materials_folder_id').eq('id', event.home_group_id).maybeSingle()
      .then(({ data }) => setGroup(data || null), () => setGroup(null));
  }, [isHomeGroup, event.home_group_id]);

  const onUpload = async (file) => {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { toast.error('Plik przekracza limit 50MB'); return; }
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const email = user?.email || null;
      const folderId = (isHomeGroup && group) ? await ensureGroupFolder(group) : null;
      const sanitized = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const storagePath = `${teamType || 'general'}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${sanitized}`;
      const { error: upErr } = await supabase.storage.from('materials').upload(storagePath, file);
      if (upErr) throw upErr;
      const { data: mf, error: insErr } = await supabase.from('materials_files').insert({
        name: file.name, storage_path: storagePath, file_size: file.size,
        mime_type: file.type || 'application/octet-stream', folder_id: folderId,
        team_type: teamType, uploaded_by: email,
      }).select().single();
      if (insErr) throw insErr;
      await supabase.from('event_materials').insert({ event_id: event.id, file_id: mf.id });
      await loadLinked();
      toast.success('Dodano materiał');
    } catch (e) { toast.error(e.message || 'Błąd dodawania materiału'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const openPicker = async () => {
    setShowPicker(true);
    setPickList(null);
    const linkedIds = new Set((linked || []).map((f) => f.id));
    let q = supabase.from('materials_files').select('*');
    q = teamType ? q.eq('team_type', teamType) : q.is('team_type', null);
    const { data } = await q.order('name');
    setPickList((data || []).filter((f) => !linkedIds.has(f.id)));
  };

  const attach = async (file) => {
    try {
      await supabase.from('event_materials').insert({ event_id: event.id, file_id: file.id });
      setPickList((prev) => (prev || []).filter((f) => f.id !== file.id));
      await loadLinked();
      toast.success('Podpięto materiał');
    } catch (e) { toast.error(e.message || 'Błąd'); }
  };

  const unlink = async (file) => {
    try {
      await supabase.from('event_materials').delete().eq('event_id', event.id).eq('file_id', file.id);
      await loadLinked();
    } catch (e) { toast.error(e.message || 'Błąd'); }
  };

  const startRename = (file) => { setRenameId(file.id); setRenameVal(file.name || ''); };
  const doRename = async (file) => {
    let name = String(renameVal || '').trim();
    if (!name) { setRenameId(null); return; }
    const oldExt = (file.name || '').includes('.') ? file.name.split('.').pop() : '';
    if (oldExt && !name.toLowerCase().endsWith('.' + oldExt.toLowerCase())) name = `${name}.${oldExt}`;
    try {
      await supabase.from('materials_files').update({ name, updated_at: new Date().toISOString() }).eq('id', file.id);
      setRenameId(null);
      await loadLinked();
    } catch (e) { toast.error(e.message || 'Błąd zmiany nazwy'); }
  };

  if (linked === null) return <Spinner center size={24} />;

  const filteredPick = (pickList || []).filter((f) => !pickSearch || (f.name || '').toLowerCase().includes(pickSearch.toLowerCase()));

  const FileActions = ({ f }) => (
    <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setPreviewIdx(linked.findIndex((x) => x.id === f.id))} title="Podgląd" className="p-1.5 rounded-lg text-gray-400 hover:text-accent-primary hover:bg-gray-100 dark:hover:bg-gray-800"><Eye size={16} /></button>
      {canManage && <button onClick={() => setShareItem({ file_id: f.id, name: f.name })} title="Udostępnij" className="p-1.5 rounded-lg text-gray-400 hover:text-accent-primary hover:bg-gray-100 dark:hover:bg-gray-800"><Share2 size={16} /></button>}
      {canManage && <button onClick={() => startRename(f)} title="Zmień nazwę" className="p-1.5 rounded-lg text-gray-400 hover:text-accent-primary hover:bg-gray-100 dark:hover:bg-gray-800"><Pencil size={15} /></button>}
      {canManage && <button onClick={() => unlink(f)} title="Odepnij od wydarzenia" className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-800"><Trash2 size={16} /></button>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {canManage ? (
          <div className="flex items-center gap-2 flex-wrap">
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => onUpload(e.target.files?.[0])} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium disabled:opacity-60">
              <Upload size={15} /> {uploading ? 'Wgrywanie…' : 'Dodaj plik'}
            </button>
            <button onClick={openPicker}
              className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
              <Plus size={15} /> Podepnij istniejące
            </button>
          </div>
        ) : <div />}
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 p-0.5">
          <button onClick={() => setView('grid')} title="Kafelki" className={`p-1.5 rounded-md ${view === 'grid' ? 'bg-accent-primary text-white' : 'text-gray-400 hover:text-gray-600'}`}><LayoutGrid size={16} /></button>
          <button onClick={() => setView('list')} title="Lista" className={`p-1.5 rounded-md ${view === 'list' ? 'bg-accent-primary text-white' : 'text-gray-400 hover:text-gray-600'}`}><ListIcon size={16} /></button>
        </div>
      </div>
      {isHomeGroup && group && canManage && <p className="text-[11px] text-gray-400 -mt-2">Nowe pliki trafią do materiałów grupy „{group.name}" i będą widoczne dla jej członków.</p>}

      {linked.length === 0 ? (
        <div className="p-6 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">Brak materiałów.</p>
          {canManage && <p className="text-xs text-gray-400 mt-1">Dodaj plik lub podepnij istniejące.</p>}
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {linked.map((m) => (
            <div key={m.id} className="group rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900 hover:shadow-md transition cursor-pointer" onClick={() => setPreviewIdx(linked.findIndex((x) => x.id === m.id))}>
              <div className="aspect-video bg-gray-50 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
                {isImage(m.mime_type) ? <img src={fileUrl(m.storage_path)} alt={m.name} className="w-full h-full object-cover" /> : <FileText size={32} className="text-gray-300 dark:text-gray-600" />}
              </div>
              <div className="p-2.5">
                {renameId === m.id ? (
                  <input autoFocus value={renameVal} onClick={(e) => e.stopPropagation()} onChange={(e) => setRenameVal(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') doRename(m); if (e.key === 'Escape') setRenameId(null); }} onBlur={() => doRename(m)}
                    className="w-full px-2 py-1 text-sm rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800" />
                ) : (
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate" title={m.name}>{m.name}</div>
                )}
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[11px] text-gray-400">{fmtSize(m.file_size)}</span>
                  <FileActions f={m} />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {linked.map((m) => (
            <div key={m.id} className="flex items-center justify-between p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl hover:shadow-sm transition cursor-pointer" onClick={() => setPreviewIdx(linked.findIndex((x) => x.id === m.id))}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="bg-accent-secondary-lighter dark:bg-accent-secondary-darkest/40 p-2 rounded-lg text-accent-secondary dark:text-accent-secondary-light shrink-0">
                  {isImage(m.mime_type) ? <img src={fileUrl(m.storage_path)} alt="" className="w-6 h-6 object-cover rounded" /> : <FileText size={18} />}
                </div>
                <div className="min-w-0">
                  {renameId === m.id ? (
                    <input autoFocus value={renameVal} onClick={(e) => e.stopPropagation()} onChange={(e) => setRenameVal(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') doRename(m); if (e.key === 'Escape') setRenameId(null); }} onBlur={() => doRename(m)}
                      className="w-full px-2 py-1 text-sm rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800" />
                  ) : (
                    <div className="font-medium text-gray-800 dark:text-gray-200 truncate" title={m.name}>{m.name}</div>
                  )}
                  {m.file_size ? <div className="text-xs text-gray-400">{fmtSize(m.file_size)}</div> : null}
                </div>
              </div>
              <FileActions f={m} />
            </div>
          ))}
        </div>
      )}

      {/* Lightbox podglądu */}
      <FilePreviewModal
        isOpen={previewIdx !== null}
        onClose={() => setPreviewIdx(null)}
        file={previewIdx !== null ? linked[previewIdx] : null}
        fileUrl={previewIdx !== null && linked[previewIdx] ? fileUrl(linked[previewIdx].storage_path) : ''}
        onDownload={() => { const f = linked[previewIdx]; if (f) window.open(fileUrl(f.storage_path), '_blank'); }}
        onPrev={() => setPreviewIdx((i) => (i > 0 ? i - 1 : i))}
        onNext={() => setPreviewIdx((i) => (i < linked.length - 1 ? i + 1 : i))}
        hasPrev={previewIdx > 0}
        hasNext={previewIdx !== null && previewIdx < linked.length - 1}
      />

      {/* Udostępnianie pliku */}
      <ShareModal isOpen={!!shareItem} onClose={() => setShareItem(null)} item={shareItem} shares={shares} />

      {showPicker && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200 dark:border-gray-700 flex flex-col max-h-[80vh]">
            <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h3 className="font-bold text-lg text-gray-800 dark:text-white">Podepnij materiały</h3>
              <button onClick={() => setShowPicker(false)} className="text-gray-400 hover:text-gray-600"><X size={22} /></button>
            </div>
            <div className="p-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700">
                <Search size={16} className="text-gray-400" />
                <input value={pickSearch} onChange={(e) => setPickSearch(e.target.value)} placeholder="Szukaj plików…"
                  className="flex-1 bg-transparent outline-none text-sm text-gray-800 dark:text-gray-200" />
              </div>
            </div>
            <div className="p-3 overflow-y-auto custom-scrollbar">
              {pickList === null ? <Spinner center size={22} /> : filteredPick.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-6">Brak materiałów do podpięcia.</p>
              ) : filteredPick.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText size={16} className="text-gray-400 shrink-0" />
                    <span className="text-sm text-gray-700 dark:text-gray-200 truncate">{f.name}</span>
                  </div>
                  <button onClick={() => attach(f)} className="text-xs px-2.5 py-1.5 rounded-lg bg-accent-primary text-white whitespace-nowrap inline-flex items-center gap-1"><Check size={13} /> Podepnij</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
