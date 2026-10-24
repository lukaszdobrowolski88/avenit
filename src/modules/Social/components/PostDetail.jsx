import React, { useMemo, useState } from 'react';
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

// Szczegóły posta po publikacji (albo w trakcie): wynik w każdym kanale, linki, błędy, ponowienie.
export default function PostDetail({ post, open, onClose, access, myEmail, accountsById, onAction }) {
  const perm = postPermissions(post || {}, access, myEmail);
  const targets = post?.targets || [];
  const [previewId, setPreviewId] = useState(null);
  const previewTarget = useMemo(() => targets.find((t) => t.id === previewId) || targets[0], [targets, previewId]);
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
          <ActivityPanel postId={post.id} myEmail={myEmail} isAdmin={access?.admin} />
        </div>
        <aside className="bg-gray-50 dark:bg-gray-900/40 border-t md:border-t-0 md:border-l border-gray-100 dark:border-gray-800 p-5">
          {previewAccount && <PostPreview account={previewAccount} content={eff.content} media={eff.media} options={eff.options} />}
        </aside>
      </div>
    </Modal>
  );
}
