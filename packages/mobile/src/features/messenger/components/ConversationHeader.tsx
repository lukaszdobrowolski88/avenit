import { Image, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  ChevronLeft,
  Hash,
  Users,
  VolumeX,
  Volume2,
  Search,
  Image as ImageIcon,
  MessageCircle,
} from "lucide-react-native";
import {
  MINISTRY_CHANNEL_META,
  memberDisplayName,
  memberInitials,
  memberPhotoUrl,
  type ConversationDetails,
  type MemberLite, type MemberMap,
} from "../api";
import { PresenceDot } from "./PresenceDot";
import { PRESENCE_LABELS, type PresenceStatus } from "../../../lib/presence";

interface Props {
  details: ConversationDetails | null;
  members: MemberMap;
  myEmail: string | null;
  onToggleMute: () => void;
  muteBusy: boolean;
  onSearch?: () => void;
  onOpenGallery?: () => void;
  /** Status drugiego uczestnika (tylko dla rozmowy 1:1). */
  peerStatus?: PresenceStatus;
}

export const ConversationHeader = ({
  details,
  members,
  myEmail,
  onToggleMute,
  muteBusy,
  onSearch,
  onOpenGallery,
  peerStatus,
}: Props) => {
  const router = useRouter();
  if (!details) {
    return (
      <View
        style={{
          backgroundColor: "#ffffff",
          paddingTop: 48,
          paddingBottom: 12,
          paddingHorizontal: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          borderBottomWidth: 1,
          borderBottomColor: "#eef0f3",
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ChevronLeft size={22} color="#1c1917" />
        </Pressable>
        <Text
          style={{
            fontSize: 16,
            color: "#0c0a09",
            fontFamily: "Inter_700Bold",
          }}
        >
          Rozmowa
        </Text>
      </View>
    );
  }

  const isMinistry = details.type === "ministry";
  const ministryMeta =
    isMinistry && details.ministry_key
      ? MINISTRY_CHANNEL_META[details.ministry_key]
      : null;

  // Direct chat: pokaż drugiego uczestnika.
  let title: string;
  let subtitle: string;
  let avatarBlock: React.ReactNode;
  if (details.type === "direct") {
    const otherEmail =
      details.participant_emails.find((e) => e !== myEmail) ??
      details.participant_emails[0] ??
      "";
    const photo = memberPhotoUrl(members, otherEmail);
    title = otherEmail ? memberDisplayName(members, otherEmail) : "Rozmowa";
    subtitle = peerStatus && peerStatus !== "offline"
      ? PRESENCE_LABELS[peerStatus]
      : otherEmail || "";
    const photoView = photo ? (
      <Image
        source={{ uri: photo }}
        style={{ width: 38, height: 38, borderRadius: 19 }}
      />
    ) : (
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: "#fef3f2",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            color: "#be185d",
            fontFamily: "Inter_700Bold",
            fontSize: 13,
          }}
        >
          {memberInitials(members, otherEmail)}
        </Text>
      </View>
    );
    avatarBlock = (
      <View>
        {photoView}
        {peerStatus ? <PresenceDot status={peerStatus} size={11} /> : null}
      </View>
    );
  } else if (isMinistry) {
    title = details.name || ministryMeta?.label || details.ministry_key || "Kanał";
    subtitle = `${details.participant_emails.length} uczestników`;
    avatarBlock = (
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          backgroundColor: ministryMeta?.bg ?? "#fce7f3",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Hash size={20} color={ministryMeta?.tint ?? "#ec4899"} strokeWidth={2.4} />
      </View>
    );
  } else {
    title = details.name || "Grupa";
    subtitle = `${details.participant_emails.length} uczestników`;
    avatarBlock = (
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: "#fef3f2",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Users size={18} color="#ec4899" />
      </View>
    );
  }

  return (
    <View
      style={{
        backgroundColor: "#ffffff",
        paddingTop: 48,
        paddingBottom: 12,
        paddingHorizontal: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        borderBottomWidth: 1,
        borderBottomColor: "#eef0f3",
      }}
    >
      <Pressable
        onPress={() => router.back()}
        hitSlop={10}
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ChevronLeft size={22} color="#1c1917" />
      </Pressable>
      {avatarBlock}
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: 15,
            color: "#0c0a09",
            letterSpacing: -0.3,
            fontFamily: "Inter_700Bold",
          }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={1}
            style={{
              fontSize: 12,
              color: "#78716c",
              fontFamily: "Inter_500Medium",
              marginTop: 1,
            }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {onSearch ? (
        <Pressable
          onPress={onSearch}
          hitSlop={10}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: "#fafaf9",
            borderWidth: 1,
            borderColor: "#eef0f3",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Search size={16} color="#57534e" strokeWidth={2.2} />
        </Pressable>
      ) : null}
      {onOpenGallery ? (
        <Pressable
          onPress={onOpenGallery}
          hitSlop={10}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: "#fafaf9",
            borderWidth: 1,
            borderColor: "#eef0f3",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ImageIcon size={16} color="#57534e" strokeWidth={2.2} />
        </Pressable>
      ) : null}
      <Pressable
        onPress={onToggleMute}
        disabled={muteBusy}
        hitSlop={10}
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: details.my_muted ? "#fef3c7" : "#fafaf9",
          borderWidth: 1,
          borderColor: details.my_muted ? "#fde68a" : "#eef0f3",
          alignItems: "center",
          justifyContent: "center",
          opacity: muteBusy ? 0.5 : 1,
        }}
      >
        {details.my_muted ? (
          <VolumeX size={16} color="#92400e" strokeWidth={2.2} />
        ) : (
          <Volume2 size={16} color="#57534e" strokeWidth={2.2} />
        )}
      </Pressable>
    </View>
  );
};

// Re-export tylko jednego ikony — żeby umożliwić import w innych miejscach (np. dla pustej konwersacji).
export { MessageCircle };
