import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronRight, type LucideIcon } from "lucide-react-native";

// „Więcej” w nagłówku Komunikatora: Moje przypomnienia, Zapisane wiadomości, Zaplanuj spotkanie.
// Wcześniej cztery okrągłe przyciski obok tytułu ściskały go do „Komunik/ator” — w nagłówku
// zostają dwa (Więcej + Nowa rozmowa), jak na innych ekranach. Arkusz od dołu jak „Wycisz”.
export interface MoreAction {
  key: string;
  label: string;
  hint?: string;
  Icon: LucideIcon;
  onPress: () => void;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  actions: MoreAction[];
}

export const MessengerMoreSheet = ({ visible, onClose, actions }: Props) => {
  const insets = useSafeAreaInsets();
  const pick = (fn: () => void) => {
    onClose();
    setTimeout(fn, 50);
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(12,10,9,0.35)", justifyContent: "flex-end" }}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Zamknij" style={StyleSheet.absoluteFill} />
        <View
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
          <Text accessibilityRole="header" style={{ fontSize: 17, color: "#2A2312", fontFamily: "Manrope_700Bold", paddingHorizontal: 6, marginBottom: 8 }}>
            Komunikator
          </Text>
          {actions.map(({ key, label, hint, Icon, onPress }) => (
            <Pressable
              key={key}
              onPress={() => pick(onPress)}
              accessibilityRole="button"
              accessibilityLabel={label}
              className="active:opacity-70"
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingHorizontal: 12,
                paddingVertical: 12,
                borderRadius: 16,
                backgroundColor: "#FFFFFF",
                marginTop: 8,
              }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#F6F4EE", alignItems: "center", justifyContent: "center" }}>
                <Icon size={18} color="#2A2312" strokeWidth={2.2} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 15, color: "#2A2312", fontFamily: "Manrope_600SemiBold" }}>{label}</Text>
                {hint ? (
                  <Text style={{ fontSize: 12, color: "#6B6557", fontFamily: "Manrope_500Medium", marginTop: 1 }}>{hint}</Text>
                ) : null}
              </View>
              <ChevronRight size={18} color="#B5AD99" />
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
};
