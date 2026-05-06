import { Text, View } from "react-native";
import { format, isToday, isYesterday } from "date-fns";
import { pl } from "date-fns/locale";

const labelFor = (date: Date): string => {
  if (isToday(date)) return "Dziś";
  if (isYesterday(date)) return "Wczoraj";
  return format(date, "EEEE, d MMM yyyy", { locale: pl });
};

export const DateSeparator = ({ date }: { date: string | Date }) => {
  const d = typeof date === "string" ? new Date(date) : date;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        marginVertical: 12,
        gap: 8,
      }}
    >
      <View style={{ flex: 1, height: 1, backgroundColor: "#eef0f3" }} />
      <Text
        style={{
          fontSize: 11,
          color: "#78716c",
          fontFamily: "Inter_700Bold",
          textTransform: "capitalize",
          letterSpacing: 0.4,
        }}
      >
        {labelFor(d)}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: "#eef0f3" }} />
    </View>
  );
};
