import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { AlertCircle, Check, Users } from "lucide-react-native";

// „Ważne — potwierdź przeczytanie” pod dymkiem (migracja 115) — jak web (AckBar.jsx).
//  • odbiorca: plakietka „Ważne” + „Rozumiem” (po kliknięciu — „Potwierdzono”),
//  • nadawca / administrator rozmowy: „Potwierdziło X z Y” → lista osób i przypomnienie.
interface Props {
  mine: boolean; // moja wiadomość (strona dymka)
  acked: boolean; // potwierdziłem
  busy?: boolean;
  count: number;
  total: number;
  canManage: boolean;
  onAck: () => void;
  onOpenStatus: () => void;
}

export const AckBar = ({ mine, acked, busy = false, count, total, canManage, onAck, onOpenStatus }: Props) => {
  const needsMyAck = !mine && !acked;
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 6,
        justifyContent: mine ? "flex-end" : "flex-start",
        paddingLeft: mine ? 0 : 38,
        marginTop: 2,
        marginBottom: 8,
      }}
    >
      <View
        accessibilityLabel="Ważna wiadomość"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 999,
          backgroundColor: needsMyAck ? "#FFF1C2" : "#F1EEE6",
          borderWidth: 1,
          borderColor: needsMyAck ? "#F2D27A" : "#E6E1D5",
        }}
      >
        <AlertCircle size={12} color={needsMyAck ? "#8A6606" : "#6E685A"} />
        <Text style={{ fontSize: 11, color: needsMyAck ? "#8A6606" : "#6E685A", fontFamily: "Manrope_700Bold" }}>Ważne</Text>
      </View>

      {!mine ? (
        acked ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 4 }}>
            <Check size={12} color="#6E685A" />
            <Text style={{ fontSize: 11, color: "#6E685A", fontFamily: "Manrope_600SemiBold" }}>Potwierdzono</Text>
          </View>
        ) : (
          <Pressable
            onPress={onAck}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Rozumiem — potwierdź przeczytanie"
            hitSlop={6}
            className="active:opacity-80"
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: "#2A2312",
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? <ActivityIndicator size="small" color="#ffffff" /> : <Check size={13} color="#ffffff" />}
            <Text style={{ fontSize: 12, color: "#ffffff", fontFamily: "Manrope_700Bold" }}>Rozumiem</Text>
          </Pressable>
        )
      ) : null}

      {canManage ? (
        <Pressable
          onPress={onOpenStatus}
          accessibilityRole="button"
          accessibilityLabel={`Kto potwierdził: ${count} z ${total}`}
          hitSlop={6}
          className="active:opacity-70"
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 999,
            backgroundColor: "#FFFFFF",
            borderWidth: 1,
            borderColor: "#E6E1D5",
          }}
        >
          <Users size={12} color="#4A463E" />
          <Text style={{ fontSize: 11, color: "#4A463E", fontFamily: "Manrope_600SemiBold" }}>
            Potwierdziło {count} z {total}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
};
