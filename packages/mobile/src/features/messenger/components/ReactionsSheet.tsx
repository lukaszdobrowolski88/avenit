import { useEffect, useMemo, useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { reactionTabs } from "@avenit/shared/src/lib/reactionPeople.js";
import { memberDisplayName, memberInitials, memberPhotoUrl, type MemberMap, type ReactionAggregate } from "../api";

// „Reakcje” — kto zareagował na wiadomość (przytrzymanie pigułki reakcji). Arkusz od dołu jak
// „Wycisz”: zakładki „Wszystkie” + po jednej na emoji, lista osób (zdjęcie + imię). Imiona z mapy
// członków, którą ekran rozmowy już ma; bez imienia — tylko część adresu przed „@” (bez e-maila).
// Dotknięcie własnego wiersza usuwa moją reakcję (jak w WhatsAppie).
interface Props {
  visible: boolean;
  onClose: () => void;
  reactions: ReactionAggregate[] | undefined;
  /** Zakładka na start (emoji przytrzymanej pigułki); null — „Wszystkie”. */
  initialEmoji: string | null;
  members: MemberMap;
  myEmail: string | null;
  onRemoveMine?: (emoji: string) => void;
}

type ReactionPerson = { email: string; name: string; me: boolean };
type ReactionTab = { emoji: string; people: ReactionPerson[] };

const F = { medium: "Manrope_500Medium", semibold: "Manrope_600SemiBold", bold: "Manrope_700Bold" } as const;

export const ReactionsSheet = ({ visible, onClose, reactions, initialEmoji, members, myEmail, onRemoveMine }: Props) => {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [active, setActive] = useState<string>(initialEmoji ?? "all");
  useEffect(() => {
    if (visible) setActive(initialEmoji ?? "all");
  }, [visible, initialEmoji]);

  const { tabs, total } = useMemo(
    (): { tabs: ReactionTab[]; total: number } =>
      reactionTabs(reactions ?? [], {
        me: myEmail,
        nameOf: (e: string) => (members && (members as any)[e] ? memberDisplayName(members, e) : null),
      }),
    [reactions, myEmail, members],
  );
  // Zakładka zniknęła (ktoś cofnął ostatnią reakcję tym emoji) — „Wszystkie”.
  const current = active === "all" ? null : tabs.find((t) => t.emoji === active) ?? null;
  const rows = current
    ? current.people.map((p) => ({ ...p, emoji: current.emoji }))
    : tabs.flatMap((t) => t.people.map((p) => ({ ...p, emoji: t.emoji })));
  const selected = current ? current.emoji : "all";

  // Ostatnia reakcja cofnięta — nie ma czego pokazać.
  useEffect(() => {
    if (visible && total === 0) onClose();
  }, [visible, total, onClose]);

  const tab = (key: string, label: string, count: number, a11y: string) => {
    const on = selected === key;
    return (
      <Pressable
        key={key}
        onPress={() => setActive(key)}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        accessibilityLabel={a11y}
        className="active:opacity-70"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 999,
          backgroundColor: on ? "#2A2312" : "#FFFFFF",
        }}
      >
        <Text style={{ fontSize: key === "all" ? 13 : 16, color: on ? "#FFFFFF" : "#2A2312", fontFamily: F.semibold }}>{label}</Text>
        <Text style={{ fontSize: 12, color: on ? "#FFFFFF" : "#6B6557", fontFamily: F.bold }}>{count}</Text>
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Tło jako osobna warstwa (nie rodzic treści) — przewijanie listy działa bez przechwytywania dotyku. */}
      <View style={{ flex: 1, backgroundColor: "rgba(12,10,9,0.35)", justifyContent: "flex-end" }}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Zamknij" style={StyleSheet.absoluteFill} />
        <View
          style={{
            backgroundColor: "#F6F4EE",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: 10,
            paddingBottom: Math.max(insets.bottom, 16) + 8,
            maxHeight: height * 0.75,
          }}
        >
          <View style={{ alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: "#E3DDD0", marginBottom: 12 }} />
          <Text accessibilityRole="header" style={{ fontSize: 17, color: "#2A2312", fontFamily: F.bold, paddingHorizontal: 22 }}>
            Reakcje
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            accessibilityRole="tablist"
            style={{ flexGrow: 0, marginTop: 12 }}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
          >
            {tab("all", "Wszystkie", total, `Wszystkie reakcje: ${total}`)}
            {tabs.map((t) => tab(t.emoji, t.emoji, t.people.length, `Reakcja ${t.emoji}: ${t.people.length}`))}
          </ScrollView>
          <ScrollView style={{ marginTop: 8 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}>
            {rows.map((p) => {
              const photo = memberPhotoUrl(members, p.email);
              const removable = p.me && !!onRemoveMine;
              const body = (
                <>
                  {photo ? (
                    <Image source={{ uri: photo }} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: "#ECE8DE" }} />
                  ) : (
                    <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: "#FFF1C2", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: "#8A6606", fontFamily: F.bold, fontSize: 13 }}>
                        {(members as any)?.[p.email] ? memberInitials(members, p.email) : p.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ fontSize: 15, color: "#2A2312", fontFamily: F.semibold }}>
                      {p.me ? "Ty" : p.name}
                    </Text>
                    {removable ? (
                      <Text numberOfLines={1} style={{ fontSize: 12, color: "#6B6557", fontFamily: F.medium, marginTop: 1 }}>
                        Dotknij, aby usunąć
                      </Text>
                    ) : null}
                  </View>
                  <Text style={{ fontSize: 22 }}>{p.emoji}</Text>
                </>
              );
              const rowStyle = { flexDirection: "row" as const, alignItems: "center" as const, gap: 12, paddingVertical: 9 };
              return removable ? (
                <Pressable
                  key={`${p.emoji}|${p.email}`}
                  onPress={() => onRemoveMine?.(p.emoji)}
                  accessibilityRole="button"
                  accessibilityLabel={`Twoja reakcja ${p.emoji}. Dotknij, aby usunąć`}
                  className="active:opacity-60"
                  style={rowStyle}
                >
                  {body}
                </Pressable>
              ) : (
                <View key={`${p.emoji}|${p.email}`} style={rowStyle} accessible accessibilityLabel={`${p.name}: ${p.emoji}`}>
                  {body}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};
