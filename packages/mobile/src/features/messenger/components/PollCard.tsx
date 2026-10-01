import { Pressable, Text, View } from "react-native";
import type { PollMetadata } from "../api";

// Ankieta w czacie (spec §2). Definicja w message.metadata, głosy z usePollVotes.
interface Props {
  metadata: PollMetadata | null | undefined;
  content: string;
  votes: Record<string, { count: number; mine: boolean }>;
  onVote: (optionId: string) => void;
  mine: boolean;
}

export const PollCard = ({ metadata, content, votes, onVote, mine }: Props) => {
  const question = metadata?.question || content || "Ankieta";
  const options = Array.isArray(metadata?.options) ? metadata!.options : [];
  const total = options.reduce((s, o) => s + (votes[o.id]?.count ?? 0), 0);
  const closed = metadata?.closes_at ? new Date(metadata.closes_at).getTime() < Date.now() : false;
  const fg = mine ? "#ffffff" : "#0c0a09";
  const sub = mine ? "#fce7f3" : "#78716c";

  return (
    <View style={{ minWidth: 230, maxWidth: 300 }}>
      <Text style={{ fontSize: 12, color: sub, fontFamily: "Inter_700Bold", marginBottom: 2 }}>
        📊 Ankieta
      </Text>
      <Text style={{ fontSize: 15, color: fg, fontFamily: "Inter_600SemiBold", marginBottom: 8 }}>
        {question}
      </Text>
      {options.map((o) => {
        const v = votes[o.id] ?? { count: 0, mine: false };
        const pct = total > 0 ? Math.round((v.count / total) * 100) : 0;
        return (
          <Pressable
            key={o.id}
            onPress={() => !closed && onVote(o.id)}
            disabled={closed}
            style={{
              marginBottom: 6,
              borderRadius: 10,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: v.mine ? "#f9a8d4" : mine ? "rgba(255,255,255,0.4)" : "#eef0f3",
            }}
          >
            <View
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: `${pct}%`,
                backgroundColor: v.mine ? "#fbcfe8" : mine ? "rgba(255,255,255,0.22)" : "#f5f5f4",
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
                  color: v.mine ? "#9d174d" : fg,
                  fontFamily: v.mine ? "Inter_700Bold" : "Inter_500Medium",
                }}
              >
                {o.text}
              </Text>
              <Text style={{ fontSize: 12, color: v.mine ? "#9d174d" : sub, fontFamily: "Inter_600SemiBold" }}>
                {v.count} · {pct}%
              </Text>
            </View>
          </Pressable>
        );
      })}
      <Text style={{ fontSize: 11, color: sub, fontFamily: "Inter_500Medium", marginTop: 2 }}>
        {total} {total === 1 ? "głos" : "głosów"}
        {metadata?.multiple ? " · wielokrotny wybór" : ""}
        {closed ? " · zamknięta" : ""}
      </Text>
    </View>
  );
};
