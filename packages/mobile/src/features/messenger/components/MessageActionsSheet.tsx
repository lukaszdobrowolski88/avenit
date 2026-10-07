import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import {
  Ban,
  Eye,
  Flag,
  Languages,
  Share2,
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
  /** Usunięcie własnej wiadomości (uprawnienie res:messages:update). */
  canDelete?: boolean;
  /** Przypinanie wiadomości — jak web: administrator rozmowy. */
  canPin?: boolean;
  /** Odpowiedź — tylko gdy mogę pisać w tej rozmowie. */
  canReply?: boolean;
  /** Przekazanie — jak web: tylko zwykłe wiadomości (bez ankiet, wydarzeń, próśb o modlitwę). */
  canForward?: boolean;
  isPinned: boolean;
  onPickReaction: (emoji: string) => void;
  onReply: () => void;
  onForward: () => void;
  onCopy: () => void;
  onTogglePin: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** K3: „Przetłumacz” (etykieta zależna od stanu: przetłumacz / pokaż tłumaczenie / pokaż oryginał). */
  translateLabel?: string | null;
  translating?: boolean;
  onTranslate?: () => void;
  /** K6: „Kto przeczytał” (moje wiadomości w grupach i kanałach). */
  onReadBy?: () => void;
  /** K10: zgłoszenie wiadomości i blokada nadawcy (cudze wiadomości). */
  onReport?: () => void;
  blockLabel?: string | null;
  onToggleBlock?: () => void;
}

interface ActionRow {
  key: string;
  label: string;
  Icon: LucideIcon;
  onPress: () => void;
  destructive?: boolean;
  busy?: boolean;
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
    backgroundColor: "#F6F4EE",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 14,
    shadowColor: "#2A2312",
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
    backgroundColor: "#F6F4EE",
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#2A2312",
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
    borderTopColor: "#E3DDD0",
  },
  rowIcon: {
    width: 24,
    alignItems: "center",
    marginRight: 16,
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    color: "#2A2312",
    fontFamily: "Manrope_600SemiBold",
    letterSpacing: -0.2,
  },
  rowLabelDestructive: {
    color: "#B42318",
  },
});

export const MessageActionsSheet = ({
  visible,
  onClose,
  mine,
  canEdit,
  canDelete,
  canPin = true,
  canReply = true,
  canForward = true,
  isPinned,
  onPickReaction,
  onReply,
  onForward,
  onCopy,
  onTogglePin,
  onEdit,
  onDelete,
  translateLabel,
  translating,
  onTranslate,
  onReadBy,
  onReport,
  blockLabel,
  onToggleBlock,
}: Props) => {
  const close = onClose;
  const wrap = (fn: () => void) => () => {
    close();
    setTimeout(fn, 50);
  };

  const actions: ActionRow[] = [
    ...(canReply ? [{ key: "reply", label: "Odpowiedz", Icon: CornerUpLeft, onPress: wrap(onReply) }] : []),
    ...(canForward ? [{ key: "forward", label: "Przekaż", Icon: Forward, onPress: wrap(onForward) }] : []),
    { key: "copy", label: "Udostępnij tekst", Icon: Share2, onPress: wrap(onCopy) },
    ...(onTranslate && translateLabel
      ? [{ key: "translate", label: translateLabel, Icon: Languages, onPress: wrap(onTranslate), busy: !!translating }]
      : []),
    ...(onReadBy ? [{ key: "readby", label: "Kto przeczytał", Icon: Eye, onPress: wrap(onReadBy) }] : []),
  ];
  if (canPin) {
    actions.push({
      key: "pin",
      label: isPinned ? "Odepnij" : "Przypnij",
      Icon: isPinned ? PinOff : Pin,
      onPress: wrap(onTogglePin),
    });
  }
  if (canEdit) {
    actions.push({ key: "edit", label: "Edytuj", Icon: Pencil, onPress: wrap(onEdit) });
  }
  if (mine && (canDelete ?? true)) {
    actions.push({
      key: "delete",
      label: "Usuń",
      Icon: Trash2,
      onPress: wrap(onDelete),
      destructive: true,
    });
  }
  if (!mine && onReport) {
    actions.push({ key: "report", label: "Zgłoś wiadomość", Icon: Flag, onPress: wrap(onReport), destructive: true });
  }
  if (!mine && onToggleBlock && blockLabel) {
    actions.push({ key: "block", label: blockLabel, Icon: Ban, onPress: wrap(onToggleBlock), destructive: true });
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
                    android_ripple={{ color: "#F1EEE6" }}
                    style={[styles.row, i > 0 && styles.rowDivider]}
                  >
                    <View style={styles.rowIcon}>
                      <Icon
                        size={20}
                        color={a.destructive ? "#B42318" : "#2A2312"}
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
                    {a.busy ? <ActivityIndicator size="small" color="#6E685A" /> : null}
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
