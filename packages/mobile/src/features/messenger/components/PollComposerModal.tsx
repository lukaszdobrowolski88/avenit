import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Plus, X } from "lucide-react-native";
import type { PollMetadata } from "../api";

// Kompozytor ankiety (spec §2). Zwraca pytanie (content) + metadata ankiety.
interface Props {
  visible: boolean;
  onClose: () => void;
  onCreate: (question: string, metadata: PollMetadata) => void;
}

const labelStyle = {
  fontSize: 11,
  color: "#78716c",
  fontFamily: "Inter_700Bold",
  textTransform: "uppercase" as const,
  letterSpacing: 0.4,
  marginBottom: 6,
  marginTop: 4,
} as const;

const inputStyle = {
  borderWidth: 1,
  borderColor: "#eef0f3",
  borderRadius: 12,
  paddingHorizontal: 14,
  paddingVertical: 12,
  fontSize: 15,
  color: "#0c0a09",
  backgroundColor: "#fafaf9",
  marginBottom: 12,
  fontFamily: "Inter_500Medium",
} as const;

export const PollComposerModal = ({ visible, onClose, onCreate }: Props) => {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [multiple, setMultiple] = useState(false);

  const reset = () => {
    setQuestion("");
    setOptions(["", ""]);
    setMultiple(false);
  };
  const close = () => {
    reset();
    onClose();
  };

  const valid = question.trim().length > 0 && options.filter((o) => o.trim()).length >= 2;

  const create = () => {
    const opts = options
      .map((t) => t.trim())
      .filter(Boolean)
      .map((text, i) => ({ id: `o${i + 1}`, text }));
    if (!question.trim() || opts.length < 2) return;
    onCreate(question.trim(), {
      question: question.trim(),
      options: opts,
      multiple,
      closes_at: null,
    });
    reset();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(15,23,42,0.45)", justifyContent: "flex-end" }}
        onPress={close}
      >
        <Pressable
          style={{
            backgroundColor: "#ffffff",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 20,
            paddingBottom: 32,
            maxHeight: "88%",
          }}
          onPress={(e) => e.stopPropagation()}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 14,
            }}
          >
            <Text style={{ fontSize: 18, color: "#0c0a09", fontFamily: "Inter_700Bold" }}>
              📊 Nowa ankieta
            </Text>
            <Pressable onPress={close} hitSlop={10}>
              <X size={20} color="#78716c" />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={labelStyle}>Pytanie</Text>
            <TextInput
              style={inputStyle}
              value={question}
              onChangeText={setQuestion}
              placeholder="O co pytasz?"
              placeholderTextColor="#a8a29e"
            />

            <Text style={labelStyle}>Opcje</Text>
            {options.map((o, i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <TextInput
                  style={[inputStyle, { flex: 1, marginBottom: 0 }]}
                  value={o}
                  placeholder={`Opcja ${i + 1}`}
                  placeholderTextColor="#a8a29e"
                  onChangeText={(t) =>
                    setOptions((prev) => prev.map((x, j) => (j === i ? t : x)))
                  }
                />
                {options.length > 2 ? (
                  <Pressable onPress={() => setOptions((prev) => prev.filter((_, j) => j !== i))} hitSlop={8}>
                    <X size={18} color="#a8a29e" />
                  </Pressable>
                ) : null}
              </View>
            ))}
            {options.length < 6 ? (
              <Pressable
                onPress={() => setOptions((prev) => [...prev, ""])}
                style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8 }}
              >
                <Plus size={16} color="#ec4899" />
                <Text style={{ color: "#be185d", fontFamily: "Inter_600SemiBold" }}>Dodaj opcję</Text>
              </Pressable>
            ) : null}

            <Pressable
              onPress={() => setMultiple((v) => !v)}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  borderWidth: 2,
                  borderColor: multiple ? "#ec4899" : "#cbd5e1",
                  backgroundColor: multiple ? "#ec4899" : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {multiple ? <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>✓</Text> : null}
              </View>
              <Text style={{ color: "#334155", fontFamily: "Inter_500Medium" }}>Wielokrotny wybór</Text>
            </Pressable>

            <Pressable
              onPress={create}
              disabled={!valid}
              style={{
                marginTop: 10,
                backgroundColor: "#ec4899",
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: "center",
                opacity: valid ? 1 : 0.5,
              }}
            >
              <Text style={{ color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" }}>Utwórz ankietę</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};
