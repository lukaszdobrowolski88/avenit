import { Image, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import { goBack } from '../../../lib/navigation';

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
  const insets = useSafeAreaInsets();
  if (!details) {
    return (
      <View
        style={{
          backgroundColor: "#F6F4EE",
          paddingTop: insets.top + 6,
          paddingBottom: 12,
          paddingHorizontal: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          borderBottomWidth: 1,
          borderBottomColor: "#E6E1D5",
        }}
      >
        <Pressable
          onPress={() => goBack(router)}
          hitSlop={10}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ChevronLeft size={22} color="#2A2312" />
        </Pressable>
        <Text
          style={{
            fontSize: 16,
            color: "#2A2312",
            fontFamily: "Manrope_700Bold",
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
          backgroundColor: "#FFF8E1",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            color: "#8A6606",
            fontFamily: "Manrope_700Bold",
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
          backgroundColor: ministryMeta?.bg ?? "#FFF1C2",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Hash size={20} color={ministryMeta?.tint ?? "#8A6606"} strokeWidth={2.4} />
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
          backgroundColor: "#FFF8E1",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Users size={18} color="#8A6606" />
      </View>
    );
  }

  return (
    <View
      style={{
        backgroundColor: "#F6F4EE",
        paddingTop: insets.top + 6,
        paddingBottom: 12,
        paddingHorizontal: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        borderBottomWidth: 1,
        borderBottomColor: "#E6E1D5",
      }}
    >
      <Pressable
        onPress={() => goBack(router)}
        hitSlop={10}
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ChevronLeft size={22} color="#2A2312" />
      </Pressable>
      {avatarBlock}
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: 15,
            color: "#2A2312",
            letterSpacing: -0.3,
            fontFamily: "Manrope_700Bold",
          }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={1}
            style={{
              fontSize: 12,
              color: "#6B6557",
              fontFamily: "Manrope_500Medium",
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
            backgroundColor: "#F1EEE6",
            borderWidth: 1,
            borderColor: "#E6E1D5",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Search size={16} color="#4A463E" strokeWidth={2.2} />
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
            backgroundColor: "#F1EEE6",
            borderWidth: 1,
            borderColor: "#E6E1D5",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ImageIcon size={16} color="#4A463E" strokeWidth={2.2} />
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
          backgroundColor: details.my_muted ? "#FFF1C2" : "#F1EEE6",
          borderWidth: 1,
          borderColor: details.my_muted ? "#F3E3B0" : "#E6E1D5",
          alignItems: "center",
          justifyContent: "center",
          opacity: muteBusy ? 0.5 : 1,
        }}
      >
        {details.my_muted ? (
          <VolumeX size={16} color="#8A6606" strokeWidth={2.2} />
        ) : (
          <Volume2 size={16} color="#4A463E" strokeWidth={2.2} />
        )}
      </Pressable>
    </View>
  );
};

// Re-export tylko jednego ikony — żeby umożliwić import w innych miejscach (np. dla pustej konwersacji).
export { MessageCircle };
