import { Alert, Platform, Pressable, Text, View } from "react-native";
import * as ExpoCalendar from "expo-calendar";
import type { EventMetadata } from "../api";

// Udostępnione wydarzenie w czacie (spec §2) — migawka. Render szczegółów + „Dodaj do
// kalendarza" telefonu (expo-calendar). RSVP (event_registrations) = follow-up (wymaga
// potwierdzenia dostępu członka do tabeli / scoped endpointu).
interface Props {
  metadata: EventMetadata | null | undefined;
  content: string;
  bubbleMine: boolean;
}

export const EventCard = ({ metadata, content, bubbleMine }: Props) => {
  const title = metadata?.title || content || "Wydarzenie";
  const fg = bubbleMine ? "#ffffff" : "#2A2312";
  const sub = bubbleMine ? "#FFF1C2" : "#2A2312";
  const line = bubbleMine ? "#F3E3B0" : "#4A463E";

  const dateLine = [metadata?.date, metadata?.time].filter(Boolean).join(" · ");

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
        Alert.alert("Błąd", "Nie znaleziono kalendarza do zapisu.");
        return;
      }
      const hasTime = !!metadata?.time;
      const start = new Date(`${metadata?.date ?? ""}T${metadata?.time || "00:00"}:00`);
      if (isNaN(start.getTime())) {
        Alert.alert("Błąd", "Wydarzenie nie ma poprawnej daty.");
        return;
      }
      const end = hasTime ? new Date(start.getTime() + 60 * 60 * 1000) : start;
      await ExpoCalendar.createEventAsync(calendarId, {
        title,
        startDate: start,
        endDate: end,
        location: metadata?.location ?? undefined,
        notes: metadata?.description ?? undefined,
        allDay: !hasTime,
      });
      Alert.alert("Dodano do kalendarza", "Wydarzenie zapisano w kalendarzu telefonu.");
    } catch (err) {
      Alert.alert("Błąd", (err as Error)?.message ?? "Nie udało się zapisać wydarzenia.");
    }
  };

  return (
    <View style={{ minWidth: 230, maxWidth: 300 }}>
      <Text style={{ fontSize: 12, color: sub, fontFamily: "Manrope_700Bold", marginBottom: 2 }}>
        📅 Wydarzenie
      </Text>
      <Text style={{ fontSize: 15, color: fg, fontFamily: "Manrope_600SemiBold", marginBottom: 4 }}>
        {title}
      </Text>
      {dateLine ? (
        <Text style={{ fontSize: 13, color: line, fontFamily: "Manrope_500Medium" }}>{dateLine}</Text>
      ) : null}
      {metadata?.location ? (
        <Text style={{ fontSize: 13, color: line, fontFamily: "Manrope_400Regular" }}>📍 {metadata.location}</Text>
      ) : null}
      {metadata?.description ? (
        <Text style={{ fontSize: 13, color: line, fontFamily: "Manrope_400Regular", marginTop: 2 }}>
          {metadata.description}
        </Text>
      ) : null}
      <Pressable
        onPress={addToCalendar}
        style={{
          marginTop: 8,
          paddingVertical: 8,
          borderRadius: 10,
          alignItems: "center",
          backgroundColor: bubbleMine ? "rgba(255,255,255,0.2)" : "#ECE8DE",
        }}
      >
        <Text style={{ fontSize: 13, color: bubbleMine ? "#ffffff" : "#2A2312", fontFamily: "Manrope_700Bold" }}>
          Dodaj do kalendarza
        </Text>
      </Pressable>
    </View>
  );
};
