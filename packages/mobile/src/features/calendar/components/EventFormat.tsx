import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, MapPin, MessageSquare, PhoneCall, Users, Video, X } from "lucide-react-native";
import { useRouter } from "expo-router";
import { B, fieldStyle } from "../../../components/ui/brand";
import { FONT as F } from "../../../lib/fonts";
import { supabase } from "../../../lib/supabase";
import { showError, friendlyError } from "../../../lib/errors";
import { toast } from "../../../lib/toast";
import { joinCall, useCallsEnabled } from "../../calls/api";
import { parseGuestInput, RESPONSE_STATUS, type MeetingResponse } from "../../meetings/logic";

// Forma wydarzenia (099): stacjonarne / online / hybrydowe — jak web src/modules/Events/eventFormat.jsx.
export type EventFormat = "in_person" | "online" | "hybrid";
export const FORMATS: { value: EventFormat; label: string; Icon: typeof MapPin }[] = [
  { value: "in_person", label: "Stacjonarne", Icon: MapPin },
  { value: "online", label: "Online", Icon: Video },
  { value: "hybrid", label: "Hybrydowe", Icon: Users },
];
export const isOnlineFormat = (f: string | null | undefined) => f === "online" || f === "hybrid";
export const formatLabel = (f: string | null | undefined) => FORMATS.find((x) => x.value === f)?.label ?? "Stacjonarne";

// „Dołącz” ma sens od 15 min przed początkiem do końca (bez końca — 3 h od początku).
export function joinWindowOpen(ev: { startsAt: Date; endsAt: Date | null; allDay: boolean; format?: string }, now = Date.now()) {
  if (!isOnlineFormat(ev.format) || ev.allDay) return false;
  const start = ev.startsAt.getTime();
  const end = ev.endsAt && ev.endsAt.getTime() > start ? ev.endsAt.getTime() : start + 3 * 3_600_000;
  return now >= start - 15 * 60_000 && now <= end;
}

export function EventFormatPicker({ value, onChange }: { value: EventFormat; onChange: (f: EventFormat) => void }) {
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {FORMATS.map(({ value: v, label, Icon }) => {
        const on = value === v;
        return (
          <Pressable
            key={v}
            onPress={() => onChange(v)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            className="active:opacity-70"
            style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, backgroundColor: on ? B.ink : B.card }}
          >
            <Icon size={14} color={on ? B.onDark : B.ink} />
            <Text style={{ fontSize: 13, color: on ? B.onDark : B.ink, fontFamily: F.semibold }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function EventFormatBadge({ format }: { format?: string | null }) {
  if (!isOnlineFormat(format)) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: B.paper2, alignSelf: "flex-start" }}>
      <Video size={11} color={B.ink} />
      <Text style={{ fontSize: 11, color: B.ink, fontFamily: F.semibold }}>{formatLabel(format)}</Text>
    </View>
  );
}

interface EventMeetingState {
  status: "none" | "needs_time" | "scheduled" | "cancelled";
  meeting?: { id: string; conversation_id: string | null; kind: "audio" | "video"; call_live: boolean; participant: boolean; invited: number };
}

async function eventMeetingFn(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("event-meeting", { body, silent: true } as never);
  if (error) {
    const ctx = (error as { context?: { error?: string } }).context;
    throw new Error(ctx?.error || "Nie udało się połączyć ze spotkaniem.");
  }
  return data as EventMeetingState;
}

// Dołącz do spotkania wydarzenia: serwer dopisuje do czatu (jeśli widzę wydarzenie), potem rozmowa
// w apce (natywnie; bez modułów natywnych — w przeglądarce telefonu).
export async function joinEventMeeting(eventId: number) {
  const res = await eventMeetingFn({ event_id: eventId, join: true });
  if (res.status === "needs_time") throw new Error("Ustaw godzinę wydarzenia, żeby utworzyć spotkanie online.");
  if (res.status === "cancelled") throw new Error("Spotkanie online tego wydarzenia zostało odwołane.");
  const m = res.meeting;
  if (!m?.conversation_id) throw new Error("Nie udało się dołączyć do spotkania.");
  await joinCall(m.conversation_id, null, m.kind === "video" ? "video" : "audio", { isGroup: true });
  return m;
}

export function JoinEventButton({ eventId, label = "Dołącz" }: { eventId: number; label?: string }) {
  const enabled = useCallsEnabled();
  const [busy, setBusy] = useState(false);
  if (!enabled) return null;
  return (
    <Pressable
      onPress={async () => {
        if (busy) return;
        setBusy(true);
        try {
          await joinEventMeeting(eventId);
        } catch (e) {
          showError("Nie udało się dołączyć", e);
        } finally {
          setBusy(false);
        }
      }}
      accessibilityRole="button"
      accessibilityLabel={`${label} do spotkania online`}
      className="active:opacity-70"
      style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: B.ink, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, alignSelf: "flex-start" }}
    >
      {busy ? <ActivityIndicator size="small" color={B.onDark} /> : <PhoneCall size={14} color={B.onDark} />}
      <Text style={{ fontSize: 13, color: B.onDark, fontFamily: F.bold }}>{label}</Text>
    </Pressable>
  );
}

