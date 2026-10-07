import { ActivityIndicator, Alert, Platform, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { showError } from "../../../lib/errors";
import { toast } from "../../../lib/toast";
import { useAuthSession } from "../../../lib/auth";
import {
  useCancelEvent,
  useEventRegistrations,
  useSignUpEvent,
  type EventRegistration,
} from "../../calendar/api";
import * as ExpoCalendar from "expo-calendar";
import type { EventMetadata } from "../api";
import { sameEmail } from "../logic";

// Udostępnione wydarzenie w czacie — migawka z messages.metadata + zapisy (RSVP, K11) na żywo
// z event_registrations (jak web EventRSVP): „Będę” / „Wypisz się”, licznik i limit miejsc,
// „Szczegóły” (pełny widok wydarzenia) i „Do kalendarza” (kalendarz telefonu).
interface Props {
  metadata: EventMetadata | null | undefined;
  content: string;
  bubbleMine: boolean;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const EventCard = ({ metadata, content, bubbleMine }: Props) => {
  const router = useRouter();
  const { user } = useAuthSession();
  const email = user?.email ?? null;
  const title = metadata?.title || content || "Wydarzenie";
  const fg = bubbleMine ? "#ffffff" : "#2A2312";
  const sub = bubbleMine ? "#FFF1C2" : "#2A2312";
  const line = bubbleMine ? "#F3E3B0" : "#4A463E";

  const eventId = metadata?.event_id != null && /^\d+$/.test(String(metadata.event_id)) ? Number(metadata.event_id) : null;
  const regs = useEventRegistrations(eventId);
  const signUp = useSignUpEvent(eventId, email);
  const cancel = useCancelEvent(eventId, email);
  const list: EventRegistration[] = regs.data ?? [];
  const going = list.reduce((s, r) => s + 1 + (r.guests_count || 0), 0);
  const mineReg = email ? list.find((r) => sameEmail(r.user_email, email)) ?? null : null;
  const limit = metadata?.max_participants ? Number(metadata.max_participants) : null;
  const full = !!limit && going >= limit;

  const start = metadata?.date ? new Date(`${metadata.date}T${metadata.time || "00:00"}:00`) : null;
  const validStart = !!start && Number.isFinite(start.getTime());
  const past = validStart && start!.getTime() < new Date(new Date().setHours(0, 0, 0, 0)).getTime();
  const dateLine = validStart
    ? [cap(format(start!, "EEEE, d MMMM", { locale: pl })), metadata?.time].filter(Boolean).join(" · ")
    : [metadata?.date, metadata?.time].filter(Boolean).join(" · ");
  const busy = signUp.isPending || cancel.isPending;

  const addToCalendar = async () => {
    try {
      const { status } = await ExpoCalendar.requestCalendarPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Brak dostępu do kalendarza", "Zezwól na dostęp do kalendarza w ustawieniach.");
        return;
      }
      let calendarId: string | null = null;
      if (Platform.OS === "ios") {
        const def = await ExpoCalendar.getDefaultCalendarAsync();
        calendarId = def?.id ?? null;
      } else {
        const cals = await ExpoCalendar.getCalendarsAsync(ExpoCalendar.EntityTypes.EVENT);
        const w =
          cals.find((c) => c.accessLevel === ExpoCalendar.CalendarAccessLevel.OWNER && c.allowsModifications) ??
          cals.find((c) => c.allowsModifications);
        calendarId = w?.id ?? null;
      }
      if (!calendarId) {
        Alert.alert("Nie udało się dodać", "Nie znaleziono w telefonie kalendarza, do którego można zapisać wydarzenie.");
        return;
      }
      if (!validStart) {
        Alert.alert("Nie udało się dodać", "To wydarzenie nie ma poprawnej daty.");
        return;
      }
      const hasTime = !!metadata?.time;
      const end = hasTime ? new Date(start!.getTime() + 60 * 60 * 1000) : start!;
      await ExpoCalendar.createEventAsync(calendarId, {
        title,
        startDate: start!,
        endDate: end,
        location: metadata?.location ?? undefined,
        notes: metadata?.description ?? undefined,
        allDay: !hasTime,
      });
      toast.success("Dodano do kalendarza telefonu");
    } catch (err) {
      showError("Nie udało się dodać do kalendarza", err, "Nie udało się zapisać wydarzenia w kalendarzu telefonu.");
    }
  };

  const join = () => {
    if (busy || !email) return;
    if (full) {
      Alert.alert("Brak wolnych miejsc", "Na to wydarzenie zapisało się już tyle osób, ile jest miejsc.");
      return;
    }
    signUp.mutate(
      { guests: 0, fullName: String(user?.full_name || "") },
      {
        onSuccess: () => toast.success("Zapis potwierdzony", title),
        onError: (e) => showError("Nie udało się zapisać", e, "Nie udało się zapisać na wydarzenie. Spróbuj ponownie."),
      },
    );
  };

  const leave = () => {
    if (busy) return;
    Alert.alert(`Wypisać się z „${title}”?`, "Zwolnisz swoje miejsce na liście zapisanych.", [
      { text: "Anuluj", style: "cancel" },
      {
        text: "Wypisz się",
        style: "destructive",
        onPress: () =>
          cancel.mutate(undefined, {
            onSuccess: () => toast.success("Wypisano z wydarzenia"),
            onError: (e) => showError("Nie udało się wypisać", e, "Spróbuj ponownie."),
          }),
      },
    ]);
  };

  const chip = (label: string, onPress: () => void, primary?: boolean, a11y?: string) => (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      className="active:opacity-70"
      style={{
        flexGrow: 1,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 10,
        alignItems: "center",
        backgroundColor: primary
          ? bubbleMine
            ? "#FFBE0B"
            : "#2A2312"
          : bubbleMine
            ? "rgba(255,255,255,0.2)"
            : "#ECE8DE",
        opacity: busy ? 0.6 : 1,
      }}
    >
      <Text
        style={{
          fontSize: 13,
          color: primary ? (bubbleMine ? "#2A2312" : "#ffffff") : bubbleMine ? "#ffffff" : "#2A2312",
          fontFamily: "Manrope_700Bold",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View style={{ minWidth: 230, maxWidth: 300 }}>
      <Text style={{ fontSize: 12, color: sub, fontFamily: "Manrope_700Bold", marginBottom: 2 }}>📅 Wydarzenie</Text>
      <Text style={{ fontSize: 15, color: fg, fontFamily: "Manrope_600SemiBold", marginBottom: 4 }}>{title}</Text>
      {dateLine ? <Text style={{ fontSize: 13, color: line, fontFamily: "Manrope_500Medium" }}>{dateLine}</Text> : null}
      {metadata?.location ? (
        <Text style={{ fontSize: 13, color: line, fontFamily: "Manrope_400Regular" }}>📍 {metadata.location}</Text>
      ) : null}
      {metadata?.description ? (
        <Text numberOfLines={4} style={{ fontSize: 13, color: line, fontFamily: "Manrope_400Regular", marginTop: 2 }}>
          {metadata.description}
        </Text>
      ) : null}

      {eventId != null ? (
        <View style={{ marginTop: 8 }}>
          <Text style={{ fontSize: 12, color: sub, fontFamily: "Manrope_600SemiBold" }}>
            {regs.isLoading ? "Sprawdzam zapisy…" : `Zapisani: ${going}${limit ? ` z ${limit}` : ""}`}
            {mineReg ? " · Ty też" : full && !past ? " · brak miejsc" : ""}
          </Text>
          {!past && email ? (
            <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
              {busy ? (
                <View style={{ flexGrow: 1, paddingVertical: 8, alignItems: "center" }}>
                  <ActivityIndicator color={fg} />
                </View>
              ) : mineReg ? (
                chip("Wypisz się", leave, false, `Wypisz się z wydarzenia ${title}`)
              ) : (
                chip(full ? "Brak miejsc" : "Będę", join, !full, `Zapisz się na wydarzenie ${title}`)
              )}
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
        {eventId != null
          ? chip("Szczegóły", () => router.push({ pathname: "/(app)/events/[id]", params: { id: String(eventId) } }))
          : null}
        {!past ? chip("Do kalendarza", addToCalendar, false, "Dodaj do kalendarza telefonu") : null}
      </View>
    </View>
  );
};
