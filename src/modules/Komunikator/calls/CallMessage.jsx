import React from 'react';
import { Phone, PhoneCall, PhoneIncoming, PhoneMissed, PhoneOutgoing, Video } from 'lucide-react';
import { useCalls } from './callContext';
import { callMessageView, inCall, parseMetadata } from './callLogic';
import { formatMessageTime } from '../utils/messageHelpers';
import { tr } from '../../../i18n';

// Wiadomość „połączenie” w wątku: ikona, opis, czas trwania, „Oddzwoń” / „Dołącz”.
export default function CallMessage({ message, currentUserEmail, isGroupConversation = false }) {
  const calls = useCalls();
  const meta = parseMetadata(message?.metadata);
  // Gdy dostawca połączeń zna stan rozmowy — ma pierwszeństwo przed (opóźnioną) wiadomością.
  const callId = meta.call_id || null;
  const liveOverride = calls && callId ? calls.isCallLive(callId) : null;
  const view = callMessageView(
    { ...message, metadata: isGroupConversation && meta.is_group == null && meta.group == null ? { ...meta, is_group: true } : meta },
    currentUserEmail,
    tr,
    { live: liveOverride },
  );
  const inThisCall = !!calls && inCall(calls.state) && calls.state.call?.id === view.callId;

  let Icon = view.mine ? PhoneOutgoing : PhoneIncoming;
  if (view.live) Icon = view.kind === 'video' ? Video : PhoneCall;
  else if (view.tone === 'missed') Icon = PhoneMissed;
  else if (view.kind === 'video') Icon = Video;
  else if (view.status === 'cancelled') Icon = Phone;

  const meta2 = [view.durationText, formatMessageTime(message.created_at)].filter(Boolean).join(' · ');
  const enabled = !!calls && calls.callsEnabled !== false;
  const pill = 'ml-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400';

  let action = null;
  if (enabled && view.live && !inThisCall && view.callId) {
    action = (
      <button type="button" className={pill}
        onClick={() => calls.joinCall({ id: view.callId, conversation_id: message.conversation_id, kind: view.kind }, null, 'audio')}>
        <PhoneCall size={13} aria-hidden="true" /> {tr('Dołącz')}
      </button>
    );
  } else if (enabled && view.canCallBack && message.conversation_id) {
    action = (
      <button type="button" className={pill} onClick={() => calls.callBack(message.conversation_id, view.kind)}>
        {view.kind === 'video' ? <Video size={13} aria-hidden="true" /> : <Phone size={13} aria-hidden="true" />} {view.callBackLabel}
      </button>
    );
  }

  return (
    <div className="flex justify-center my-2" data-call-status={view.status}>
      <div className="inline-flex items-center gap-3 pl-2 pr-2 py-2 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700/50 shadow-sm max-w-full">
        <span className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center ${view.tone === 'missed'
          ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300'
          : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'}`}>
          <Icon size={17} aria-hidden="true" />
        </span>
        <div className="min-w-0 text-left pr-1">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{view.title}</p>
          {meta2 && <p className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">{meta2}</p>}
        </div>
        {action}
      </div>
    </div>
  );
}
