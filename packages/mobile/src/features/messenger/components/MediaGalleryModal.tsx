import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { FileText, X } from "lucide-react-native";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { useConversationMedia, type MediaItem } from "../api";

interface Props {
  visible: boolean;
  onClose: () => void;
  conversationId: string;
}

type Tab = "images" | "files";

export const MediaGalleryModal = ({ visible, onClose, conversationId }: Props) => {
  const { width } = useWindowDimensions();
  const { data, isLoading } = useConversationMedia(conversationId, visible);
  const [tab, setTab] = useState<Tab>("images");
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);

  const images = useMemo(
    () => (data ?? []).filter((m) => m.type?.startsWith("image/")),
    [data],
  );
  const files = useMemo(
    () => (data ?? []).filter((m) => !m.type?.startsWith("image/")),
    [data],
  );

  const cellSize = Math.floor((width - 32 - 8) / 3);

  const renderImageCell = ({ item, index }: { item: MediaItem; index: number }) => (
    <Pressable
      onPress={() => setPreviewIdx(index)}
      style={{
        width: cellSize,
        height: cellSize,
        margin: 2,
        borderRadius: 8,
        overflow: "hidden",
        backgroundColor: "#fafaf9",
      }}
    >
      <Image
        source={{ uri: item.url }}
        style={{ width: "100%", height: "100%" }}
        resizeMode="cover"
      />
    </Pressable>
  );

  const renderFileRow = ({ item }: { item: MediaItem }) => (
    <Pressable
      onPress={() => Linking.openURL(item.url)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: "#f5f5f4",
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          backgroundColor: "#fef3f2",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <FileText size={18} color="#dc2626" />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: 14,
            color: "#0c0a09",
            fontFamily: "Inter_600SemiBold",
          }}
        >
          {item.name}
        </Text>
        <Text
          style={{
            fontSize: 11,
            color: "#a8a29e",
            fontFamily: "Inter_500Medium",
            marginTop: 2,
          }}
        >
          {format(new Date(item.createdAt), "d MMM yyyy, HH:mm", { locale: pl })}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <View style={{ flex: 1, backgroundColor: "#ffffff" }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingTop: 16,
            paddingBottom: 12,
            paddingHorizontal: 16,
            gap: 12,
            borderBottomWidth: 1,
            borderBottomColor: "#eef0f3",
          }}
        >
          <Pressable onPress={onClose} hitSlop={10}>
            <X size={22} color="#1c1917" />
          </Pressable>
          <Text
            style={{
              flex: 1,
              fontSize: 16,
              color: "#0c0a09",
              fontFamily: "Inter_700Bold",
              letterSpacing: -0.3,
            }}
          >
            Galeria mediów
          </Text>
        </View>

        <View
          style={{
            flexDirection: "row",
            gap: 6,
            paddingHorizontal: 16,
            paddingVertical: 12,
          }}
        >
          {(
            [
              { key: "images", label: `Zdjęcia (${images.length})` },
              { key: "files", label: `Pliki (${files.length})` },
            ] as { key: Tab; label: string }[]
          ).map((t) => {
            const active = tab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  borderRadius: 999,
                  backgroundColor: active ? "#0c0a09" : "#fafaf9",
                  borderWidth: 1,
                  borderColor: active ? "#0c0a09" : "#eef0f3",
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: active ? "#ffffff" : "#1c1917",
                    fontFamily: "Inter_600SemiBold",
                  }}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {isLoading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color="#ec4899" />
          </View>
        ) : tab === "images" ? (
          <FlatList
            data={images}
            keyExtractor={(it, i) => `${it.messageId}-${i}`}
            numColumns={3}
            contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 32 }}
            renderItem={renderImageCell}
            ListEmptyComponent={
              <Text
                style={{
                  textAlign: "center",
                  marginTop: 48,
                  color: "#78716c",
                  fontFamily: "Inter_500Medium",
                }}
              >
                Brak zdjęć w tej rozmowie.
              </Text>
            }
          />
        ) : (
          <FlatList
            data={files}
            keyExtractor={(it, i) => `${it.messageId}-${i}`}
            renderItem={renderFileRow}
            ListEmptyComponent={
              <Text
                style={{
                  textAlign: "center",
                  marginTop: 48,
                  color: "#78716c",
                  fontFamily: "Inter_500Medium",
                }}
              >
                Brak plików w tej rozmowie.
              </Text>
            }
          />
        )}
      </View>

      {/* Pełnoekranowy podgląd zdjęcia */}
      <Modal
        visible={previewIdx !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewIdx(null)}
      >
        <Pressable
          onPress={() => setPreviewIdx(null)}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.92)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {previewIdx !== null && images[previewIdx] ? (
            <Image
              source={{ uri: images[previewIdx].url }}
              style={{ width: "100%", height: "100%" }}
              resizeMode="contain"
            />
          ) : null}
          <Pressable
            onPress={() => setPreviewIdx(null)}
            hitSlop={12}
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
