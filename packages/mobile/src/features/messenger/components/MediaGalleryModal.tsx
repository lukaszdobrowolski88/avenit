import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { friendlyError } from "../../../lib/errors";
import { FileText, X } from "lucide-react-native";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { useConversationMedia, type MediaItem } from "../api";
import { isVoiceAttachment } from "../logic";
import { openAttachment } from "../signedUrl";
import { AttachmentImage } from "./AttachmentImage";

interface Props {
  visible: boolean;
  onClose: () => void;
  conversationId: string;
}

type Tab = "images" | "files";

// Galeria rozmowy (K11): paczkami od najnowszych, kolejne przy przewijaniu; pliki i zdjęcia
// przez podpisany link (K1).
export const MediaGalleryModal = ({ visible, onClose, conversationId }: Props) => {
  const { width } = useWindowDimensions();
  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useConversationMedia(
    conversationId,
    visible,
  );
  const [tab, setTab] = useState<Tab>("images");
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);

  const all = useMemo(() => (data?.pages ?? []).flatMap((p) => p.items), [data]);
  const images = useMemo(() => all.filter((m: MediaItem) => m.type?.startsWith("image/")), [all]);
  // Głosówki nie są „plikami” do przeglądania — zostają w rozmowie.
  const files = useMemo(
    () => all.filter((m: MediaItem) => !m.type?.startsWith("image/") && !isVoiceAttachment(m)),
    [all],
  );

  const cellSize = Math.floor((width - 32 - 8) / 3);
  const more = () => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  };
  // Mało pozycji w bieżącej zakładce (np. same pliki w pierwszych paczkach) — doczytaj dalej,
  // bo pusta lista nie przewija się i sama nie poprosi o więcej.
  const shown = tab === "images" ? images.length : files.length;
  useEffect(() => {
    if (visible && shown < 12 && hasNextPage && !isFetchingNextPage && !isLoading) fetchNextPage();
  }, [visible, shown, hasNextPage, isFetchingNextPage, isLoading, fetchNextPage]);
  const plus = hasNextPage ? "+" : "";

  const renderImageCell = ({ item, index }: { item: MediaItem; index: number }) => (
    <Pressable
      onPress={() => setPreviewIdx(index)}
      accessibilityRole="imagebutton"
      accessibilityLabel={`Zdjęcie z ${format(new Date(item.createdAt), "d MMMM", { locale: pl })}`}
      className="active:opacity-80"
      style={{
        width: cellSize,
        height: cellSize,
        margin: 2,
        borderRadius: 8,
        overflow: "hidden",
        backgroundColor: "#F1EEE6",
      }}
    >
      <AttachmentImage url={item.url} style={{ width: "100%", height: "100%" }} />
    </Pressable>
  );

  const renderFileRow = ({ item }: { item: MediaItem }) => (
    <Pressable
      onPress={() => openAttachment(item.url)}
      accessibilityRole="button"
      accessibilityLabel={`Otwórz plik ${item.name}`}
      className="active:opacity-70"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: "#ECE8DE",
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          backgroundColor: "#FFF8E1",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <FileText size={18} color="#2A2312" />
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 14, color: "#2A2312", fontFamily: "Manrope_600SemiBold" }}>
          {item.name}
        </Text>
        <Text style={{ fontSize: 11, color: "#6E685A", fontFamily: "Manrope_500Medium", marginTop: 2 }}>
          {format(new Date(item.createdAt), "d MMM yyyy, HH:mm", { locale: pl })}
        </Text>
      </View>
    </Pressable>
  );

  const footer = isFetchingNextPage ? (
    <View style={{ paddingVertical: 18 }}>
      <ActivityIndicator color="#2A2312" />
    </View>
  ) : null;

  const empty = (text: string) => (
    <Text style={{ textAlign: "center", marginTop: 48, color: "#6B6557", fontFamily: "Manrope_500Medium" }}>
      {hasNextPage ? "Wczytywanie…" : text}
    </Text>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: "#F6F4EE" }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingTop: 16,
            paddingBottom: 12,
            paddingHorizontal: 16,
            gap: 12,
            borderBottomWidth: 1,
            borderBottomColor: "#E6E1D5",
          }}
        >
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Zamknij galerię">
            <X size={22} color="#2A2312" />
          </Pressable>
          <Text style={{ flex: 1, fontSize: 16, color: "#2A2312", fontFamily: "Manrope_700Bold", letterSpacing: -0.3 }}>
            Zdjęcia i pliki
          </Text>
        </View>

        <View style={{ flexDirection: "row", gap: 6, paddingHorizontal: 16, paddingVertical: 12 }}>
          {(
            [
              { key: "images", label: `Zdjęcia (${images.length}${plus})` },
              { key: "files", label: `Pliki (${files.length}${plus})` },
            ] as { key: Tab; label: string }[]
          ).map((t) => {
            const active = tab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  borderRadius: 999,
                  backgroundColor: active ? "#2A2312" : "#F1EEE6",
                  borderWidth: 1,
                  borderColor: active ? "#2A2312" : "#E6E1D5",
                }}
              >
                <Text style={{ fontSize: 13, color: active ? "#ffffff" : "#2A2312", fontFamily: "Manrope_600SemiBold" }}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {isLoading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color="#2A2312" />
          </View>
        ) : isError && !data ? (
          <Text style={{ textAlign: "center", marginTop: 48, marginHorizontal: 24, color: "#4A463E", fontFamily: "Manrope_500Medium" }}>
            {friendlyError(error, "Nie udało się wczytać zdjęć i plików z rozmowy.")}
          </Text>
        ) : tab === "images" ? (
          <FlatList
            key="images"
            data={images}
            keyExtractor={(it, i) => `${it.messageId}-${i}`}
            numColumns={3}
            contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 32 }}
            renderItem={renderImageCell}
            onEndReached={more}
            onEndReachedThreshold={0.6}
            ListFooterComponent={footer}
            ListEmptyComponent={empty("Brak zdjęć w tej rozmowie.")}
          />
        ) : (
          <FlatList
            key="files"
            data={files}
            keyExtractor={(it, i) => `${it.messageId}-${i}`}
            renderItem={renderFileRow}
            onEndReached={more}
            onEndReachedThreshold={0.6}
            ListFooterComponent={footer}
            ListEmptyComponent={empty("Brak plików w tej rozmowie.")}
          />
        )}
      </View>

      {/* Pełnoekranowy podgląd zdjęcia */}
      <Modal visible={previewIdx !== null} transparent animationType="fade" onRequestClose={() => setPreviewIdx(null)}>
        <Pressable
          onPress={() => setPreviewIdx(null)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)", alignItems: "center", justifyContent: "center" }}
        >
          {previewIdx !== null && images[previewIdx] ? (
            <AttachmentImage url={images[previewIdx].url} style={{ width: "100%", height: "100%" }} resizeMode="contain" dark />
          ) : null}
          <Pressable
            onPress={() => setPreviewIdx(null)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Zamknij podgląd"
            style={{
              position: "absolute",
              top: 60,
              right: 24,
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: "rgba(0,0,0,0.5)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={20} color="#ffffff" />
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
};
