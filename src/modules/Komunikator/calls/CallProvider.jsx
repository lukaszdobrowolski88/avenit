import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { toast } from '../../../lib/toast';
import { tr } from '../../../i18n';
import { sameEmail, emailPattern, channelName, isMutedNow } from '../utils/chatLogic';
import { getMinistryName } from '../utils/messageHelpers';
import {
  callReducer, initialCallState, inCall, shouldRing, ringRemainingMs, isLiveCall,
  isCallsDisabledError, isCallGoneError, readCallsDisabled, writeCallsDisabled, ENDED_STATUSES, OUTGOING_TIMEOUT_MS,
} from './callLogic';
import { startRingtone, unlockAudio } from './ringtone';
import { applyGuestRequest, lobbyQueue } from './guestLogic';
import { callFn } from './callApi';
import useCallRoom from './useCallRoom';
import CallLayer from './CallLayer';

import { CallsContext, CallRoomContext } from './callContext';

export { useCalls, useCallRoomContext } from './callContext';

// Globalny stan połączeń (montowany raz w powłoce aplikacji): dzwonek przychodzący z realtime
// (tabela calls), rozmowa w toku (LiveKit), okno pełne / mini, trwające rozmowy per rozmowa
// czatu (baner „Trwa rozmowa — dołącz”).


async function userInfo(email) {
  if (!email) return { email: null, name: '', avatar: null };
  try {
    const { data } = await supabase
      .from('app_users')
      .select('email, full_name, avatar_url')
      .ilike('email', emailPattern(email))
      .limit(1)
      .maybeSingle();
    return { email, name: data?.full_name || email, avatar: data?.avatar_url || null };
  } catch {
    return { email, name: email, avatar: null };
  }
}

// Nazwa i awatar rozmowy (dla 1:1 — druga osoba), typ i moje wyciszenie.
async function conversationInfo(id, me) {
  const [{ data: conv }, { data: mine }] = await Promise.all([
    supabase.from('conversations').select('id, name, type, avatar_url, ministry_key').eq('id', id).maybeSingle(),
    supabase.from('conversation_participants').select('muted, muted_until, role').eq('conversation_id', id)
      .ilike('user_email', emailPattern(me)).limit(1).maybeSingle(),
  ]);
  if (!conv) return null;
  let name = conv.type === 'ministry' ? channelName(conv, getMinistryName) : conv.name;
  let avatar = conv.avatar_url || null;
  if (conv.type === 'direct') {
    const { data: parts } = await supabase.from('conversation_participants').select('user_email').eq('conversation_id', id);
    const other = (parts || []).find((p) => !sameEmail(p.user_email, me));
    if (other) {
      const u = await userInfo(other.user_email);
      name = u.name;
      avatar = u.avatar;
    }
  }
  return { id: conv.id, type: conv.type, name: name || tr('Rozmowa'), avatar, muted: isMutedNow(mine || {}), isParticipant: !!mine, myRole: mine?.role || null };
}

const normConversation = (c) => (c ? {
  id: c.id,
  type: c.type || null,
  name: c.displayName || c.name || (c.type === 'ministry' ? channelName(c, getMinistryName) : '') || tr('Rozmowa'),
  avatar: c.displayAvatar || c.avatar || c.avatar_url || null,
  myRole: c.myRole ?? c.my_role ?? null,
} : null);

