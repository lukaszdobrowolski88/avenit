import React, { useEffect, useState } from 'react';
import { Link as LinkIcon, ExternalLink, Copy, Plus, Trash2, ChevronUp, ChevronDown, Info } from 'lucide-react';
import Button from '../../../components/Button';
import Spinner from '../../../components/Spinner';
import { tr } from '../../../i18n';
import { toast } from '../../../lib/toast';
import { socialApi } from '../lib/socialApi';

const inputCls = 'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent-primary/40';

function Toggle({ checked, onChange, label, hint, disabled }) {
  return (
    <label className={`flex items-start gap-3 py-2 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} className="mt-0.5 rounded" />
      <span>
        <span className="block text-sm font-medium text-gray-800 dark:text-gray-100">{label}</span>
        {hint && <span className="block text-xs text-gray-500">{hint}</span>}
      </span>
    </label>
  );
}

// Strona linków („link in bio”) — publiczna strona kościoła pod /linki: przyciski z licznikiem
// kliknięć, udostępnione wydarzenia, ostatnie kazania i posty. Renderuje ją serwer (podgląd OG).
export default function LinkPageTab({ access }) {
  const canEdit = Boolean(access.publish || access.manage);
  const [page, setPage] = useState(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    socialApi.linkPage().then((d) => { setPage(d.page); setUrl(d.url); }).catch((e) => { toast.error(e.message); setPage({ links: [] }); });
  }, []);

  if (!page) return <Spinner center />;
  const set = (patch) => setPage((p) => ({ ...p, ...patch }));
  const setLink = (i, patch) => set({ links: page.links.map((l, k) => (k === i ? { ...l, ...patch } : l)) });
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= page.links.length) return;
    const next = [...page.links];
    [next[i], next[j]] = [next[j], next[i]];
    set({ links: next });
  };

  const save = async () => {
    setBusy(true);
    try {
      const d = await socialApi.saveLinkPage(page);
      setPage(d.page);
      toast.success(tr('Strona linków zapisana.'));
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast.success(tr('Skopiowano adres strony.')); } catch { toast.error(tr('Nie udało się skopiować.')); }
  };

  return (
    <div className="grid xl:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
      <section className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700/60 p-5 space-y-4">
        <div className="flex items-start gap-3">
          <span data-tone={1} className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center justify-center shrink-0"><LinkIcon size={17} aria-hidden="true" /></span>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">{tr('Strona linków')}</h3>
            <p className="text-sm text-gray-500">{tr('Jeden adres do bio na Instagramie i Facebooku — przyciski, wydarzenia, kazania i posty kościoła.')}</p>
          </div>
        </div>
        <Toggle checked={Boolean(page.enabled)} onChange={(v) => set({ enabled: v })} disabled={!canEdit}
          label={tr('Strona włączona')} hint={tr('Wyłączona strona pokazuje „Nie znaleziono”.')} />
        <label className="block">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{tr('Tytuł')}</span>
          <input value={page.title || ''} onChange={(e) => set({ title: e.target.value })} disabled={!canEdit} placeholder={tr('Domyślnie nazwa kościoła')} className={`mt-1 ${inputCls}`} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{tr('Opis')}</span>
          <textarea value={page.bio || ''} onChange={(e) => set({ bio: e.target.value })} disabled={!canEdit} rows={3} maxLength={600}
            placeholder={tr('Np. Nabożeństwa w niedziele o 10:00, ul. Przykładowa 1')} className={`mt-1 ${inputCls}`} />
        </label>

        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{tr('Przyciski')}</p>
          {page.links.map((l, i) => (
            <div key={l.code || i} className="flex items-center gap-2 rounded-xl bg-gray-50 dark:bg-gray-900/40 p-2">
              <div className="flex flex-col">
                <button type="button" className="icon-btn" onClick={() => move(i, -1)} disabled={!canEdit || i === 0} aria-label={tr('W górę')}><ChevronUp size={14} /></button>
                <button type="button" className="icon-btn" onClick={() => move(i, 1)} disabled={!canEdit || i === page.links.length - 1} aria-label={tr('W dół')}><ChevronDown size={14} /></button>
              </div>
              <div className="flex-1 grid sm:grid-cols-2 gap-2">
                <input value={l.label} onChange={(e) => setLink(i, { label: e.target.value })} disabled={!canEdit} placeholder={tr('Napis, np. Zapisz się na kurs')} className={inputCls} aria-label={tr('Napis przycisku')} />
                <input value={l.url} onChange={(e) => setLink(i, { url: e.target.value, code: undefined })} disabled={!canEdit} placeholder="https://" className={inputCls} aria-label={tr('Adres')} />
              </div>
              {l.code && <span className="text-xs tabular-nums text-gray-500 w-20 text-right" title={tr('Kliknięcia')}>{tr('{n} klik.', { n: l.clicks || 0 })}</span>}
              {canEdit && <button type="button" className="icon-btn" onClick={() => set({ links: page.links.filter((_, k) => k !== i) })} aria-label={tr('Usuń przycisk')}><Trash2 size={15} /></button>}
            </div>
          ))}
          {canEdit && page.links.length < 30 && (
            <Button size="sm" variant="outline" icon={Plus} onClick={() => set({ links: [...page.links, { label: '', url: '' }] })}>{tr('Dodaj przycisk')}</Button>
          )}
        </div>

        <div className="pt-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">{tr('Sekcje')}</p>
          <Toggle checked={page.show_events !== false} onChange={(v) => set({ show_events: v })} disabled={!canEdit}
            label={tr('Najbliższe wydarzenia')} hint={tr('Tylko wydarzenia udostępnione przyciskiem „Udostępnij w social media”.')} />
          <Toggle checked={page.show_sermons !== false} onChange={(v) => set({ show_sermons: v })} disabled={!canEdit} label={tr('Ostatnie kazania')} hint={tr('Opublikowane kazania z publicznym adresem.')} />
          <Toggle checked={page.show_posts !== false} onChange={(v) => set({ show_posts: v })} disabled={!canEdit} label={tr('Posty ze zdjęciami')} hint={tr('Ostatnie opublikowane posty — kafelki prowadzą do Facebooka / Instagrama.')} />
        </div>
        {canEdit && <div className="flex justify-end"><Button onClick={save} loading={busy}>{tr('Zapisz')}</Button></div>}
      </section>

      <aside className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700/60 p-5 space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{tr('Adres strony')}</p>
        <p className="text-sm font-medium text-gray-900 dark:text-white break-all">{url}</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" icon={Copy} onClick={copy}>{tr('Kopiuj')}</Button>
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">
            <ExternalLink size={14} aria-hidden="true" />{tr('Otwórz')}
          </a>
        </div>
        <div className="rounded-xl bg-gray-50 dark:bg-gray-900/40 p-3 text-xs text-gray-600 dark:text-gray-300 flex gap-2">
          <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{tr('Wklej ten adres w polu „Strona internetowa” w profilu na Instagramie i na Facebooku. Kliknięcia przycisków liczymy tutaj.')}</span>
        </div>
      </aside>
    </div>
  );
}
