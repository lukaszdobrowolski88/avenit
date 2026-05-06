import { Image, Linking, Pressable, Text, View } from "react-native";
import { Check, CheckCheck, CornerUpLeft, FileText, Pin } from "lucide-react-native";
import { format } from "date-fns";
import type { MemberLite, MemberMap, MessageRow, ReactionAggregate } from "../api";
import { memberDisplayName, memberInitials } from "../api";
import { isVoiceAttachment } from "../attachments";
import { PresenceDot } from "./PresenceDot";
import { AudioPlayer } from "./AudioPlayer";
import { type PresenceStatus } from "../../../lib/presence";

interface Props {
  message: MessageRow;
  mine: boolean;
  members: MemberMap;
  /** Czy to pierwsza wiadomość w "burst" od tego nadawcy (pokazujemy avatar+name). */
  showSender: boolean;
  replyTo?: MessageRow | null;
  reactions?: ReactionAggregate[];
  pinned?: boolean;
  /** Liczba odbiorców (poza nadawcą), którzy już zobaczyli wiadomość. */
  readByCount?: number;
  senderStatus?: PresenceStatus;
  onLongPress?: () => void;
  onToggleReaction?: (emoji: string) => void;
}

const Avatar = ({
  email,
  members,
}: {
  email: string;
  members: MemberMap;
}) => {
  const m = members[email];
  const initials = memberInitials(members, email);
  if (m?.photoUrl) {
    return (
      <Image
        source={{ uri: m.photoUrl }}
        style={{ width: 32, height: 32, borderRadius: 16 }}
      />
    );
  }
  return (
    <View
      style={{
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: "#fef3f2",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          color: "#be185d",
          fontFamily: "Inter_700Bold",
          fontSize: 12,
        }}
      >
        {initials}
      </Text>
    </View>
  );
};

