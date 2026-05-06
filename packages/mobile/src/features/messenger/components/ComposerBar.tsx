import { useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, TextInput, View } from "react-native";
import {
  Camera,
  CornerUpLeft,
  Image as ImageIcon,
  Mic,
  Pencil,
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
}: Props) => {
  const canSend = !!text.trim() || !!pendingAttachment;
  const [recording, setRecording] = useState(false);

  if (recording && onSendVoice) {
    return (
      <View
        style={{
          backgroundColor: "#ffffff",
          borderTopWidth: 1,
          borderTopColor: "#eef0f3",
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
        backgroundColor: "#ffffff",
        borderTopWidth: 1,
        borderTopColor: "#eef0f3",
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
              borderLeftColor: "#ec4899",
              paddingLeft: 8,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <CornerUpLeft size={11} color="#ec4899" />
              <Text
                style={{
                  fontSize: 11,
                  color: "#be185d",
                  fontFamily: "Inter_700Bold",
                }}
              >
                Odpowiedź dla {memberDisplayName(members, replyTo.sender_email)}
              </Text>
            </View>
            <Text
              style={{
                fontSize: 12,
                color: "#57534e",
                fontFamily: "Inter_400Regular",
              }}
              numberOfLines={1}
            >
              {replyTo.content || "(załącznik)"}
            </Text>
          </View>
          <Pressable onPress={onClearReply} hitSlop={10} style={{ padding: 4 }}>
            <X size={16} color="#a8a29e" />
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
              fontFamily: "Inter_700Bold",
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
                backgroundColor: "#f5f5f4",
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
              color: "#78716c",
              fontFamily: "Inter_500Medium",
            }}
            numberOfLines={1}
          >
            {pendingAttachment.name}
          </Text>
          <Pressable onPress={onClearAttachment} hitSlop={10} style={{ padding: 4 }}>
            <X size={16} color="#a8a29e" />
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
          <>
            <Pressable
              onPress={onPickImage}
              disabled={uploading}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: "#fafaf9",
                borderWidth: 1,
                borderColor: "#eef0f3",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ImageIcon size={18} color="#57534e" />
            </Pressable>
            <Pressable
              onPress={onTakePhoto}
              disabled={uploading}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: "#fafaf9",
                borderWidth: 1,
                borderColor: "#eef0f3",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Camera size={18} color="#57534e" />
            </Pressable>
          </>
        ) : null}
        <TextInput
          style={{
            flex: 1,
            maxHeight: 130,
            minHeight: 40,
            borderRadius: 20,
            paddingHorizontal: 16,
            paddingVertical: 10,
            backgroundColor: "#fafaf9",
            borderWidth: 1,
            borderColor: "#eef0f3",
            fontSize: 15,
            color: "#0c0a09",
            fontFamily: "Inter_400Regular",
          }}
          placeholder={editing ? "Edytuj…" : uploading ? "Wgrywanie…" : "Napisz wiadomość…"}
          placeholderTextColor="#a8a29e"
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
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: "#ec4899",
              alignItems: "center",
              justifyContent: "center",
              shadowColor: "#ec4899",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.35,
              shadowRadius: 8,
              elevation: 4,
            }}
          >
            <Mic size={18} color="#ffffff" strokeWidth={2.4} />
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
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: "#ec4899",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ActivityIndicator color="white" />
              </View>
            ) : (
              <GradientIcon
                Icon={Send}
                size={40}
                iconSize={18}
                from="#f97316"
                to="#ec4899"
                rounded
              />
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
};
