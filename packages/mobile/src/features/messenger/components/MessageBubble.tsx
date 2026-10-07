import { memo } from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";
import { Check, CheckCheck, CornerUpLeft, Eye, EyeOff, FileText, Forward, Languages, Pin } from "lucide-react-native";
import { format } from "date-fns";
import type { MemberMap, MessageRow, ReactionAggregate } from "../api";
import { memberDisplayName, memberInitials, pollOf } from "../api";
import { isVoiceAttachment, voiceDurationMs, mentionsUser, mentionsAll, previewText, splitLinks, firstLink } from "../logic";
import { PresenceDot } from "./PresenceDot";
import { AudioPlayer } from "./AudioPlayer";
import { type PresenceStatus } from "../../../lib/presence";
import { PollCard } from "./PollCard";
import { PrayerCard } from "./PrayerCard";
import { EventCard } from "./EventCard";
import { AttachmentImage } from "./AttachmentImage";
import { LinkPreviewCard, openLink } from "./LinkPreviewCard";
import { openAttachment } from "../signedUrl";
import { translatedFromLabel } from "../plus";
import type { PrayerMetadata, EventMetadata, DeliveryStatus } from "../api";

// Treść: klikalne linki (K2) + pogrubione @wzmianki (z „@wszyscy” — K5).
const MENTION_RE = /(@[\p{L}][\p{L}\d._-]*)/u;
const renderRichText = (text: string, opts: { accent: string; link: string; onLongPress?: () => void }) =>
  splitLinks(text).flatMap((part, i) => {
    if (part.kind === "link") {
      return [
        <Text
          key={`l${i}`}
          onPress={() => openLink(part.url)}
          onLongPress={opts.onLongPress}
          accessibilityRole="link"
          style={{ color: opts.link, textDecorationLine: "underline" }}
        >
          {part.text}
        </Text>,
      ];
    }
    return part.text.split(MENTION_RE).map((seg, j) =>
      seg.startsWith("@") ? (
        <Text key={`m${i}-${j}`} style={{ fontFamily: "Manrope_700Bold", color: opts.accent }}>
          {seg}
        </Text>
      ) : (
        seg
      ),
    );
  });

export interface BubbleTranslation {
  text: string;
  source: string | null;
  /** Tłumaczenie w toku. */
  pending?: boolean;
}

interface Props {
  message: MessageRow;
  mine: boolean;
  members: MemberMap;
  /** Czy to pierwsza wiadomość w "burst" od tego nadawcy (pokazujemy avatar+name). */
  showSender: boolean;
  replyTo?: MessageRow | null;
  reactions?: ReactionAggregate[];
  pinned?: boolean;
  senderStatus?: PresenceStatus;
  onLongPress?: () => void;
  onToggleReaction?: (emoji: string) => void;
  currentUserEmail?: string | null;
  /** Ptaszki (K6): „read” dopiero, gdy przeczytali wszyscy pozostali. */
  deliveryStatus?: DeliveryStatus;
  /** „Widziane przez N” / „Przeczytało N z M” pod moją wiadomością (K6). */
  readInfo?: { label: string; onPress: () => void } | null;
  pollVotes?: Record<string, { count: number; mine: boolean }>;
  onVote?: (optionId: string) => void;
  prayerCount?: number;
  prayerMine?: boolean;
  onPray?: () => void;
  /** Tłumaczenie pod oryginałem (K3) + „Pokaż oryginał”. */
  translation?: BubbleTranslation | null;
  onHideTranslation?: () => void;
  /** Wiadomość od zablokowanej osoby w grupie — zwinięta (K10). */
  blockedHidden?: boolean;
  onReveal?: () => void;
  /** Dotknięcie cytatu — skok do cytowanej wiadomości (K11). */
  onPressReply?: () => void;
  /** Podgląd zdjęcia na pełnym ekranie. */
  onOpenImage?: (url: string) => void;
  /** Wyróżnienie po skoku (wyszukiwarka, cytat, przypięte). */
  highlighted?: boolean;
}

