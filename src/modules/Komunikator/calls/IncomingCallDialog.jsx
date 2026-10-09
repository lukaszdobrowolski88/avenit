import React, { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Phone, PhoneOff, Video } from 'lucide-react';
import UserAvatar from '../components/UserAvatar';
import { useFocusTrap } from '../../../components/ui/useFocusTrap';
import { tr } from '../../../i18n';

function Action({ icon: Icon, label, onClick, tone, autoFocus = false }) {
  const tones = {
    decline: 'bg-red-600 hover:bg-red-700 text-white',
    accept: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  };
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        data-autofocus={autoFocus || undefined}
        className={`w-14 h-14 rounded-full inline-flex items-center justify-center shadow-md transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-500 dark:focus-visible:ring-offset-gray-900 ${tones[tone]}`}
      >
        <Icon size={22} aria-hidden="true" />
      </button>
      <span className="text-xs text-gray-600 dark:text-gray-300" aria-hidden="true">{label}</span>
    </div>
  );
}

// Połączenie przychodzące — działa na każdej trasie (montowane w powłoce aplikacji).
export default function IncomingCallDialog({ incoming, onAccept, onDecline }) {
  const panelRef = useRef(null);
  const titleId = useId();
  const descId = useId();
  useFocusTrap(panelRef, true);
  const { call, conversation, caller } = incoming;
  const video = call?.kind === 'video';
  const isGroup = conversation?.type && conversation.type !== 'direct';
  const who = caller?.name || caller?.email || tr('Ktoś');

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/30 p-4">
      <div
        ref={panelRef}
        tabIndex={-1}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="w-full max-w-sm rounded-3xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200/70 dark:border-gray-700/60 p-6 text-center outline-none animate-[slideIn_.2s_ease]"
      >
        <div className="flex justify-center mb-3">
          <span className="rounded-full ring-4 ring-accent-primary/30 motion-safe:animate-pulse">
            <UserAvatar user={{ full_name: who, email: caller?.email, avatar_url: caller?.avatar }} size="xl" />
          </span>
        </div>
        <h2 id={titleId} className="text-lg font-semibold text-gray-900 dark:text-white truncate">{who}</h2>
        <p id={descId} className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">
          {video ? tr('Połączenie wideo przychodzące') : tr('Połączenie głosowe przychodzące')}
          {isGroup && conversation?.name ? <><br /><span className="text-gray-500 dark:text-gray-400">{tr('w rozmowie „{name}”', { name: conversation.name })}</span></> : null}
        </p>
        <div className="mt-6 flex items-start justify-center gap-6">
          <Action icon={PhoneOff} tone="decline" label={tr('Odrzuć')} onClick={onDecline} />
          <Action icon={Phone} tone="accept" label={tr('Odbierz')} onClick={() => onAccept('audio')} autoFocus={!video} />
          <Action icon={Video} tone="accept" label={tr('Odbierz z wideo')} onClick={() => onAccept('video')} autoFocus={video} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
