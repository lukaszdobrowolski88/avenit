import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Share,
  StatusBar,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { goBack } from "../../../src/lib/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { isSameDay } from "date-fns";
import { ArrowDown, Ban, X } from "lucide-react-native";
import {
  useMessages,
  useOlderMessages,
  useMessagesByIds,
  useSendMessage,
  useEditMessage,
  useDeleteMessage,
  useConversationDetails,
  useMembersByEmails,
  useSetMute,
  useReactions,
  useToggleReaction,
  usePinnedMessages,
  useTogglePin,
  useForwardMessage,
  useReadReceipts,
  markConversationRead,
  markMessagesAsRead,
  markReadLocally,
  clearUnreadLocally,
  memberDisplayName,
  memberPhotoUrl,
  canEditMessage,
  usePollVotes,
  useTogglePollVote,
  usePrayerResponses,
  useTogglePrayerResponse,
  extractMentions,
  canPostIn,
  sameEmail,
  pollOf,
  messagesKey,
  trimThreadCache,
  LATEST_PAGE,
  type MessageAttachment,
  type MessageRow,
  type ReadReceiptRow,
  type PollMetadata,
  type EventMetadata,
  type MuteChoice,
} from "../../../src/features/messenger/api";
import { usePresence } from "../../../src/lib/presence";
import { preloadSendSound, setActiveConversation } from "../../../src/lib/sounds";
import {
  pickDocument,
  pickImageFromLibrary,
  takePhoto,
  uploadAttachment,
  uploadDocument,
  uploadVoiceMessage,
} from "../../../src/features/messenger/attachments";
import { useRealtimeMessages } from "../../../src/features/messenger/hooks/useRealtimeMessages";
import { useTypingStatus, typingLabel } from "../../../src/features/messenger/hooks/useTypingStatus";
import {
  firstUnreadMessageId,
  isMutedNow,
  normEmail,
  readSince,
  receiptSummary,
  unreadIdsToMark,
} from "../../../src/features/messenger/logic";
import { MessageBubble, type BubbleTranslation } from "../../../src/features/messenger/components/MessageBubble";
import { ComposerBar, type MentionCandidate } from "../../../src/features/messenger/components/ComposerBar";
import { PollComposerModal } from "../../../src/features/messenger/components/PollComposerModal";
import { EventShareModal } from "../../../src/features/messenger/components/EventShareModal";
import { ConversationHeader } from "../../../src/features/messenger/components/ConversationHeader";
import { DateSeparator } from "../../../src/features/messenger/components/DateSeparator";
import { MessageActionsSheet } from "../../../src/features/messenger/components/MessageActionsSheet";
import { ForwardMessageModal } from "../../../src/features/messenger/components/ForwardMessageModal";
import { SearchModal } from "../../../src/features/messenger/components/SearchModal";
import { PinnedPanel } from "../../../src/features/messenger/components/PinnedPanel";
import { MediaGalleryModal } from "../../../src/features/messenger/components/MediaGalleryModal";
import { ConversationInfoModal } from "../../../src/features/messenger/components/ConversationInfoModal";
import { MuteSheet } from "../../../src/features/messenger/components/MuteSheet";
import { ReadByModal } from "../../../src/features/messenger/components/ReadByModal";
import { ReportModal } from "../../../src/features/messenger/components/ReportModal";
import { AttachmentImage } from "../../../src/features/messenger/components/AttachmentImage";
import { loadDraft, saveDraft } from "../../../src/features/messenger/drafts";
import {
  chatErrorTitle,
  translateMessage,
  useMyBlocks,
  useReportMessage,
  useToggleBlock,
} from "../../../src/features/messenger/plus";
import { useAuthSession } from "../../../src/lib/auth";
import { usePermissions } from "../../../src/lib/permissions";
import { friendlyError, showError } from "../../../src/lib/errors";
import { toast } from "../../../src/lib/toast";
import { useLang } from "../../../src/i18n";

