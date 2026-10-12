import { useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { Ban, CalendarClock, CalendarDays, CalendarPlus, ChevronDown, Pencil, PhoneCall, Users, Video, XCircle } from "lucide-react-native";
import { B } from "../../../components/ui/brand";
import { FONT as F } from "../../../lib/fonts";
import { showError } from "../../../lib/errors";
import { addToPhoneCalendar } from "../../calendar/add-to-calendar";
import { joinCall, useCallsEnabled, useLiveCall } from "../../calls/api";
import { useCancelMeeting, useMeeting, useRespondMeeting } from "../api";
import { PHASE_TEXT, RESPONSES, RESPONSE_LABELS, RESPONSE_STATUS, meetingPhase, responseCounts, type Meeting } from "../logic";
import { MeetingSheet } from "./MeetingSheet";

const when = (m: Meeting) => {
  const s = new Date(m.starts_at);
  const e = new Date(m.ends_at);
  const day = format(s, "EEE, d MMM", { locale: pl });
  return `${day} · ${format(s, "HH:mm")}–${format(e, "HH:mm")}`;
};

// Karta spotkania pod nagłówkiem rozmowy typu 'meeting' (jak web MeetingPanel).
export function MeetingCard({ conversationId, myEmail }: { conversationId: string; myEmail: string | null }) {
  const router = useRouter();
  const q = useMeeting(conversationId);
  const respond = useRespondMeeting(conversationId);
  const cancel = useCancelMeeting(conversationId);
  const callsOn = useCallsEnabled();
  const live = useLiveCall(conversationId);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const m = q.data as Meeting | undefined;
  if (!m) return null;
  const phase = meetingPhase(m, now, !!live);
  const cancelled = phase === "cancelled";
  const counts = responseCounts(m);
  const invited = m.my_response != null && (m.organizer.email || "").toLowerCase() !== String(myEmail || "").toLowerCase();
  const pill = (active: boolean) => ({
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: active ? B.ink : B.card,
  });
  const pillText = (active: boolean) => ({ fontSize: 13, color: active ? B.onDark : B.ink, fontFamily: F.semibold });

  const confirmCancel = () =>
    Alert.alert("Odwołać spotkanie?", "Zaproszeni dostaną informację, a linki gości przestaną działać. Czat spotkania zostanie.", [
      { text: "Nie", style: "cancel" },
      {
        text: "Odwołaj spotkanie",
        style: "destructive",
        onPress: () => cancel.mutate(m.id, { onError: (e) => showError("Nie udało się odwołać spotkania", e) }),
      },
    ]);

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 12, backgroundColor: B.kurkumaSoft, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: B.card, alignItems: "center", justifyContent: "center" }}>
          {cancelled ? <Ban size={17} color={B.ink} /> : <CalendarClock size={17} color={B.ink} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, color: B.ink, fontFamily: F.bold, textDecorationLine: cancelled ? "line-through" : "none" }}>{when(m)}</Text>
          <Text style={{ fontSize: 12, color: B.ink2, fontFamily: F.medium }} numberOfLines={1}>
            {PHASE_TEXT[phase] ? `${PHASE_TEXT[phase]} · ` : ""}Prowadzi: {m.organizer.name}
          </Text>
        </View>
        {!cancelled && phase !== "ended" && callsOn ? (
          <Pressable
            onPress={() => void joinCall(conversationId, live?.id, m.kind, { title: m.title, isGroup: true })}
            accessibilityRole="button"
            accessibilityLabel={live ? "Dołącz do spotkania" : "Rozpocznij spotkanie"}
            className="active:opacity-70"
            style={pill(true)}
          >
            {m.kind === "video" ? <Video size={14} color={B.onDark} /> : <PhoneCall size={14} color={B.onDark} />}
            <Text style={pillText(true)}>{live ? "Dołącz" : "Rozpocznij"}</Text>
          </Pressable>
        ) : null}
      </View>

      {m.description && !cancelled ? (
        <Text style={{ fontSize: 13, lineHeight: 19, color: B.ink2, fontFamily: F.regular }} numberOfLines={3}>{m.description}</Text>
      ) : null}

      {!cancelled ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {invited && phase !== "ended"
            ? RESPONSES.map((r) => (
                <Pressable
                  key={r}
                  onPress={() => m.my_response !== r && respond.mutate({ meetingId: m.id, response: r }, { onError: (e) => showError("Nie udało się zapisać odpowiedzi", e) })}
                  disabled={respond.isPending}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: m.my_response === r }}
                  className="active:opacity-70"
                  style={pill(m.my_response === r)}
                >
                  <Text style={pillText(m.my_response === r)}>{RESPONSE_LABELS[r]}</Text>
                </Pressable>
              ))
            : null}
          <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }} className="active:opacity-70" style={pill(false)}>
            <Users size={14} color={B.ink} />
            <Text style={pillText(false)}>
              Uczestnicy: {m.members.length + m.guests.length}
              {counts.accepted ? ` · potwierdziło: ${counts.accepted}` : ""}
            </Text>
            <ChevronDown size={13} color={B.ink} style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }} />
          </Pressable>
          <Pressable
            onPress={() => void addToPhoneCalendar({ title: m.title, startsAt: new Date(m.starts_at), endsAt: new Date(m.ends_at), allDay: false, location: "Spotkanie online (Avenit)" }, m.description)}
            accessibilityRole="button"
            className="active:opacity-70"
            style={pill(false)}
          >
            <CalendarPlus size={14} color={B.ink} />
            <Text style={pillText(false)}>Do kalendarza</Text>
          </Pressable>
          {m.event_id ? (
            <Pressable onPress={() => router.push({ pathname: "/(app)/events/[id]", params: { id: String(m.event_id) } })} accessibilityRole="button" className="active:opacity-70" style={pill(false)}>
              <CalendarDays size={14} color={B.ink} />
              <Text style={pillText(false)}>Otwórz wydarzenie</Text>
            </Pressable>
          ) : null}
          {m.can_manage && m.source !== "event" ? (
            <>
              <Pressable onPress={() => setEditing(true)} accessibilityRole="button" className="active:opacity-70" style={pill(false)}>
                <Pencil size={14} color={B.ink} />
                <Text style={pillText(false)}>Edytuj</Text>
              </Pressable>
              <Pressable onPress={confirmCancel} disabled={cancel.isPending} accessibilityRole="button" className="active:opacity-70" style={pill(false)}>
                <XCircle size={14} color={B.ink} />
                <Text style={pillText(false)}>Odwołaj</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      ) : null}

      {open && !cancelled ? (
        <View style={{ gap: 4 }}>
          {m.members.map((p) => (
            <View key={p.email} style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: B.card, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 }}>
              <Text style={{ flex: 1, fontSize: 14, color: B.ink, fontFamily: F.medium }} numberOfLines={1}>
                {p.name}{p.organizer ? <Text style={{ color: B.ink3 }}> · organizator</Text> : null}
              </Text>
              <Text style={{ fontSize: 12, color: B.ink3, fontFamily: F.medium }}>{RESPONSE_STATUS[p.response] ?? RESPONSE_STATUS.pending}</Text>
            </View>
          ))}
          {m.guests.map((g) => (
            <View key={g.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: B.card, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 }}>
              <Text style={{ flex: 1, fontSize: 14, color: B.ink, fontFamily: F.medium }} numberOfLines={1}>
                {g.name}<Text style={{ color: B.ink3 }}> · {g.email || "gość"}</Text>
              </Text>
              <Text style={{ fontSize: 12, color: B.ink3, fontFamily: F.medium }}>{RESPONSE_STATUS[g.response] ?? RESPONSE_STATUS.pending}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {editing ? (
        <MeetingSheet visible meeting={m} myEmail={myEmail} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); void q.refetch(); }} />
      ) : null}
    </View>
  );
}
