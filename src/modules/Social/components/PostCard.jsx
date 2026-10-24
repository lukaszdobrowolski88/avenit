import React from 'react';
import { Film, Pencil, Copy, Trash2, Zap, Undo2, RotateCcw, CheckCircle2, ExternalLink, Eye } from 'lucide-react';
import { StatusPill } from '../../../components/ui/DataTable';
import ActionMenu from '../../../components/ActionMenu';
import Button from '../../../components/Button';
import { tr } from '../../../i18n';
import { POST_STATUS_LABELS, isVideo } from '@avenit/shared/src/lib/social.js';
import { mediaSrc } from '../lib/socialApi';
import { STATUS_COLOR, postPermissions, snippet, timeLabel } from '../lib/socialUi';
import ChannelAvatar from './ChannelAvatar';

// Karta posta w listach (kolejka, akceptacja, szkice, opublikowane) — miękka karta bez ramki-akcentu.
export default function PostCard({ post, access, myEmail, accountsById, onOpen, onAction, showTime = true }) {
  const perm = postPermissions(post, access, myEmail);
  const first = (post.media || [])[0];
  const when = post.published_at || post.scheduled_at;
  const items = [
    perm.edit ? { key: 'edit', icon: Pencil, label: tr('Edytuj'), onClick: () => onOpen(post) } : { key: 'view', icon: Eye, label: tr('Szczegóły'), onClick: () => onOpen(post) },
    perm.publishNow && { key: 'now', icon: Zap, label: tr('Opublikuj teraz'), onClick: () => onAction('publishNow', post) },
    perm.unschedule && { key: 'unschedule', icon: Undo2, label: post.status === 'scheduled' ? tr('Wstrzymaj (do szkiców)') : tr('Wycofaj do szkiców'), onClick: () => onAction('unschedule', post) },
    perm.retry && { key: 'retry', icon: RotateCcw, label: tr('Ponów publikację'), onClick: () => onAction('retry', post) },
    perm.duplicate && { key: 'dup', icon: Copy, label: tr('Duplikuj'), onClick: () => onAction('duplicate', post) },
    perm.delete && { divider: true },
    perm.delete && { key: 'del', icon: Trash2, label: tr('Usuń'), danger: true, onClick: () => onAction('delete', post) },
  ].filter(Boolean);

  return (
    <div className="group flex gap-3 sm:gap-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700/60 p-3 sm:p-4 hover:shadow-sm transition-shadow">
      {showTime && (
        <div className="w-12 shrink-0 pt-0.5 text-sm font-semibold tabular-nums text-gray-800 dark:text-gray-100">
          {when ? timeLabel(when) : ''}
        </div>
      )}
      <button type="button" onClick={() => onOpen(post)} className="flex-1 min-w-0 flex gap-3 text-left">
        {first && (
          <span className="relative w-16 h-16 shrink-0 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-900">
            {isVideo(first)
              ? <span className="w-full h-full flex items-center justify-center text-gray-500"><Film size={20} aria-hidden="true" /></span>
              : <img src={`${mediaSrc(first)}?w=128`} alt="" className="w-full h-full object-cover" loading="lazy" onError={(e) => { e.currentTarget.src = mediaSrc(first); }} />}
            {post.media.length > 1 && <span className="absolute right-1 bottom-1 text-[10px] px-1.5 rounded-full bg-black/60 text-white tabular-nums">+{post.media.length - 1}</span>}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-gray-800 dark:text-gray-100 line-clamp-2 break-words">
            {snippet(post.content, 220) || <span className="text-gray-400 italic">{tr('Post bez tekstu')}</span>}
          </span>
          <span className="mt-2 flex items-center gap-2 flex-wrap">
            <span className="flex -space-x-1.5">
              {(post.targets || []).map((t) => (
                <ChannelAvatar key={t.id} account={accountsById?.get(t.account_id)} provider={t.provider} name={t.account_name} avatarUrl={accountsById?.get(t.account_id)?.avatar_url ?? null} size={22} status={post.status === 'draft' || post.status === 'pending_approval' || post.status === 'scheduled' ? null : t.status}
                  title={`${t.account_name} · ${t.error || tr(t.status === 'published' ? 'Opublikowany' : t.status === 'failed' ? 'Błąd' : 'Oczekuje')}`} />
              ))}
            </span>
            <StatusPill color={STATUS_COLOR[post.status]}>{tr(POST_STATUS_LABELS[post.status] || post.status)}</StatusPill>
            {post.created_by && <span className="text-xs text-gray-400 truncate">{post.created_by}</span>}
          </span>
          {(post.targets || []).filter((t) => t.status === 'failed' && t.error).slice(0, 2).map((t) => (
            <span key={t.id} className="mt-1.5 block text-xs text-red-700 dark:text-red-300 line-clamp-2">{t.account_name}: {t.error}</span>
          ))}
        </span>
      </button>
      <div className="flex items-start gap-1.5 shrink-0">
        {perm.approve && (
          <Button size="sm" icon={CheckCircle2} onClick={() => onAction('approve', post)}>{tr('Zatwierdź')}</Button>
        )}
        {(post.targets || []).some((t) => t.permalink) && (
          <a href={(post.targets.find((t) => t.permalink) || {}).permalink} target="_blank" rel="noreferrer" className="icon-btn" aria-label={tr('Zobacz post')} title={tr('Zobacz post')}>
            <ExternalLink size={15} />
          </a>
        )}
        <ActionMenu items={items} label={tr('Akcje posta')} />
      </div>
    </div>
  );
}
