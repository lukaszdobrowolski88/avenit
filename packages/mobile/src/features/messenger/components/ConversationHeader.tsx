import { Image, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  BellOff,
  ChevronLeft,
  Hash,
  House,
  Users,
  Volume2,
  Search,
  Image as ImageIcon,
  Megaphone,
  MessageCircle,
} from "lucide-react-native";
import {
  MINISTRY_CHANNEL_META,
  conversationTitle,
  memberDisplayName,
  memberInitials,
  memberPhotoUrl,
  type ConversationDetails,
  type MemberLite, type MemberMap,
} from "../api";
import { PresenceDot } from "./PresenceDot";
import { PRESENCE_LABELS, type PresenceStatus } from "../../../lib/presence";
import { goBack } from '../../../lib/navigation';
import { isHomeGroupChannel, isMutedNow, mutedUntilLabel, sameEmail } from "../logic";

interface Props {
  details: ConversationDetails | null;
  members: MemberMap;
  myEmail: string | null;
  /** Brak = bez przycisku (rola nie może zmieniać swoich ustawień rozmowy). Otwiera menu „Wycisz” (K4). */
  onToggleMute?: () => void;
  muteBusy: boolean;
  onSearch?: () => void;
  onOpenGallery?: () => void;
  /** Status drugiego uczestnika (tylko dla rozmowy 1:1). */
  peerStatus?: PresenceStatus;
  /** Dotknięcie nazwy rozmowy — okno „Szczegóły rozmowy” (skład, opuszczenie, usunięcie). */
  onOpenInfo?: () => void;
}

// „1 uczestnik”, dalej „2 uczestników” (rodzaj męskoosobowy — dopełniacz przy każdej liczbie).
const participantsLabel = (n: number) => (n === 1 ? "1 uczestnik" : `${n} uczestników`);

export const ConversationHeader = ({
  details,
  members,
  myEmail,
  onToggleMute,
  muteBusy,
  onSearch,
  onOpenGallery,
  peerStatus,
  onOpenInfo,
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
          accessibilityRole="button"
          accessibilityLabel="Wróć do listy rozmów"
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
      details.participant_emails.find((e) => !sameEmail(e, myEmail)) ??
      details.participant_emails[0] ??
      "";
    const photo = memberPhotoUrl(members, otherEmail);
    title = otherEmail ? memberDisplayName(members, otherEmail) : "Rozmowa";
    // Jak web: status obecności, a gdy ktoś jest poza aplikacją — „Prywatna rozmowa”.
    subtitle = peerStatus && peerStatus !== "offline" ? PRESENCE_LABELS[peerStatus] : "Prywatna rozmowa";
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
    const homeGroup = isHomeGroupChannel(details);
    title = conversationTitle(details, members);
    subtitle = `${homeGroup ? "Grupa domowa" : "Kanał służby"} · ${participantsLabel(details.participant_emails.length)}`;
    avatarBlock = (
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          backgroundColor: ministryMeta?.bg ?? "#ECE8DE",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {homeGroup ? (
          <House size={19} color="#2A2312" strokeWidth={2.2} />
        ) : (
          <Hash size={20} color={ministryMeta?.tint ?? "#2A2312"} strokeWidth={2.4} />
        )}
      </View>
    );
  } else if (details.type === "announcement") {
    title = details.name || "Kanał ogłoszeń";
    subtitle = `Kanał ogłoszeń · ${participantsLabel(details.participant_emails.length)}`;
    avatarBlock = (
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          backgroundColor: "#ECE8DE",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Megaphone size={18} color="#2A2312" />
      </View>
    );
  } else {
    title = details.name || "Grupa";
    subtitle = participantsLabel(details.participant_emails.length);
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
        accessibilityRole="button"
        accessibilityLabel="Wróć do listy rozmów"
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
      <Pressable
        onPress={onOpenInfo}
        disabled={!onOpenInfo}
        accessibilityRole="button"
        accessibilityLabel={`${title}. Szczegóły rozmowy`}
        className="active:opacity-70"
        style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}
      >
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
      </Pressable>
      {onSearch ? (
        <Pressable
          onPress={onSearch}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Szukaj w rozmowie"
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
          accessibilityRole="button"
          accessibilityLabel="Galeria zdjęć i plików"
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
      {onToggleMute ? (() => {
        const muted = isMutedNow({ muted: details.my_muted, muted_until: details.my_muted_until });
        const until = mutedUntilLabel(details.my_muted_until);
        return (
          <Pressable
            onPress={onToggleMute}
            disabled={muteBusy}
            accessibilityRole="button"
            accessibilityLabel={
              muted ? `Powiadomienia wyciszone${until ? ` ${until}` : ""}. Zmień` : "Wycisz powiadomienia z rozmowy"
            }
            hitSlop={10}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: muted ? "#FFF1C2" : "#F1EEE6",
              borderWidth: 1,
              borderColor: muted ? "#F3E3B0" : "#E6E1D5",
              alignItems: "center",
              justifyContent: "center",
              opacity: muteBusy ? 0.5 : 1,
            }}
          >
            {muted ? (
              <BellOff size={16} color="#8A6606" strokeWidth={2.2} />
            ) : (
              <Volume2 size={16} color="#4A463E" strokeWidth={2.2} />
            )}
          </Pressable>
        );
      })() : null}
    </View>
  );
};

// Re-export tylko jednego ikony — żeby umożliwić import w innych miejscach (np. dla pustej konwersacji).
export { MessageCircle };