// Krótki cytat wiadomości do potwierdzeń („Usunąć wiadomość „…”?”).
const excerpt = (text: string | null | undefined, max = 60) => {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type FeedItem =
  | { kind: "msg"; msg: MessageRow; showSender: boolean; lastOfBurst: boolean }
  | { kind: "date"; key: string; date: string }
  | { kind: "unread"; key: string };

type TranslationState = BubbleTranslation & { hidden?: boolean };

// Lista wątku jest ODWRÓCONA (najnowsze na dole, offset 0 = dół): rozmowa otwiera się na końcu
// bez przewijania, starsze wiadomości doczytują się przy przewijaniu w górę (K11).
export default function ConversationScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const { user } = useAuthSession();
  const myEmail = user?.email ?? null;
  const qc = useQueryClient();
  const router = useRouter();
  const cid = String(conversationId ?? "");
  const perms = usePermissions();
  const { lang } = useLang();
  // Co rola pozwala zapisać — jak web (KomunikatorModule.perms). Serwer i tak pilnuje zakresu.
  const canManageOwn = perms.can("res:conversation_participants:update"); // przeczytane, wyciszenie
  const canEditOwn = perms.can("res:messages:update"); // edycja i usuwanie własnych wiadomości

  // Composer siedzi nad tabbarem — padding równy jego wysokości z (app)/_layout.tsx.
  // Przy otwartej klawiaturze pasek zakładek się chowa (FloatingTabBar), więc odstęp znika —
  // inaczej pole pisania wisiało wysoko nad klawiaturą.
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvt, () => setKeyboardOpen(true));
    const hide = Keyboard.addListener(hideEvt, () => setKeyboardOpen(false));
    preloadSendSound();
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  // Otwarta rozmowa — powiadomienia z niej bez banera (tylko dźwięk przyjścia).
  useEffect(() => {
    setActiveConversation(cid);
    return () => setActiveConversation(null);
  }, [cid]);
  // Po wyjściu z rozmowy w pamięci telefonu zostaje tylko końcówka wątku.
  useEffect(() => () => trimThreadCache(qc, cid), [qc, cid]);
  const composerBottomPad = keyboardOpen ? 6 : Platform.OS === "ios" ? 88 : 70;

  const messagesQuery = useMessages(cid);
  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);
  const threadReady = messagesQuery.data !== undefined;
  const older = useOlderMessages(cid);
  const canLoadMore = !older.exhausted && messages.length >= LATEST_PAGE;
  const detailsQuery = useConversationDetails(cid, myEmail);
  const sendMutation = useSendMessage(cid, myEmail);
  const editMutation = useEditMessage(cid);
  const deleteMutation = useDeleteMessage(cid);
  const muteMutation = useSetMute(myEmail);
  const reactionsQuery = useReactions(cid, myEmail, threadReady);
  const reactionMutation = useToggleReaction(cid, myEmail);
  const pinnedQuery = usePinnedMessages(cid);
  const pinMutation = useTogglePin(cid, myEmail);
  const forwardMutation = useForwardMessage(myEmail);
  const readReceiptsQuery = useReadReceipts(cid, threadReady);
  const pollVotesQuery = usePollVotes(cid, myEmail, threadReady);
  const prayerQuery = usePrayerResponses(cid, myEmail, threadReady);
  const pollVoteMutation = useTogglePollVote(cid, myEmail);
  const prayerMutation = useTogglePrayerResponse(cid, myEmail);
  const blocksQuery = useMyBlocks(myEmail);
  const blockMutation = useToggleBlock(myEmail);
  const reportMutation = useReportMessage(myEmail);
  useRealtimeMessages(cid);

  const details = detailsQuery.data;
  const blockedSet = useMemo(() => new Set(blocksQuery.data ?? []), [blocksQuery.data]);
  const isBlocked = useCallback((email: string | null | undefined) => !!email && blockedSet.has(normEmail(email)), [blockedSet]);

  const loadedById = useMemo(() => {
    const map = new Map<string, MessageRow>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

  // Cytaty i przypięte spoza wczytanej paczki — dociągnięte po id (K11).
  const missingIds = useMemo(() => {
    const out = new Set<string>();
    for (const m of messages) if (m.reply_to_id && !loadedById.has(m.reply_to_id)) out.add(m.reply_to_id);
    for (const p of pinnedQuery.data ?? []) if (!loadedById.has(p.message_id)) out.add(p.message_id);
    return Array.from(out);
  }, [messages, loadedById, pinnedQuery.data]);
  const extraQuery = useMessagesByIds(cid, missingIds);
  const messageById = useMemo(() => {
    const map = new Map(loadedById);
    for (const [id, m] of Object.entries(extraQuery.data ?? {})) if (!map.has(id)) map.set(id, m as MessageRow);
    return map;
  }, [loadedById, extraQuery.data]);

  const memberEmails = useMemo(() => {
    const set = new Set<string>();
    for (const m of messages) set.add(m.sender_email);
    for (const e of details?.participant_emails ?? []) set.add(e);
    return Array.from(set);
  }, [messages, details?.participant_emails]);
  const membersQuery = useMembersByEmails(memberEmails);
  const members = membersQuery.data ?? {};

  // Presence dla wszystkich uczestników (pomijając mnie).
  const presenceEmails = useMemo(() => memberEmails.filter((e) => !sameEmail(e, myEmail)), [memberEmails, myEmail]);
  const { getStatus } = usePresence(presenceEmails);

  // W rozmowie 1:1 pokaż status drugiej osoby w nagłówku.
  const peerEmail = useMemo(() => {
    if (details?.type !== "direct") return null;
    return details.participant_emails.find((e: string) => !sameEmail(e, myEmail)) ?? null;
  }, [details, myEmail]);
  const peerStatus = peerEmail ? getStatus(peerEmail) : undefined;
  const peerBlocked = isBlocked(peerEmail);

  const [text, setText] = useState("");
  const [pendingAttachment, setPendingAttachment] = useState<MessageAttachment | null>(null);
  const [pollOpen, setPollOpen] = useState(false);
  const [eventShareOpen, setEventShareOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [replyTo, setReplyTo] = useState<MessageRow | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<MessageRow | null>(null);
  const [forwardTarget, setForwardTarget] = useState<MessageRow | null>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [prayerMode, setPrayerMode] = useState(false);
  const [infoVisible, setInfoVisible] = useState(false);
  const [muteOpen, setMuteOpen] = useState(false);
  const [readByTarget, setReadByTarget] = useState<MessageRow | null>(null);
  const [reportTarget, setReportTarget] = useState<MessageRow | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [translations, setTranslations] = useState<Record<string, TranslationState>>({});
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [showJumpDown, setShowJumpDown] = useState(false);
  // Zmiana wymusza próbę przewinięcia do pendingScroll (gdy lista przeliczyła się wcześniej).
  const [scrollTick, setScrollTick] = useState(0);
  // Separator „Nowe wiadomości” (K11): pierwsza nieprzeczytana w chwili wejścia do rozmowy.
  const [unreadAnchor, setUnreadAnchor] = useState<string | null>(null);
  const [snapshotDone, setSnapshotDone] = useState(false);
  const listRef = useRef<FlatList<FeedItem>>(null);
  const cidRef = useRef(cid);
  cidRef.current = cid;
  const editingRef = useRef<string | null>(null);
  editingRef.current = editingId;
  // Wiadomości już oznaczone przeze mnie jako przeczytane (bez powtórnych zapisów — jak web).
  const markedRef = useRef<Set<string>>(new Set());
  const readFloor = useRef(0);
  const scrollRetries = useRef(0);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingScroll = useRef<{ id: string; viewPosition: number; tries: number } | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textRef = useRef("");
  textRef.current = text;

  // Inna rozmowa w tym samym ekranie (powiadomienie, link) — szkic, załącznik i odpowiedź
  // nie mogą „przejść” do innej rozmowy. Szkic tej rozmowy wraca z pamięci telefonu (K11).
  useEffect(() => {
    setText("");
    setPendingAttachment(null);
    setReplyTo(null);
    setEditingId(null);
    setActionTarget(null);
    setForwardTarget(null);
    setPrayerMode(false);
    setTranslations({});
    setRevealed(new Set());
    setUnreadAnchor(null);
    setSnapshotDone(false);
    setHighlightId(null);
    markedRef.current = new Set();
    readFloor.current = 0;
    pendingScroll.current = null;
    let alive = true;
    loadDraft(myEmail, cid).then((d) => {
      if (alive && d && cidRef.current === cid && !editingRef.current && !textRef.current) setText(d);
    });
    return () => {
      alive = false;
      // Wyjście z rozmowy — szkic zapisany od razu (bez czekania na opóźnienie).
      if (draftTimer.current) clearTimeout(draftTimer.current);
      if (!editingRef.current) saveDraft(myEmail, cid, textRef.current);
    };
  }, [cid, myEmail]);

  const scheduleDraft = (t: string) => {
    if (editingId) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => saveDraft(myEmail, cid, t), 500);
  };
  const clearDraft = () => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    saveDraft(myEmail, cid, "");
  };

  const pinnedIds = useMemo(() => {
    const set = new Set<string>();
    for (const p of pinnedQuery.data ?? []) set.add(p.message_id);
    return set;
  }, [pinnedQuery.data]);

  // Złóż feed (chronologicznie): separatory dni, „Nowe wiadomości”, grupowanie po nadawcy.
  const feed = useMemo<FeedItem[]>(() => {
    const out: FeedItem[] = [];
    let prevDate: Date | null = null;
    let prevSender: string | null = null;
    let prevTime = 0;
    for (const m of messages) {
      const d = new Date(m.created_at);
      if (!prevDate || !isSameDay(prevDate, d)) {
        out.push({ kind: "date", key: `d-${m.id}`, date: m.created_at });
        prevSender = null;
      }
      if (unreadAnchor && m.id === unreadAnchor) {
        out.push({ kind: "unread", key: `u-${m.id}` });
        prevSender = null;
      }
      // showSender, gdy zmienia się sender lub upłynęło >5 min od poprzedniej.
      const isNewBurst = prevSender !== m.sender_email || d.getTime() - prevTime > 5 * 60 * 1000;
      const prevItem = out[out.length - 1];
      if (isNewBurst && prevItem?.kind === "msg") prevItem.lastOfBurst = true;
      out.push({ kind: "msg", msg: m, showSender: isNewBurst, lastOfBurst: false });
      prevDate = d;
      prevSender = m.sender_email;
      prevTime = d.getTime();
    }
    // Ostatnia w wątku i ostatnia przed separatorem też zamyka serię.
    for (let i = 0; i < out.length; i++) {
      const it = out[i];
      if (it.kind !== "msg") continue;
      const next = out[i + 1];
      if (!next || next.kind !== "msg") it.lastOfBurst = true;
    }
    return out;
  }, [messages, unreadAnchor]);
  // Dane listy odwróconej: od najnowszych.
  const data = useMemo(() => [...feed].reverse(), [feed]);

  const indexOfMessage = useCallback(
    (id: string) => data.findIndex((it) => it.kind === "msg" && it.msg.id === id),
    [data],
  );

  const flash = (id: string) => {
    setHighlightId(id);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightId(null), 2200);
  };

  // Przewinięcie do elementu po przeliczeniu listy (skok, pierwsza nieprzeczytana).
  useEffect(() => {
    const p = pendingScroll.current;
    if (!p) return;
    const idx = p.id.startsWith("u-") ? data.findIndex((it) => it.kind === "unread" && it.key === p.id) : indexOfMessage(p.id);
    if (idx < 0) return;
    pendingScroll.current = null;
    const t = setTimeout(() => {
      listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: p.viewPosition });
    }, 60);
    return () => clearTimeout(t);
  }, [data, indexOfMessage, scrollTick]);

  // Doczytuj starsze, aż wiadomość (o danym id lub z danej chwili) będzie wczytana.
  const { loadOlder, status: olderStatus } = older;
  const loadUntil = useCallback(
    async (found: () => boolean, maxRounds = 25): Promise<boolean> => {
      let rounds = 0;
      while (!found() && rounds < maxRounds) {
        const st = olderStatus();
        if (st.exhausted) break;
        if (st.busy) {
          await sleep(250);
          rounds += 0.25;
          continue;
        }
        const got = await loadOlder(200).catch(() => [] as MessageRow[]);
        rounds += 1;
        if (!got.length && olderStatus().exhausted) break;
        // Pusta paczka bez końca historii (np. błąd sieci) — nie kręć się w kółko.
        if (!got.length) break;
      }
      return found();
    },
    [loadOlder, olderStatus],
  );

  // K11: skok do wiadomości z wyszukiwarki, cytatu albo przypiętych — doczytuje, aż się znajdzie.
  const jumpToMessage = useCallback(
    async (msg: { id: string }) => {
      const inThread = () => !!(qc.getQueryData<MessageRow[]>(messagesKey(cid)) ?? []).some((m: MessageRow) => m.id === msg.id);
      if (!inThread()) {
        toast.info("Szukam wiadomości…");
        const ok = await loadUntil(inThread);
        if (!ok) {
          toast.info("Nie udało się znaleźć tej wiadomości", "Mogła zostać usunięta.");
          return;
        }
      }
      const idx = indexOfMessage(msg.id);
      flash(msg.id);
      if (idx >= 0) listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
      else {
        pendingScroll.current = { id: msg.id, viewPosition: 0.5, tries: 0 };
        setScrollTick((x) => x + 1);
      }
    },
    [qc, cid, loadUntil, indexOfMessage],
  );

  // K11: pierwsza nieprzeczytana — moment wejścia (świeże dane rozmowy i wątku), zanim zapiszemy
  // „przeczytane”. Gdy nieprzeczytanych jest więcej niż w paczce, doczytujemy do nich.
  useEffect(() => {
    if (snapshotDone || !cid || !myEmail) return;
    const detailsFresh = detailsQuery.isFetchedAfterMount || detailsQuery.isError;
    if (!detailsFresh || !messagesQuery.isFetchedAfterMount) return;
    let cancelled = false;
    (async () => {
      const since = details?.is_participant
        ? readSince({ last_read_at: details.my_last_read_at, joined_at: details.my_joined_at })
        : null;
      if (since) {
        const sinceTs = new Date(since).getTime();
        const coversSince = () => {
          const list = qc.getQueryData<MessageRow[]>(messagesKey(cid)) ?? [];
          return list.length < LATEST_PAGE || new Date(list[0]?.created_at ?? 0).getTime() <= sinceTs;
        };
        if (!coversSince()) await loadUntil(coversSince, 5);
      }
      if (cancelled) return;
      const list = qc.getQueryData<MessageRow[]>(messagesKey(cid)) ?? [];
      const first = since ? firstUnreadMessageId(list, myEmail, since) : null;
      // Potwierdzenia odczytu tylko dla wiadomości nowszych niż moje „przeczytane” z chwili wejścia
      // — doczytana starsza historia nie nadpisuje godzin odczytu sprzed lat.
      readFloor.current = since ? new Date(since).getTime() || 0 : 0;
      setUnreadAnchor(first);
      setSnapshotDone(true);
      // Otwórz przy pierwszej nieprzeczytanej, gdy nie mieści się na dole ekranu.
      if (first) {
        const pos = list.findIndex((m: MessageRow) => m.id === first);
        if (pos >= 0 && list.length - pos > 6) {
          pendingScroll.current = { id: `u-${first}`, viewPosition: 0.9, tries: 0 };
          setScrollTick((x) => x + 1);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    snapshotDone,
    cid,
    myEmail,
    detailsQuery.isFetchedAfterMount,
    detailsQuery.isError,
    messagesQuery.isFetchedAfterMount,
    details,
    qc,
    loadUntil,
  ]);

  // Wejście w rozmowę i każda nowa wiadomość = przeczytane (jak web). Znacznik nie wcześniejszy niż
  // ostatnia wiadomość (spóźniony zegar telefonu), licznik na liście znika od razu.
  const newestCreatedAt = messages[messages.length - 1]?.created_at ?? null;
  useEffect(() => {
    // Najpierw zapamiętany separator „Nowe wiadomości”, potem zapis „przeczytane”.
    if (!snapshotDone) return;
    if (cid && myEmail && details?.is_participant && readReceiptsQuery.isFetched) {
      clearUnreadLocally(qc, myEmail, cid);
      // „Przeczytane” — tylko gdy rola może zmieniać swój wiersz uczestnika (inaczej 403).
      if (canManageOwn) {
        markConversationRead(cid, myEmail, newestCreatedAt)
          .then((at) => {
            if (at) markReadLocally(qc, myEmail, cid, at);
          })
          .catch(() => undefined);
      }
      // Potwierdzenia przeczytania — tylko cudze, jeszcze nieoznaczone wiadomości.
      const floor = readFloor.current;
      const ids = unreadIdsToMark(
        floor ? messages.filter((m: MessageRow) => new Date(m.created_at).getTime() > floor) : messages,
        myEmail,
        markedRef.current,
        (readReceiptsQuery.data ?? {}) as Record<string, ReadReceiptRow[]>,
      );
      if (ids.length > 0) {
        ids.forEach((id) => markedRef.current.add(id));
        markMessagesAsRead(ids, myEmail).catch(() => {
          ids.forEach((id) => markedRef.current.delete(id));
        });
      }
    }
  }, [
    snapshotDone,
    cid,
    myEmail,
    messages.length,
    newestCreatedAt,
    details?.is_participant,
    canManageOwn,
    readReceiptsQuery.isFetched,
  ]);

  const scrollToBottom = () => listRef.current?.scrollToOffset({ offset: 0, animated: true });

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const far = y > 600;
    if (far !== showJumpDown) setShowJumpDown(far);
  };

  const handleEndReached = () => {
    if (!canLoadMore || older.loadingOlder) return;
    older.loadOlder().catch((e) => toast.error(e, "Nie udało się wczytać starszych wiadomości"));
  };

  const handlePickImage = async () => {
    if (uploading) return;
    setUploading(true);
    try {
      const asset = await pickImageFromLibrary();
      if (!asset) return;
      const att = await uploadAttachment(cid, asset);
      setPendingAttachment(att);
    } catch (e) {
      Alert.alert("Nie udało się dodać zdjęcia", friendlyError(e, "Spróbuj ponownie."));
    } finally {
      setUploading(false);
    }
  };

  const handlePickFile = async () => {
    if (uploading) return;
    setUploading(true);
    try {
      const asset = await pickDocument();
      if (!asset) return;
      setPendingAttachment(await uploadDocument(cid, asset));
    } catch (e) {
      Alert.alert("Nie udało się dodać pliku", friendlyError(e, "Spróbuj ponownie."));
    } finally {
      setUploading(false);
    }
  };

  const handleSendVoice = async (uri: string, mime: string, durationMs: number) => {
    try {
      const att = await uploadVoiceMessage(cid, uri, mime, durationMs);
      await sendMutation.mutateAsync({
        content: "",
        attachments: [att],
        replyToId: replyTo?.id ?? null,
      });
      setReplyTo(null);
      scrollToBottom();
    } catch (e) {
      Alert.alert(
        chatErrorTitle(e, "Nie udało się wysłać"),
        friendlyError(e, "Nie udało się wysłać wiadomości głosowej. Spróbuj ponownie."),
      );
      throw e;
    }
  };

  const handleTakePhoto = async () => {
    if (uploading) return;
    setUploading(true);
    try {
      const asset = await takePhoto();
      if (!asset) return;
      const att = await uploadAttachment(cid, asset);
      setPendingAttachment(att);
    } catch (e) {
      Alert.alert("Nie udało się dodać zdjęcia", friendlyError(e, "Spróbuj ponownie."));
    } finally {
      setUploading(false);
    }
  };

  const resetComposer = () => {
    setText("");
    setPendingAttachment(null);
    setReplyTo(null);
    setEditingId(null);
  };

  // Prawo pisania: uczestnik rozmowy, a w kanale „tylko administratorzy” — administrator.
  // Do czasu wczytania rozmowy pole jest schowane (bez mignięcia u nie-adminów).
  const canPost = !!details && details.is_participant && canPostIn(details);
  const readOnlyText = !details
    ? detailsQuery.isError
      ? friendlyError(detailsQuery.error, "Nie udało się wczytać rozmowy.")
      : detailsQuery.isSuccess
        ? "Tej rozmowy już nie ma albo nie masz do niej dostępu."
        : ""
    : !details.is_participant
      ? "Nie jesteś uczestnikiem tej rozmowy."
      : "W tym kanale piszą tylko administratorzy.";
  const isConvAdmin = details?.my_role === "admin";
  // K5: „@wszyscy” — jak serwer (komunikatorPlus.canMentionAll): administrator rozmowy (w kanałach
  // służb i grup domowych lider ma tę rolę z synchronizacji), w kanałach także admin aplikacji.
  const canMentionAll =
    !!details && details.type !== "direct" && (isConvAdmin || (details.type === "ministry" && perms.isAdmin));
  const mentionCandidates = useMemo<MentionCandidate[]>(
    () =>
      details && details.type !== "direct"
        ? ((details.participant_emails ?? []) as string[])
            .filter((e: string) => !sameEmail(e, myEmail))
            .map((e: string) => ({ email: e, name: memberDisplayName(members, e), photoUrl: memberPhotoUrl(members, e) }))
            .sort((a: MentionCandidate, b: MentionCandidate) => a.name.localeCompare(b.name, "pl"))
        : [],
    [details, members, myEmail],
  );
  // „pisze…” — jak web: zapis tylko z prawem do typing_status i tylko gdy mogę pisać.
  const { typingEmails, startTyping, stopTyping } = useTypingStatus(
    cid,
    myEmail,
    canPost && perms.can("res:typing_status:create"),
  );
  const typingText = typingLabel(typingEmails.map((e) => memberDisplayName(members, e)));
  const handleChangeText = (t: string) => {
    setText(t);
    scheduleDraft(t);
    if (t.trim() && !editingId) startTyping();
  };
  // Przypinanie wiadomości — jak web: administrator rozmowy z prawem do przypięć.
  const canPin = isConvAdmin && perms.can("res:pinned_messages:create");
  const sending = sendMutation.isPending || editMutation.isPending;

  // Ankieta: okno zamyka się dopiero po wysłaniu (przy błędzie treść zostaje).
  const handleCreatePoll = async (question: string, metadata: PollMetadata & { poll: PollMetadata }) => {
    if (sendMutation.isPending) return false;
    try {
      await sendMutation.mutateAsync({ content: question, messageType: "poll", metadata });
      setPollOpen(false);
      scrollToBottom();
      return true;
    } catch (e) {
      Alert.alert(chatErrorTitle(e, "Nie udało się utworzyć ankiety"), friendlyError(e, "Spróbuj ponownie."));
      return false;
    }
  };

  const handleShareEvent = async (title: string, metadata: EventMetadata) => {
    if (sendMutation.isPending) return;
    try {
      await sendMutation.mutateAsync({ content: title, messageType: "event", metadata });
      setEventShareOpen(false);
      scrollToBottom();
    } catch (e) {
      Alert.alert(chatErrorTitle(e, "Nie udało się udostępnić wydarzenia"), friendlyError(e, "Spróbuj ponownie."));
    }
  };

  // Wysyłka: tekst i załącznik zostają w polu do potwierdzenia przez serwer — przy błędzie
  // (np. „W tym kanale piszą tylko administratorzy”, blokada, brak sieci) nic nie ginie.
  const handleSend = async () => {
    if (sending) return;
    if (editingId) {
      const t = text.trim();
      if (!t) return;
      try {
        await editMutation.mutateAsync({ id: editingId, content: t });
        resetComposer();
        // Po edycji wraca szkic, który był w polu przed nią.
        loadDraft(myEmail, cid).then((d) => {
          if (cidRef.current === cid && !editingRef.current && !textRef.current) setText(d);
        });
      } catch (e) {
        Alert.alert(
          "Nie udało się zapisać zmian",
          friendlyError(e, "Nie udało się zapisać zmian w wiadomości. Spróbuj ponownie."),
        );
      }
      return;
    }

    const t = text.trim();
    if (prayerMode) {
      // Prośba o modlitwę (jak web): treść pola staje się tytułem prośby.
      if (!t) return;
      try {
        await sendMutation.mutateAsync({ content: t, messageType: "prayer", metadata: { title: t } });
        void stopTyping();
        setPrayerMode(false);
        resetComposer();
        clearDraft();
        scrollToBottom();
      } catch (e) {
        Alert.alert(
          chatErrorTitle(e, "Nie udało się wysłać prośby"),
          friendlyError(e, "Nie udało się wysłać prośby o modlitwę. Spróbuj ponownie."),
        );
      }
      return;
    }
    if (!t && !pendingAttachment) return;
    try {
      await sendMutation.mutateAsync({
        content: t,
        attachments: pendingAttachment ? [pendingAttachment] : undefined,
        replyToId: replyTo?.id ?? null,
        mentions: extractMentions(t, members, { allowAll: canMentionAll, exclude: myEmail }),
      });
      void stopTyping();
      resetComposer();
      clearDraft();
      scrollToBottom();
    } catch (e) {
      Alert.alert(
        chatErrorTitle(e, "Nie udało się wysłać"),
        friendlyError(e, "Nie udało się wysłać wiadomości. Spróbuj ponownie."),
      );
    }
  };

  const handleCopyMessage = async (msg: MessageRow) => {
    if (!msg.content) {
      Alert.alert("Brak tekstu", "Ta wiadomość nie zawiera tekstu do udostępnienia.");
      return;
    }
    try {
      await Share.share({ message: msg.content });
    } catch {
      // user closed share sheet
    }
  };

  const handleTogglePin = (msg: MessageRow) => {
    if (pinMutation.isPending) return;
    pinMutation.mutate(
      { messageId: msg.id, pinned: pinnedIds.has(msg.id) },
      {
        onError: (e) =>
          Alert.alert("Nie udało się", friendlyError(e, "Nie udało się zmienić przypięcia wiadomości. Spróbuj ponownie.")),
      },
    );
  };

  // Przekazanie: każda rozmowa osobno; okno zamyka się, gdy choć jedna wysyłka się udała.
  const handleConfirmForward = async (conversationIds: string[]) => {
    const target = forwardTarget;
    if (!target) return false;
    try {
      const { sent, total } = await forwardMutation.mutateAsync({
        conversationIds,
        content: target.content,
        attachments: Array.isArray(target.attachments) ? target.attachments : [],
        forwardedFrom: target.id,
      });
      setForwardTarget(null);
      if (sent < total) {
        Alert.alert("Przekazano częściowo", `Przekazano do ${sent} z ${total} rozmów. Do pozostałych nie udało się wysłać.`);
      } else {
        toast.success(sent === 1 ? "Wiadomość przekazana" : `Wiadomość przekazana do ${sent} rozmów`);
      }
      return true;
    } catch (e) {
      Alert.alert("Nie udało się przekazać", friendlyError(e, "Spróbuj ponownie."));
      return false;
    }
  };

  const handleDeleteMessage = (msg: MessageRow) => {
    const quote = excerpt(msg.content);
    Alert.alert(
      quote ? `Usunąć wiadomość „${quote}”?` : "Usunąć tę wiadomość?",
      "Zniknie u wszystkich uczestników rozmowy. Tego nie można cofnąć.",
      [
        { text: "Anuluj", style: "cancel" },
        {
          text: "Usuń",
          style: "destructive",
          onPress: () => {
            if (deleteMutation.isPending) return;
            deleteMutation.mutate(msg.id, {
              onSuccess: () => toast.success("Wiadomość usunięta"),
              onError: (e) =>
                Alert.alert("Nie udało się usunąć", friendlyError(e, "Nie udało się usunąć wiadomości. Spróbuj ponownie.")),
            });
          },
        },
      ],
    );
  };

  // K4: menu „Wycisz” (błędy pokazuje hook).
  const handlePickMute = (choice: MuteChoice) => {
    if (!details || muteMutation.isPending) return;
    muteMutation.mutate({ conversationId: cid, choice });
  };

  // K3: tłumaczenie na język aplikacji. Ponowny wybór przełącza „pokaż oryginał / tłumaczenie”.
  const translationLabel = (msg: MessageRow | null): string | null => {
    if (!msg?.content || (msg.message_type && !["text", "prayer"].includes(msg.message_type))) return null;
    const t = translations[msg.id];
    if (!t) return "Przetłumacz";
    if (t.pending) return "Tłumaczę…";
    return t.hidden ? "Pokaż tłumaczenie" : "Pokaż oryginał";
  };
  const handleTranslate = async (msg: MessageRow) => {
    const cur = translations[msg.id];
    if (cur?.pending) return;
    if (cur) {
      setTranslations((p) => ({ ...p, [msg.id]: { ...cur, hidden: !cur.hidden } }));
      return;
    }
    setTranslations((p) => ({ ...p, [msg.id]: { text: "", source: null, pending: true } }));
    try {
      const r = await translateMessage(msg.id, lang);
      setTranslations((p) => ({ ...p, [msg.id]: { text: r.text, source: r.source_lang } }));
    } catch (e) {
      setTranslations((p) => {
        const { [msg.id]: _drop, ...rest } = p;
        return rest;
      });
      showError("Nie udało się przetłumaczyć", e, "Nie udało się przetłumaczyć wiadomości. Spróbuj ponownie.");
    }
  };

  // K10: blokowanie (potwierdzenie z nazwą i skutkiem) i zgłaszanie.
  const handleToggleBlock = (email: string | null | undefined) => {
    if (!email || blockMutation.isPending) return;
    const name = memberDisplayName(members, email);
    const blocked = isBlocked(email);
    Alert.alert(
      blocked ? `Odblokować: ${name}?` : `Zablokować: ${name}?`,
      blocked
        ? "Znów zobaczysz wiadomości tej osoby, a ona będzie mogła pisać do Ciebie prywatnie."
        : "Nie będzie mogła pisać do Ciebie prywatnie, a jej wiadomości w grupach będą zwinięte. Możesz to cofnąć w każdej chwili.",
      [
        { text: "Anuluj", style: "cancel" },
        {
          text: blocked ? "Odblokuj" : "Zablokuj",
          style: blocked ? "default" : "destructive",
          onPress: () =>
            blockMutation.mutate(
              { target: email, blocked },
              {
                onSuccess: () => toast.success(blocked ? `Odblokowano: ${name}` : `Zablokowano: ${name}`),
                onError: (e) => showError(blocked ? "Nie udało się odblokować" : "Nie udało się zablokować", e),
              },
            ),
        },
      ],
    );
  };

  const handleSubmitReport = async (reason: string): Promise<boolean> => {
    const target = reportTarget;
    if (!target || reportMutation.isPending) return false;
    try {
      await reportMutation.mutateAsync({ messageId: target.id, conversationId: cid, reason });
      toast.success("Zgłoszenie wysłane", "Dziękujemy — osoby odpowiedzialne je sprawdzą.");
      return true;
    } catch (e) {
      showError("Nie udało się wysłać zgłoszenia", e, "Spróbuj ponownie.");
      return false;
    }
  };

  // K6: potwierdzenia odczytu własnej wiadomości wobec składu rozmowy.
  const participantEmails = details?.participant_emails ?? [];
  const summaryFor = (m: MessageRow) =>
    receiptSummary((readReceiptsQuery.data?.[m.id] ?? []) as ReadReceiptRow[], m.sender_email, participantEmails);
  const readBySummary = readByTarget ? summaryFor(readByTarget) : null;
  const canSeeReadBy = (m: MessageRow | null) => !!m && !!details && details.type !== "direct" && sameEmail(m.sender_email, myEmail);

  const actionMine = sameEmail(actionTarget?.sender_email, myEmail);

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
        style={{ flex: 1, backgroundColor: "#F6F4EE" }}
      >
        <ConversationHeader
          details={details ?? null}
          members={members}
          myEmail={myEmail}
          onToggleMute={canManageOwn && details?.is_participant ? () => setMuteOpen(true) : undefined}
          muteBusy={muteMutation.isPending}
          onSearch={() => setSearchVisible(true)}
          onOpenGallery={() => setGalleryVisible(true)}
          peerStatus={peerStatus}
          onOpenInfo={details ? () => setInfoVisible(true) : undefined}
        />

        <PinnedPanel
          pinned={pinnedQuery.data ?? []}
          messageById={messageById}
          members={members}
          onJump={(m) => void jumpToMessage(m)}
          onUnpin={canPin ? (m) => handleTogglePin(m) : undefined}
        />

        {messagesQuery.isLoading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color="#2A2312" />
          </View>
        ) : messagesQuery.isError && !messagesQuery.data ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
            <Text style={{ fontSize: 14, color: "#6B6557", fontFamily: "Manrope_500Medium", textAlign: "center", lineHeight: 20 }}>
              {friendlyError(messagesQuery.error, "Nie udało się wczytać wiadomości. Spróbuj ponownie.")}
            </Text>
          </View>
        ) : messages.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 14, color: "#6B6557", fontFamily: "Manrope_500Medium" }}>
              {canPost ? "Brak wiadomości. Napisz pierwszą." : "Brak wiadomości."}
            </Text>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <FlatList
              ref={listRef}
              inverted
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8 }}
              data={data}
              keyExtractor={(it) => (it.kind === "msg" ? it.msg.id : it.key)}
              initialNumToRender={20}
              maxToRenderPerBatch={12}
              windowSize={11}
              keyboardShouldPersistTaps="handled"
              onEndReached={handleEndReached}
              onEndReachedThreshold={0.4}
              onScroll={handleScroll}
              scrollEventThrottle={100}
              onScrollToIndexFailed={(info) => {
                // Element jeszcze niewyrenderowany — przybliżone przewinięcie i ponowna próba (najwyżej 3).
                listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
                if (scrollRetries.current >= 3) {
                  scrollRetries.current = 0;
                  return;
                }
                scrollRetries.current += 1;
                setTimeout(() => {
                  if (info.index < data.length) {
                    listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 });
                  }
                }, 250);
              }}
              onMomentumScrollEnd={() => {
                scrollRetries.current = 0;
              }}
              ListFooterComponent={
                older.loadingOlder ? (
                  <View style={{ paddingVertical: 14 }}>
                    <ActivityIndicator color="#6E685A" />
                  </View>
                ) : !canLoadMore && messages.length >= LATEST_PAGE ? (
                  <Text style={{ textAlign: "center", paddingVertical: 14, fontSize: 12, color: "#6E685A", fontFamily: "Manrope_500Medium" }}>
                    To początek rozmowy
                  </Text>
                ) : null
              }
              renderItem={({ item }) => {
                if (item.kind === "date") return <DateSeparator date={item.date} />;
                if (item.kind === "unread") {
                  return (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 10 }} accessibilityRole="header">
                      <View style={{ flex: 1, height: 1, backgroundColor: "#FFBE0B" }} />
                      <Text style={{ fontSize: 11, color: "#8A6606", fontFamily: "Manrope_700Bold", letterSpacing: 0.4 }}>
                        Nowe wiadomości
                      </Text>
                      <View style={{ flex: 1, height: 1, backgroundColor: "#FFBE0B" }} />
                    </View>
                  );
                }
                const m = item.msg;
                const mine = sameEmail(m.sender_email, myEmail);
                const prayer = prayerQuery.data?.[m.id];
                const summary = mine ? summaryFor(m) : null;
                const tr = translations[m.id];
                const groupLike = !!details && details.type !== "direct";
                let readInfo: { label: string; onPress: () => void } | null = null;
                if (mine && summary && groupLike && item.lastOfBurst) {
                  const open = () => setReadByTarget(m);
                  if (details?.type === "announcement" && isConvAdmin) {
                    readInfo = { label: `Przeczytało ${summary.readCount} z ${summary.total}`, onPress: open };
                  } else if (summary.readCount > 0) {
                    readInfo = {
                      label:
                        summary.total > 0 && summary.readCount >= summary.total
                          ? "Widziane przez wszystkich"
                          : `Widziane przez ${summary.readCount}`,
                      onPress: open,
                    };
                  }
                }
                const hiddenBlocked = !mine && groupLike && isBlocked(m.sender_email) && !revealed.has(m.id);
                return (
                  <MessageBubble
                    message={m}
                    mine={mine}
                    members={members}
                    showSender={item.showSender}
                    replyTo={m.reply_to_id ? messageById.get(m.reply_to_id) ?? null : null}
                    onPressReply={m.reply_to_id ? () => void jumpToMessage({ id: m.reply_to_id! }) : undefined}
                    reactions={reactionsQuery.data?.[m.id]}
                    pinned={pinnedIds.has(m.id)}
                    currentUserEmail={myEmail}
                    deliveryStatus={summary?.status}
                    readInfo={readInfo}
                    pollVotes={pollVotesQuery.data?.[m.id]}
                    onVote={(optionId) => {
                      // Blokada podwójnego głosu (błędy pokazuje hook).
                      if (pollVoteMutation.isPending) return;
                      pollVoteMutation.mutate({
                        messageId: m.id,
                        optionId,
                        multiple: !!pollOf(m.metadata)?.multiple,
                      });
                    }}
                    prayerCount={prayer?.count ?? 0}
                    prayerMine={!!prayer?.mine}
                    onPray={() => {
                      if (prayerMutation.isPending) return;
                      prayerMutation.mutate({ messageId: m.id, responding: !!prayer?.mine });
                    }}
                    translation={tr && !tr.hidden ? tr : null}
                    onHideTranslation={() => setTranslations((p) => (p[m.id] ? { ...p, [m.id]: { ...p[m.id], hidden: true } } : p))}
                    blockedHidden={hiddenBlocked}
                    onReveal={() => setRevealed((prev) => new Set(prev).add(m.id))}
                    onOpenImage={(url) => setImagePreview(url)}
                    highlighted={highlightId === m.id}
                    senderStatus={mine ? undefined : getStatus(m.sender_email)}
                    onLongPress={() => setActionTarget(m)}
                    onToggleReaction={(emoji) => reactionMutation.mutate({ messageId: m.id, emoji })}
                  />
                );
              }}
            />
            {showJumpDown ? (
              <Pressable
                onPress={scrollToBottom}
                accessibilityRole="button"
                accessibilityLabel="Przewiń do najnowszych wiadomości"
                className="active:opacity-80"
                style={{
                  position: "absolute",
                  right: 14,
                  bottom: 12,
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: "#FFFFFF",
                  borderWidth: 1,
                  borderColor: "#E6E1D5",
                  alignItems: "center",
                  justifyContent: "center",
                  shadowColor: "#2A2312",
                  shadowOffset: { width: 0, height: 3 },
                  shadowOpacity: 0.12,
                  shadowRadius: 8,
                  elevation: 3,
                }}
              >
                <ArrowDown size={18} color="#2A2312" />
              </Pressable>
            ) : null}
          </View>
        )}

        {typingText ? (
          <View style={{ paddingHorizontal: 16, paddingVertical: 4, backgroundColor: "#F6F4EE" }}>
            <Text
              accessibilityLiveRegion="polite"
              style={{ fontSize: 12, color: "#6B6557", fontStyle: "italic", fontFamily: "Manrope_500Medium" }}
            >
              {typingText}
            </Text>
          </View>
        ) : null}

        {details?.type === "direct" && peerBlocked ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              marginHorizontal: 12,
              marginBottom: 6,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 14,
              backgroundColor: "#FDE7E4",
            }}
          >
            <Ban size={16} color="#B42318" />
            <Text style={{ flex: 1, fontSize: 12, lineHeight: 17, color: "#7A1A12", fontFamily: "Manrope_500Medium" }}>
              Ta osoba jest zablokowana — nie może pisać do Ciebie prywatnie.
            </Text>
            <Pressable
              onPress={() => handleToggleBlock(peerEmail)}
              accessibilityRole="button"
              className="active:opacity-70"
              hitSlop={6}
            >
              <Text style={{ fontSize: 13, color: "#B42318", fontFamily: "Manrope_700Bold" }}>Odblokuj</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={{ paddingBottom: composerBottomPad, backgroundColor: "#F6F4EE" }}>
          <ComposerBar
            text={text}
            onChangeText={handleChangeText}
            onSend={handleSend}
            sending={sending}
            pendingAttachment={pendingAttachment}
            onClearAttachment={() => setPendingAttachment(null)}
            onPickImage={handlePickImage}
            onTakePhoto={handleTakePhoto}
            onPickFile={handlePickFile}
            uploading={uploading}
            replyTo={replyTo}
            onClearReply={() => setReplyTo(null)}
            editing={!!editingId}
            members={members}
            onSendVoice={handleSendVoice}
            canPost={canPost}
            readOnlyText={readOnlyText}
            onCreatePoll={() => setPollOpen(true)}
            onShareEvent={() => setEventShareOpen(true)}
            prayerMode={prayerMode}
            onStartPrayer={() => {
              setPrayerMode(true);
              setReplyTo(null);
              setPendingAttachment(null);
            }}
            onCancelPrayer={() => setPrayerMode(false)}
            mentionCandidates={mentionCandidates}
            canMentionAll={canMentionAll}
          />
        </View>
      </KeyboardAvoidingView>

      <PollComposerModal visible={pollOpen} onClose={() => setPollOpen(false)} onCreate={handleCreatePoll} />

      <EventShareModal
        visible={eventShareOpen}
        onClose={() => setEventShareOpen(false)}
        onShare={handleShareEvent}
        busy={sendMutation.isPending}
      />

      <MessageActionsSheet
        visible={!!actionTarget}
        onClose={() => setActionTarget(null)}
        mine={actionMine}
        canEdit={canEditOwn && !!actionTarget && canEditMessage(actionTarget, myEmail)}
        canDelete={canEditOwn}
        canPin={canPin}
        isPinned={actionTarget ? pinnedIds.has(actionTarget.id) : false}
        onPickReaction={(emoji) => {
          if (actionTarget) reactionMutation.mutate({ messageId: actionTarget.id, emoji });
        }}
        onReply={() => {
          if (actionTarget) {
            setReplyTo(actionTarget);
            setEditingId(null);
          }
        }}
        onForward={() => {
          if (actionTarget) setForwardTarget(actionTarget);
        }}
        // Jak web: ankiet, wydarzeń i próśb o modlitwę się nie przekazuje (poszłaby sama treść).
        canForward={!!actionTarget && (!actionTarget.message_type || actionTarget.message_type === "text")}
        canReply={canPost}
        onCopy={() => {
          if (actionTarget) handleCopyMessage(actionTarget);
        }}
        onTogglePin={() => {
          if (actionTarget) handleTogglePin(actionTarget);
        }}
        onEdit={() => {
          if (actionTarget) {
            // Niewysłany tekst nie ginie — wraca po zapisaniu edycji.
            if (!editingId) saveDraft(myEmail, cid, text);
            setEditingId(actionTarget.id);
            setText(actionTarget.content);
            setReplyTo(null);
            setPendingAttachment(null);
          }
        }}
        onDelete={() => {
          if (actionTarget) handleDeleteMessage(actionTarget);
        }}
        translateLabel={translationLabel(actionTarget)}
        translating={!!actionTarget && !!translations[actionTarget.id]?.pending}
        onTranslate={() => {
          if (actionTarget) void handleTranslate(actionTarget);
        }}
        onReadBy={canSeeReadBy(actionTarget) ? () => actionTarget && setReadByTarget(actionTarget) : undefined}
        onReport={
          details?.is_participant && actionTarget && !actionMine && actionTarget.message_type !== "system"
            ? () => setReportTarget(actionTarget)
            : undefined
        }
        blockLabel={
          actionTarget && !actionMine && actionTarget.message_type !== "system"
            ? isBlocked(actionTarget.sender_email)
              ? "Odblokuj osobę"
              : "Zablokuj osobę"
            : null
        }
        onToggleBlock={
          actionTarget && !actionMine && actionTarget.message_type !== "system"
            ? () => handleToggleBlock(actionTarget.sender_email)
            : undefined
        }
      />

      <ForwardMessageModal
        visible={!!forwardTarget}
        onClose={() => setForwardTarget(null)}
        onConfirm={handleConfirmForward}
        myEmail={myEmail}
        sourceConversationId={cid}
      />

      <SearchModal
        visible={searchVisible}
        onClose={() => setSearchVisible(false)}
        conversationId={cid}
        members={members}
        onJump={(m) => void jumpToMessage(m)}
      />

      <MediaGalleryModal visible={galleryVisible} onClose={() => setGalleryVisible(false)} conversationId={cid} />

      <ConversationInfoModal
        visible={infoVisible}
        onClose={() => setInfoVisible(false)}
        details={details ?? null}
        members={members}
        myEmail={myEmail}
        canLeave={perms.can("res:conversation_participants:delete")}
        canDelete={perms.can("res:conversations:delete")}
        onGone={() => goBack(router)}
        peerBlocked={peerBlocked}
        onToggleBlock={peerEmail ? () => handleToggleBlock(peerEmail) : undefined}
      />

      <MuteSheet
        visible={muteOpen}
        onClose={() => setMuteOpen(false)}
        muted={isMutedNow({ muted: details?.my_muted, muted_until: details?.my_muted_until })}
        mutedUntil={details?.my_muted_until ?? null}
        onPick={handlePickMute}
      />

      <ReadByModal
        visible={!!readByTarget}
        onClose={() => setReadByTarget(null)}
        message={readByTarget}
        readers={(readBySummary?.readers ?? []) as ReadReceiptRow[]}
        participantEmails={participantEmails}
        members={members}
      />

      <ReportModal
        visible={!!reportTarget}
        message={reportTarget}
        senderName={reportTarget ? memberDisplayName(members, reportTarget.sender_email) : ""}
        busy={reportMutation.isPending}
        onClose={() => setReportTarget(null)}
        onSubmit={handleSubmitReport}
      />

      {/* Podgląd zdjęcia z rozmowy (podpisany link — K1). */}
      <Modal visible={!!imagePreview} transparent animationType="fade" onRequestClose={() => setImagePreview(null)}>
        <Pressable
          onPress={() => setImagePreview(null)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)", alignItems: "center", justifyContent: "center" }}
        >
          {imagePreview ? (
            <AttachmentImage url={imagePreview} style={{ width: "100%", height: "100%" }} resizeMode="contain" dark />
          ) : null}
          <Pressable
            onPress={() => setImagePreview(null)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Zamknij podgląd"
            style={{
              position: "absolute",
              top: 60,
              right: 24,
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: "rgba(0,0,0,0.5)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={20} color="#ffffff" />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
