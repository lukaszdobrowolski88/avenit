import React, { useCallback, useEffect, useState } from 'react';
import { MessageCircle, Info, EyeOff, Eye, Trash2, Check, Reply, ExternalLink, Film, CheckCheck, X } from 'lucide-react';
import Button from '../../../components/Button';
import Spinner from '../../../components/Spinner';
import EmptyState from '../../../components/EmptyState';
import { tr, appLocale } from '../../../i18n';
import { toast } from '../../../lib/toast';
import { confirmDialog } from '../../../lib/dialog';
import { socialApi, mediaSrc } from '../lib/socialApi';
import { snippet } from '../lib/socialUi';
import ChannelAvatar, { channelName } from './ChannelAvatar';

const FILTERS = [
  { value: 'new', label: 'Nowe' },
  { value: 'all', label: 'Wszystkie' },
  { value: 'hidden', label: 'Ukryte' },
];
const when = (iso) => (iso ? new Date(iso).toLocaleString(appLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

function Bubble({ c, own }) {
  return (
    <div className={`rounded-xl px-3 py-2 ${own ? 'bg-accent-primary/10 dark:bg-accent-primary/15' : 'bg-gray-50 dark:bg-gray-900/40'} ${c.hidden ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span className="font-semibold text-gray-800 dark:text-gray-100">{c.author_name || tr('Użytkownik')}</span>
        <span className="tabular-nums">{when(c.created_time)}</span>
        {c.hidden && <span className="inline-flex items-center gap-1"><EyeOff size={11} aria-hidden="true" />{tr('ukryty')}</span>}
        {c.status === 'new' && !own && <span className="w-2 h-2 rounded-full bg-accent-primary" aria-label={tr('nowy')} />}
      </div>
      <p className="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap break-words mt-0.5">{c.message}</p>
    </div>
  );
}

// Skrzynka komentarzy z Facebooka i Instagrama (worker co 10 min): odpowiedź, ukrycie, usunięcie.
export default function InboxTab({ accounts, access, postFilter, onClearPostFilter, onChanged, version }) {
  const canEngage = Boolean(access.engage);
  const [status, setStatus] = useState(postFilter ? 'all' : 'new');
  const [account, setAccount] = useState(null);
  const [items, setItems] = useState(null);
  const [replying, setReplying] = useState(null);
  const [text, setText] = useState('');

  const load = useCallback(() => {
    socialApi.inbox({ status, account_id: account, post_id: postFilter || undefined })
      .then(setItems).catch((e) => { toast.error(e.message); setItems([]); });
  }, [status, account, postFilter]);
  useEffect(() => { setItems(null); load(); }, [load, version]);

  const byId = new Map(accounts.map((a) => [a.id, a]));
  const needReconnect = accounts.filter((a) => (a.needs_reconnect_for || []).includes('comments'));
  const act = async (fn, ok) => {
    try { await fn(); if (ok) toast.success(ok); load(); onChanged?.(); } catch (e) { toast.error(e.message); }
  };
  const send = (c) => act(async () => { await socialApi.inboxReply(c.id, text.trim()); setReplying(null); setText(''); }, tr('Odpowiedź opublikowana.'));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1" role="radiogroup" aria-label={tr('Filtr komentarzy')}>
          {FILTERS.map((f) => (
            <button key={f.value} type="button" role="radio" aria-checked={status === f.value} onClick={() => setStatus(f.value)}
              className={`px-3 py-1 rounded-lg text-xs font-medium ${status === f.value ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'}`}>{tr(f.label)}</button>
          ))}
        </div>
        <div className="flex items-center gap-1" role="group" aria-label={tr('Filtruj po kanale')}>
          {accounts.map((a) => (
            <button key={a.id} type="button" onClick={() => setAccount((cur) => (cur === a.id ? null : a.id))} aria-pressed={account === a.id} title={channelName(a)} className="rounded-full p-0.5">
              <ChannelAvatar account={a} size={28} selected={account === a.id} dimmed={Boolean(account) && account !== a.id} />
            </button>
          ))}
        </div>
        {postFilter && (
          <button type="button" onClick={onClearPostFilter} className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-800 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-200">
            {tr('Jeden post')}<X size={12} aria-hidden="true" />
          </button>
        )}
        <span className="flex-1" />
        {status === 'new' && items?.length > 0 && (
          <Button size="sm" variant="outline" icon={CheckCheck} onClick={() => act(() => socialApi.inboxMark({ all: true, status: 'read' }), tr('Oznaczono jako przeczytane.'))}>{tr('Oznacz wszystkie jako przeczytane')}</Button>
        )}
      </div>

      {needReconnect.length > 0 && (
        <div className="rounded-2xl bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200 px-4 py-3 text-sm flex gap-2">
          <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{tr('Połącz ponownie kanały: {names} (zakładka Kanały), żeby pobierać komentarze i na nie odpowiadać.', { names: needReconnect.map(channelName).join(', ') })}</span>
        </div>
      )}

      {items === null ? <Spinner center /> : !items.length ? (
        <EmptyState icon={MessageCircle} title={status === 'new' ? tr('Wszystko przeczytane') : tr('Brak komentarzy')}
          subtitle={tr('Komentarze spod opublikowanych postów (ostatnie 30 dni) pojawiają się tu co kilka minut.')} />
      ) : items.map((c) => {
        const acc = byId.get(c.account_id);
        const first = (c.post_media || [])[0];
        return (
          <article key={c.id} className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700/60 p-4 space-y-3">
            <header className="flex items-center gap-2.5 min-w-0">
              <ChannelAvatar account={acc} provider={c.provider} name={c.account_name} size={26} />
              {first && (
                <span className="w-8 h-8 rounded-md overflow-hidden bg-gray-100 dark:bg-gray-900 shrink-0 flex items-center justify-center">
                  {first.kind === 'video' ? <Film size={14} className="text-gray-400" aria-hidden="true" /> : <img src={`${mediaSrc(first)}?w=96`} alt="" className="w-full h-full object-cover" />}
                </span>
              )}
              <span className="text-xs text-gray-500 truncate flex-1">{snippet(c.post_content, 90) || tr('Post bez tekstu')}</span>
              {c.permalink && <a href={c.permalink} target="_blank" rel="noreferrer" className="icon-btn" aria-label={tr('Zobacz post')} title={tr('Zobacz post')}><ExternalLink size={14} /></a>}
            </header>
            <Bubble c={c} />
            {c.replies.length > 0 && (
              <div className="pl-5 space-y-2 border-l-2 border-gray-100 dark:border-gray-700 ml-2">
                {c.replies.map((r) => <Bubble key={r.id} c={r} own={r.is_own} />)}
              </div>
            )}
            {replying === c.id ? (
              <div className="flex gap-2 items-end">
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2200} autoFocus
                  placeholder={tr('Odpowiedź jako {name}…', { name: channelName(acc) || c.account_name || '' })}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && text.trim()) { e.preventDefault(); send(c); } }}
                  className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent-primary/40" aria-label={tr('Odpowiedź')} />
                <Button size="sm" variant="secondary" onClick={() => { setReplying(null); setText(''); }}>{tr('Anuluj')}</Button>
                <Button size="sm" onClick={() => send(c)} disabled={!text.trim()}>{tr('Odpowiedz')}</Button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 flex-wrap">
                {canEngage && <Button size="sm" variant="outline" icon={Reply} onClick={() => { setReplying(c.id); setText(''); }}>{tr('Odpowiedz')}</Button>}
                {(c.status === 'new' || c.replies.some((r) => r.status === 'new' && !r.is_own)) && (
                  <Button size="sm" variant="ghost" icon={Check} onClick={() => act(() => socialApi.inboxMark({ ids: [c.id], status: 'read' }))}>{tr('Przeczytane')}</Button>
                )}
                {canEngage && (
                  <Button size="sm" variant="ghost" icon={c.hidden ? Eye : EyeOff} onClick={() => act(() => socialApi.inboxHide(c.id, !c.hidden), c.hidden ? tr('Komentarz znów widoczny.') : tr('Komentarz ukryty.'))}>
                    {c.hidden ? tr('Pokaż') : tr('Ukryj')}
                  </Button>
                )}
                {canEngage && (
                  <Button size="sm" variant="ghost" icon={Trash2} onClick={async () => {
                    if (!(await confirmDialog(tr('Usunąć ten komentarz z {provider}? Tego nie da się cofnąć.', { provider: c.provider === 'instagram' ? 'Instagrama' : 'Facebooka' })))) return;
                    act(() => socialApi.inboxDelete(c.id), tr('Komentarz usunięty.'));
                  }}>{tr('Usuń')}</Button>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
