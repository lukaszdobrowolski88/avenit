import { useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, Text, TextInput, View } from "react-native";
import {
  BarChart3,
  Calendar,
  Camera,
  CornerUpLeft,
  Image as ImageIcon,
  Mic,
  Pencil,
  Plus,
  Send,
  X,
} from "lucide-react-native";
import { GradientIcon } from "../../../components/ui/GradientIcon";
import type { MemberLite, MemberMap, MessageAttachment, MessageRow } from "../api";
import { memberDisplayName } from "../api";
import { AudioRecorder } from "./AudioRecorder";

interface Props {
  text: string;
  onChangeText: (t: string) => void;
  onSend: () => void;
  sending: boolean;
  pendingAttachment: MessageAttachment | null;
  onClearAttachment: () => void;
  onPickImage: () => void;
  onTakePhoto: () => void;
  uploading: boolean;
  replyTo: MessageRow | null;
  onClearReply: () => void;
  editing: boolean;
  members: MemberMap;
  onSendVoice?: (uri: string, mime: string, durationMs: number) => Promise<void>;
  // Kanał ogłoszeń (spec §5) + kompozytor ankiety (spec §2).
  canPost?: boolean;
  onCreatePoll?: () => void;
  onShareEvent?: () => void;
}

export const ComposerBar = ({
  text,
  onChangeText,
  onSend,
  sending,
  pendingAttachment,
  onClearAttachment,
  onPickImage,
  onTakePhoto,
  uploading,
  replyTo,
  onClearReply,
  editing,
  members,
  onSendVoice,
  canPost = true,
  onCreatePoll,
  onShareEvent,
}: Props) => {
  // Kanał ogłoszeń: bez prawa pisania — ukryj kompozytor, pokaż info (spec §5).
  if (!canPost) {
    return (
      <View
        style={{
          backgroundColor: "#F6F4EE",
          borderTopWidth: 1,
          borderTopColor: "#E6E1D5",
          padding: 16,
          alignItems: "center",
        }}
      >
        <Text style={{ fontSize: 13, color: "#7A7466", fontFamily: "Manrope_500Medium", textAlign: "center" }}>
          📢 Tylko administratorzy mogą pisać w tym kanale.
        </Text>
      </View>
    );
  }
  const canSend = !!text.trim() || !!pendingAttachment;
  const [recording, setRecording] = useState(false);
  const [showActions, setShowActions] = useState(false);

  // Akcje załączników schowane pod „+" — pole tekstowe dostaje całą szerokość.
  const actions: { key: string; label: string; Icon: typeof ImageIcon; tint: string; bg: string; onPress: () => void }[] = [
    { key: "image", label: "Zdjęcie", Icon: ImageIcon, tint: "#2563eb", bg: "#dbeafe", onPress: onPickImage },
    { key: "camera", label: "Aparat", Icon: Camera, tint: "#0e7490", bg: "#cffafe", onPress: onTakePhoto },
    ...(onCreatePoll ? [{ key: "poll", label: "Ankieta", Icon: BarChart3, tint: "#7c3aed", bg: "#ede9fe", onPress: onCreatePoll }] : []),
    ...(onShareEvent ? [{ key: "event", label: "Wydarzenie", Icon: Calendar, tint: "#8A6606", bg: "#FFF1C2", onPress: onShareEvent }] : []),
  ];
  const runAction = (fn: () => void) => {
    setShowActions(false);
    fn();
  };

  if (recording && onSendVoice) {
    return (
      <View
        style={{
          backgroundColor: "#F6F4EE",
          borderTopWidth: 1,
          borderTopColor: "#E6E1D5",
        }}
      >
        <AudioRecorder
          onSend={async (uri, mime, durationMs) => {
            await onSendVoice(uri, mime, durationMs);
            setRecording(false);
          }}
          onCancel={() => setRecording(false)}
          disabled={sending}
        />
      </View>
    );
  }

  return (
    <View
      style={{
        backgroundColor: "#F6F4EE",
        borderTopWidth: 1,
        borderTopColor: "#E6E1D5",
      }}
    >
      {replyTo && !editing ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 14,
            paddingTop: 8,
          }}
        >
          <View
            style={{
              flex: 1,
              borderLeftWidth: 3,
              borderLeftColor: "#FFBE0B",
              paddingLeft: 8,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <CornerUpLeft size={11} color="#8A6606" />
              <Text
                style={{
                  fontSize: 11,
                  color: "#8A6606",
                  fontFamily: "Manrope_700Bold",
                }}
              >
                Odpowiedź dla {memberDisplayName(members, replyTo.sender_email)}
              </Text>
            </View>
            <Text
              style={{
                fontSize: 12,
                color: "#4A463E",
                fontFamily: "Manrope_400Regular",
              }}
              numberOfLines={1}
            >
              {replyTo.content || "(załącznik)"}
            </Text>
          </View>
          <Pressable onPress={onClearReply} hitSlop={10} style={{ padding: 4 }}>
            <X size={16} color="#A8A59E" />
          </Pressable>
        </View>
      ) : null}

      {editing ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 14,
            paddingTop: 8,
          }}
        >
          <Pencil size={12} color="#d97706" />
          <Text
            style={{
              fontSize: 11,
              color: "#b45309",
              fontFamily: "Manrope_700Bold",
            }}
          >
            Edytujesz wiadomość
          </Text>
        </View>
      ) : null}

      {pendingAttachment ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 14,
            paddingTop: 8,
          }}
        >
          {pendingAttachment.type?.startsWith("image/") ? (
            <Image
              source={{ uri: pendingAttachment.url }}
              style={{ width: 48, height: 48, borderRadius: 10 }}
            />
          ) : (
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 10,
                backgroundColor: "#ECE8DE",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text>📎</Text>
            </View>
          )}
          <Text
            style={{
              flex: 1,
              fontSize: 12,
              color: "#7A7466",
              fontFamily: "Manrope_500Medium",
            }}
            numberOfLines={1}
          >
            {pendingAttachment.name}
          </Text>
          <Pressable onPress={onClearAttachment} hitSlop={10} style={{ padding: 4 }}>
            <X size={16} color="#A8A59E" />
          </Pressable>
        </View>
      ) : null}

      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      >
        {!editing ? (
          <Pressable
            onPress={() => setShowActions(true)}
            disabled={uploading}
            hitSlop={6}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: "#F1EEE6",
              borderWidth: 1,
              borderColor: "#E6E1D5",
              alignItems: "center",
              justifyContent: "center",
              opacity: uploading ? 0.5 : 1,
            }}
          >
            {uploading ? (
              <ActivityIndicator size="small" color="#A8A59E" />
            ) : (
              <Plus size={22} color="#4A463E" strokeWidth={2.2} />
            )}
          </Pressable>
        ) : null}
        <TextInput
          style={{
            flex: 1,
            maxHeight: 130,
            minHeight: 44,
            borderRadius: 22,
            paddingHorizontal: 18,
            paddingVertical: 11,
            backgroundColor: "#F1EEE6",
            borderWidth: 1,
            borderColor: "#E6E1D5",
            fontSize: 15,
            color: "#2A2312",
            fontFamily: "Manrope_400Regular",
          }}
          placeholder={editing ? "Edytuj…" : uploading ? "Wgrywanie…" : "Napisz wiadomość…"}
          placeholderTextColor="#A8A59E"
          value={text}
          onChangeText={onChangeText}
          multiline
          editable={!sending && !uploading}
        />
        {!editing && !canSend && onSendVoice ? (
          <Pressable
            onPress={() => setRecording(true)}
            disabled={sending || uploading}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: "#2A2312",
              alignItems: "center",
              justifyContent: "center",
              shadowColor: "#2A2312",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.35,
              shadowRadius: 8,
              elevation: 4,
            }}
          >
            <Mic size={19} color="#ffffff" strokeWidth={2.4} />
          </Pressable>
        ) : (
          <Pressable
            onPress={onSend}
            disabled={sending || !canSend}
            style={{ opacity: canSend ? 1 : 0.4 }}
          >
            {sending || uploading ? (
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: "#2A2312",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ActivityIndicator color="white" />
              </View>
            ) : (
              <GradientIcon
                Icon={Send}
                size={44}
                iconSize={19}
                rounded
              />
            )}
          </Pressable>
        )}
      </View>

      <Modal
        visible={showActions}
        transparent
        animationType="fade"
        onRequestClose={() => setShowActions(false)}
      >
        <Pressable
          onPress={() => setShowActions(false)}
          style={{ flex: 1, backgroundColor: "rgba(12,10,9,0.35)", justifyContent: "flex-end" }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "#F6F4EE",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingHorizontal: 16,
              paddingTop: 10,
              paddingBottom: 34,
            }}
          >
            <View
              style={{
                alignSelf: "center",
                width: 40,
                height: 5,
                borderRadius: 3,
                backgroundColor: "#E3DDD0",
                marginBottom: 14,
              }}
            />
            {actions.map(({ key, label, Icon, tint, bg, onPress }) => (
              <Pressable
                key={key}
                onPress={() => runAction(onPress)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 14,
                  paddingVertical: 12,
                  paddingHorizontal: 6,
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: bg,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon size={21} color={tint} strokeWidth={2.1} />
                </View>
                <Text style={{ fontSize: 16, color: "#2A2312", fontFamily: "Manrope_600SemiBold" }}>
                  {label}
                </Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => setShowActions(false)}
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
              <Text style={{ fontSize: 15, color: "#7A7466", fontFamily: "Manrope_600SemiBold" }}>
                Anuluj
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};
