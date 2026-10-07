import { useState } from "react";
import { ActivityIndicator, Image, View, type ImageStyle, type StyleProp } from "react-native";
import { ImageOff } from "lucide-react-native";
import { useAttachmentUrl } from "../signedUrl";

// Zdjęcie z rozmowy (K1): adres podpisany na czas wyświetlenia; do tego czasu — tło papieru.
// Nieudane wczytanie (np. plik usunięty z serwera) — ikona zamiast pustego prostokąta.
interface Props {
  url: string;
  style: StyleProp<ImageStyle>;
  resizeMode?: "cover" | "contain";
  /** Ciemne tło (podgląd pełnoekranowy). */
  dark?: boolean;
  accessibilityLabel?: string;
}

export const AttachmentImage = ({ url, style, resizeMode = "cover", dark, accessibilityLabel }: Props) => {
  const uri = useAttachmentUrl(url);
  const [failed, setFailed] = useState(false);
  const bg = dark ? "transparent" : "#ECE8DE";
  if (!uri || failed) {
    return (
      <View style={[style as any, { backgroundColor: bg, alignItems: "center", justifyContent: "center" }]}>
        {failed ? <ImageOff size={20} color={dark ? "#CFC8B6" : "#6E685A"} /> : <ActivityIndicator color={dark ? "#ffffff" : "#6E685A"} />}
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={[{ backgroundColor: bg }, style]}
      resizeMode={resizeMode}
      accessibilityLabel={accessibilityLabel}
      onError={() => setFailed(true)}
    />
  );
};
