import { useState } from "react";
import { Image, Linking, Pressable, Text, View } from "react-native";
import { Link2 } from "lucide-react-native";
import { useLinkPreview } from "../plus";
import { linkDomain } from "../logic";
import { showError } from "../../../lib/errors";

// K2 — karta podglądu PIERWSZEGO linku w wiadomości (obrazek, tytuł, domena). Pobierana dopiero,
// gdy wiadomość się wyrenderuje (lista wątku renderuje tylko okolice ekranu). Brak danych — nic.
export const openLink = (url: string) =>
  Linking.openURL(url).catch((e) => showError("Nie udało się otworzyć linku", e, "Sprawdź adres albo otwórz go w przeglądarce."));

export const LinkPreviewCard = ({ url, mine, onLongPress }: { url: string; mine: boolean; onLongPress?: () => void }) => {
  const { data } = useLinkPreview(url);
  const [imageFailed, setImageFailed] = useState(false);
  if (!data) return null;
  const domain = data.siteName || linkDomain(data.url || url);
  // http:// bywa blokowane przez iOS (ATS) — tylko bezpieczne obrazki.
  const image = !imageFailed && data.image && /^https:\/\//i.test(data.image) ? data.image : null;
  const fg = mine ? "#ffffff" : "#2A2312";
  const sub = mine ? "#F3E3B0" : "#6B6557";
  return (
    <Pressable
      onPress={() => openLink(data.url || url)}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="link"
      accessibilityLabel={`${data.title || domain}. Otwórz link`}
      className="active:opacity-80"
      style={{
        marginTop: 6,
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: mine ? "rgba(255,255,255,0.12)" : "#F6F4EE",
        borderWidth: 1,
        borderColor: mine ? "rgba(255,255,255,0.18)" : "#E6E1D5",
        maxWidth: 280,
      }}
    >
      {image ? (
        <Image
          source={{ uri: image }}
          style={{ width: "100%", height: 130, backgroundColor: mine ? "rgba(255,255,255,0.08)" : "#ECE8DE" }}
          resizeMode="cover"
          onError={() => setImageFailed(true)}
        />
      ) : null}
      <View style={{ paddingHorizontal: 10, paddingVertical: 8, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Link2 size={11} color={sub} />
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 11, color: sub, fontFamily: "Manrope_600SemiBold" }}>
            {domain}
          </Text>
        </View>
        {data.title ? (
          <Text numberOfLines={2} style={{ fontSize: 13, lineHeight: 18, color: fg, fontFamily: "Manrope_700Bold" }}>
            {data.title}
          </Text>
        ) : null}
        {data.description ? (
          <Text numberOfLines={2} style={{ fontSize: 12, lineHeight: 16, color: sub, fontFamily: "Manrope_400Regular" }}>
            {data.description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
};
