import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, X } from "lucide-react-native";
import { REPORT_REASONS } from "../plus";
import { previewText } from "../logic";
import type { MessageRow } from "../api";

// K10 — „Zgłoś wiadomość”: powód (lista + opcjonalny opis). Zgłoszenie trafia do osób, które
// rozpatrują zgłoszenia w Komunikatorze na webie. Okno zamyka się dopiero po udanym zapisie.
// Używane też dla innych treści (ściana modlitwy) — wtedy title/preview/note zamiast wiadomości.
interface Props {
  visible: boolean;
  message: MessageRow | null;
  senderName: string;
  title?: string;
  /** Cytat zgłaszanej treści (gdy to nie wiadomość). */
  preview?: string | null;
  note?: string;
  busy: boolean;
  onClose: () => void;
  /** false = błąd (pokazany przez rodzica), okno zostaje. */
  onSubmit: (reason: string) => Promise<boolean>;
}

export const ReportModal = ({ visible, message, senderName, title, preview, note, busy, onClose, onSubmit }: Props) => {
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");

  useEffect(() => {
    if (visible) {
      setReason("");
      setDetails("");
    }
  }, [visible, message?.id, preview]);

  const label = REPORT_REASONS.find((r) => r.key === reason)?.label ?? "";
  const canSend = !!reason && (reason !== "other" || details.trim().length > 2) && !busy;

  const submit = async () => {
    if (!canSend) return;
    const text = [label, details.trim()].filter(Boolean).join(" — ");
    const ok = await onSubmit(text);
    if (ok) onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => !busy && onClose()}>
      <Pressable
        onPress={() => !busy && onClose()}
        style={{ flex: 1, backgroundColor: "rgba(12,10,9,0.35)", justifyContent: "flex-end" }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: "#F6F4EE",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 20,
            paddingBottom: Math.max(insets.bottom, 16) + 12,
            maxHeight: "88%",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 18, color: "#2A2312", fontFamily: "Manrope_700Bold" }}>{title ?? "Zgłoś wiadomość"}</Text>
            <Pressable onPress={onClose} disabled={busy} hitSlop={10} accessibilityRole="button" accessibilityLabel="Zamknij">
              <X size={20} color="#6B6557" />
            </Pressable>
          </View>
          {message || preview ? (
            <Text numberOfLines={2} style={{ marginTop: 6, fontSize: 13, color: "#6B6557", fontFamily: "Manrope_500Medium", lineHeight: 18 }}>
              {senderName}: „{preview ?? ((message ? previewText(message) : "") || "Wiadomość")}”
            </Text>
          ) : null}
          <Text style={{ marginTop: 10, fontSize: 13, color: "#4A463E", fontFamily: "Manrope_500Medium", lineHeight: 18 }}>
            {note ?? "Zgłoszenie zobaczą osoby odpowiedzialne za Komunikator. Autor nie dowie się, kto zgłosił."}
          </Text>

          <ScrollView keyboardShouldPersistTaps="handled" style={{ marginTop: 10 }}>
            {REPORT_REASONS.map((r) => {
              const on = reason === r.key;
              return (
                <Pressable
                  key={r.key}
                  onPress={() => setReason(r.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  className="active:opacity-70"
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingVertical: 12,
                    paddingHorizontal: 12,
                    borderRadius: 14,
                    marginBottom: 6,
                    backgroundColor: on ? "#FFF1C2" : "#FFFFFF",
                    borderWidth: 1,
                    borderColor: on ? "#F3E3B0" : "#E6E1D5",
                  }}
                >
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      borderWidth: on ? 0 : 2,
                      borderColor: "#D3CCBC",
                      backgroundColor: on ? "#2A2312" : "transparent",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {on ? <Check size={13} color="#ffffff" strokeWidth={3} /> : null}
                  </View>
                  <Text style={{ flex: 1, fontSize: 15, color: "#2A2312", fontFamily: on ? "Manrope_700Bold" : "Manrope_500Medium" }}>
                    {r.label}
                  </Text>
                </Pressable>
              );
            })}
            <TextInput
              value={details}
              onChangeText={setDetails}
              placeholder={reason === "other" ? "Opisz krótko, co jest nie tak (wymagane)" : "Dodatkowe informacje (opcjonalnie)"}
              placeholderTextColor="#6E685A"
              multiline
              maxLength={500}
              accessibilityLabel="Opis zgłoszenia"
              style={{
                minHeight: 70,
                marginTop: 4,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "#B5AD99",
                backgroundColor: "#FFFFFF",
                paddingHorizontal: 14,
                paddingVertical: 10,
                fontSize: 15,
                color: "#2A2312",
                fontFamily: "Manrope_500Medium",
                textAlignVertical: "top",
              }}
            />
            <Pressable
              onPress={submit}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSend }}
              className="active:opacity-80"
              style={{
                marginTop: 14,
                height: 50,
                borderRadius: 14,
                backgroundColor: "#B42318",
                alignItems: "center",
                justifyContent: "center",
                opacity: canSend ? 1 : 0.45,
              }}
            >
              {busy ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={{ color: "#ffffff", fontSize: 15, fontFamily: "Manrope_700Bold" }}>Wyślij zgłoszenie</Text>
              )}
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};
