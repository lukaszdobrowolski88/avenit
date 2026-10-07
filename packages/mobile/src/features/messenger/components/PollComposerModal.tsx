import { useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { Plus, X } from "lucide-react-native";
import { DateField, TimeField, toYmd } from "../../../components/ui/DateField";
import type { PollMetadata } from "../api";

// Kompozytor ankiety (K7): pytanie, 2–10 opcji, „Wiele odpowiedzi”, „Anonimowa”, „Zamknij o…”.
// Zwraca pytanie (content) + metadata: pola ankiety wprost (zgodność ze starszymi wersjami)
// oraz metadata.poll (kontrakt serwera: termin zamknięcia, zastępowanie głosu, anonimowość).
interface Props {
  visible: boolean;
  onClose: () => void;
  // false = nie udało się wysłać (treść zostaje w oknie, rodzic pokazał błąd).
  onCreate: (question: string, metadata: PollMetadata & { poll: PollMetadata }) => Promise<boolean | void> | boolean | void;
}

const MAX_OPTIONS = 10;

const labelStyle = {
  fontSize: 11,
  color: "#6B6557",
  fontFamily: "Manrope_700Bold",
  textTransform: "uppercase" as const,
  letterSpacing: 0.4,
  marginBottom: 6,
  marginTop: 4,
} as const;

const inputStyle = {
  borderWidth: 1,
  borderColor: "#B5AD99",
  borderRadius: 12,
  paddingHorizontal: 14,
  paddingVertical: 12,
  fontSize: 15,
  color: "#2A2312",
  backgroundColor: "#FFFFFF",
  marginBottom: 12,
  fontFamily: "Manrope_500Medium",
} as const;

const ToggleRow = ({
  title,
  hint,
  value,
  onChange,
}: {
  title: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) => (
  <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 }}>
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 15, color: "#2A2312", fontFamily: "Manrope_600SemiBold" }}>{title}</Text>
      <Text style={{ fontSize: 12, color: "#6B6557", fontFamily: "Manrope_500Medium", marginTop: 1, lineHeight: 16 }}>{hint}</Text>
    </View>
    <Switch
      value={value}
      onValueChange={onChange}
      accessibilityLabel={title}
      trackColor={{ false: "#D3CCBC", true: "#2A2312" }}
      thumbColor="#ffffff"
      ios_backgroundColor="#D3CCBC"
    />
  </View>
);

const tomorrowEvening = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toYmd(d);
};

export const PollComposerModal = ({ visible, onClose, onCreate }: Props) => {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeDate, setCloseDate] = useState("");
  const [closeTime, setCloseTime] = useState("20:00");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setQuestion("");
    setOptions(["", ""]);
    setMultiple(false);
    setAnonymous(false);
    setClosing(false);
    setCloseDate("");
    setCloseTime("20:00");
  };
  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const valid = question.trim().length > 0 && options.filter((o) => o.trim()).length >= 2;

  const create = async () => {
    if (busy) return;
    const opts = options
      .map((t) => t.trim())
      .filter(Boolean)
      .map((text, i) => ({ id: `o${i + 1}`, text }));
    if (!question.trim() || opts.length < 2) return;
    let closesAt: string | null = null;
    if (closing) {
      const at = closeDate && closeTime ? new Date(`${closeDate}T${closeTime}:00`) : null;
      if (!at || !Number.isFinite(at.getTime())) {
        Alert.alert("Wybierz termin zamknięcia", "Podaj dzień i godzinę, o której ankieta ma się zamknąć, albo wyłącz „Zamknij o…”.");
        return;
      }
      if (at.getTime() <= Date.now() + 60 * 1000) {
        Alert.alert("Termin już minął", "Ankieta może zamknąć się najwcześniej za kilka minut. Wybierz późniejszą godzinę.");
        return;
      }
      closesAt = at.toISOString();
    }
    const poll: PollMetadata = { question: question.trim(), options: opts, multiple, anonymous, closes_at: closesAt };
    setBusy(true);
    try {
      const ok = await onCreate(poll.question, { ...poll, poll });
      if (ok !== false) reset();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(12,10,9,0.35)", justifyContent: "flex-end" }}
        onPress={close}
      >
        <Pressable
          style={{
            backgroundColor: "#F6F4EE",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 20,
            paddingBottom: 32,
            maxHeight: "92%",
          }}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <Text style={{ fontSize: 18, color: "#2A2312", fontFamily: "Manrope_700Bold" }}>Nowa ankieta</Text>
            <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel="Zamknij">
              <X size={20} color="#6B6557" />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={labelStyle}>Pytanie</Text>
            <TextInput
              style={inputStyle}
              value={question}
              onChangeText={setQuestion}
              placeholder="O co pytasz?"
              placeholderTextColor="#6E685A"
              accessibilityLabel="Pytanie ankiety"
            />

            <Text style={labelStyle}>Odpowiedzi</Text>
            {options.map((o, i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <TextInput
                  style={[inputStyle, { flex: 1, marginBottom: 0 }]}
                  value={o}
                  placeholder={`Odpowiedź ${i + 1}`}
                  placeholderTextColor="#6E685A"
                  accessibilityLabel={`Odpowiedź ${i + 1}`}
                  onChangeText={(t) => setOptions((prev) => prev.map((x, j) => (j === i ? t : x)))}
                />
                {options.length > 2 ? (
                  <Pressable
                    onPress={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Usuń odpowiedź ${i + 1}`}
                  >
                    <X size={18} color="#6E685A" />
                  </Pressable>
                ) : null}
              </View>
            ))}
            {options.length < MAX_OPTIONS ? (
              <Pressable
                onPress={() => setOptions((prev) => [...prev, ""])}
                className="active:opacity-70"
                style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8 }}
              >
                <Plus size={16} color="#8A6606" />
                <Text style={{ color: "#8A6606", fontFamily: "Manrope_600SemiBold" }}>Dodaj odpowiedź</Text>
              </Pressable>
            ) : null}

            <View style={{ marginTop: 6, borderTopWidth: 1, borderTopColor: "#E6E1D5", paddingTop: 4 }}>
              <ToggleRow
                title="Wiele odpowiedzi"
                hint="Można zaznaczyć więcej niż jedną odpowiedź."
                value={multiple}
                onChange={setMultiple}
              />
              <ToggleRow
                title="Anonimowa"
                hint="Widać tylko liczbę głosów — nikt nie zobaczy, kto jak głosował."
                value={anonymous}
                onChange={setAnonymous}
              />
              <ToggleRow
                title="Zamknij o…"
                hint="Po tym terminie głosowanie się kończy, wyniki zostają."
                value={closing}
                onChange={(v) => {
                  setClosing(v);
                  if (v && !closeDate) setCloseDate(tomorrowEvening());
                }}
              />
              {closing ? (
                <View style={{ gap: 8, marginTop: 2, marginBottom: 6 }}>
                  <DateField value={closeDate} onChange={setCloseDate} placeholder="Dzień zamknięcia" />
                  <TimeField value={closeTime} onChange={setCloseTime} title="Godzina zamknięcia" />
                </View>
              ) : null}
            </View>

            <Pressable
              onPress={create}
              disabled={!valid || busy}
              accessibilityRole="button"
              accessibilityState={{ disabled: !valid || busy }}
              className="active:opacity-80"
              style={{
                marginTop: 12,
                backgroundColor: "#2A2312",
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: "center",
                opacity: valid && !busy ? 1 : 0.5,
              }}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: "#fff", fontSize: 15, fontFamily: "Manrope_700Bold" }}>Utwórz ankietę</Text>
              )}
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};
