import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Share2, Plus, CalendarDays, ListOrdered, ClipboardCheck, FileText, CheckCheck, Link2, AlertTriangle } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import ResponsiveTabs from '../../components/ResponsiveTabs';
import Button from '../../components/Button';
import Spinner from '../../components/Spinner';
import { tr } from '../../i18n';
import { toast } from '../../lib/toast';
import { confirmDialog, promptDialog } from '../../lib/dialog';
import useSocial from './hooks/useSocial';
import { socialApi } from './lib/socialApi';
import { connectMessage } from './lib/socialUi';
import { EDITABLE_STATUSES } from '@avenit/shared/src/lib/social.js';
import Composer, { fmtWhen } from './components/Composer';
import PostDetail from './components/PostDetail';
import PostList from './components/PostList';
import CalendarView from './components/CalendarView';
import ChannelsTab from './components/ChannelsTab';

function TabLabel({ label, count, tone }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {tr(label)}
      {count > 0 && (
        <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold tabular-nums flex items-center justify-center ${tone === 'danger' ? 'bg-red-600 text-white' : 'bg-accent-primary text-white'}`}>
          {count > 99 ? '99+' : count}
        </span>
      )}
    </span>
  );
}

export default function SocialModule() {
  const social = useSocial();
  const { accounts, access, counts, meta, me, loading, version, reload, refresh } = social;
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState('calendar');
  const [composer, setComposer] = useState(null); // { post?, defaults? }
  const [detail, setDetail] = useState(null);
  const myEmail = me?.email || '';
  const accountsById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const canCreate = access.create || access.publish;

  // Powrót z logowania Meta (?sm_result=…) — komunikat i czyszczenie adresu.
  useEffect(() => {
    const msg = connectMessage(params);
    if (!msg) return;
    if (msg.tone === 'success') toast.success(tr(msg.text, { n: msg.n }));
    else toast.error(tr(msg.text));
    const next = new URLSearchParams(params);
    ['sm_result', 'sm_reason', 'sm_added'].forEach((k) => next.delete(k));
    next.set('tab', 'channels');
    setParams(next, { replace: true });
    setTab('channels');
    refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const open = useCallback((post) => {
    if (post && !EDITABLE_STATUSES.has(post.status)) { setDetail(post); return; }
    if (post && post.status === 'failed') { setDetail(post); return; }
    setComposer({ post });
  }, []);

  // Link z powiadomienia: /social?post=<id>.
  useEffect(() => {
    const id = params.get('post');
    if (!id) return;
    socialApi.get(id).then((p) => open(p)).catch((e) => toast.error(e.message));
    const next = new URLSearchParams(params);
    next.delete('post');
    setParams(next, { replace: true });
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const onAction = useCallback(async (action, post, targetId) => {
    if (action === 'edit') { setDetail(null); setComposer({ post }); return; }
    try {
      if (action === 'approve') {
        const p = await socialApi.approve(post.id);
        toast.success(tr('Zatwierdzono — publikacja {when}.', { when: fmtWhen(p.scheduled_at) }));
      } else if (action === 'reject') {
        const note = await promptDialog(tr('Co poprawić? (autor dostanie powiadomienie)'), '');
        if (note === null || note === undefined) return;
        await socialApi.reject(post.id, note);
        toast.success(tr('Post odesłany do poprawy.'));
      } else if (action === 'publishNow') {
        if (!(await confirmDialog(tr('Opublikować ten post od razu?')))) return;
        await socialApi.publishNow(post.id);
        toast.success(tr('Publikowanie rozpoczęte.'));
      } else if (action === 'unschedule') {
        await socialApi.unschedule(post.id);
        toast.success(tr('Post przeniesiony do szkiców.'));
      } else if (action === 'retry') {
        await socialApi.retry(post.id, targetId);
        toast.success(tr('Ponawiamy publikację.'));
        setDetail(null);
      } else if (action === 'duplicate') {
        const copy = await socialApi.duplicate(post.id);
        setDetail(null);
        setComposer({ post: copy });
      } else if (action === 'delete') {
        const published = ['published', 'partial'].includes(post.status);
        const msg = published
          ? tr('Usunąć post z Avenit? Opublikowany post zostanie na Facebooku i Instagramie — usuń go tam ręcznie, jeśli trzeba.')
          : tr('Usunąć ten post?');
        if (!(await confirmDialog(msg))) return;
        await socialApi.remove(post.id);
        toast.success(tr('Post usunięty.'));
        setDetail(null);
      }
      reload();
    } catch (e) {
      toast.error(e.message);
    }
  }, [reload]);

  const tabs = [
    { id: 'calendar', label: tr('Kalendarz'), icon: CalendarDays },
    { id: 'queue', label: <TabLabel label="Kolejka" count={counts.queue} />, icon: ListOrdered },
    { id: 'approval', label: <TabLabel label="Do akceptacji" count={counts.approval} />, icon: ClipboardCheck },
    { id: 'drafts', label: <TabLabel label="Szkice" count={counts.drafts} />, icon: FileText },
    { id: 'sent', label: <TabLabel label="Opublikowane" count={counts.failed} tone="danger" />, icon: CheckCheck },
    { id: 'channels', label: tr('Kanały'), icon: Link2 },
  ];

  const createBtn = canCreate && (
    <Button icon={Plus} onClick={() => setComposer({ post: null })}>{tr('Utwórz post')}</Button>
  );
  const revoked = accounts.filter((a) => a.status === 'revoked');

  return (
    <div className="space-y-6">
      <PageHeader moduleKey="social" icon={Share2} title={tr('Social Media')}
        subtitle={tr('Planuj, zatwierdzaj i publikuj posty na Facebooku i Instagramie')}
        actions={createBtn} />

      {revoked.length > 0 && tab !== 'channels' && (
        <button type="button" onClick={() => setTab('channels')}
          className="w-full text-left rounded-2xl bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 px-4 py-3 text-sm flex items-center gap-2">
          <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />
          {tr('Kanały wymagają ponownego połączenia: {names}. Zaplanowane posty na nie się nie opublikują.', { names: revoked.map((a) => a.name).join(', ') })}
        </button>
      )}

      <ResponsiveTabs moduleKey="social" tabs={tabs} activeTab={tab} onChange={setTab} />

      {loading ? <Spinner center label={tr('Ładowanie…')} /> : social.error ? (
        <p className="text-sm text-red-700 dark:text-red-300">{social.error}</p>
      ) : (
        <div>
          {tab === 'calendar' && (
            <CalendarView version={version} access={access} myEmail={myEmail} onOpen={open}
              onCreate={(defaults) => setComposer({ post: null, defaults })} onChanged={reload} />
          )}
          {['queue', 'approval', 'drafts', 'sent'].includes(tab) && (
            <PostList view={tab} version={version} access={access} myEmail={myEmail} accountsById={accountsById}
              onOpen={open} onAction={onAction} action={tab !== 'sent' ? createBtn : null} />
          )}
          {tab === 'channels' && <ChannelsTab accounts={accounts} access={access} meta={meta} onChanged={reload} />}
        </div>
      )}

      <Composer open={Boolean(composer)} onClose={() => setComposer(null)} post={composer?.post || null} defaults={composer?.defaults}
        accounts={accounts} access={access} myEmail={myEmail} onSaved={reload} />
      <PostDetail open={Boolean(detail)} post={detail} onClose={() => setDetail(null)} access={access} myEmail={myEmail}
        accountsById={accountsById} onAction={onAction} />
    </div>
  );
}
