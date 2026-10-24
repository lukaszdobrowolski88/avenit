import React, { useRef, useState } from 'react';
import { ImagePlus, X, ChevronLeft, ChevronRight, Film, Type } from 'lucide-react';
import { tr } from '../../../i18n';
import { toast } from '../../../lib/toast';
import { promptDialog } from '../../../lib/dialog';
import Spinner from '../../../components/Spinner';
import { uploadSocialMedia, mediaSrc } from '../lib/socialApi';
import { MAX_MEDIA, isVideo } from '@avenit/shared/src/lib/social.js';

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime';
const MAX_BYTES = 50 * 1024 * 1024;

// Zdjęcia i wideo posta: wgrywanie (klik / upuszczenie), kolejność, tekst alternatywny, usuwanie.
export default function MediaPicker({ media, onChange, disabled = false }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(0);
  const [drag, setDrag] = useState(false);
  const list = media || [];

  const addFiles = async (files) => {
    const arr = Array.from(files || []);
    if (!arr.length) return;
    const room = MAX_MEDIA - list.length;
    if (room <= 0) { toast.error(tr('Najwyżej {n} plików w poście.', { n: MAX_MEDIA })); return; }
    const accepted = [];
    for (const f of arr.slice(0, room)) {
      if (!ACCEPT.split(',').includes(f.type)) { toast.error(tr('Nieobsługiwany format pliku: {name}', { name: f.name })); continue; }
      if (f.size > MAX_BYTES) { toast.error(tr('Plik jest za duży (najwyżej 50 MB): {name}', { name: f.name })); continue; }
      accepted.push(f);
    }
    if (!accepted.length) return;
    setUploading((n) => n + accepted.length);
    const added = [];
    for (const f of accepted) {
      try {
        added.push(await uploadSocialMedia(f));
      } catch (e) {
        toast.error(e.message || tr('Nie udało się wgrać pliku'));
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (added.length) onChange([...list, ...added]);
  };

  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const editAlt = async (i) => {
    const value = await promptDialog(tr('Tekst alternatywny (opis zdjęcia dla osób niewidomych)'), list[i].alt || '');
    if (value === null || value === undefined) return;
    const next = [...list];
    next[i] = { ...next[i], alt: String(value).slice(0, 1000) || null };
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {list.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {list.map((m, i) => (
            <div key={m.path} className="group relative w-24 h-24 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800">
              {isVideo(m) ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 dark:text-gray-400">
                  <Film size={22} aria-hidden="true" />
                  <span className="text-[11px] mt-1 tabular-nums">{m.duration ? `${Math.round(m.duration)} s` : tr('Wideo')}</span>
                </div>
              ) : (
                <img src={`${mediaSrc(m)}?w=192`} alt={m.alt || ''} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.src = mediaSrc(m); }} />
              )}
              <span className="absolute left-1 top-1 text-[10px] font-semibold px-1.5 rounded-full bg-black/55 text-white tabular-nums">{i + 1}</span>
              {!disabled && (
                <>
                  <button type="button" onClick={() => onChange(list.filter((_, k) => k !== i))} aria-label={tr('Usuń plik')}
                    className="absolute right-1 top-1 w-6 h-6 rounded-full bg-black/55 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100">
                    <X size={13} />
                  </button>
                  <div className="absolute inset-x-1 bottom-1 flex justify-between opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={tr('Przesuń w lewo')} className="w-6 h-6 rounded-full bg-black/55 text-white flex items-center justify-center disabled:opacity-30"><ChevronLeft size={13} /></button>
                    {!isVideo(m) && (
                      <button type="button" onClick={() => editAlt(i)} aria-label={tr('Tekst alternatywny')} title={m.alt || tr('Dodaj tekst alternatywny')}
                        className={`h-6 px-1.5 rounded-full text-[10px] font-semibold flex items-center gap-0.5 ${m.alt ? 'bg-white text-gray-800' : 'bg-black/55 text-white'}`}>
                        <Type size={11} />ALT
                      </button>
                    )}
                    <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label={tr('Przesuń w prawo')} className="w-6 h-6 rounded-full bg-black/55 text-white flex items-center justify-center disabled:opacity-30"><ChevronRight size={13} /></button>
                  </div>
                </>
              )}
            </div>
          ))}
          {Array.from({ length: uploading }).map((_, i) => (
            <div key={`up-${i}`} className="w-24 h-24 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center"><Spinner /></div>
          ))}
        </div>
      )}
      {!disabled && list.length < MAX_MEDIA && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
          className={`w-full rounded-xl border border-dashed px-4 py-3 text-sm flex items-center justify-center gap-2 transition-colors ${
            drag ? 'border-accent-primary bg-accent-primary/5 text-gray-800 dark:text-gray-100' : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400'
          }`}
        >
          <ImagePlus size={16} aria-hidden="true" />
          {uploading ? tr('Wgrywanie…') : tr('Dodaj zdjęcia lub wideo (przeciągnij albo kliknij)')}
        </button>
      )}
      <input ref={inputRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
    </div>
  );
}
