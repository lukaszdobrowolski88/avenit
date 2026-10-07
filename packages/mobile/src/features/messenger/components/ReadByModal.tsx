import { FlatList, Image, Modal, Pressable, Text, View } from "react-native";
import { CheckCheck, Clock, X } from "lucide-react-native";
import { format, isToday, isYesterday } from "date-fns";
import { pl } from "date-fns/locale";
import { memberDisplayName, memberInitials, memberPhotoUrl, type MemberMap, type MessageRow, type ReadReceiptRow } from "../api";
import { normEmail, previewText, sameEmail } from "../logic";

// K6 — „Widziane przez”: kto przeczytał moją wiadomość (z godziną) i kto jeszcze nie.
interface Props {
  visible: boolean;
  onClose: () => void;
  message: MessageRow | null;
  readers: ReadReceiptRow[];
  /** Wszyscy uczestnicy rozmowy (bez nadawcy liczymy „jeszcze nie”). */
  participantEmails: string[];
  members: MemberMap;
}

const when = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  if (isToday(d)) return `dziś, ${format(d, "HH:mm")}`;
  if (isYesterday(d)) return `wczoraj, ${format(d, "HH:mm")}`;
  return format(d, "d MMM, HH:mm", { locale: pl });
};

type Row = { kind: "header"; key: string; title: string } | { kind: "person"; key: string; email: string; at: string | null };

export const ReadByModal = ({ visible, onClose, message, readers, participantEmails, members }: Props) => {
  const sender = message?.sender_email ?? null;
  const readSet = new Set(readers.map((r) => normEmail(r.user_email)));
  const pending = Array.from(new Map(participantEmails.map((e) => [normEmail(e), e])).values())
    .filter((e) => !sameEmail(e, sender) && !readSet.has(normEmail(e)))
    .sort((a, b) => memberDisplayName(members, a).localeCompare(memberDisplayName(members, b), "pl"));
  const rows: Row[] = [
    { kind: "header", key: "h-read", title: `Przeczytali (${readers.length})` },
    ...readers.map((r) => ({ kind: "person" as const, key: `r-${r.user_email}`, email: r.user_email, at: r.read_at ?? null })),
    ...(pending.length
      ? [
          { kind: "header" as const, key: "h-pending", title: `Jeszcze nie (${pending.length})` },
          ...pending.map((e) => ({ kind: "person" as const, key: `p-${e}`, email: e, at: null })),
        ]
      : []),
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#F6F4EE" }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingTop: 16,
            paddingBottom: 12,
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: "#E6E1D5",
          }}
        >
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Zamknij">
            <X size={22} color="#2A2312" />
          </Pressable>
          <Text style={{ flex: 1, fontSize: 16, color: "#2A2312", fontFamily: "Manrope_700Bold", letterSpacing: -0.3 }}>
            Widziane przez
          </Text>
        </View>
        {message ? (
          <Text
            numberOfLines={2}
            style={{ marginHorizontal: 16, marginTop: 12, fontSize: 13, color: "#6B6557", fontFamily: "Manrope_500Medium", lineHeight: 18 }}
          >
            „{previewText(message) || "Wiadomość"}”
          </Text>
        ) : null}
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          renderItem={({ item }) => {
            if (item.kind === "header") {
              return (
                <Text
                  style={{
                    fontSize: 11,
                    color: "#6B6557",
                    letterSpacing: 1.4,
                    textTransform: "uppercase",
                    fontFamily: "Manrope_700Bold",
                    marginTop: 18,
                    marginBottom: 4,
                  }}
                >
                  {item.title}
                </Text>
              );
            }
            const photo = memberPhotoUrl(members, item.email);
            return (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9 }}>
                {photo ? (
                  <Image source={{ uri: photo }} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "#ECE8DE" }} />
                ) : (
                  <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "#FFF1C2", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: "#8A6606", fontFamily: "Manrope_700Bold", fontSize: 12 }}>{memberInitials(members, item.email)}</Text>
                  </View>
                )}
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: "#2A2312", fontFamily: "Manrope_600SemiBold" }}>
                  {memberDisplayName(members, item.email)}
                </Text>
                {item.at ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <CheckCheck size={13} color="#8A6606" />
                    <Text style={{ fontSize: 12, color: "#6B6557", fontFamily: "Manrope_500Medium" }}>{when(item.at)}</Text>
                  </View>
                ) : (
                  <Clock size={13} color="#B5AD99" />
                )}
              </View>
            );
          }}
        />
      </View>
    </Modal>
  );
};
