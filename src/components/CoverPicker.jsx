import React, { useState, useRef } from 'react';
import { Image as ImageIcon, RotateCcw, Upload, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { usePermissions } from '../contexts/PermissionsContext';
import { invalidateModuleLabels } from '../hooks/useModuleLabel';
import { toast } from '../lib/toast';

// Zmiana okładki modułu (jak „Zmień okładkę" w Monday). Zapis do app_settings 'module_covers'
// ({ key: {type,value} }) — bez migracji. Widoczne TYLKO dla admina.
const GRADIENTS = [
  'linear-gradient(120deg,#6366f1,#8b5cf6)',
  'linear-gradient(120deg,#f093fb,#f5576c)',
  'linear-gradient(120deg,#4facfe,#00f2fe)',
  'linear-gradient(120deg,#43e97b,#38f9d7)',
  'linear-gradient(120deg,#fa709a,#fee140)',
  'linear-gradient(120deg,#30cfd0,#330867)',
  'linear-gradient(120deg,#0ea5e9,#6366f1)',
  'linear-gradient(120deg,#f59e0b,#ef4444)',
  'linear-gradient(120deg,#11998e,#38ef7d)',
  'linear-gradient(120deg,#1f2937,#4b5563)',
];
const COLORS = ['#6366f1', '#00c875', '#e2445c', '#fdab3d', '#a25ddc', '#0086c0', '#ff5ac4', '#579bfc', '#037f4c', '#333333'];

export default function CoverPicker({ moduleKey }) {
  const { subject } = usePermissions();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  if (!moduleKey || !subject?.isAdmin) return null;

  // Upload pliku obrazu (jak avatary/logo — bucket public-assets) → okładka = image URL.
  const uploadFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Wybierz plik graficzny'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Maksymalny rozmiar to 5 MB'); return; }
    setBusy(true);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const fileName = `cover-${moduleKey}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('public-assets').upload(fileName, file);
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('public-assets').getPublicUrl(fileName);
      await save({ type: 'image', value: data.publicUrl });
    } catch {
      toast.error('Nie udało się wgrać pliku');
      setBusy(false);
    }
  };

  const save = async (cover) => {
    setBusy(true);
    try {
      const { data } = await supabase.from('app_settings').select('value').eq('key', 'module_covers').maybeSingle();
      let map = {};
      try { map = JSON.parse(data?.value || '{}') || {}; } catch { map = {}; }
      if (cover) map[moduleKey] = cover; else delete map[moduleKey];
      const { error } = await supabase.from('app_settings').upsert({ key: 'module_covers', value: JSON.stringify(map) }, { onConflict: 'key' });
      if (error) throw error;
      invalidateModuleLabels();
      setOpen(false);
      toast.success('Okładka zapisana');
    } catch {
      toast.error('Nie udało się zapisać okładki');
    } finally { setBusy(false); }
  };

  return (
    <div className="relative">
      <input ref={fileRef} type="file" accept="image/*" onChange={uploadFile} className="hidden" />
      <button onClick={() => setOpen((o) => !o)} disabled={busy}
        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white/90 dark:bg-gray-900/80 text-gray-700 dark:text-gray-200 shadow-sm hover:bg-white dark:hover:bg-gray-900 backdrop-blur-sm disabled:opacity-70">
        {busy ? <Loader2 size={13} className="animate-spin" /> : <ImageIcon size={13} />} Zmień okładkę
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[90]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-[100] w-72 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-3">
            <div className="text-[11px] font-semibold text-gray-500 uppercase mb-1.5">Gradient</div>
            <div className="grid grid-cols-5 gap-2 mb-3">
              {GRADIENTS.map((g) => (
                <button key={g} onClick={() => save({ type: 'gradient', value: g })} className="h-9 rounded-lg ring-1 ring-black/5 hover:scale-105 transition" style={{ background: g }} />
              ))}
            </div>
            <div className="text-[11px] font-semibold text-gray-500 uppercase mb-1.5">Kolor</div>
            <div className="grid grid-cols-5 gap-2 mb-3">
              {COLORS.map((c) => (
                <button key={c} onClick={() => save({ type: 'color', value: c })} className="h-9 rounded-lg ring-1 ring-black/5 hover:scale-105 transition" style={{ background: c }} />
              ))}
            </div>
            <div className="text-[11px] font-semibold text-gray-500 uppercase mb-1.5">Obraz</div>
            <button onClick={() => fileRef.current?.click()} disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-2 mb-1.5 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 hover:border-accent-primary/50 hover:text-accent-primary disabled:opacity-50">
              <Upload size={14} /> Prześlij plik
            </button>
            <div className="flex gap-1.5">
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="…lub wklej URL"
                onKeyDown={(e) => { if (e.key === 'Enter' && url.trim()) save({ type: 'image', value: url.trim() }); }}
                className="flex-1 min-w-0 text-sm bg-gray-100 dark:bg-gray-700/50 rounded-lg px-2 py-1.5 outline-none text-gray-800 dark:text-gray-100" />
              <button onClick={() => url.trim() && save({ type: 'image', value: url.trim() })}
                className="px-3 rounded-lg bg-accent-primary text-white text-sm shrink-0">OK</button>
            </div>
            <button onClick={() => save(null)} className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-accent-primary">
              <RotateCcw size={12} /> Przywróć domyślną
            </button>
          </div>
        </>
      )}
    </div>
  );
}
