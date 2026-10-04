import { Pressable, Text, View } from "react-native";
import type { PrayerMetadata } from "../api";

// Prośba o modlitwę w czacie (spec §2). „🙏 Modlę się" = toggle prayer_responses.
interface Props {
  metadata: PrayerMetadata | null | undefined;
  content: string;
  count: number;
  mine: boolean; // czy JA odpowiedziałem „modlę się"
  bubbleMine: boolean; // czy to moja wiadomość (kolor bąbelka)
  onToggle: () => void;
}

export const PrayerCard = ({ metadata, content, count, mine, bubbleMine, onToggle }: Props) => {
  const title = metadata?.title || "Prośba o modlitwę";
  const fg = bubbleMine ? "#ffffff" : "#2A2312";
  const sub = bubbleMine ? "#FFF1C2" : "#2A2312";
  return (
    <View style={{ minWidth: 220, maxWidth: 300 }}>
      <Text style={{ fontSize: 12, color: sub, fontFamily: "Manrope_700Bold", marginBottom: 2 }}>
        🙏 Prośba o modlitwę
      </Text>
      <Text style={{ fontSize: 15, color: fg, fontFamily: "Manrope_600SemiBold", marginBottom: content ? 2 : 8 }}>
        {title}
      </Text>
      {content ? (
        <Text style={{ fontSize: 14, color: bubbleMine ? "#F3E3B0" : "#4A463E", fontFamily: "Manrope_400Regular", marginBottom: 8 }}>
          {content}
        </Text>
      ) : null}
      <Pressable
        onPress={onToggle}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          paddingVertical: 9,
          borderRadius: 12,
          backgroundColor: mine ? "#2A2312" : bubbleMine ? "rgba(255,255,255,0.2)" : "#ECE8DE",
        }}
      >
        <Text style={{ fontSize: 14, color: mine ? "#ffffff" : bubbleMine ? "#ffffff" : "#2A2312", fontFamily: "Manrope_700Bold" }}>
          🙏 Modlę się{count > 0 ? ` · ${count}` : ""}
        </Text>
      </Pressable>
    </View>
  );
};
