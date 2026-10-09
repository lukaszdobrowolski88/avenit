import React from 'react';
import { useCalls, useCallRoomContext } from './callContext';
import IncomingCallDialog from './IncomingCallDialog';
import CallWindow from './CallWindow';
import CallMiniWindow from './CallMiniWindow';
import { inCall } from './callLogic';

// Warstwa połączeń nad aplikacją: dzwonek, pełne okno albo mini-okno rozmowy.
export default function CallLayer() {
  const calls = useCalls();
  const room = useCallRoomContext();
  if (!calls || !room) return null;
  const { state } = calls;
  if (state.phase === 'incoming' && state.incoming) {
    return <IncomingCallDialog incoming={state.incoming} onAccept={calls.acceptCall} onDecline={calls.declineCall} />;
  }
  if (!inCall(state)) return null;
  return state.minimized
    ? <CallMiniWindow calls={calls} room={room} />
    : <CallWindow calls={calls} room={room} />;
}