export function CallProvider({ userEmail, children }) {
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(callReducer, initialCallState);
  const [activeCalls, setActiveCalls] = useState({}); // conversation_id → wiersz calls (ringing/active)
  const [callsEnabled, setCallsEnabledState] = useState(() => !readCallsDisabled());
  const [announcement, setAnnouncement] = useState('');
  const [startedAt, setStartedAt] = useState(null); // początek MOJEGO udziału (zegar w oknie)
  const [guestRequests, setGuestRequests] = useState({}); // poczekalnia gości: id → wiersz (oczekujące)
  const [guestInvite, setGuestInvite] = useState(null);   // rozmowa, dla której otwarto „Zaproś gościa”

  const stateRef = useRef(state);
  stateRef.current = state;
  const meRef = useRef(userEmail);
  meRef.current = userEmail;
  const dismissedRef = useRef(new Set()); // rozmowy odrzucone/zakończone tu — nie dzwonią ponownie
  const opRef = useRef(0);                // numer operacji (łączenie przerwane rozłączeniem)
  const ringTimerRef = useRef(null);

  const setCallsEnabled = useCallback((enabled) => {
    setCallsEnabledState(enabled);
    writeCallsDisabled(!enabled);
  }, []);

  const announce = useCallback((text) => {
    setAnnouncement('');
    setTimeout(() => setAnnouncement(text), 30);
  }, []);

  const handleRemoteDisconnect = useRef(null);
  const room = useCallRoom({
    onRemoteJoined: (p) => {
      announce(tr('{name} dołączył(a) do rozmowy', { name: p?.name || p?.identity || '' }));
      dispatch({ type: 'REMOTE_JOINED' });
    },
    onRemoteLeft: (p) => announce(tr('{name} opuścił(a) rozmowę', { name: p?.name || p?.identity || '' })),
    onDisconnected: (reason) => handleRemoteDisconnect.current?.(reason),
  });
  const roomRef = useRef(room);
  roomRef.current = room;

  // ── Trwające rozmowy (baner) ────────────────────────────────────────────────
  const upsertActive = useCallback((call) => {
    if (!call?.conversation_id) return;
    setActiveCalls((prev) => {
      const key = String(call.conversation_id);
      const cur = prev[key];
      if (isLiveCall(call)) {
        if (cur && cur.id !== call.id && Date.parse(cur.started_at || 0) > Date.parse(call.started_at || 0)) return prev;
        return { ...prev, [key]: { ...(cur?.id === call.id ? cur : {}), ...call } };
      }
      if (!cur || cur.id !== call.id) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  // Usuń rozmowę z banera (serwer odpowiedział, że już się zakończyła).
  const dropActive = useCallback((callId) => {
    if (!callId) return;
    setActiveCalls((prev) => {
      const key = Object.keys(prev).find((k) => prev[k]?.id === callId);
      if (!key) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  // Aktualny stan jednej rozmowy z serwera (po rozłączeniu — zmiana mogła nie dojść przez realtime).
  const refreshCall = useCallback(async (callId) => {
    if (!callId) return;
    try {
      const { data } = await supabase.from('calls').select('*').eq('id', callId).maybeSingle();
      if (data) upsertActive(data);
    } catch { /* sieć — kolejne odświeżenie poprawi */ }
  }, [upsertActive]);

  // ── Kończenie ──────────────────────────────────────────────────────────────
  const finish = useCallback(async ({ notify = null } = {}) => {
    opRef.current += 1;
    const cur = stateRef.current;
    if (cur.call?.id) dismissedRef.current.add(cur.call.id);
    dispatch({ type: 'RESET' });
    setStartedAt(null);
    await roomRef.current.disconnect();
    if (notify) toast.info(notify);
    if (cur.call?.id) refreshCall(cur.call.id);
  }, [refreshCall]);

  handleRemoteDisconnect.current = () => {
    if (!inCall(stateRef.current)) return;
    finish({ notify: tr('Rozmowa zakończona') });
  };

  // ── Dzwonek przychodzący ───────────────────────────────────────────────────
  const considerRing = useCallback(async (call, { fresh = false } = {}) => {
    const me = meRef.current;
    const busy = stateRef.current.phase !== 'idle';
    if (!shouldRing(call, { me, fresh, dismissed: dismissedRef.current, busy })) return;
    try {
      const conversation = await conversationInfo(call.conversation_id, me);
      if (!conversation || !conversation.isParticipant) return;
      // 1:1 już odebrana (na innym urządzeniu) — nie dzwonimy. Grupa dzwoni całe 45 s.
      if ((call.is_group === false || conversation.type === 'direct') && call.status === 'active') return;
      // Rozmowa wyciszona: bez dzwonka (zostaje baner „Trwa rozmowa — dołącz”).
      if (conversation.muted) return;
      const { data: myRow } = await supabase.from('call_participants').select('response, joined_at')
        .eq('call_id', call.id).ilike('user_email', emailPattern(me)).limit(1).maybeSingle();
      if (myRow && (myRow.response || myRow.joined_at)) return;
      const caller = await userInfo(call.started_by_email);
      if (stateRef.current.phase !== 'idle' || dismissedRef.current.has(call.id)) return;
      clearTimeout(ringTimerRef.current);
      ringTimerRef.current = setTimeout(() => dispatch({ type: 'RING_STOP', callId: call.id }), ringRemainingMs(call, { fresh }));
      dispatch({ type: 'RING', call, conversation, caller });
    } catch { /* brak dostępu / sieć — bez dzwonka */ }
  }, []);

  // Zdarzenie wiersza calls (realtime lub start).
  const onCallRow = useCallback((call, { fresh = false } = {}) => {
    if (!call?.id) return;
    upsertActive(call);
    const cur = stateRef.current;
    // Moja bieżąca rozmowa.
    if (cur.call?.id === call.id && inCall(cur)) {
      if (ENDED_STATUSES.has(call.status)) {
        const notify = cur.phase === 'outgoing' || (cur.phase === 'joining' && cur.outgoing)
          ? (call.status === 'declined' ? tr('Połączenie odrzucone') : call.status === 'missed' ? tr('Nikt nie odebrał') : tr('Rozmowa zakończona'))
          : null;
        finish({ notify });
      } else {
        dispatch({ type: 'CALL_UPDATED', call });
      }
      return;
    }
    // Dzwoni do mnie — koniec dzwonienia, gdy rozmowa się skończyła albo (1:1) została odebrana.
    if (cur.phase === 'incoming' && cur.incoming?.call?.id === call.id) {
      const direct = call.is_group === false || cur.incoming.conversation?.type === 'direct';
      if (ENDED_STATUSES.has(call.status) || (direct && call.status === 'active')) {
        dispatch({ type: 'RING_STOP', callId: call.id });
      }
      return;
    }
    considerRing(call, { fresh });
  }, [upsertActive, considerRing, finish]);

  // Wczytaj trwające rozmowy (start, powrót połączenia realtime) — także dzwoniącą do mnie,
  // gdy aplikację otwarto z powiadomienia push.
  const loadActive = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('calls').select('*').in('status', ['ringing', 'active'])
        .order('started_at', { ascending: false }).limit(50);
      if (error || !Array.isArray(data)) return;
      const map = {};
      for (const c of data) {
        const key = String(c.conversation_id);
        if (isLiveCall(c) && !map[key]) map[key] = c;
      }
      setActiveCalls(map);
      const ringing = data.find((c) => shouldRing(c, { me: meRef.current, dismissed: dismissedRef.current }));
      if (ringing) considerRing(ringing);
    } catch { /* tabela jeszcze nie istnieje — bez połączeń */ }
  }, [considerRing]);

  // Czy serwer ma skonfigurowane połączenia (bez kluczy LiveKit → przyciski ukryte).
  useEffect(() => {
    if (!userEmail) return undefined;
    let alive = true;
    callFn('call-config', {}).then((cfg) => {
      if (alive && cfg && typeof cfg.enabled === 'boolean') setCallsEnabled(cfg.enabled);
    }).catch(() => { /* starsze API — dowiemy się przy pierwszej próbie (503) */ });
    return () => { alive = false; };
  }, [userEmail, setCallsEnabled]);

  useEffect(() => {
    if (!userEmail) return undefined;
    loadActive();
    // Realtime nie stosuje filtrów kanału — serwer wysyła wiersze rozmów, w których jestem.
    const chan = supabase
      .channel('calls-global')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, (payload) => {
        const row = payload?.new;
        if (row?.id) onCallRow(row, { fresh: payload.eventType === 'INSERT' });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'call_guest_requests' }, (payload) => {
        const row = payload?.new;
        if (!row?.id) return;
        setGuestRequests((prev) => applyGuestRequest(prev, row));
        // Nowy gość w poczekalni mojej bieżącej rozmowy — komunikat dla czytnika ekranu.
        const cur = stateRef.current;
        if (row.status === 'pending' && payload.eventType === 'INSERT' && inCall(cur)
          && String(cur.conversation?.id || cur.call?.conversation_id) === String(row.conversation_id)) {
          announce(tr('Gość chce dołączyć: {name}', { name: row.guest_name || '' }));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'call_participants' }, (payload) => {
        const row = payload?.new;
        const cur = stateRef.current;
        // Odebrałem/odrzuciłem na innym urządzeniu — przestań dzwonić tutaj.
        if (row && cur.phase === 'incoming' && cur.incoming?.call?.id === row.call_id
          && sameEmail(row.user_email, meRef.current) && (row.response || row.joined_at)) {
          dispatch({ type: 'RING_STOP', callId: row.call_id });
        }
      })
      .subscribe();
    const onReconnect = () => loadActive();
    window.addEventListener('avenit:realtime-reconnect', onReconnect);
    return () => {
      supabase.removeChannel(chan);
      window.removeEventListener('avenit:realtime-reconnect', onReconnect);
    };
  }, [userEmail, loadActive, onCallRow, announce]);

  // Siatka bezpieczeństwa dla banerów „Trwa połączenie”: zmiany z workera (nieodebrane po
  // restarcie API, uzgodnienie z LiveKit) nie idą przez realtime. Gdy coś „trwa” — sprawdzaj
  // co 30 s i po powrocie do karty.
  const hasActive = Object.keys(activeCalls).length > 0;
  useEffect(() => {
    if (!userEmail || !hasActive) return undefined;
    const timer = setInterval(loadActive, 30000);
    const onVisible = () => { if (document.visibilityState === 'visible') loadActive(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userEmail, hasActive, loadActive]);

  // Poczekalnia gości bieżącej rozmowy — wczytanie przy wejściu do rozmowy (później realtime).
  const lobbyConversationId = inCall(state) ? String(state.conversation?.id || state.call?.conversation_id || '') : '';
  const loadGuestRequests = useCallback(async (conversationId) => {
    if (!conversationId) return;
    try {
      const { data, error } = await supabase.from('call_guest_requests')
        .select('id, conversation_id, guest_name, status, created_at')
        .eq('conversation_id', conversationId).eq('status', 'pending')
        .order('created_at', { ascending: true }).limit(50);
      if (error || !Array.isArray(data)) return;
      setGuestRequests((prev) => {
        const next = Object.fromEntries(Object.entries(prev).filter(([, r]) => String(r.conversation_id) !== String(conversationId)));
        for (const r of data) next[r.id] = r;
        return next;
      });
    } catch { /* tenant bez migracji 097 — bez poczekalni */ }
  }, []);
  useEffect(() => {
    if (!lobbyConversationId) return undefined;
    loadGuestRequests(lobbyConversationId);
    const onReconnect = () => loadGuestRequests(lobbyConversationId);
    window.addEventListener('avenit:realtime-reconnect', onReconnect);
    return () => window.removeEventListener('avenit:realtime-reconnect', onReconnect);
  }, [lobbyConversationId, loadGuestRequests]);

  // Odblokowanie dźwięku przy pierwszym geście (dzwonek później zagra także w tle).
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // Dzwonek / sygnał oczekiwania.
  useEffect(() => {
    if (state.phase === 'incoming') return startRingtone('incoming');
    if (state.phase === 'outgoing') return startRingtone('ringback');
    return undefined;
  }, [state.phase]);
  useEffect(() => { if (state.phase !== 'incoming') clearTimeout(ringTimerRef.current); }, [state.phase]);

  // Nikt nie odbiera — dzwoniący rozłącza się sam (serwer i tak oznaczy „nieodebrane”).
  useEffect(() => {
    if (state.phase !== 'outgoing') return undefined;
    const t = setTimeout(() => {
      if (stateRef.current.phase !== 'outgoing') return;
      const id = stateRef.current.call?.id;
      if (id) callFn('call-cancel', { call_id: id }).catch(() => {});
      finish({ notify: tr('Nikt nie odebrał') });
    }, OUTGOING_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [state.phase, finish]);

  // Zamknięcie karty — opuść rozmowę (webhook LiveKit i tak to potwierdzi).
  useEffect(() => {
    const onHide = (e) => {
      if (e?.persisted) return; // strona idzie do bfcache — może wrócić
      const cur = stateRef.current;
      if (!inCall(cur) || !cur.call?.id) return;
      callFn('call-leave', { call_id: cur.call.id }).catch(() => {});
      roomRef.current.disconnect();
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, []);

  // ── Akcje ──────────────────────────────────────────────────────────────────
  const handleApiError = useCallback((err, fallback) => {
    if (isCallsDisabledError(err)) {
      setCallsEnabled(false);
      toast.info(tr('Połączenia audio i wideo nie są jeszcze włączone. Zapytaj administratora.'));
      return;
    }
    toast.error(err, { fallback });
  }, [setCallsEnabled]);

  // Połącz z pokojem po odpowiedzi serwera ({ token, url, call }).
  const connectWith = useCallback(async (op, data, { video }) => {
    const r = roomRef.current;
    const lkRoom = await r.connect({ url: data.url, token: data.token, video, canPublish: data.can_publish !== false });
    if (op !== opRef.current) { await r.disconnect(); return false; }
    const joinedCall = data.call || null;
    if (joinedCall) upsertActive(joinedCall);
    setStartedAt(Date.now());
    dispatch({ type: 'JOINED', call: joinedCall, remotePresent: (lkRoom?.remoteParticipants?.size || 0) > 0 });
    return true;
  }, [upsertActive]);

  const startCall = useCallback(async (conversation, kind = 'audio') => {
    const conv = normConversation(conversation);
    if (!conv?.id) return;
    const cur = stateRef.current;
    if (cur.phase !== 'idle') {
      if (inCall(cur) && String(cur.conversation?.id) === String(conv.id)) dispatch({ type: 'RESTORE' });
      else toast.info(tr('Najpierw zakończ bieżącą rozmowę.'));
      return;
    }
    unlockAudio();
    const op = ++opRef.current;
    dispatch({ type: 'START', conversation: conv, kind });
    let data;
    try {
      data = await callFn('call-start', { conversation_id: conv.id, kind });
      if (!callsEnabled) setCallsEnabled(true);
    } catch (err) {
      if (op === opRef.current) dispatch({ type: 'RESET' });
      handleApiError(err, tr('Nie udało się rozpocząć połączenia. Spróbuj ponownie.'));
      return;
    }
    if (op !== opRef.current) {
      if (data?.call?.id) callFn('call-leave', { call_id: data.call.id }).catch(() => {});
      return;
    }
    // Serwer mógł dołączyć mnie do trwającej rozmowy — wtedy JOINED przejdzie od razu w „active”.
    dispatch({ type: 'CALL_SET', call: data.call });
    try {
      await connectWith(op, data, { video: kind === 'video' });
    } catch (err) {
      if (data?.call?.id) callFn('call-leave', { call_id: data.call.id }).catch(() => {});
      if (op === opRef.current) { dispatch({ type: 'RESET' }); await roomRef.current.disconnect(); }
      toast.error(err, { fallback: tr('Nie udało się połączyć z rozmową. Sprawdź internet i spróbuj ponownie.') });
    }
  }, [callsEnabled, connectWith, handleApiError, setCallsEnabled]);

  const joinById = useCallback(async (callId, kind, op) => {
    let data;
    try {
      data = await callFn('call-join', { call_id: callId });
    } catch (err) {
      if (op === opRef.current) dispatch({ type: 'RESET' });
      if (isCallGoneError(err)) {
        dropActive(callId);
        loadActive();
        toast.info(tr('To połączenie już się zakończyło'));
        return;
      }
      handleApiError(err, tr('Nie udało się dołączyć do rozmowy. Mogła się już zakończyć.'));
      return;
    }
    if (op !== opRef.current) { callFn('call-leave', { call_id: callId }).catch(() => {}); return; }
    try {
      await connectWith(op, data, { video: kind === 'video' });
    } catch (err) {
      callFn('call-leave', { call_id: callId }).catch(() => {});
      if (op === opRef.current) { dispatch({ type: 'RESET' }); await roomRef.current.disconnect(); }
      toast.error(err, { fallback: tr('Nie udało się połączyć z rozmową. Sprawdź internet i spróbuj ponownie.') });
    }
  }, [connectWith, handleApiError, dropActive, loadActive]);

  const acceptCall = useCallback(async (kind) => {
    const cur = stateRef.current;
    if (cur.phase !== 'incoming') return;
    unlockAudio();
    const callId = cur.incoming.call.id;
    const op = ++opRef.current;
    dispatch({ type: 'ACCEPT', kind });
    await joinById(callId, kind || cur.incoming.call.kind, op);
  }, [joinById]);

  const declineCall = useCallback(async () => {
    const cur = stateRef.current;
    if (cur.phase !== 'incoming') return;
    const callId = cur.incoming.call.id;
    dismissedRef.current.add(callId);
    dispatch({ type: 'DECLINE' });
    try { await callFn('call-decline', { call_id: callId }); } catch { /* serwer i tak oznaczy po czasie */ }
  }, []);

  // Dołącz do trwającej rozmowy (baner, wiadomość „Dołącz”).
  const joinCall = useCallback(async (callOrId, conversation = null, kind = 'audio') => {
    const call = typeof callOrId === 'object' ? callOrId : { id: callOrId };
    if (!call?.id) return;
    const cur = stateRef.current;
    if (inCall(cur)) {
      if (cur.call?.id === call.id) dispatch({ type: 'RESTORE' });
      else toast.info(tr('Najpierw zakończ bieżącą rozmowę.'));
      return;
    }
    if (cur.phase === 'incoming') {
      if (cur.incoming.call.id === call.id) return acceptCall(kind);
      dispatch({ type: 'RING_STOP' });
    }
    unlockAudio();
    let conv = normConversation(conversation);
    if (!conv && call.conversation_id) conv = { id: call.conversation_id, type: null, name: tr('Rozmowa'), avatar: null };
    const op = ++opRef.current;
    dispatch({ type: 'JOIN', call, conversation: conv, kind });
    if (conv && !conversation && call.conversation_id) {
      conversationInfo(call.conversation_id, meRef.current).then((info) => {
        if (info && op === opRef.current) dispatch({ type: 'CONVERSATION_SET', conversation: info });
      }).catch(() => {});
    }
    await joinById(call.id, kind, op);
  }, [acceptCall, joinById]);

  // Zakończ / anuluj (dzwoniący, zanim ktoś odebrał → call-cancel).
  const leaveCall = useCallback(async () => {
    const cur = stateRef.current;
    if (!inCall(cur)) return;
    const id = cur.call?.id;
    const cancel = cur.outgoing && (cur.phase === 'outgoing' || cur.phase === 'joining') && (roomRef.current.snapshot?.remoteCount || 0) === 0;
    await finish();
    if (id) callFn(cancel ? 'call-cancel' : 'call-leave', { call_id: id }).catch(() => {});
  }, [finish]);

  // Oddzwoń z wiadomości „Nieodebrane połączenie”.
  const callBack = useCallback(async (conversationId, kind = 'audio') => {
    if (!conversationId) return;
    const info = await conversationInfo(conversationId, meRef.current).catch(() => null);
    await startCall(info || { id: conversationId }, kind);
  }, [startCall]);

  // ── Goście z linku ─────────────────────────────────────────────────────────
  const decideGuest = useCallback(async (requestId, admit) => {
    const row = Object.values(guestRequests).find((r) => r.id === requestId) || null;
    setGuestRequests((prev) => { const next = { ...prev }; delete next[requestId]; return next; });
    try {
      await callFn(admit ? 'call-guest-admit' : 'call-guest-deny', { request_id: requestId });
      if (admit && row?.guest_name) announce(tr('Wpuszczono: {name}', { name: row.guest_name }));
    } catch (err) {
      const closed = err?.code === 'REQUEST_CLOSED' || err?.status === 404;
      if (!closed && row) setGuestRequests((prev) => applyGuestRequest(prev, row));
      if (closed) toast.info(tr('Ta osoba już nie czeka na wejście.'));
      else toast.error(err, { fallback: admit ? tr('Nie udało się wpuścić gościa.') : tr('Nie udało się odrzucić prośby.') });
    }
  }, [guestRequests, announce]);
  const admitGuest = useCallback((requestId) => decideGuest(requestId, true), [decideGuest]);
  const denyGuest = useCallback((requestId) => decideGuest(requestId, false), [decideGuest]);
  const openGuestInvite = useCallback((conversation) => {
    const conv = normConversation(conversation);
    if (conv?.id) setGuestInvite(conv);
  }, []);
  const closeGuestInvite = useCallback(() => setGuestInvite(null), []);
  const lobby = useMemo(() => (lobbyConversationId ? lobbyQueue(guestRequests, lobbyConversationId) : []), [guestRequests, lobbyConversationId]);

  const minimize = useCallback(() => dispatch({ type: 'MINIMIZE' }), []);
  const restore = useCallback(() => dispatch({ type: 'RESTORE' }), []);
  const openChat = useCallback(() => {
    const id = stateRef.current.conversation?.id;
    if (!id) return;
    dispatch({ type: 'MINIMIZE' });
    navigate(`/komunikator?conversation=${encodeURIComponent(id)}`);
  }, [navigate]);

  const activeCallFor = useCallback((conversationId) => (conversationId ? activeCalls[String(conversationId)] || null : null), [activeCalls]);
  const isCallLive = useCallback((callId) => !!callId && Object.values(activeCalls).some((c) => c.id === callId), [activeCalls]);

  const value = useMemo(() => ({
    me: userEmail,
    state,
    callsEnabled,
    activeCalls,
    activeCallFor,
    isCallLive,
    startedAt,
    startCall,
    acceptCall,
    declineCall,
    joinCall,
    leaveCall,
    callBack,
    minimize,
    restore,
    openChat,
    lobby,
    admitGuest,
    denyGuest,
    guestInvite,
    openGuestInvite,
    closeGuestInvite,
  }), [userEmail, state, callsEnabled, activeCalls, activeCallFor, isCallLive, startedAt, startCall, acceptCall, declineCall, joinCall, leaveCall, callBack, minimize, restore, openChat, lobby, admitGuest, denyGuest, guestInvite, openGuestInvite, closeGuestInvite]);

  return (
    <CallsContext.Provider value={value}>
      <CallRoomContext.Provider value={room}>
        {children}
        <CallLayer />
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>
      </CallRoomContext.Provider>
    </CallsContext.Provider>
  );
}

export default CallProvider;