interface Guest { id: string; email: string; name: string; response: MeetingResponse; email_sent: boolean }

// Goście spoza aplikacji (e-mail) — dla osób, które mogą edytować wydarzenie (fn event-meeting-guests).
function EventGuests({ eventId }: { eventId: number }) {
  const qc = useQueryClient();
  const key = ["event-meeting-guests", eventId];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("event-meeting-guests", { body: { event_id: eventId }, silent: true } as never);
      if (error) return [] as Guest[];
      return ((data as { guests?: Guest[] } | null)?.guests ?? []) as Guest[];
    },
  });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const call = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("event-meeting-guests", { body: { event_id: eventId, ...body }, silent: true } as never);
    if (error) throw Object.assign(new Error((error as { context?: { error?: string } }).context?.error || "Nie udało się zapisać."), {});
    qc.setQueryData(key, (data as { guests: Guest[] }).guests);
    return data as { added: number; members_added: number };
  };
  const add = async () => {
    const { emails, invalid } = parseGuestInput(text);
    if (invalid.length) { setErr(`Nieprawidłowy adres e-mail: ${invalid[0]}`); return; }
    if (!emails.length) return;
    setBusy(true);
    setErr("");
    try {
      const res = await call({ add: emails.map((email) => ({ email })) });
      setText("");
      if (res.added) toast.success(`Zaproszenia wysłane: ${res.added}`);
      if (res.members_added) toast.success(`Osoby z kontem dodano jako uczestników: ${res.members_added}`);
    } catch (e) {
      setErr(friendlyError(e, "Nie udało się wysłać zaproszeń."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: B.line, gap: 8 }}>
      <Text style={{ fontSize: 14, color: B.ink, fontFamily: F.bold }}>Goście spoza aplikacji</Text>
      <Text style={{ fontSize: 12, color: B.ink3, fontFamily: F.medium }}>Każdy dostanie e-mail z osobistym linkiem i plikiem do kalendarza.</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="adres@przyklad.pl"
          placeholderTextColor={B.ink4}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={add}
          style={[fieldStyle as object, { flex: 1 }]}
        />
        <Pressable onPress={add} disabled={busy || !text.trim()} accessibilityRole="button" className="active:opacity-70" style={{ justifyContent: "center", paddingHorizontal: 14, borderRadius: 999, backgroundColor: text.trim() ? B.ink : B.paper2 }}>
          {busy ? <ActivityIndicator size="small" color={B.onDark} /> : <Text style={{ fontSize: 13, color: text.trim() ? B.onDark : B.ink3, fontFamily: F.bold }}>Zaproś</Text>}
        </Pressable>
      </View>
      {err ? <Text accessibilityRole="alert" style={{ fontSize: 12, color: B.danger, fontFamily: F.semibold }}>{err}</Text> : null}
      {((q.data ?? []) as Guest[]).map((g) => (
        <View key={g.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: B.paper, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text style={{ flex: 1, fontSize: 13, color: B.ink, fontFamily: F.medium }} numberOfLines={1}>
            {g.name}<Text style={{ color: B.ink3 }}> · {g.email}</Text>
          </Text>
          <Text style={{ fontSize: 11, color: B.ink3, fontFamily: F.medium }}>{RESPONSE_STATUS[g.response] ?? RESPONSE_STATUS.pending}</Text>
          <Pressable
            onPress={() => call({ remove: [g.id] }).then(() => toast.success("Zaproszenie wycofane"), (e) => showError("Nie udało się wycofać zaproszenia", e))}
            hitSlop={8}
            accessibilityLabel={`Wycofaj zaproszenie: ${g.email}`}
          >
            <X size={14} color={B.ink3} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

// Karta „Spotkanie online” na ekranie wydarzenia (jak web OnlineMeetingCard).
export function OnlineMeetingCard({
  ev,
  canManage,
  wideAudience,
}: {
  ev: { eventId: number; startsAt: Date; endsAt: Date | null; allDay: boolean; format?: string };
  canManage: boolean;
  wideAudience: boolean;
}) {
  const router = useRouter();
  const callsOn = useCallsEnabled();
  const q = useQuery({
    queryKey: ["event-meeting", ev.eventId, ev.format, ev.startsAt.getTime()],
    enabled: isOnlineFormat(ev.format),
    queryFn: () => eventMeetingFn({ event_id: ev.eventId }),
    refetchInterval: 60_000,
  });
  if (!isOnlineFormat(ev.format)) return null;
  const st = q.data;
  const m = st?.meeting;
  return (
    <View style={{ backgroundColor: B.card, borderRadius: 22, padding: 16, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Video size={17} color={B.gold} />
        <Text style={{ fontSize: 15, color: B.ink, fontFamily: F.bold }}>Spotkanie online</Text>
      </View>
      {q.isLoading ? (
        <Text style={{ fontSize: 13, color: B.ink3, fontFamily: F.medium }}>Przygotowuję spotkanie online…</Text>
      ) : q.isError ? (
        <Text style={{ fontSize: 13, color: B.ink3, fontFamily: F.medium }}>Nie udało się wczytać spotkania online.</Text>
      ) : st?.status === "needs_time" ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Clock size={15} color={B.ink2} />
          <Text style={{ flex: 1, fontSize: 13, color: B.ink2, fontFamily: F.medium }}>Ustaw godzinę rozpoczęcia — wtedy utworzy się spotkanie online z czatem.</Text>
        </View>
      ) : st?.status === "cancelled" ? (
        <Text style={{ fontSize: 13, color: B.ink2, fontFamily: F.medium }}>Spotkanie online tego wydarzenia zostało odwołane.</Text>
      ) : (
        <>
          <Text style={{ fontSize: 13, lineHeight: 19, color: B.ink2, fontFamily: F.medium }}>
            {m?.call_live ? "Spotkanie trwa." : "Dołączyć może każdy, kto widzi to wydarzenie. Osoby zapisane bez konta dostaną e-mailem osobisty link."}
          </Text>
          {callsOn ? <JoinEventButton eventId={ev.eventId} label={m?.call_live ? "Dołącz" : "Dołącz do spotkania"} /> : null}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <Text style={{ fontSize: 12, color: B.ink3, fontFamily: F.medium }}>Zaproszonych: {m?.invited ?? 0}</Text>
            {m?.participant && m.conversation_id ? (
              <Pressable onPress={() => router.push({ pathname: "/(app)/messenger/[conversationId]", params: { conversationId: m.conversation_id as string } })} accessibilityRole="link" style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <MessageSquare size={13} color={B.ink} />
                <Text style={{ fontSize: 12, color: B.ink, fontFamily: F.bold }}>Czat spotkania</Text>
              </Pressable>
            ) : null}
          </View>
          {wideAudience ? (
            <Text style={{ fontSize: 12, lineHeight: 17, color: B.ink3, fontFamily: F.medium }}>
              Wydarzenie widzi cały kościół. Rozmowa wideo działa wygodnie do ok. 30 osób z kamerami.
            </Text>
          ) : null}
          {canManage ? <EventGuests eventId={ev.eventId} /> : null}
        </>
      )}
    </View>
  );
}
