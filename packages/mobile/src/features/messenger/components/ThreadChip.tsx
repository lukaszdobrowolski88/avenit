import { Image, Pressable, Text, View } from "react-native";
import { format } from "date-fns";
import { memberDisplayName, memberInitials, memberPhotoUrl, type MemberMap, type MessageRow } from "../api";
import { replyCountLabel, replyCountOf } from "../threads";
import { B } from "../../../components/ui/brand";

const MiniAvatar = ({ email, members, first }: { email: string; members: MemberMap; first: boolean }) => {
  const photo = memberPhotoUrl(members, email);
  const ring = { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: B.card, marginLeft: first ? 0 : -6 };
  if (photo) return <Image source={{ uri: photo }} style={ring} />;
  return (
    <View style={{ ...ring, backgroundColor: B.kurkumaSoft, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 8, color: B.goldDeep, fontFamily: "Manrope_700Bold" }}>{memberInitials(members, email)}</Text>
    </View>
  );
};

// „N odpowiedzi · ostatnia 12:30” pod wiadomością główną (jak web) — miękka pigułka z awatarami
// ostatnio odpowiadających; dotknięcie otwiera ekran wątku.
export const ThreadChip = ({
  message,
  repliers = [],
  members,
  mine,
  onOpen,
}: {
  message: MessageRow;
  repliers?: string[];
  members: MemberMap;
  mine: boolean;
  onOpen: () => void;
}) => {
  const n = replyCountOf(message);
  if (!n) return null;
  const last = message.thread_last_reply_at ? format(new Date(message.thread_last_reply_at), "HH:mm") : null;
  const label = replyCountLabel(n);
  const names = repliers.map((e) => memberDisplayName(members, e)).join(", ");
  return (
    <View style={{ flexDirection: "row", justifyContent: mine ? "flex-end" : "flex-start", marginTop: 4 }}>
      <Pressable
        onPress={onOpen}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={`Otwórz wątek: ${label}${names ? `, odpowiadali: ${names}` : ""}`}
        className="active:opacity-70"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingLeft: repliers.length ? 4 : 10,
          paddingRight: 10,
          paddingVertical: 4,
          borderRadius: 999,
          backgroundColor: B.card,
          borderWidth: 1,
          borderColor: "#E6E1D5",
        }}
      >
        {repliers.length ? (
          <View style={{ flexDirection: "row" }}>
            {repliers.map((e, i) => (
              <MiniAvatar key={e} email={e} members={members} first={i === 0} />
            ))}
          </View>
        ) : null}
        <Text style={{ fontSize: 12, color: B.ink, fontFamily: "Manrope_700Bold" }}>{label}</Text>
        {last ? <Text style={{ fontSize: 11, color: B.ink4, fontFamily: "Manrope_500Medium" }}>{`ostatnia ${last}`}</Text> : null}
      </Pressable>
    </View>
  );
};
