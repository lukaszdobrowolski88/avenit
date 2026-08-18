import React, { useState } from 'react';
import { Image as ImageIcon, RotateCcw } from 'lucide-react';
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
  if (!moduleKey || !subject?.isAdmin) return null;

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
      <button onClick={() => setOpen((o) => !o)} disabled={busy}
        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white/90 dark:bg-gray-900/80 text-gray-700 dark:text-gray-200 shadow-sm hover:bg-white dark:hover:bg-gray-900 backdrop-blur-sm">
        <ImageIcon size={13} /> Zmień okładkę
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
            <div className="text-[11px] font-semibold text-gray-500 uppercase mb-1.5">Obraz (URL)</div>
            <div className="flex gap-1.5">
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…"
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
