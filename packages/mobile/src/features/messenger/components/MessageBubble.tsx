import { Image, Linking, Pressable, Text, View } from "react-native";
import { Check, CheckCheck, CornerUpLeft, FileText, Pin } from "lucide-react-native";
import { format } from "date-fns";
import type { MemberLite, MemberMap, MessageRow, ReactionAggregate } from "../api";
import { memberDisplayName, memberInitials } from "../api";
import { isVoiceAttachment } from "../attachments";
import { PresenceDot } from "./PresenceDot";
import { AudioPlayer } from "./AudioPlayer";
import { type PresenceStatus } from "../../../lib/presence";
import { PollCard } from "./PollCard";
import { PrayerCard } from "./PrayerCard";
import { EventCard } from "./EventCard";
import type { PollMetadata, PrayerMetadata, EventMetadata, DeliveryStatus } from "../api";

// Pogrubia tokeny @wzmianek w treści (spec §3).
const MENTION_RE = /(@[\p{L}][\p{L}\d._-]*)/u;
const renderWithMentions = (text: string, accent: string) =>
  text.split(MENTION_RE).map((part, i) =>
    part.startsWith("@") ? (
      <Text key={i} style={{ fontFamily: "Manrope_700Bold", color: accent }}>
        {part}
      </Text>
    ) : (
      part
    ),
  );

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
  // Komunikator „WhatsApp": bogate typy, wzmianki, ptaszki (spec §2–4).
  currentUserEmail?: string | null;
  deliveryStatus?: DeliveryStatus;
  pollVotes?: Record<string, { count: number; mine: boolean }>;
  onVote?: (optionId: string) => void;
  prayerCount?: number;
  prayerMine?: boolean;
  onPray?: () => void;
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
        backgroundColor: "#FFF8E1",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          color: "#8A6606",
          fontFamily: "Manrope_700Bold",
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
  currentUserEmail,
  deliveryStatus,
  pollVotes,
  onVote,
  prayerCount,
  prayerMine,
  onPray,
}: Props) => {
  // API zwraca puste załączniki jako {} (obiekt), nie []. Bez tego guardu
  // {}.map(...) rzuca "undefined is not a function" i wywala całą rozmowę.
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  const senderName = memberDisplayName(members, message.sender_email);
  const replyName = replyTo
    ? memberDisplayName(members, replyTo.sender_email)
    : null;
  const time = format(new Date(message.created_at), "HH:mm");
  const mentionsMe =
    !!currentUserEmail &&
    Array.isArray(message.mentions) &&
    message.mentions.includes(currentUserEmail);

  // Wiadomość systemowa — wyśrodkowana pastylka (spec §2).
  if (message.message_type === "system") {
    return (
      <View style={{ alignItems: "center", marginVertical: 6 }}>
        <View
          style={{
            backgroundColor: "#E6E1D5",
            borderRadius: 999,
            paddingHorizontal: 12,
            paddingVertical: 5,
            maxWidth: "85%",
          }}
        >
          <Text
            style={{
              fontSize: 12,
              color: "#6B6557",
              fontFamily: "Manrope_500Medium",
              textAlign: "center",
            }}
          >
            {message.content}
          </Text>
        </View>
      </View>
    );
  }

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
            <Pin size={10} color="#857F70" />
            <Text
              style={{
                fontSize: 10,
                color: "#857F70",
                fontFamily: "Manrope_600SemiBold",
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
          backgroundColor: mine ? "#2A2312" : "#ECE8DE",
          shadowColor: "#2A2312",
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
              color: "#6B6557",
              fontFamily: "Manrope_700Bold",
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
              borderLeftColor: mine ? "rgba(255,255,255,0.5)" : "#A8A59E",
              paddingLeft: 8,
              marginBottom: 4,
              paddingVertical: 2,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <CornerUpLeft size={10} color={mine ? "#FFF1C2" : "#7A7466"} />
              <Text
                style={{
                  fontSize: 11,
                  color: mine ? "#FFF1C2" : "#4A463E",
                  fontFamily: "Manrope_600SemiBold",
                }}
              >
                {replyName}
              </Text>
            </View>
            <Text
              numberOfLines={1}
              style={{
                fontSize: 12,
                color: mine ? "#F3E3B0" : "#6B6557",
                fontFamily: "Manrope_400Regular",
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
                backgroundColor: mine ? "rgba(255,255,255,0.18)" : "#F6F4EE",
                marginBottom: 4,
              }}
            >
              <FileText size={16} color={mine ? "#ffffff" : "#dc2626"} />
              <Text
                style={{
                  flex: 1,
                  fontSize: 13,
                  color: mine ? "#ffffff" : "#2A2312",
                  fontFamily: "Manrope_500Medium",
                }}
                numberOfLines={1}
              >
                {att.name}
              </Text>
            </Pressable>
          );
        })}

        {mentionsMe ? (
          <Text
            style={{
              fontSize: 10,
              color: mine ? "#F3E3B0" : "#8A6606",
              fontFamily: "Manrope_700Bold",
              marginBottom: 2,
            }}
          >
            @ wspomniano Cię
          </Text>
        ) : null}

        {message.message_type === "poll" ? (
          <PollCard
            metadata={message.metadata as PollMetadata}
            content={message.content}
            votes={pollVotes ?? {}}
            onVote={(o) => onVote?.(o)}
            mine={mine}
          />
        ) : message.message_type === "prayer" ? (
          <PrayerCard
            metadata={message.metadata as PrayerMetadata}
            content={message.content}
            count={prayerCount ?? 0}
            mine={!!prayerMine}
            bubbleMine={mine}
            onToggle={() => onPray?.()}
          />
        ) : message.message_type === "event" ? (
          <EventCard
            metadata={message.metadata as EventMetadata}
            content={message.content}
            bubbleMine={mine}
          />
        ) : message.content ? (
          <Text
            style={{
              fontSize: 15,
              lineHeight: 21,
              color: mine ? "#ffffff" : "#2A2312",
              fontFamily: "Manrope_400Regular",
            }}
          >
            {renderWithMentions(message.content, mine ? "#F3E3B0" : "#8A6606")}
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
                color: mine ? "#FFF1C2" : "#857F70",
                fontStyle: "italic",
                fontFamily: "Manrope_400Regular",
              }}
            >
              edytowano ·{" "}
            </Text>
          ) : null}
          <Text
            style={{
              fontSize: 10,
              color: mine ? "#FFF1C2" : "#857F70",
              fontFamily: "Manrope_500Medium",
            }}
          >
            {time}
          </Text>
          {mine
            ? (() => {
                // Ptaszki (spec §4): read=✓✓ jasne, delivered=✓✓ przygaszone, sent=✓.
                const st: DeliveryStatus =
                  deliveryStatus ?? ((readByCount ?? 0) > 0 ? "read" : "sent");
                if (st === "read")
                  return <CheckCheck size={12} color="#ffffff" strokeWidth={2.4} />;
                if (st === "delivered")
                  return <CheckCheck size={12} color="#F3E3B0" strokeWidth={2.4} />;
                return <Check size={12} color="#F3E3B0" strokeWidth={2.4} />;
              })()
            : null}
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
                backgroundColor: r.hasUserReacted ? "#FFF1C2" : "#F1EEE6",
                borderWidth: 1,
                borderColor: r.hasUserReacted ? "#f9a8d4" : "#E6E1D5",
              }}
            >
              <Text style={{ fontSize: 12 }}>{r.emoji}</Text>
              <Text
                style={{
                  fontSize: 11,
                  color: r.hasUserReacted ? "#8A6606" : "#4A463E",
                  fontFamily: "Manrope_700Bold",
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
