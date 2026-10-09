import React from 'react';
import { PhoneCall, Video, Maximize2 } from 'lucide-react';
import { useCalls } from './callContext';
import { inCall } from './callLogic';
import { tr } from '../../../i18n';

// Pasek pod nagłówkiem rozmowy: „Trwa rozmowa — dołącz” (gdy mnie w niej nie ma) albo
// „Jesteś w tej rozmowie — pokaż” (gdy okno rozmowy jest zminimalizowane).
export default function ActiveCallBanner({ conversation }) {
  const calls = useCalls();
  if (!calls || !conversation?.id) return null;
  const { state } = calls;
  const live = calls.activeCallFor(conversation.id);
  const mineHere = inCall(state) && String(state.conversation?.id) === String(conversation.id);
  const bar = 'flex items-center gap-3 px-4 py-2 border-b border-gray-200/60 dark:border-gray-700/60 bg-accent-primary-lightest/70 dark:bg-accent-primary-darkest/25 text-sm text-gray-800 dark:text-gray-100';
  const pill = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400';

  if (mineHere) {
    if (!state.minimized) return null;
    return (
      <div className={bar} role="status">
        <PhoneCall size={16} aria-hidden="true" className="shrink-0" />
        <span className="flex-1 min-w-0 truncate">{tr('Jesteś w tej rozmowie')}</span>
        <button type="button" onClick={calls.restore} className={`${pill} bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900`}>
          <Maximize2 size={13} aria-hidden="true" /> {tr('Pokaż')}
        </button>
      </div>
    );
  }
  if (!live || calls.callsEnabled === false) return null;

  const video = live.kind === 'video';
  const busy = inCall(state);
  return (
    <div className={bar} role="status">
      {video ? <Video size={16} aria-hidden="true" className="shrink-0" /> : <PhoneCall size={16} aria-hidden="true" className="shrink-0" />}
      <span className="flex-1 min-w-0 truncate">
        {conversation.type === 'direct'
          ? (video ? tr('Trwa połączenie wideo — dołącz') : tr('Trwa połączenie głosowe — dołącz'))
          : tr('Trwa rozmowa — dołącz')}
      </span>
      {!busy && video && (
        <button type="button" onClick={() => calls.joinCall(live, conversation, 'video')} className={`${pill} bg-white/80 dark:bg-gray-800 hover:bg-white dark:hover:bg-gray-700`} aria-label={tr('Dołącz z wideo')} title={tr('Dołącz z wideo')}>
          <Video size={13} aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        onClick={() => calls.joinCall(live, conversation, 'audio')}
        disabled={busy}
        title={busy ? tr('Najpierw zakończ bieżącą rozmowę.') : undefined}
        className={`${pill} bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 disabled:opacity-50`}
      >
        <PhoneCall size={13} aria-hidden="true" /> {tr('Dołącz')}
      </button>
    </div>
  );
}