export const MessageBubble = ({
  message,
  mine,
  members,
  showSender,
  replyTo,
  reactions,
  pinned,
  readByCount,
  senderStatus,
  onLongPress,
  onToggleReaction,
}: Props) => {
  const attachments = message.attachments ?? [];
  const senderName = memberDisplayName(members, message.sender_email);
  const replyName = replyTo
    ? memberDisplayName(members, replyTo.sender_email)
    : null;
  const time = format(new Date(message.created_at), "HH:mm");

  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: mine ? "flex-end" : "flex-start",
        alignItems: "flex-end",
        gap: 6,
        marginBottom: showSender ? 8 : 2,
      }}
    >
      {!mine && (
        <View style={{ width: 32 }}>
          {showSender ? (
            <View>
              <Avatar email={message.sender_email} members={members} />
              {senderStatus ? <PresenceDot status={senderStatus} size={9} /> : null}
            </View>
          ) : null}
        </View>
      )}

      <View style={{ maxWidth: "78%", alignItems: mine ? "flex-end" : "flex-start" }}>
        {pinned ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              marginBottom: 2,
              paddingHorizontal: 4,
            }}
          >
            <Pin size={10} color="#a8a29e" />
            <Text
              style={{
                fontSize: 10,
                color: "#a8a29e",
                fontFamily: "Inter_600SemiBold",
                letterSpacing: -0.1,
              }}
            >
              Przypięte
            </Text>
          </View>
        ) : null}
      <Pressable
        onLongPress={onLongPress}
        delayLongPress={350}
        style={{
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 18,
          borderTopLeftRadius: !mine && showSender ? 6 : 18,
          borderTopRightRadius: mine && showSender ? 6 : 18,
          borderBottomLeftRadius: !mine ? 6 : 18,
          borderBottomRightRadius: mine ? 6 : 18,
          backgroundColor: mine ? "#ec4899" : "#f5f5f4",
          shadowColor: "#0f172a",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: mine ? 0.1 : 0.04,
          shadowRadius: 4,
          elevation: 1,
        }}
      >
        {!mine && showSender ? (
          <Text
            style={{
              fontSize: 11,
              color: "#78716c",
              fontFamily: "Inter_700Bold",
              marginBottom: 2,
            }}
          >
            {senderName}
          </Text>
        ) : null}

        {replyTo ? (
          <View
            style={{
              borderLeftWidth: 2,
              borderLeftColor: mine ? "rgba(255,255,255,0.5)" : "#a8a29e",
              paddingLeft: 8,
              marginBottom: 4,
              paddingVertical: 2,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <CornerUpLeft size={10} color={mine ? "#fce7f3" : "#78716c"} />
              <Text
                style={{
                  fontSize: 11,
                  color: mine ? "#fce7f3" : "#57534e",
                  fontFamily: "Inter_600SemiBold",
                }}
              >
                {replyName}
              </Text>
            </View>
            <Text
              numberOfLines={1}
              style={{
                fontSize: 12,
                color: mine ? "#fbcfe8" : "#78716c",
                fontFamily: "Inter_400Regular",
              }}
            >
              {replyTo.deleted_at ? "(usunięto)" : replyTo.content || "(załącznik)"}
            </Text>
          </View>
        ) : null}

        {attachments.map((att, i) => {
          if (isVoiceAttachment(att)) {
            // size jest u nas nośnikiem długości w ms (z uploadVoiceMessage).
            return (
              <View
                key={i}
                style={{
                  marginBottom: message.content || i < attachments.length - 1 ? 6 : 0,
                }}
              >
                <AudioPlayer
                  uri={att.url}
                  durationHintMs={typeof att.size === "number" ? att.size : undefined}
                  variant={mine ? "light" : "dark"}
                />
              </View>
            );
          }
          if (att.type?.startsWith("image/")) {
            return (
              <Pressable
                key={i}
                onPress={() => Linking.openURL(att.url)}
                style={{ marginBottom: message.content || i < attachments.length - 1 ? 6 : 0 }}
              >
                <Image
                  source={{ uri: att.url }}
                  style={{ width: 220, height: 220, borderRadius: 12 }}
                  resizeMode="cover"
                />
              </Pressable>
            );
          }
          return (
            <Pressable
              key={i}
              onPress={() => Linking.openURL(att.url)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                padding: 8,
                borderRadius: 10,
                backgroundColor: mine ? "rgba(255,255,255,0.18)" : "#ffffff",
                marginBottom: 4,
              }}
            >
              <FileText size={16} color={mine ? "#ffffff" : "#dc2626"} />
              <Text
                style={{
                  flex: 1,
                  fontSize: 13,
                  color: mine ? "#ffffff" : "#0c0a09",
                  fontFamily: "Inter_500Medium",
                }}
                numberOfLines={1}
              >
                {att.name}
              </Text>
            </Pressable>
          );
        })}

        {message.content ? (
          <Text
            style={{
              fontSize: 15,
              lineHeight: 21,
              color: mine ? "#ffffff" : "#0c0a09",
              fontFamily: "Inter_400Regular",
            }}
          >
            {message.content}
          </Text>
        ) : null}

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 3,
            marginTop: 2,
          }}
        >
          {message.edited_at ? (
            <Text
              style={{
                fontSize: 10,
                color: mine ? "#fce7f3" : "#a8a29e",
                fontStyle: "italic",
                fontFamily: "Inter_400Regular",
              }}
            >
              edytowano ·{" "}
            </Text>
          ) : null}
          <Text
            style={{
              fontSize: 10,
              color: mine ? "#fce7f3" : "#a8a29e",
              fontFamily: "Inter_500Medium",
            }}
          >
            {time}
          </Text>
          {mine ? (
            (readByCount ?? 0) > 0 ? (
              <CheckCheck size={12} color="#fce7f3" strokeWidth={2.4} />
            ) : (
              <Check size={12} color="#fbcfe8" strokeWidth={2.4} />
            )
          ) : null}
        </View>
      </Pressable>

      {reactions && reactions.length > 0 ? (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 4,
            marginTop: 4,
            justifyContent: mine ? "flex-end" : "flex-start",
          }}
        >
          {reactions.map((r) => (
            <Pressable
              key={r.emoji}
              onPress={() => onToggleReaction?.(r.emoji)}
              hitSlop={4}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 3,
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 999,
                backgroundColor: r.hasUserReacted ? "#fce7f3" : "#fafaf9",
                borderWidth: 1,
                borderColor: r.hasUserReacted ? "#f9a8d4" : "#eef0f3",
              }}
            >
              <Text style={{ fontSize: 12 }}>{r.emoji}</Text>
              <Text
                style={{
                  fontSize: 11,
                  color: r.hasUserReacted ? "#be185d" : "#57534e",
                  fontFamily: "Inter_700Bold",
                }}
              >
                {r.count}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      </View>
    </View>
  );
};
