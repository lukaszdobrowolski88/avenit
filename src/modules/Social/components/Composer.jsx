import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PenSquare, Hash, AlertCircle, AlertTriangle, ListOrdered, Zap, CalendarClock, MessageSquareDashed, Link2, GalleryVerticalEnd } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import EmptyState from '../../../components/EmptyState';
import { DateInput, TimeField } from '../../../components/pickers';
import { tr, appLocale } from '../../../i18n';
import { toast } from '../../../lib/toast';
import { promptDialog, confirmDialog } from '../../../lib/dialog';
import { supabase } from '../../../lib/supabase';
import { socialApi } from '../lib/socialApi';
import { toLocalFields, fromLocalFields, appendBlock, postPermissions } from '../lib/socialUi';
import {
  SOCIAL_PROVIDERS, IG_FORMAT_LABELS, FB_FORMAT_LABELS, validateTarget, effectiveTarget, charCount, instagramFormat,
} from '@avenit/shared/src/lib/social.js';
import ActivityPanel from './ActivityPanel';
import LibraryPicker from './LibraryPicker';
import ChannelAvatar, { providerLabel, channelName, ProviderIcon } from './ChannelAvatar';
import MediaPicker from './MediaPicker';
import PostPreview from './PostPreview';

export const fmtWhen = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(appLocale(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const textareaCls = 'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3.5 py-3 text-sm leading-relaxed text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-accent-primary/40 resize-y';

function Segmented({ value, onChange, options }) {
  return (
    <div role="radiogroup" className="inline-flex flex-wrap gap-1 rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
      {options.map((o) => {
        const Icon = o.icon;
        const active = value === o.value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={active} onClick={() => onChange(o.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${active ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'}`}>
            {Icon && <Icon size={13} aria-hidden="true" />}{o.label}
          </button>
        );
      })}
    </div>
  );
}

// Licznik znaków dla wybranych sieci (najbardziej restrykcyjna pierwsza).
function Counters({ content, providers }) {
  const len = charCount(content);
  const list = [...new Set(providers)].map((p) => SOCIAL_PROVIDERS[p]).filter(Boolean).sort((a, b) => a.maxChars - b.maxChars);
  if (!list.length) return null;
  return (
    <div className="flex gap-3 text-[11px] tabular-nums text-gray-500">
      {list.map((P) => (
        <span key={P.key} className={len > P.maxChars ? 'text-red-600 font-semibold' : ''}>{P.label} {len}/{P.maxChars}</span>
      ))}
    </div>
  );
}

function HashtagMenu({ onInsert }) {
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState(null);
  const ref = useRef(null);
  useEffect(() => {
    if (!open || groups) return;
    supabase.from('social_hashtag_groups').select('*').order('name').then(({ data }) => setGroups(data || []));
  }, [open, groups]);
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <Button type="button" variant="ghost" size="sm" icon={Hash} onClick={() => setOpen((o) => !o)} aria-expanded={open}>{tr('Hashtagi')}</Button>
      {open && (
        <div className="absolute z-20 left-0 mt-1 w-72 max-h-72 overflow-auto rounded-xl bg-white dark:bg-gray-800 shadow-xl border border-gray-100 dark:border-gray-700 p-1">
          {groups === null && <p className="px-3 py-2 text-xs text-gray-500">{tr('Ładowanie…')}</p>}
          {groups?.length === 0 && <p className="px-3 py-2 text-xs text-gray-500">{tr('Brak zestawów — dodasz je w zakładce Kanały.')}</p>}
          {groups?.map((g) => (
            <button key={g.id} type="button" onClick={() => { onInsert(g.hashtags); setOpen(false); }}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
              <span className="block text-sm font-medium text-gray-800 dark:text-gray-100">{g.name}</span>
              <span className="block text-xs text-gray-500 truncate">{g.hashtags}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Niezapisany nowy post w przeglądarce (zamknięta karta, odświeżenie) — do przywrócenia.
const DRAFT_KEY = 'social.composer.draft';
const DRAFT_TTL_MS = 7 * 86400_000;
const readLocalDraft = () => {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    return d && Date.now() - d.savedAt < DRAFT_TTL_MS ? d : null;
  } catch { return null; }
};
const writeLocalDraft = (d) => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, savedAt: Date.now() })); } catch { /* prywatne okno */ } };
const clearLocalDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch { /* prywatne okno */ } };

const initialWhen = (post, defaults, canPublish) => {
  const at = post?.scheduled_at || defaults?.scheduled_at;
  if (at && new Date(at) > new Date()) return 'schedule';
  return canPublish ? 'queue' : 'none';
};

export default function Composer({ open, onClose, post, defaults, accounts, access, myEmail, onSaved }) {
  const canPublish = Boolean(access?.publish);
  const editing = Boolean(post?.id);
  const perm = postPermissions(post || { status: 'draft', created_by: myEmail }, access, myEmail);
  const readOnly = editing && !perm.edit;
  const usable = useMemo(() => (accounts || []).filter((a) => a.status !== 'revoked' || post?.targets?.some((t) => t.account_id === a.id)), [accounts, post]);

  const [selected, setSelected] = useState([]);
  const [content, setContent] = useState('');
  const [media, setMedia] = useState([]);
  const [custom, setCustom] = useState({}); // accountId → { on, content, options }
  const [tab, setTab] = useState('all');
  const [previewId, setPreviewId] = useState(null);
  const [when, setWhen] = useState('queue');
  const [ymd, setYmd] = useState('');
  const [hm, setHm] = useState('');
  const [nextSlot, setNextSlot] = useState(null);
  const [serverErrors, setServerErrors] = useState([]);
  const [localDraft, setLocalDraft] = useState(null);
  const [libraryFor, setLibraryFor] = useState(null); // 'all' | id kanału — dokąd dodać media z biblioteki
  const baseline = useRef(null);

  // Wczytanie posta / wartości domyślnych przy otwarciu.
  useEffect(() => {
    if (!open) return;
    const targets = post?.targets || [];
    const ids = targets.length ? targets.map((t) => t.account_id).filter(Boolean)
      : (defaults?.account_ids || (usable.length === 1 ? [usable[0].id] : []));
    const initContent = post?.content ?? defaults?.content ?? '';
    const initMedia = post?.media || defaults?.media || [];
    const c = {};
    for (const t of targets) {
      if (!t.account_id) continue;
      const own = Array.isArray(t.media) && t.media.length > 0;
      c[t.account_id] = { on: t.content != null && t.content !== '', content: t.content || '', options: t.options || {}, mediaOn: own, media: own ? t.media : [] };
    }
    const w = initialWhen(post, defaults, canPublish);
    let f = toLocalFields(post?.scheduled_at || defaults?.scheduled_at || '');
    if (!f.ymd) {
      const d = new Date(Date.now() + 2 * 3600_000);
      f = { ymd: toLocalFields(d.toISOString()).ymd, hm: `${String(d.getHours()).padStart(2, '0')}:00` };
    }
    setSelected(ids);
    setContent(initContent);
    setMedia(initMedia);
    setCustom(c);
    setTab('all');
    setPreviewId(ids[0] || null);
    setWhen(w);
    setYmd(f.ymd);
    setHm(f.hm);
    setServerErrors([]);
    // Punkt odniesienia „bez zmian” — te same wartości, które właśnie ustawiamy.
    baseline.current = JSON.stringify({ selected: ids, content: initContent, media: initMedia, custom: c, when: w, ymd: f.ymd, hm: f.hm });
    setLocalDraft(!post?.id && !defaults?.content ? readLocalDraft() : null);
  }, [open, post, defaults]); // eslint-disable-line react-hooks/exhaustive-deps

  const snap = JSON.stringify({ selected, content, media, custom, when, ymd, hm });
  const dirty = open && !readOnly && baseline.current !== null && snap !== baseline.current;

  // Autozapis nowego posta w przeglądarce (co sekundę po zmianie).
  useEffect(() => {
    if (!open || editing || !dirty) return undefined;
    const t = setTimeout(() => writeLocalDraft({ selected, content, media, custom, when, ymd, hm }), 1000);
    return () => clearTimeout(t);
  }, [open, editing, dirty, snap]); // eslint-disable-line react-hooks/exhaustive-deps

  const restoreLocalDraft = () => {
    const d = localDraft;
    if (!d) return;
    const ids = (d.selected || []).filter((id) => usable.some((a) => a.id === id));
    setSelected(ids);
    setContent(d.content || '');
    setMedia(Array.isArray(d.media) ? d.media : []);
    setCustom(d.custom || {});
    setWhen(d.when || (canPublish ? 'queue' : 'none'));
    if (d.ymd) setYmd(d.ymd);
    if (d.hm) setHm(d.hm);
    setPreviewId(ids[0] || null);
    setLocalDraft(null);
  };

  // Zamknięcie z niezapisanymi zmianami — pytamy (szkic nowego posta zostaje w przeglądarce).
  const requestClose = async () => {
    if (dirty && !(await confirmDialog({ title: tr('Zamknąć bez zapisywania?'), message: editing ? tr('Zmiany w poście nie zostaną zapisane.') : tr('Post zostanie w tej przeglądarce — przywrócisz go przy następnym tworzeniu posta.'), danger: false }))) return;
    onClose();
  };

  // Najbliższy slot kolejki dla wybranych kanałów.
  useEffect(() => {
    if (!open || !canPublish || !selected.length) { setNextSlot(null); return undefined; }
    let alive = true;
    socialApi.queuePreview(selected, post?.id).then((at) => { if (alive) setNextSlot(at); }).catch(() => { if (alive) setNextSlot(null); });
    return () => { alive = false; };
  }, [open, canPublish, selected, post?.id]);

  const byId = useMemo(() => new Map((accounts || []).map((a) => [a.id, a])), [accounts]);
  const selectedAccounts = selected.map((id) => byId.get(id)).filter(Boolean);

  const toggle = (id) => {
    if (readOnly) return;
    setSelected((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      if (!next.includes(previewId)) setPreviewId(next[0] || null);
      if (tab !== 'all' && !next.includes(tab)) setTab('all');
      return next;
    });
  };

  const targetFor = (acc) => {
    const c = custom[acc.id] || {};
    return { account_id: acc.id, content: c.on ? c.content : null, media: c.mediaOn && c.media?.length ? c.media : null, options: c.options || {} };
  };
  const setCustomFor = (id, patch) => setCustom((prev) => ({ ...prev, [id]: { on: false, content: '', options: {}, ...prev[id], ...patch } }));
  const setOption = (id, key, value) => setCustom((prev) => {
    const cur = { on: false, content: '', options: {}, ...prev[id] };
    return { ...prev, [id]: { ...cur, options: { ...cur.options, [key]: value } } };
  });

  // Walidacja na żywo (te same reguły co serwer).
  const checks = selectedAccounts.map((acc) => {
    const eff = effectiveTarget({ content, media }, targetFor(acc));
    const v = validateTarget(acc.provider, eff, tr);
    if (acc.status === 'revoked') v.errors.unshift(tr('Kanał wymaga ponownego połączenia.'));
    return { acc, ...v };
  });
  const hasErrors = checks.some((c) => c.errors.length);

  const scheduledIso = when === 'schedule' ? fromLocalFields(ymd, hm) : null;

  const submit = async (intent) => {
    setServerErrors([]);
    if (intent !== 'draft' && !selected.length) { toast.error(tr('Wybierz co najmniej jeden kanał.')); return; }
    if (when === 'schedule' && !scheduledIso && intent !== 'draft') { toast.error(tr('Wybierz datę i godzinę.')); return; }
    const body = {
      id: post?.id, content, media, intent,
      tags: post?.tags || [],
      targets: selectedAccounts.map(targetFor),
      ...(scheduledIso ? { scheduled_at: scheduledIso } : {}),
      ...(defaults?.source_type && !post?.id ? { source_type: defaults.source_type, source_id: defaults.source_id } : {}),
    };
    try {
      const saved = await socialApi.save(body);
      const msg = {
        draft: tr('Szkic zapisany.'),
        submit: tr('Wysłano do akceptacji.'),
        queue: tr('Dodano do kolejki — {when}.', { when: fmtWhen(saved.scheduled_at) }),
        now: tr('Publikowanie rozpoczęte.'),
        schedule: tr('Zaplanowano na {when}.', { when: fmtWhen(saved.scheduled_at) }),
      }[intent];
      toast.success(msg);
      if (!post?.id) clearLocalDraft();
      baseline.current = null;
      onSaved?.(saved);
      onClose();
    } catch (e) {
      setServerErrors(e.details?.length ? e.details : [e.message]);
      toast.error(e.message);
    }
  };

  const reject = async () => {
    const note = await promptDialog(tr('Co poprawić? (autor dostanie powiadomienie)'), '');
    if (note === null || note === undefined) return;
    try {
      await socialApi.reject(post.id, note);
      toast.success(tr('Post odesłany do poprawy.'));
      onSaved?.();
      onClose();
    } catch (e) { toast.error(e.message); }
  };

  const insertHashtags = (tags) => {
    if (tab === 'all') setContent((t) => appendBlock(t, tags));
    else setCustomFor(tab, { on: true, content: appendBlock(custom[tab]?.on ? custom[tab].content : content, tags) });
  };

  const previewAcc = byId.get(previewId) || selectedAccounts[0];
  const previewEff = previewAcc ? effectiveTarget({ content, media }, targetFor(previewAcc)) : null;
  const publishLabel = { queue: tr('Dodaj do kolejki'), now: tr('Opublikuj teraz'), schedule: tr('Zaplanuj') }[when] || tr('Zaplanuj');
  const pendingOther = post?.status === 'pending_approval' && canPublish;

  const whenOptions = canPublish
    ? [
      { value: 'queue', label: nextSlot ? tr('Kolejka · {when}', { when: fmtWhen(nextSlot) }) : tr('Kolejka'), icon: ListOrdered },
      { value: 'now', label: tr('Teraz'), icon: Zap },
      { value: 'schedule', label: tr('Wybrany termin'), icon: CalendarClock },
    ]
    : [
      { value: 'none', label: tr('Bez terminu'), icon: ListOrdered },
      { value: 'schedule', label: tr('Proponowany termin'), icon: CalendarClock },
    ];

  const footer = readOnly ? (
    <Button variant="secondary" onClick={onClose}>{tr('Zamknij')}</Button>
  ) : (
    <>
      <Button variant="secondary" onClick={requestClose}>{tr('Anuluj')}</Button>
      {pendingOther && <Button variant="outline" icon={MessageSquareDashed} onClick={reject}>{tr('Odeślij do poprawy')}</Button>}
      <Button variant="outline" onClick={() => submit('draft')}>{tr('Zapisz szkic')}</Button>
      {canPublish ? (
        <Button onClick={() => submit(when === 'schedule' ? 'schedule' : when === 'now' ? 'now' : 'queue')} disabled={hasErrors || !selected.length}>
          {pendingOther ? tr('Zatwierdź: {action}', { action: publishLabel.toLowerCase() }) : publishLabel}
        </Button>
      ) : (
        <Button onClick={() => submit('submit')} disabled={hasErrors || !selected.length}>{tr('Wyślij do akceptacji')}</Button>
      )}
    </>
  );

  const activeAcc = tab !== 'all' ? byId.get(tab) : null;
  const activeCustom = activeAcc ? (custom[activeAcc.id] || { on: false, content: '', options: {} }) : null;

  return (
    <>
    <LibraryPicker open={Boolean(libraryFor)} onClose={() => setLibraryFor(null)}
      max={Math.max(1, 10 - (libraryFor && libraryFor !== 'all' ? (custom[libraryFor]?.media || []).length : media.length))}
      onPick={(list) => {
        const add = (prev) => [...prev, ...list.filter((m) => !prev.some((p) => p.path === m.path))].slice(0, 10);
        if (libraryFor === 'all') setMedia(add);
        else if (libraryFor) setCustomFor(libraryFor, { mediaOn: true, media: add(custom[libraryFor]?.media || []) });
      }} />
    <Modal isOpen={open} onClose={requestClose} size="full" closeOnBackdrop={false} icon={PenSquare}
      title={readOnly ? tr('Podgląd posta') : editing ? tr('Edytuj post') : tr('Nowy post')}
      subtitle={post?.status === 'pending_approval' ? tr('Czeka na akceptację') : undefined}
      footer={footer}>
      {!usable.length ? (
        <div className="p-6">
          <EmptyState icon={Link2} title={tr('Brak podłączonych kanałów')} subtitle={tr('Połącz stronę na Facebooku i konto na Instagramie w zakładce Kanały.')} />
        </div>
      ) : (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-0 min-h-[60vh]">
          <div className="p-6 space-y-5 min-w-0">
            {localDraft && (
              <div className="rounded-xl bg-gray-100 dark:bg-gray-800 px-4 py-3 text-sm flex items-center gap-3 flex-wrap">
                <span className="flex-1 min-w-[200px] text-gray-700 dark:text-gray-200">{tr('Masz niezapisany post z {when}.', { when: fmtWhen(new Date(localDraft.savedAt).toISOString()) })}</span>
                <Button size="sm" onClick={restoreLocalDraft}>{tr('Przywróć')}</Button>
                <Button size="sm" variant="ghost" onClick={() => { clearLocalDraft(); setLocalDraft(null); }}>{tr('Odrzuć')}</Button>
              </div>
            )}
            {post?.review_note && post.status === 'draft' && (
              <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200 px-4 py-3 text-sm flex gap-2">
                <MessageSquareDashed size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <div><p className="font-semibold">{tr('Uwagi do poprawy')}</p><p className="whitespace-pre-wrap">{post.review_note}</p></div>
              </div>
            )}

            {/* Kanały */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">{tr('Kanały')}</p>
              <div className="flex flex-wrap gap-3">
                {usable.map((a) => (
                  <button key={a.id} type="button" onClick={() => toggle(a.id)} aria-pressed={selected.includes(a.id)} disabled={readOnly}
                    className="flex items-center gap-2 rounded-full pr-3 py-1 pl-1 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:cursor-default">
                    <ChannelAvatar account={a} size={34} selected={selected.includes(a.id)} dimmed={!selected.includes(a.id)} />
                    <span className={`text-sm ${selected.includes(a.id) ? 'text-gray-900 dark:text-gray-50 font-medium' : 'text-gray-500'}`}>
                      {channelName(a)}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Zakładki treści: wspólna + per kanał */}
            {selectedAccounts.length > 0 && (
              <div className="flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-700">
                {[{ id: 'all', label: tr('Wspólna treść') }, ...selectedAccounts.map((a) => ({ id: a.id, label: `${providerLabel(a.provider)}${custom[a.id]?.on || custom[a.id]?.mediaOn ? ' •' : ''}`, acc: a }))].map((t) => (
                  <button key={t.id} type="button" onClick={() => { setTab(t.id); if (t.acc) setPreviewId(t.id); }}
                    className={`px-3 py-2 text-sm border-b-2 -mb-px flex items-center gap-1.5 ${tab === t.id ? 'border-accent-primary text-gray-900 dark:text-white font-medium' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
                    {t.acc && <ProviderIcon provider={t.acc.provider} size={14} />}{t.label}
                  </button>
                ))}
              </div>
            )}

            {tab === 'all' ? (
              <div className="space-y-2">
                <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={7} readOnly={readOnly}
                  placeholder={tr('Co chcesz opublikować? Napisz zaproszenie, ogłoszenie albo myśl z kazania…')} className={textareaCls} aria-label={tr('Treść posta')} />
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  {!readOnly ? <HashtagMenu onInsert={insertHashtags} /> : <span />}
                  <Counters content={content} providers={selectedAccounts.map((a) => a.provider)} />
                </div>
              </div>
            ) : activeAcc && (
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                  <input type="checkbox" checked={Boolean(activeCustom.on)} disabled={readOnly}
                    onChange={(e) => setCustomFor(activeAcc.id, { on: e.target.checked, content: activeCustom.content || content })} className="rounded" />
                  {tr('Własna treść dla tego kanału')}
                </label>
                {activeCustom.on ? (
                  <>
                    <textarea value={activeCustom.content} onChange={(e) => setCustomFor(activeAcc.id, { content: e.target.value })} rows={6} readOnly={readOnly} className={textareaCls}
                      aria-label={tr('Treść dla kanału {name}', { name: channelName(activeAcc) })} />
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      {!readOnly ? <HashtagMenu onInsert={insertHashtags} /> : <span />}
                      <Counters content={activeCustom.content} providers={[activeAcc.provider]} />
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-gray-500">{tr('Ten kanał używa wspólnej treści.')}</p>
                )}
                {activeAcc.provider === 'instagram' && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{tr('Format na Instagramie')}</p>
                    <Segmented
                      value={activeCustom.options?.format || instagramFormat(media, {})}
                      onChange={(v) => !readOnly && setOption(activeAcc.id, 'format', v)}
                      options={SOCIAL_PROVIDERS.instagram.formats.map((f) => ({ value: f, label: tr(IG_FORMAT_LABELS[f]) }))}
                    />
                  </div>
                )}
                {activeAcc.provider === 'facebook' && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{tr('Format na Facebooku')}</p>
                    <Segmented
                      value={activeCustom.options?.format === 'reel' ? 'reel' : 'post'}
                      onChange={(v) => !readOnly && setOption(activeAcc.id, 'format', v === 'reel' ? 'reel' : undefined)}
                      options={SOCIAL_PROVIDERS.facebook.formats.map((f) => ({ value: f, label: tr(FB_FORMAT_LABELS[f]) }))}
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                    <input type="checkbox" checked={Boolean(activeCustom.mediaOn)} disabled={readOnly} className="rounded"
                      onChange={(e) => setCustomFor(activeAcc.id, { mediaOn: e.target.checked, media: activeCustom.media?.length ? activeCustom.media : media })} />
                    {tr('Inne zdjęcia lub wideo dla tego kanału')}
                  </label>
                  {activeCustom.mediaOn && (
                    <>
                      <MediaPicker media={activeCustom.media || []} onChange={(m) => setCustomFor(activeAcc.id, { media: m })} disabled={readOnly} />
                      {!readOnly && <Button size="sm" variant="ghost" icon={GalleryVerticalEnd} onClick={() => setLibraryFor(activeAcc.id)}>{tr('Z biblioteki')}</Button>}
                    </>
                  )}
                </div>
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{tr('Pierwszy komentarz (opcjonalnie)')}</p>
                  <textarea value={activeCustom.options?.first_comment || ''} onChange={(e) => setOption(activeAcc.id, 'first_comment', e.target.value)} rows={2} readOnly={readOnly}
                    placeholder={activeAcc.provider === 'instagram' ? tr('Np. hashtagi albo link — pojawi się jako pierwszy komentarz') : tr('Np. link do zapisów')} className={textareaCls} />
                </div>
              </div>
            )}

            {/* Media */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{tr('Zdjęcia i wideo')}</p>
                {!readOnly && <Button size="sm" variant="ghost" icon={GalleryVerticalEnd} onClick={() => setLibraryFor('all')}>{tr('Z biblioteki')}</Button>}
              </div>
              <MediaPicker media={media} onChange={setMedia} disabled={readOnly} />
            </div>

            {/* Termin */}
            {!readOnly && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{canPublish ? tr('Kiedy opublikować') : tr('Termin')}</p>
                <Segmented value={when} onChange={setWhen} options={whenOptions} />
                {when === 'schedule' && (
                  <div className="flex gap-2 max-w-sm">
                    <DateInput value={ymd} onChange={(e) => setYmd(e.target.value)} min={toLocalFields(new Date().toISOString()).ymd} className="flex-1" aria-label={tr('Data publikacji')} />
                    <TimeField value={hm} onChange={(e) => setHm(e.target.value)} className="w-32" aria-label={tr('Godzina publikacji')} />
                  </div>
                )}
                {when === 'queue' && canPublish && !nextSlot && selected.length > 0 && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">{tr('Kolejka nie ma ustawionych godzin — dodaj je w zakładce Kanały albo wybierz termin.')}</p>
                )}
                {!canPublish && (
                  <p className="text-xs text-gray-500">{tr('Post trafi do osoby zatwierdzającej, która ustali ostateczny termin.')}</p>
                )}
              </div>
            )}

            {/* Walidacja */}
            {(checks.some((c) => c.errors.length || c.warnings.length) || serverErrors.length > 0) && (
              <div className="space-y-1.5">
                {serverErrors.map((m, i) => (
                  <p key={`s${i}`} className="text-sm text-red-700 dark:text-red-300 flex gap-2"><AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />{m}</p>
                ))}
                {checks.map((c) => [
                  ...c.errors.map((m, i) => (
                    <p key={`${c.acc.id}e${i}`} className="text-sm text-red-700 dark:text-red-300 flex gap-2"><AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" /><span><b>{channelName(c.acc)}:</b> {m}</span></p>
                  )),
                  ...c.warnings.map((m, i) => (
                    <p key={`${c.acc.id}w${i}`} className="text-sm text-amber-700 dark:text-amber-300 flex gap-2"><AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" /><span><b>{channelName(c.acc)}:</b> {m}</span></p>
                  )),
                ])}
              </div>
            )}

            {editing && (
              <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                <ActivityPanel postId={post.id} myEmail={myEmail} isAdmin={access?.admin} />
              </div>
            )}
          </div>

          {/* Podgląd */}
          <aside className="bg-gray-50 dark:bg-gray-900/40 border-t lg:border-t-0 lg:border-l border-gray-100 dark:border-gray-800 p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{tr('Podgląd')}</p>
              {selectedAccounts.length > 1 && (
                <div className="flex gap-1.5">
                  {selectedAccounts.map((a) => (
                    <button key={a.id} type="button" onClick={() => setPreviewId(a.id)} aria-label={a.name}>
                      <ChannelAvatar account={a} size={24} selected={previewAcc?.id === a.id} dimmed={previewAcc?.id !== a.id} />
                    </button>
                  ))}
                </div>
              )}
            </div>
            {previewAcc ? (
              <PostPreview account={previewAcc} content={previewEff.content} media={previewEff.media} options={previewEff.options} />
            ) : (
              <p className="text-sm text-gray-500 py-10 text-center">{tr('Wybierz kanał, aby zobaczyć podgląd.')}</p>
            )}
            <p className="text-[11px] text-gray-400">{tr('Podgląd przybliżony — ostateczny wygląd zależy od sieci.')}</p>
          </aside>
        </div>
      )}
    </Modal>
    </>
  );
}
