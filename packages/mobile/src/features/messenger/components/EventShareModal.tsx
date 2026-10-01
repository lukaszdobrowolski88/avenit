import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Calendar, ChevronRight, MapPin, X } from "lucide-react-native";
import { useUpcomingEvents, type EventMetadata, type ShareableEvent } from "../api";

// Udostępnianie istniejącego wydarzenia w czacie (spec §2) — snapshot do messages.metadata
// z event_id (RSVP wspiera się o event_registrations po stronie odbiorcy/weba).
interface Props {
  visible: boolean;
  onClose: () => void;
  onShare: (title: string, metadata: EventMetadata) => void;
}

export const EventShareModal = ({ visible, onClose, onShare }: Props) => {
  const { data, isLoading } = useUpcomingEvents();
  const events: ShareableEvent[] = data ?? [];

  const pick = (e: ShareableEvent) => {
    onShare(e.title, {
      event_id: e.id,
      title: e.title,
      date: e.date ?? undefined,
      time: e.time ?? undefined,
      location: e.location ?? undefined,
      description: e.description ?? undefined,
      max_participants: e.max_participants ?? undefined,
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(15,23,42,0.45)", justifyContent: "flex-end" }}
        onPress={onClose}
      >
        <Pressable
          style={{
            backgroundColor: "#ffffff",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: 20,
            paddingBottom: 28,
            maxHeight: "80%",
          }}
          onPress={(e) => e.stopPropagation()}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
              paddingHorizontal: 20,
            }}
          >
            <Text style={{ fontSize: 18, color: "#0c0a09", fontFamily: "Inter_700Bold" }}>
              📅 Udostępnij wydarzenie
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <X size={20} color="#78716c" />
            </Pressable>
          </View>

          {isLoading ? (
            <View style={{ paddingVertical: 40, alignItems: "center" }}>
              <ActivityIndicator color="#ec4899" />
            </View>
          ) : events.length === 0 ? (
            <View style={{ paddingVertical: 40, alignItems: "center", paddingHorizontal: 24 }}>
              <Calendar size={28} color="#cbd5e1" />
              <Text
                style={{
                  marginTop: 8,
                  fontSize: 14,
                  color: "#78716c",
                  fontFamily: "Inter_500Medium",
                  textAlign: "center",
                }}
              >
                Brak nadchodzących wydarzeń do udostępnienia.
              </Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}>
              {events.map((e) => {
                const dateLine = [e.date, e.time].filter(Boolean).join(" · ");
                return (
                  <Pressable
                    key={e.id}
                    onPress={() => pick(e)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      padding: 14,
                      marginBottom: 8,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: "#eef0f3",
                      backgroundColor: "#fafaf9",
                    }}
                  >
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        backgroundColor: "#cffafe",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Calendar size={18} color="#0e7490" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{ fontSize: 15, color: "#0c0a09", fontFamily: "Inter_600SemiBold" }}
                        numberOfLines={1}
                      >
                        {e.title}
                      </Text>
                      {dateLine ? (
                        <Text style={{ fontSize: 12, color: "#78716c", fontFamily: "Inter_500Medium" }}>
                          {dateLine}
                        </Text>
                      ) : null}
                      {e.location ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 1 }}>
                          <MapPin size={11} color="#a8a29e" />
                          <Text
                            style={{ fontSize: 12, color: "#a8a29e", fontFamily: "Inter_400Regular" }}
                            numberOfLines={1}
                          >
                            {e.location}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <ChevronRight size={18} color="#cbd5e1" />
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};