const Avatar = ({ email, members }: { email: string; members: MemberMap }) => {
  const m = members[email];
  const initials = memberInitials(members, email);
  if (m?.photoUrl) {
    return <Image source={{ uri: m.photoUrl }} style={{ width: 32, height: 32, borderRadius: 16 }} />;
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
      <Text style={{ color: "#8A6606", fontFamily: "Manrope_700Bold", fontSize: 12 }}>{initials}</Text>
    </View>
  );
};

const MessageBubbleBase = ({
  message,
  mine,
  members,
  showSender,
  replyTo,
  reactions,
  pinned,
  senderStatus,
  onLongPress,
  onToggleReaction,
  currentUserEmail,
  deliveryStatus,
  readInfo,
  pollVotes,
  onVote,
  prayerCount,
  prayerMine,
  onPray,
  translation,
  onHideTranslation,
  blockedHidden,
  onReveal,
  onPressReply,
  onOpenImage,
  highlighted,
}: Props) => {
  // API zwraca puste załączniki jako {} (obiekt), nie []. Bez tego guardu
  // {}.map(...) rzuca "undefined is not a function" i wywala całą rozmowę.
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  const senderName = memberDisplayName(members, message.sender_email);
  const replyName = replyTo ? memberDisplayName(members, replyTo.sender_email) : null;
  const time = format(new Date(message.created_at), "HH:mm");
  const toAll = mentionsAll(message);
  const mentionsMe = !mine && (mentionsUser(message, currentUserEmail) || toAll);
  const isText = !message.message_type || message.message_type === "text";
  const previewUrl = isText && message.content ? firstLink(message.content) : null;

  // Wiadomość systemowa — wyśrodkowana pastylka (spec §2).
  if (message.message_type === "system") {
    return (
      <View style={{ alignItems: "center", marginVertical: 6 }}>
        <View style={{ backgroundColor: "#E6E1D5", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, maxWidth: "85%" }}>
          <Text style={{ fontSize: 12, color: "#6B6557", fontFamily: "Manrope_500Medium", textAlign: "center" }}>
            {message.content}
          </Text>
        </View>
      </View>
    );
  }

  // Zablokowana osoba w grupie (K10): bez treści, z możliwością podejrzenia.
  if (blockedHidden) {
    return (
      <View style={{ flexDirection: "row", justifyContent: "flex-start", marginBottom: showSender ? 8 : 2, paddingLeft: 38 }}>
        <Pressable
          onPress={onReveal}
          onLongPress={onLongPress}
          accessibilityRole="button"
          accessibilityLabel="Wiadomość od zablokowanej osoby. Pokaż"
          className="active:opacity-70"
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 14,
            backgroundColor: "#ECE8DE",
          }}
        >
          <EyeOff size={13} color="#6E685A" />
          <Text style={{ fontSize: 12, color: "#6B6557", fontFamily: "Manrope_500Medium" }}>
            Wiadomość od zablokowanej osoby —{" "}
            <Text style={{ color: "#8A6606", fontFamily: "Manrope_700Bold" }}>pokaż</Text>
          </Text>
        </Pressable>
      </View>
    );
  }

  const textColor = mine ? "#ffffff" : "#2A2312";
  const accent = mine ? "#F3E3B0" : "#8A6606";

  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: mine ? "flex-end" : "flex-start",
        alignItems: "flex-end",
        gap: 6,
        marginBottom: showSender ? 8 : 2,
        borderRadius: 14,
        backgroundColor: highlighted ? "rgba(255,190,11,0.18)" : "transparent",
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
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 2, paddingHorizontal: 4 }}>
            <Pin size={10} color="#6E685A" />
            <Text style={{ fontSize: 10, color: "#6E685A", fontFamily: "Manrope_600SemiBold", letterSpacing: -0.1 }}>Przypięte</Text>
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
            // Jak web: moje — słód z białym tekstem, cudze — biała karta na papierze.
            backgroundColor: mine ? "#2A2312" : "#FFFFFF",
            borderWidth: mentionsMe ? 1 : 0,
            borderColor: mentionsMe ? "#FFBE0B" : "transparent",
            shadowColor: "#2A2312",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: mine ? 0.1 : 0.04,
            shadowRadius: 4,
            elevation: 1,
          }}
        >
          {!mine && showSender ? (
            <Text style={{ fontSize: 11, color: "#6B6557", fontFamily: "Manrope_700Bold", marginBottom: 2 }}>{senderName}</Text>
          ) : null}

          {message.forwarded_from ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
              <Forward size={11} color={mine ? "#F3E3B0" : "#6E685A"} />
              <Text style={{ fontSize: 11, fontStyle: "italic", color: mine ? "#F3E3B0" : "#6E685A", fontFamily: "Manrope_500Medium" }}>
                Przekazana wiadomość
              </Text>
            </View>
          ) : null}

          {replyTo ? (
            <Pressable
              onPress={onPressReply}
              onLongPress={onLongPress}
              disabled={!onPressReply}
              accessibilityRole="button"
              accessibilityLabel={`Cytat: ${replyName}. Pokaż cytowaną wiadomość`}
              className="active:opacity-70"
              style={{
                borderRadius: 10,
                backgroundColor: mine ? "rgba(255,255,255,0.12)" : "#F1EEE6",
                paddingHorizontal: 8,
                marginBottom: 4,
                paddingVertical: 4,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <CornerUpLeft size={10} color={mine ? "#FFF1C2" : "#7A7466"} />
                <Text style={{ fontSize: 11, color: mine ? "#FFF1C2" : "#4A463E", fontFamily: "Manrope_600SemiBold" }}>{replyName}</Text>
              </View>
              <Text numberOfLines={1} style={{ fontSize: 12, color: mine ? "#F3E3B0" : "#6B6557", fontFamily: "Manrope_400Regular" }}>
                {replyTo.deleted_at ? "Wiadomość usunięta" : previewText(replyTo) || "Wiadomość"}
              </Text>
            </Pressable>
          ) : null}

          {attachments.map((att, i) => {
            const gap = { marginBottom: message.content || i < attachments.length - 1 ? 6 : 0 };
            if (isVoiceAttachment(att)) {
              // Długość: duration (s) jak w webie; starsze nagrania z telefonu — size w ms.
              return (
                <View key={i} style={gap}>
                  <AudioPlayer uri={att.url} durationHintMs={voiceDurationMs(att)} variant={mine ? "light" : "dark"} />
                </View>
              );
            }
            if (att.type?.startsWith("image/")) {
              return (
                <Pressable
                  key={i}
                  onPress={() => (onOpenImage ? onOpenImage(att.url) : openAttachment(att.url))}
                  onLongPress={onLongPress}
                  accessibilityRole="imagebutton"
                  accessibilityLabel="Zdjęcie. Otwórz podgląd"
                  style={gap}
                >
                  <AttachmentImage url={att.url} style={{ width: 220, height: 220, borderRadius: 12 }} />
                </Pressable>
              );
            }
            return (
              <Pressable
                key={i}
                onPress={() => openAttachment(att.url)}
                onLongPress={onLongPress}
                accessibilityRole="button"
                accessibilityLabel={`Plik ${att.name}. Otwórz`}
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
                <FileText size={16} color={mine ? "#ffffff" : "#2A2312"} />
                <Text style={{ flex: 1, fontSize: 13, color: textColor, fontFamily: "Manrope_500Medium" }} numberOfLines={1}>
                  {att.name}
                </Text>
              </Pressable>
            );
          })}

          {mentionsMe ? (
            <Text style={{ fontSize: 10, color: accent, fontFamily: "Manrope_700Bold", marginBottom: 2 }}>
              {toAll ? "@wszyscy — do wszystkich" : "@ wspomniano Cię"}
            </Text>
          ) : null}

          {message.message_type === "poll" ? (
            <PollCard
              metadata={pollOf(message.metadata)}
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
            <EventCard metadata={message.metadata as EventMetadata} content={message.content} bubbleMine={mine} />
          ) : message.content ? (
            <Text style={{ fontSize: 15, lineHeight: 21, color: textColor, fontFamily: "Manrope_400Regular" }}>
              {renderRichText(message.content, { accent, link: mine ? "#FFE08A" : "#6B4F05", onLongPress })}
            </Text>
          ) : null}

          {translation ? (
            <View
              style={{
                marginTop: 6,
                paddingTop: 6,
                borderTopWidth: 1,
                borderTopColor: mine ? "rgba(255,255,255,0.18)" : "#ECE8DE",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 2 }}>
                <Languages size={11} color={accent} />
                <Text style={{ fontSize: 10, color: accent, fontFamily: "Manrope_700Bold" }}>
                  {translation.pending ? "Tłumaczę…" : translatedFromLabel(translation.source)}
                </Text>
                {translation.pending ? <ActivityIndicator size="small" color={accent} style={{ transform: [{ scale: 0.7 }] }} /> : null}
              </View>
              {translation.pending ? null : (
                <Text style={{ fontSize: 15, lineHeight: 21, color: textColor, fontFamily: "Manrope_400Regular" }}>
                  {renderRichText(translation.text, { accent, link: mine ? "#FFE08A" : "#6B4F05", onLongPress })}
                </Text>
              )}
              {onHideTranslation && !translation.pending ? (
                <Text
                  onPress={onHideTranslation}
                  accessibilityRole="button"
                  style={{ marginTop: 3, fontSize: 11, color: accent, fontFamily: "Manrope_700Bold" }}
                >
                  Pokaż oryginał
                </Text>
              ) : null}
            </View>
          ) : null}

          {previewUrl ? <LinkPreviewCard url={previewUrl} mine={mine} onLongPress={onLongPress} /> : null}

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 3, marginTop: 2 }}>
            {message.edited_at ? (
              <Text style={{ fontSize: 10, color: mine ? "#FFF1C2" : "#6E685A", fontStyle: "italic", fontFamily: "Manrope_400Regular" }}>
                edytowano ·{" "}
              </Text>
            ) : null}
            <Text style={{ fontSize: 10, color: mine ? "#FFF1C2" : "#6E685A", fontFamily: "Manrope_500Medium" }}>{time}</Text>
            {mine
              ? (() => {
                  // Ptaszki (K6): ✓✓ kurkuma = przeczytali wszyscy, ✓✓ przygaszone = doręczone, ✓ = wysłane.
                  const st: DeliveryStatus = deliveryStatus ?? "sent";
                  if (st === "read") return <CheckCheck size={13} color="#FFBE0B" strokeWidth={2.4} accessibilityLabel="Przeczytane" />;
                  if (st === "delivered") return <CheckCheck size={12} color="#CFC8B6" strokeWidth={2.4} accessibilityLabel="Doręczone" />;
                  return <Check size={12} color="#CFC8B6" strokeWidth={2.4} accessibilityLabel="Wysłane" />;
                })()
              : null}
          </View>
        </Pressable>

        {readInfo ? (
          <Pressable
            onPress={readInfo.onPress}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`${readInfo.label}. Pokaż, kto przeczytał`}
            className="active:opacity-60"
            style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3, paddingHorizontal: 4 }}
          >
            <Eye size={11} color="#6E685A" />
            <Text style={{ fontSize: 11, color: "#6E685A", fontFamily: "Manrope_600SemiBold" }}>{readInfo.label}</Text>
          </Pressable>
        ) : null}

        {reactions && reactions.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4, justifyContent: mine ? "flex-end" : "flex-start" }}>
            {reactions.map((r) => (
              <Pressable
                key={r.emoji}
                onPress={() => onToggleReaction?.(r.emoji)}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityState={{ selected: r.hasUserReacted }}
                accessibilityLabel={`Reakcja ${r.emoji}: ${r.count}`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 3,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 999,
                  backgroundColor: r.hasUserReacted ? "#FFF1C2" : "#F1EEE6",
                  borderWidth: 1,
                  borderColor: r.hasUserReacted ? "#F3E3B0" : "#E6E1D5",
                }}
              >
                <Text style={{ fontSize: 12 }}>{r.emoji}</Text>
                <Text style={{ fontSize: 11, color: r.hasUserReacted ? "#8A6606" : "#4A463E", fontFamily: "Manrope_700Bold" }}>
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

export const MessageBubble = memo(MessageBubbleBase);
