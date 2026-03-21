import React, { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { Image as ImageIcon, Upload, Trash2, RotateCcw, X } from 'lucide-react';

const GRAPHIC_SLOTS = [
  { key: 'zalacznik1', label: 'Slajd tytułowy', hint: 'Wyświetlany na początku nabożeństwa' },
  { key: 'zalacznik2', label: 'Slajd przejściowy', hint: 'Między pieśniami' },
  { key: 'piesn', label: 'Tło piosenek', hint: 'Tło dla tekstów pieśni' },
];

export default function GraphicsOverride({ program, seriesGraphics, onUpdate }) {
  const [uploading, setUploading] = useState(null);

  const overrideGraphics = program.graphics_override || [];
  const hasOverride = overrideGraphics.length > 0;

  const getGraphicUrl = (slotKey) => {
    // First check override
    const override = overrideGraphics.find(g => {
      const name = (g.name || '').toLowerCase();
      return name.includes(slotKey);
    });
    if (override) return { url: override.url, source: 'override' };

    // Then check series graphics
    if (seriesGraphics) {
      const series = seriesGraphics.find(g => {
        const name = (g.name || '').toLowerCase();
        return name.includes(slotKey);
      });
      if (series) return { url: series.url, source: 'series' };
    }

    return null;
  };

  const handleUpload = async (slotKey, file) => {
    if (!file || !program.id) return;

    setUploading(slotKey);
    try {
      const ext = file.name.split('.').pop();
      const path = `programs/${program.id}/${Date.now()}_${slotKey}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('public-assets')
        .upload(path, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('public-assets')
        .getPublicUrl(path);

      // Update override array
      const updated = [...overrideGraphics.filter(g => !(g.name || '').toLowerCase().includes(slotKey))];
      updated.push({ name: slotKey, url: publicUrl });

      await supabase.from('programs').update({ graphics_override: updated }).eq('id', program.id);
      onUpdate?.({ ...program, graphics_override: updated });
    } catch (err) {
      console.error('Upload error:', err);
      alert('Błąd uploadu: ' + err.message);
    } finally {
      setUploading(null);
    }
  };

  const removeOverride = async (slotKey) => {
    const updated = overrideGraphics.filter(g => !(g.name || '').toLowerCase().includes(slotKey));
    await supabase.from('programs').update({ graphics_override: updated.length > 0 ? updated : null }).eq('id', program.id);
    onUpdate?.({ ...program, graphics_override: updated.length > 0 ? updated : null });
  };

  const resetAll = async () => {
    await supabase.from('programs').update({ graphics_override: null }).eq('id', program.id);
    onUpdate?.({ ...program, graphics_override: null });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-gray-800 dark:text-white flex items-center gap-2">
          <ImageIcon size={18} className="text-accent-primary" />
          Grafiki prezentacji
        </h4>
        {hasOverride && (
          <button
            onClick={resetAll}
            className="text-sm text-gray-500 hover:text-red-500 flex items-center gap-1 transition"
          >
            <RotateCcw size={14} /> Resetuj do grafik serii
          </button>
        )}
      </div>

      {!seriesGraphics?.length && !hasOverride && (
        <p className="text-sm text-gray-400 dark:text-gray-500">
          Brak grafik z serii. Dodaj własne grafiki do tego programu.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {GRAPHIC_SLOTS.map(slot => {
          const graphic = getGraphicUrl(slot.key);
          const isUploading = uploading === slot.key;

          return (
            <div key={slot.key} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-800">
              {/* Preview */}
              <div className="aspect-video bg-gray-100 dark:bg-gray-900 relative flex items-center justify-center">
                {graphic?.url ? (
                  <>
                    <img src={graphic.url} alt={slot.label} className="w-full h-full object-cover" />
                    {graphic.source === 'override' && (
                      <span className="absolute top-1 right-1 bg-accent-primary text-white text-[10px] px-1.5 py-0.5 rounded font-bold">
                        NADPISANE
                      </span>
                    )}
                  </>
                ) : (
                  <ImageIcon size={24} className="text-gray-300 dark:text-gray-600" />
                )}
                {isUploading && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                  </div>
                )}
              </div>

              {/* Info + Actions */}
              <div className="p-2">
                <p className="text-xs font-bold text-gray-700 dark:text-gray-200">{slot.label}</p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500">{slot.hint}</p>
                <div className="flex gap-1 mt-1.5">
                  <label className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 transition text-gray-600 dark:text-gray-300">
                    <Upload size={12} /> Nadpisz
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => handleUpload(slot.key, e.target.files[0])}
                      disabled={isUploading}
                    />
                  </label>
                  {graphic?.source === 'override' && (
                    <button
                      onClick={() => removeOverride(slot.key)}
                      className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition"
                      title="Usuń nadpisanie"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
