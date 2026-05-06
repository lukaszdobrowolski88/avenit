import { Modal, Pressable, Text, View } from "react-native";
import { REACTION_EMOJIS } from "../api";

interface Props {
  visible: boolean;
  onClose: () => void;
  onPick: (emoji: string) => void;
}

export const ReactionPicker = ({ visible, onClose, onPick }: Props) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: "rgba(15,23,42,0.45)",
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 24,
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            backgroundColor: "#ffffff",
            borderRadius: 999,
            paddingHorizontal: 12,
            paddingVertical: 10,
            shadowColor: "#0f172a",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.18,
            shadowRadius: 24,
            elevation: 12,
          }}
        >
          {REACTION_EMOJIS.map((e) => (
            <Pressable
              key={e}
              onPress={() => {
                onPick(e);
                onClose();
              }}
              hitSlop={6}
              style={({ pressed }) => ({
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 999,
                transform: [{ scale: pressed ? 1.2 : 1 }],
              })}
            >
              <Text style={{ fontSize: 28 }}>{e}</Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
};
