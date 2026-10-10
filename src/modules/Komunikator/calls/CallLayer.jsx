import React from 'react';
import { useCalls, useCallRoomContext } from './callContext';
import IncomingCallDialog from './IncomingCallDialog';
import CallWindow from './CallWindow';
import CallMiniWindow from './CallMiniWindow';
import GuestLobby from './GuestLobby';
import GuestInviteModal from './GuestInviteModal';
import { inCall } from './callLogic';

// Warstwa połączeń nad aplikacją: dzwonek, pełne okno albo mini-okno rozmowy, poczekalnia gości
// (dla osób w rozmowie) i okno „Zaproś gościa”.
export default function CallLayer() {
  const calls = useCalls();
  const room = useCallRoomContext();
  if (!calls || !room) return null;
  const { state } = calls;
  const invite = calls.guestInvite
    ? <GuestInviteModal conversation={calls.guestInvite} onClose={calls.closeGuestInvite} />
    : null;
  if (state.phase === 'incoming' && state.incoming) {
    return <>
      <IncomingCallDialog incoming={state.incoming} onAccept={calls.acceptCall} onDecline={calls.declineCall} />
      {invite}
    </>;
  }
  if (!inCall(state)) return invite;
  return <>
    {state.minimized
      ? <CallMiniWindow calls={calls} room={room} />
      : <CallWindow calls={calls} room={room} />}
    <GuestLobby queue={calls.lobby} onAdmit={calls.admitGuest} onDeny={calls.denyGuest} />
    {invite}
  </>;
}
