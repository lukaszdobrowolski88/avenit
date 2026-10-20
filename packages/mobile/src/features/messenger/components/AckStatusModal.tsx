import { ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, Text, View } from "react-native";
import { BellRing, CheckCheck, Clock, X } from "lucide-react-native";
import { format, isToday, isYesterday } from "date-fns";
import { pl } from "date-fns/locale";
import { memberInitials, memberPhotoUrl, type MemberMap, type MessageRow } from "../api";
import { previewText } from "../logic";
import { useAckStatus, useRemindAck, type AckError } from "../acks";
import { friendlyError } from "../../../lib/errors";
import { toast } from "../../../lib/toast";

// „Potwierdziło X z Y” (migracja 115) — jak web (AckStatusModal.jsx): kto kliknął „Rozumiem”
// (z godziną), kto jeszcze nie, i „Przypomnij niepotwierdzonym” (push, raz na 6 godzin).
interface Props {
  visible: boolean;
  onClose: () => void;
  message: MessageRow | null;
  members: MemberMap;
  /** Liczba potwierdzeń z realtime — zmiana odświeża listę. */
  ackCount: number;
}

const when = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  if (isToday(d)) return `dziś, ${format(d, "HH:mm")}`;
  if (isYesterday(d)) return `wczoraj, ${format(d, "HH:mm")}`;
  return format(d, "d MMM, HH:mm", { locale: pl });
};

type Row =
  | { kind: "header"; key: string; title: string }
  | { kind: "person"; key: string; email: string; name: string; at: string | null };

export const AckStatusModal = ({ visible, onClose, message, members, ackCount }: Props) => {
  const status = useAckStatus(visible ? message?.id ?? null : null, ackCount);
  const remind = useRemindAck();
  const s = status.data;
  const tooSoon = !!s?.next_remind_at && new Date(s.next_remind_at).getTime() > Date.now();

  const rows: Row[] = s
    ? [
        { kind: "header", key: "h-acked", title: `Potwierdzili (${s.acked.length})` },
        ...s.acked.map((p) => ({ kind: "person" as const, key: `a-${p.email}`, email: p.email, name: p.name, at: p.acked_at ?? null })),
        ...(s.pending.length
          ? [
              { kind: "header" as const, key: "h-pending", title: `Jeszcze nie (${s.pending.length})` },
              ...s.pending.map((p) => ({ kind: "person" as const, key: `p-${p.email}`, email: p.email, name: p.name, at: null })),
            ]
          : []),
      ]
    : [];

  const handleRemind = async () => {
    if (!message || remind.isPending) return;
    try {
      const out = await remind.mutateAsync(message.id);
      if (!out?.pending) toast.success("Wszyscy już potwierdzili.");
      else if (out.sent > 0) {
        toast.success(
          out.skipped_quiet
            ? `Wysłano przypomnienie: ${out.sent}. Pominięto (ciche godziny): ${out.skipped_quiet}.`
            : `Wysłano przypomnienie: ${out.sent}.`,
        );
      } else toast.success("Nikt nie dostał przypomnienia — niepotwierdzeni mają teraz ciche godziny.");
    } catch (e) {
      const err = e as AckError;
      if (err?.code === "ACK_REMIND_TOO_SOON") {
        Alert.alert(
          "Przypomnienie wysłano niedawno",
          err.nextRemindAt ? `Kolejne będzie możliwe ${when(err.nextRemindAt)}.` : "Przypomnienie można wysłać raz na 6 godzin.",
        );
      } else {
        Alert.alert("Nie udało się wysłać przypomnienia", friendlyError(e, "Spróbuj ponownie."));
      }
    }
  };

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
            {s ? `Potwierdziło ${s.acked_count} z ${s.total}` : "Potwierdzenia"}
          </Text>
          {status.isFetching ? <ActivityIndicator color="#2A2312" /> : null}
        </View>
        {message ? (
          <Text
            numberOfLines={2}
            style={{ marginHorizontal: 16, marginTop: 12, fontSize: 13, color: "#6B6557", fontFamily: "Manrope_500Medium", lineHeight: 18 }}
          >
            „{previewText(message) || "Wiadomość"}”
          </Text>
        ) : null}

        {status.isLoading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color="#2A2312" />
          </View>
        ) : status.isError && !s ? (
          <Text style={{ textAlign: "center", marginTop: 48, marginHorizontal: 24, color: "#4A463E", fontFamily: "Manrope_500Medium" }}>
            {friendlyError(status.error, "Nie udało się wczytać potwierdzeń.")}
          </Text>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(r) => r.key}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
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
                    {item.name}
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
        )}

        {s && s.pending.length > 0 ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32, borderTopWidth: 1, borderTopColor: "#E6E1D5", gap: 8 }}>
            <Text style={{ fontSize: 12, color: "#6B6557", fontFamily: "Manrope_500Medium", textAlign: "center" }}>
              {tooSoon
                ? `Kolejne przypomnienie możliwe ${when(s.next_remind_at)}.`
                : s.last_reminded_at
                  ? `Ostatnie przypomnienie: ${when(s.last_reminded_at)}.`
                  : "Przypomnienie dostaną tylko osoby, które jeszcze nie potwierdziły."}
            </Text>
            <Pressable
              onPress={handleRemind}
              disabled={tooSoon || remind.isPending}
              accessibilityRole="button"
              accessibilityState={{ disabled: tooSoon || remind.isPending }}
              className="active:opacity-80"
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                height: 48,
                borderRadius: 14,
                backgroundColor: "#2A2312",
                opacity: tooSoon || remind.isPending ? 0.5 : 1,
              }}
            >
              {remind.isPending ? <ActivityIndicator color="#ffffff" /> : <BellRing size={17} color="#ffffff" />}
              <Text style={{ fontSize: 15, color: "#ffffff", fontFamily: "Manrope_700Bold" }}>Przypomnij niepotwierdzonym</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Modal>
  );
};
