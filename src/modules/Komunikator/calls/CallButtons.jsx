import React from 'react';
import { Phone, Video } from 'lucide-react';
import { useCalls } from './callContext';
import { inCall } from './callLogic';
import { canPostIn } from '../utils/chatLogic';
import { toast } from '../../../lib/toast';
import { tr } from '../../../i18n';

// Dlaczego nie można teraz dzwonić (null = można). Serwer i tak sprawdza (blokady, zasady
// rozmów prywatnych, niepełnoletni) — jego odmowę pokazujemy po kliknięciu.
// W kanale „piszą tylko administratorzy” zwykły uczestnik nie zaczyna rozmowy, ale może dołączyć
// do trwającej (serwer wpuszcza go tylko do słuchania).
export function callBlockReason(conversation, { peerBlocked = false, state = null, live = false } = {}) {
  if (!canPostIn(conversation) && !live) return tr('W tej rozmowie piszą tylko administratorzy, więc nie możesz tu dzwonić.');
  if (peerBlocked) return tr('Odblokuj tę osobę, aby zadzwonić.');
  if (state && inCall(state) && String(state.conversation?.id) !== String(conversation?.id)) return tr('Najpierw zakończ bieżącą rozmowę.');
  return null;
}

// „Zadzwoń” / „Wideo” w nagłówku rozmowy. Ukryte, gdy połączenia są wyłączone (503 z serwera).
export default function CallButtons({ conversation, peerBlocked = false, className = '' }) {
  const calls = useCalls();
  if (!calls || calls.callsEnabled === false || !conversation?.id) return null;
  const live = calls.activeCallFor(conversation.id);
  const reason = callBlockReason(conversation, { peerBlocked, state: calls.state, live: !!live });
  const btn = 'p-2.5 rounded-xl transition-all duration-200 group';
  const make = (kind) => {
    const label = kind === 'video'
      ? (live ? tr('Dołącz z wideo') : tr('Połączenie wideo'))
      : (live ? tr('Dołącz do rozmowy') : tr('Zadzwoń'));
    const Icon = kind === 'video' ? Video : Phone;
    return (
      <button
        key={kind}
        type="button"
        onClick={() => {
          if (reason) { toast.info(reason); return; }
          if (live && !(inCall(calls.state) && calls.state.call?.id === live.id)) calls.joinCall(live, conversation, kind);
          else calls.startCall(conversation, kind);
        }}
        aria-disabled={reason ? 'true' : undefined}
        aria-label={reason ? `${label}: ${reason}` : label}
        title={reason || label}
        className={`${btn} ${reason ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
      >
        <Icon size={18} className={reason ? 'text-gray-500' : 'text-gray-500 group-hover:text-accent-primary transition-colors'} aria-hidden="true" />
      </button>
    );
  };
  return <div className={`flex items-center gap-0.5 ${className}`}>{make('audio')}{make('video')}</div>;
}
