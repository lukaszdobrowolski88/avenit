import React, { useEffect, useMemo, useState } from 'react';
import { Eye, ExternalLink, RotateCcw, Copy, Trash2, Pencil } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { StatusPill } from '../../../components/ui/DataTable';
import { tr } from '../../../i18n';
import { POST_STATUS_LABELS, TARGET_STATUS_LABELS, effectiveTarget } from '@avenit/shared/src/lib/social.js';
import { STATUS_COLOR, TARGET_COLOR, postPermissions } from '../lib/socialUi';
import ChannelAvatar from './ChannelAvatar';
import PostPreview from './PostPreview';
import { fmtWhen } from './Composer';
import ActivityPanel from './ActivityPanel';
import { socialApi } from '../lib/socialApi';

// Szczegóły posta po publikacji (albo w trakcie): wynik w każdym kanale, linki, błędy, ponowienie.
export default function PostDetail({ post, open, onClose, access, myEmail, accountsById, onAction }) {
  const perm = postPermissions(post || {}, access, myEmail);
  const targets = post?.targets || [];
  const [previewId, setPreviewId] = useState(null);
  const previewTarget = useMemo(() => targets.find((t) => t.id === previewId) || targets[0], [targets, previewId]);
  const [links, setLinks] = useState([]);
  const [metrics, setMetrics] = useState([]);
  useEffect(() => {
    if (!open || !post?.id) { setLinks([]); setMetrics([]); return; }
    socialApi.postLinks(post.id).then(setLinks).catch(() => setLinks([]));
    socialApi.postMetrics(post.id).then(setMetrics).catch(() => setMetrics([]));
  }, [open, post?.id]);
  const metricsOf = (targetId) => metrics.find((m) => m.target_id === targetId);
  if (!post) return null;
  const previewAccount = previewTarget
    ? (accountsById.get(previewTarget.account_id) || { provider: previewTarget.provider, name: previewTarget.account_name })
    : null;
  const eff = previewTarget ? effectiveTarget(post, previewTarget) : null;

  const footer = (
    <>
      {perm.delete && <Button variant="ghost" icon={Trash2} onClick={() => onAction('delete', post)}>{tr('Usuń z Avenit')}</Button>}
      <span className="flex-1" />
      {perm.edit && <Button variant="outline" icon={Pencil} onClick={() => onAction('edit', post)}>{tr('Edytuj')}</Button>}
      {perm.duplicate && <Button variant="outline" icon={Copy} onClick={() => onAction('duplicate', post)}>{tr('Duplikuj')}</Button>}
      {perm.retry && <Button icon={RotateCcw} onClick={() => onAction('retry', post)}>{tr('Ponów nieudane')}</Button>}
      <Button variant="secondary" onClick={onClose}>{tr('Zamknij')}</Button>
    </>
  );

  return (
    <Modal isOpen={open} onClose={onClose} size="xl" icon={Eye} title={tr('Szczegóły posta')}
      subtitle={post.published_at ? tr('Opublikowano {when}', { when: fmtWhen(post.published_at) }) : (post.scheduled_at ? fmtWhen(post.scheduled_at) : undefined)}
      footer={footer}>
      <div className="grid md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="p-6 space-y-4 min-w-0">
          <div className="flex items-center gap-2">
            <StatusPill color={STATUS_COLOR[post.status]}>{tr(POST_STATUS_LABELS[post.status] || post.status)}</StatusPill>
            {post.created_by && <span className="text-xs text-gray-500">{tr('Autor')}: {post.created_by}</span>}
            {post.approved_by && <span className="text-xs text-gray-500">· {tr('Zatwierdził(a)')}: {post.approved_by}</span>}
          </div>
          <ul className="divide-y divide-gray-100 dark:divide-gray-800 rounded-2xl border border-gray-100 dark:border-gray-800">
            {targets.map((t) => (
              <li key={t.id} className="flex items-start gap-3 px-4 py-3">
                <button type="button" onClick={() => setPreviewId(t.id)} aria-label={tr('Podgląd')}>
                  <ChannelAvatar account={accountsById.get(t.account_id)} provider={t.provider} name={t.account_name} size={32} selected={previewTarget?.id === t.id} />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-50 truncate">{t.account_name}</p>
                  {t.error && <p className={`text-xs mt-0.5 ${t.status === 'failed' ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>{t.error}</p>}
                  {t.published_at && <p className="text-xs text-gray-500 mt-0.5">{fmtWhen(t.published_at)}</p>}
                  {metricsOf(t.id) && (() => {
                    const m = metricsOf(t.id);
                    const parts = [
                      m.views != null && tr('{n} wyświetleń', { n: m.views }),
                      m.reach != null && tr('zasięg {n}', { n: m.reach }),
                      tr('{n} reakcji', { n: m.likes || 0 }),
                      tr('{n} kom.', { n: m.comments || 0 }),
                      m.shares != null && tr('{n} udostępnień', { n: m.shares }),
                      m.saves != null && tr('{n} zapisów', { n: m.saves }),
                    ].filter(Boolean);
                    return <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 tabular-nums">{parts.join(' · ')}</p>;
                  })()}
                </div>
                <StatusPill color={TARGET_COLOR[t.status]}>{tr(TARGET_STATUS_LABELS[t.status] || t.status)}</StatusPill>
                {t.permalink && (
                  <a href={t.permalink} target="_blank" rel="noreferrer" className="icon-btn" aria-label={tr('Zobacz post')} title={tr('Zobacz post')}><ExternalLink size={15} /></a>
                )}
                {perm.retry && t.status === 'failed' && (
                  <button type="button" className="icon-btn" onClick={() => onAction('retry', post, t.id)} aria-label={tr('Ponów')} title={tr('Ponów')}><RotateCcw size={15} /></button>
                )}
              </li>
            ))}
          </ul>
          {links.length > 0 && (
            <div className="rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">{tr('Kliknięcia linków')}</p>
              <ul className="space-y-1.5">
                {links.map((l) => (
                  <li key={l.code} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 min-w-0 truncate text-gray-700 dark:text-gray-200" title={l.target_url}>{(l.target_url || '').replace(/[?&]utm_[^&]+/g, '').replace(/\?$/, '')}</span>
                    <span className="font-semibold tabular-nums text-gray-900 dark:text-white">{l.clicks}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ActivityPanel postId={post.id} myEmail={myEmail} isAdmin={access?.admin} />
        </div>
        <aside className="bg-gray-50 dark:bg-gray-900/40 border-t md:border-t-0 md:border-l border-gray-100 dark:border-gray-800 p-5">
          {previewAccount && <PostPreview account={previewAccount} content={eff.content} media={eff.media} options={eff.options} />}
        </aside>
      </div>
    </Modal>
  );
}
