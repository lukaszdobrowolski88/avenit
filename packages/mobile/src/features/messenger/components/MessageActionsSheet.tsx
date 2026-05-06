import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import {
  Copy,
  CornerUpLeft,
  Forward,
  Pencil,
  Pin,
  PinOff,
  Trash2,
  type LucideIcon,
} from "lucide-react-native";
import { REACTION_EMOJIS } from "../api";

interface Props {
  visible: boolean;
  onClose: () => void;
  mine: boolean;
  canEdit: boolean;
  isPinned: boolean;
  onPickReaction: (emoji: string) => void;
  onReply: () => void;
  onForward: () => void;
  onCopy: () => void;
  onTogglePin: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

interface ActionRow {
  key: string;
  label: string;
  Icon: LucideIcon;
  onPress: () => void;
  destructive?: boolean;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
  },
  contentWrapper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  contentInner: {
    width: "100%",
    maxWidth: 360,
  },
  reactionsBar: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 14,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 22,
    elevation: 14,
  },
  reactionPress: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  emoji: {
    fontSize: 28,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    paddingHorizontal: 18,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e7e5e4",
  },
  rowIcon: {
    width: 24,
    alignItems: "center",
    marginRight: 16,
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    color: "#0c0a09",
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.2,
  },
  rowLabelDestructive: {
    color: "#ef4444",
  },
});

export const MessageActionsSheet = ({
  visible,
  onClose,
  mine,
  canEdit,
  isPinned,
  onPickReaction,
  onReply,
  onForward,
  onCopy,
  onTogglePin,
  onEdit,
  onDelete,
}: Props) => {
  const close = onClose;
  const wrap = (fn: () => void) => () => {
    close();
    setTimeout(fn, 50);
  };

  const actions: ActionRow[] = [
    { key: "reply", label: "Odpowiedz", Icon: CornerUpLeft, onPress: wrap(onReply) },
    { key: "forward", label: "Przekaż", Icon: Forward, onPress: wrap(onForward) },
    { key: "copy", label: "Kopiuj", Icon: Copy, onPress: wrap(onCopy) },
    {
      key: "pin",
      label: isPinned ? "Odepnij" : "Przypnij",
      Icon: isPinned ? PinOff : Pin,
      onPress: wrap(onTogglePin),
    },
  ];
  if (canEdit) {
    actions.push({ key: "edit", label: "Edytuj", Icon: Pencil, onPress: wrap(onEdit) });
  }
  if (mine) {
    actions.push({
      key: "delete",
      label: "Usuń",
      Icon: Trash2,
      onPress: wrap(onDelete),
      destructive: true,
    });
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={close}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />

        <View pointerEvents="box-none" style={styles.contentWrapper}>
          <View style={styles.contentInner}>
            {/* Pasek reakcji */}
            <View style={styles.reactionsBar}>
              {REACTION_EMOJIS.map((e) => (
                <Pressable
                  key={e}
                  onPress={() => {
                    close();
                    setTimeout(() => onPickReaction(e), 30);
                  }}
                  hitSlop={4}
                  style={styles.reactionPress}
                >
                  <Text style={styles.emoji}>{e}</Text>
                </Pressable>
              ))}
            </View>

            {/* Karta akcji */}
            <View style={styles.card}>
              {actions.map((a, i) => {
                const Icon = a.Icon;
                return (
                  <Pressable
                    key={a.key}
                    onPress={a.onPress}
                    android_ripple={{ color: "#fafaf9" }}
                    style={[styles.row, i > 0 && styles.rowDivider]}
                  >
                    <View style={styles.rowIcon}>
                      <Icon
                        size={20}
                        color={a.destructive ? "#ef4444" : "#1c1917"}
                        strokeWidth={2}
                      />
                    </View>
                    <Text
                      style={[
                        styles.rowLabel,
                        a.destructive && styles.rowLabelDestructive,
                      ]}
                    >
                      {a.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};
