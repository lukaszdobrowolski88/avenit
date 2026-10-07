import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { TimeField } from "../../../components/ui/DateField";
import { showError } from "../../../lib/errors";
import { toast } from "../../../lib/toast";
import { useQuietHours, useSaveQuietHours } from "../plus";

// K4 — ciche godziny czatu (Konto): od–do, zapis do push_user_preferences (mój wiersz).
// W tych godzinach serwer nie wysyła powiadomień z czatu — poza wzmiankami o mnie.
interface Props {
  visible: boolean;
  onClose: () => void;
  email: string | null;
}

export const quietHoursSummary = (q: { enabled: boolean; start: string; end: string } | undefined | null) =>
  q?.enabled ? `${q.start}–${q.end}` : "Wyłączone — powiadomienia z czatu o każdej porze";

export const ChatQuietHoursSheet = ({ visible, onClose, email }: Props) => {
  const insets = useSafeAreaInsets();
  const query = useQuietHours(email);
  const save = useSaveQuietHours(email);
  const [enabled, setEnabled] = useState(false);
  const [start, setStart] = useState("22:00");
  const [end, setEnd] = useState("07:00");

  useEffect(() => {
    if (!visible || !query.data) return;
    setEnabled(query.data.enabled);
    setStart(query.data.start || "22:00");
    setEnd(query.data.end || "07:00");
  }, [visible, query.data]);

  const close = () => {
    if (save.isPending) return;
    onClose();
  };

  const submit = () => {
    if (save.isPending) return;
    if (enabled && start === end) {
      showError("Sprawdź godziny", "Początek i koniec cichych godzin muszą się różnić.");
      return;
    }
    save.mutate(
      { enabled, start, end },
      {
        onSuccess: () => {
          toast.success(enabled ? `Ciche godziny: ${start}–${end}` : "Ciche godziny wyłączone");
          onClose();
        },
        onError: (e) => showError("Nie udało się zapisać cichych godzin", e, "Spróbuj ponownie."),
      },
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable onPress={close} style={{ flex: 1, backgroundColor: "rgba(12,10,9,0.35)", justifyContent: "flex-end" }}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: "#F6F4EE",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 20,
            paddingBottom: Math.max(insets.bottom, 16) + 12,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 18, color: "#2A2312", fontFamily: "Manrope_700Bold" }}>Ciche godziny czatu</Text>
            <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel="Zamknij">
              <X size={20} color="#6B6557" />
            </Pressable>
          </View>
          <Text style={{ marginTop: 6, fontSize: 13, color: "#6B6557", fontFamily: "Manrope_500Medium", lineHeight: 18 }}>
            W tych godzinach nie dostaniesz powiadomień o wiadomościach z Komunikatora. Wzmianki o Tobie (@) przyjdą normalnie.
          </Text>

          {query.isLoading ? (
            <View style={{ paddingVertical: 28 }}>
              <ActivityIndicator color="#2A2312" />
            </View>
          ) : (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14, paddingVertical: 6 }}>
                <Text style={{ flex: 1, fontSize: 15, color: "#2A2312", fontFamily: "Manrope_600SemiBold" }}>Włącz ciche godziny</Text>
                <Switch
                  value={enabled}
                  onValueChange={setEnabled}
                  accessibilityLabel="Włącz ciche godziny"
                  trackColor={{ false: "#D3CCBC", true: "#2A2312" }}
                  thumbColor="#ffffff"
                  ios_backgroundColor="#D3CCBC"
                />
              </View>
              {enabled ? (
                <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ fontSize: 12, color: "#6B6557", fontFamily: "Manrope_700Bold" }}>Od</Text>
                    <TimeField value={start} onChange={setStart} title="Początek cichych godzin" />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ fontSize: 12, color: "#6B6557", fontFamily: "Manrope_700Bold" }}>Do</Text>
                    <TimeField value={end} onChange={setEnd} title="Koniec cichych godzin" />
                  </View>
                </View>
              ) : null}
              {enabled ? (
                <Text style={{ marginTop: 8, fontSize: 12, color: "#6E685A", fontFamily: "Manrope_500Medium", lineHeight: 17 }}>
                  {start > end ? `Codziennie od ${start} do ${end} następnego dnia.` : `Codziennie od ${start} do ${end}.`}
                </Text>
              ) : null}

              <Pressable
                onPress={submit}
                disabled={save.isPending}
                accessibilityRole="button"
                className="active:opacity-80"
                style={{
                  marginTop: 18,
                  height: 50,
                  borderRadius: 14,
                  backgroundColor: "#2A2312",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: save.isPending ? 0.6 : 1,
                }}
              >
                {save.isPending ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={{ color: "#ffffff", fontSize: 15, fontFamily: "Manrope_700Bold" }}>Zapisz</Text>
                )}
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};
