import { Pressable, Text, View } from "react-native";
import { Lock } from "lucide-react-native";
import { format, isSameYear, isToday } from "date-fns";
import { pl } from "date-fns/locale";
import type { PollMetadata } from "../api";

// Ankieta w czacie (K7). Definicja z message.metadata (pollOf), głosy z usePollVotes.
// Po terminie zamknięcia: wyniki zostają, głosowanie zablokowane — „Ankieta zamknięta”.
interface Props {
  metadata: PollMetadata | null | undefined;
  content: string;
  votes: Record<string, { count: number; mine: boolean }>;
  onVote: (optionId: string) => void;
  mine: boolean;
}

const plVotes = (n: number) =>
  n === 1 ? "głos" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "głosy" : "głosów";

const closesLabel = (iso: string) => {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  if (isToday(d)) return `dziś o ${format(d, "HH:mm")}`;
  return format(d, isSameYear(d, new Date()) ? "d MMM, HH:mm" : "d MMM yyyy, HH:mm", { locale: pl });
};

export const PollCard = ({ metadata, content, votes, onVote, mine }: Props) => {
  const question = metadata?.question || content || "Ankieta";
  const options = Array.isArray(metadata?.options) ? metadata!.options : [];
  const total = options.reduce((s, o) => s + (votes[o.id]?.count ?? 0), 0);
  const closesAt = metadata?.closes_at ?? null;
  const closed = closesAt ? new Date(closesAt).getTime() <= Date.now() : false;
  const fg = mine ? "#ffffff" : "#2A2312";
  const sub = mine ? "#FFF1C2" : "#6B6557";
  // Mój głos: kurkuma (na ciemnym bąbelku jasna, na jasnym — ciemne złoto).
  const votedFg = mine ? "#FFBE0B" : "#6B4F05";
  const votedFill = mine ? "rgba(255,190,11,0.22)" : "#F3E3B0";
  const tags = [metadata?.multiple ? "wiele odpowiedzi" : null, metadata?.anonymous ? "anonimowa" : null].filter(Boolean);

  return (
    <View style={{ minWidth: 230, maxWidth: 300 }}>
      <Text style={{ fontSize: 12, color: sub, fontFamily: "Manrope_700Bold", marginBottom: 2 }}>
        Ankieta{tags.length ? ` · ${tags.join(" · ")}` : ""}
      </Text>
      <Text style={{ fontSize: 15, color: fg, fontFamily: "Manrope_600SemiBold", marginBottom: 8 }}>{question}</Text>
      {options.map((o) => {
        const v = votes[o.id] ?? { count: 0, mine: false };
        const pct = total > 0 ? Math.round((v.count / total) * 100) : 0;
        return (
          <Pressable
            key={o.id}
            onPress={() => !closed && onVote(o.id)}
            disabled={closed}
            accessibilityRole={metadata?.multiple ? "checkbox" : "radio"}
            accessibilityState={{ checked: v.mine, disabled: closed }}
            accessibilityLabel={`${o.text}: ${v.count} ${plVotes(v.count)}, ${pct}%`}
            style={{
              marginBottom: 6,
              borderRadius: 10,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: v.mine ? "#FFBE0B" : mine ? "rgba(255,255,255,0.4)" : "#E6E1D5",
            }}
          >
            <View
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: `${pct}%`,
                backgroundColor: v.mine ? votedFill : mine ? "rgba(255,255,255,0.22)" : "#ECE8DE",
              }}
            />
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingHorizontal: 10,
                paddingVertical: 8,
                gap: 8,
              }}
            >
              <Text
                style={{
                  flex: 1,
                  fontSize: 14,
                  color: v.mine ? votedFg : fg,
                  fontFamily: v.mine ? "Manrope_700Bold" : "Manrope_500Medium",
                }}
              >
                {o.text}
              </Text>
              <Text style={{ fontSize: 12, color: v.mine ? votedFg : sub, fontFamily: "Manrope_600SemiBold" }}>
                {v.count} · {pct}%
              </Text>
            </View>
          </Pressable>
        );
      })}
      {closed ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 }}>
          <Lock size={11} color={sub} />
          <Text style={{ fontSize: 12, color: fg, fontFamily: "Manrope_700Bold" }}>Ankieta zamknięta</Text>
          <Text style={{ fontSize: 11, color: sub, fontFamily: "Manrope_500Medium" }}>
            · {total} {plVotes(total)}
          </Text>
        </View>
      ) : (
        <Text style={{ fontSize: 11, color: sub, fontFamily: "Manrope_500Medium", marginTop: 2 }}>
          {total} {plVotes(total)}
          {closesAt ? ` · zamknięcie ${closesLabel(closesAt)}` : ""}
        </Text>
      )}
    </View>
  );
};
