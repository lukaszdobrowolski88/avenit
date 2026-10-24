import React, { useCallback, useEffect, useState } from 'react';
import { MessageCircle, Trash2, Send, History } from 'lucide-react';
import Button from '../../../components/Button';
import { tr, appLocale } from '../../../i18n';
import { toast } from '../../../lib/toast';
import { socialApi } from '../lib/socialApi';

// Zdarzenia historii (migracja 122) — osoba + czynność; zdarzenia systemowe bez osoby.
export const ACTIVITY_LABELS = {
  created: 'utworzył(a) post',
  edited: 'zmienił(a) post',
  submitted: 'wysłał(a) do akceptacji',
  approved: 'zatwierdził(a)',
  rejected: 'odesłał(a) do poprawy',
  scheduled: 'zaplanował(a)',
  published_now: 'zlecił(a) publikację od razu',
  unscheduled: 'wstrzymał(a) — przeniesiono do szkiców',
  rescheduled: 'zmienił(a) termin',
  retried: 'ponowił(a) publikację',
  published: 'Opublikowano',
  partial: 'Opublikowano częściowo',
  failed: 'Publikacja nie powiodła się',
};
const WITH_TIME = new Set(['scheduled', 'approved', 'rescheduled']);
const fmt = (iso) => new Date(iso).toLocaleString(appLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// Komentarze zespołu i historia posta (kompozytor i szczegóły). Komentarz widzi każdy, kto widzi post.
export default function ActivityPanel({ postId, myEmail, isAdmin, version }) {
  const [items, setItems] = useState(null);
  const [text, setText] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(() => {
    if (!postId) return;
    socialApi.activity(postId).then(setItems).catch(() => setItems([]));
  }, [postId]);
  useEffect(() => { load(); }, [load, version]);

  if (!postId) return null;
  const send = async () => {
    const body = text.trim();
    if (!body) return;
    try {
      setItems(await socialApi.comment(postId, body));
      setText('');
    } catch (e) { toast.error(e.message); }
  };
  const remove = async (id) => {
    try { setItems(await socialApi.commentDelete(id)); } catch (e) { toast.error(e.message); }
  };

  const list = items || [];
  const comments = list.filter((a) => a.kind === 'comment');
  const events = list.filter((a) => a.kind !== 'comment');

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
          <MessageCircle size={13} aria-hidden="true" />{tr('Komentarze zespołu')}
          {comments.length > 0 && <span className="tabular-nums text-gray-400">{comments.length}</span>}
        </p>
        {events.length > 0 && (
          <button type="button" onClick={() => setShowHistory((v) => !v)} className="text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 flex items-center gap-1">
            <History size={13} aria-hidden="true" />{showHistory ? tr('Ukryj historię') : tr('Pokaż historię')}
          </button>
        )}
      </div>
      <ul className="space-y-2">
        {list.filter((a) => a.kind === 'comment' || showHistory).map((a) => (a.kind === 'comment' ? (
          <li key={a.id} className="group rounded-xl bg-gray-50 dark:bg-gray-800/70 px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="font-semibold text-gray-700 dark:text-gray-200 truncate">{a.actor}</span>
              <span className="tabular-nums">{fmt(a.created_at)}</span>
              {(isAdmin || String(a.actor || '').toLowerCase() === String(myEmail || '').toLowerCase()) && (
                <button type="button" onClick={() => remove(a.id)} aria-label={tr('Usuń komentarz')}
                  className="ml-auto opacity-0 group-hover:opacity-100 focus:opacity-100 text-gray-400 hover:text-red-600"><Trash2 size={13} /></button>
              )}
            </div>
            <p className="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap break-words mt-0.5">{a.note}</p>
          </li>
        ) : (
          <li key={a.id} className="text-xs text-gray-500 flex gap-1.5 px-1">
            <span className="tabular-nums shrink-0">{fmt(a.created_at)}</span>
            <span className="min-w-0">
              {a.actor && <span className="text-gray-700 dark:text-gray-300">{a.actor} </span>}
              {tr(ACTIVITY_LABELS[a.kind] || a.kind)}
              {WITH_TIME.has(a.kind) && a.note && !Number.isNaN(Date.parse(a.note)) ? ` · ${fmt(a.note)}` : ''}
              {!WITH_TIME.has(a.kind) && a.note ? <span className="block whitespace-pre-wrap text-gray-400">{a.note}</span> : null}
            </span>
          </li>
        )))}
        {items !== null && !comments.length && !showHistory && (
          <li className="text-xs text-gray-400 px-1">{tr('Brak komentarzy — zapytaj albo podpowiedz coś autorowi.')}</li>
        )}
      </ul>
      <div className="flex gap-2 items-end">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2000} placeholder={tr('Napisz komentarz…')}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }}
          className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent-primary/40"
          aria-label={tr('Komentarz')} />
        <Button size="sm" icon={Send} onClick={send} disabled={!text.trim()}>{tr('Wyślij')}</Button>
      </div>
    </section>
  );
}
