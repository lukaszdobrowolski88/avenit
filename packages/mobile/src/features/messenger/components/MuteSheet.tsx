import { Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bell, BellOff, Clock, Moon, Sunrise } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import type { MuteChoice } from "../api";
import { mutedUntilLabel } from "../logic";

// K4 — „Wycisz”: 1 godzina / 8 godzin / do jutra 8:00 / zawsze; przy wyciszonej rozmowie
// także „Włącz powiadomienia”. Arkusz od dołu jak menu „+” w polu pisania.
interface Props {
  visible: boolean;
  onClose: () => void;
  /** Rozmowa wyciszona teraz (muted albo muted_until w przyszłości). */
  muted: boolean;
  mutedUntil: string | null;
  title?: string;
  onPick: (choice: MuteChoice) => void;
}

export const MuteSheet = ({ visible, onClose, muted, mutedUntil, title, onPick }: Props) => {
  const insets = useSafeAreaInsets();
  const until = mutedUntilLabel(mutedUntil);
  const rows: { key: MuteChoice; label: string; Icon: LucideIcon }[] = [
    { key: "1h", label: "Na 1 godzinę", Icon: Clock },
    { key: "8h", label: "Na 8 godzin", Icon: Moon },
    { key: "tomorrow", label: "Do jutra, 8:00", Icon: Sunrise },
    { key: "always", label: "Zawsze", Icon: BellOff },
  ];
  const pick = (c: MuteChoice) => {
    onClose();
    setTimeout(() => onPick(c), 50);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(12,10,9,0.35)", justifyContent: "flex-end" }}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: "#F6F4EE",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: Math.max(insets.bottom, 16) + 12,
          }}
        >
          <View style={{ alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: "#E3DDD0", marginBottom: 12 }} />
          <Text style={{ fontSize: 17, color: "#2A2312", fontFamily: "Manrope_700Bold", paddingHorizontal: 6 }}>
            {muted ? "Rozmowa wyciszona" : "Wycisz powiadomienia"}
          </Text>
          <Text style={{ fontSize: 13, color: "#6B6557", fontFamily: "Manrope_500Medium", paddingHorizontal: 6, marginTop: 2, marginBottom: 8, lineHeight: 18 }}>
            {muted
              ? until
                ? `Bez powiadomień ${until}. Wzmianki o Tobie nadal dotrą.`
                : "Bez powiadomień, dopóki ich nie włączysz. Wzmianki o Tobie nadal dotrą."
              : title
                ? `Jak długo nie powiadamiać o wiadomościach z „${title}”?`
                : "Jak długo nie powiadamiać o nowych wiadomościach?"}
          </Text>

          {muted ? (
            <Pressable
              onPress={() => pick("off")}
              accessibilityRole="button"
              className="active:opacity-70"
              style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, paddingHorizontal: 6 }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#FFF1C2", alignItems: "center", justifyContent: "center" }}>
                <Bell size={19} color="#8A6606" />
              </View>
              <Text style={{ fontSize: 16, color: "#2A2312", fontFamily: "Manrope_700Bold" }}>Włącz powiadomienia</Text>
            </Pressable>
          ) : null}

          {rows.map(({ key, label, Icon }) => (
            <Pressable
              key={key}
              onPress={() => pick(key)}
              accessibilityRole="button"
              accessibilityLabel={`Wycisz: ${label.toLowerCase()}`}
              className="active:opacity-70"
              style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, paddingHorizontal: 6 }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#ECE8DE", alignItems: "center", justifyContent: "center" }}>
                <Icon size={19} color="#2A2312" />
              </View>
              <Text style={{ fontSize: 16, color: "#2A2312", fontFamily: "Manrope_600SemiBold" }}>{label}</Text>
            </Pressable>
          ))}

          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            className="active:opacity-70"
            style={{
              marginTop: 8,
              paddingVertical: 13,
              borderRadius: 14,
              backgroundColor: "#F1EEE6",
              borderWidth: 1,
              borderColor: "#E6E1D5",
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 15, color: "#6B6557", fontFamily: "Manrope_600SemiBold" }}>Anuluj</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
};
