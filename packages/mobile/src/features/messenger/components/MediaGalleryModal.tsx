import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { friendlyError } from "../../../lib/errors";
import { CornerDownRight, FileText, Link2, Play, X } from "lucide-react-native";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { voiceDurationMs } from "../logic";
import { openAttachment } from "../signedUrl";
import { useConversationFiles, type ConversationFileItem, type FilesKind } from "../conversationFiles";
import { AttachmentImage } from "./AttachmentImage";
import { AudioPlayer } from "./AudioPlayer";

interface Props {
  visible: boolean;
  onClose: () => void;
  conversationId: string;
  /** „Pokaż w rozmowie” — okno się zamyka, wątek przewija do wiadomości. */
  onJump?: (message: { id: string; created_at: string; thread_root_id?: string | null }) => void;
}

// Media, pliki, linki i głosówki rozmowy — jak web (MediaGalleryModal.jsx). Dane filtruje serwer
// (fn chat-media), paczkami od najnowszych, kolejne przy przewijaniu; pliki i zdjęcia przez
// podpisany link (K1).
const TABS: { key: FilesKind; label: string }[] = [
  { key: "media", label: "Media" },
  { key: "files", label: "Pliki" },
  { key: "links", label: "Linki" },
  { key: "voice", label: "Głosowe" },
];
const EMPTY: Record<FilesKind, string> = {
  media: "Brak zdjęć i filmów w tej rozmowie.",
  files: "Brak plików w tej rozmowie.",
  links: "Brak linków w tej rozmowie.",
  voice: "Brak wiadomości głosowych w tej rozmowie.",
};
const isImage = (it: ConversationFileItem) => String(it.attachment?.type || "").startsWith("image/");
const fmtSize = (n?: number | null) => {
  const b = Number(n);
  if (!Number.isFinite(b) || b <= 0) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};
const safeHttp = (url?: string) => !!url && /^https?:\/\//i.test(url);

export const MediaGalleryModal = ({ visible, onClose, conversationId, onJump }: Props) => {
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<FilesKind>("media");
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useConversationFiles(
    conversationId,
    tab,
    visible,
  );

  const items = useMemo(() => (data?.pages ?? []).flatMap((p) => p.items), [data]);
  const images = useMemo(() => items.filter(isImage), [items]);

  const cellSize = Math.floor((width - 32 - 8) / 3);
  const more = () => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  };
  const meta = (it: ConversationFileItem, extra?: string) =>
    [extra, it.sender_name, format(new Date(it.created_at), "d MMM yyyy, HH:mm", { locale: pl })].filter(Boolean).join(" · ");
  const jump = (it: ConversationFileItem) => {
    if (!onJump) return;
    onClose();
    setTimeout(() => onJump({ id: it.message_id, created_at: it.created_at, thread_root_id: it.thread_root_id ?? null }), 250);
  };

  const jumpButton = (it: ConversationFileItem) =>
    onJump ? (
      <Pressable
        onPress={() => jump(it)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Pokaż w rozmowie"
        className="active:opacity-60"
        style={{ padding: 6 }}
      >
        <CornerDownRight size={17} color="#6E685A" />
      </Pressable>
    ) : null;

  const rowStyle = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#ECE8DE",
  };
  const iconBox = {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#FFF8E1",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  };

  const renderMediaCell = ({ item }: { item: ConversationFileItem }) => {
    const a = item.attachment;
    if (!a?.url) return null;
    if (isImage(item)) {
      const idx = images.indexOf(item);
      return (
        <Pressable
          onPress={() => setPreviewIdx(idx)}
          accessibilityRole="imagebutton"
          accessibilityLabel={`Zdjęcie z ${format(new Date(item.created_at), "d MMMM", { locale: pl })}`}
          className="active:opacity-80"
          style={{ width: cellSize, height: cellSize, margin: 2, borderRadius: 8, overflow: "hidden", backgroundColor: "#F1EEE6" }}
        >
          <AttachmentImage url={a.url} style={{ width: "100%", height: "100%" }} />
        </Pressable>
      );
    }
    return (
      <Pressable
        onPress={() => openAttachment(a.url)}
        accessibilityRole="button"
        accessibilityLabel={`Otwórz film ${a.name ?? ""}`}
        className="active:opacity-80"
        style={{
          width: cellSize,
          height: cellSize,
          margin: 2,
          borderRadius: 8,
          backgroundColor: "#ECE8DE",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          padding: 6,
        }}
      >
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#2A2312", alignItems: "center", justifyContent: "center" }}>
          <Play size={16} color="#ffffff" />
        </View>
        <Text numberOfLines={1} style={{ fontSize: 11, color: "#4A463E", fontFamily: "Manrope_500Medium" }}>
          {a.name || "Film"}
        </Text>
      </Pressable>
    );
  };

  const renderFileRow = ({ item }: { item: ConversationFileItem }) => {
    const a = item.attachment;
    if (!a?.url) return null;
    return (
      <View style={rowStyle}>
        <Pressable
          onPress={() => openAttachment(a.url)}
          accessibilityRole="button"
          accessibilityLabel={`Otwórz plik ${a.name}`}
          className="active:opacity-70"
          style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12 }}
        >
          <View style={iconBox}>
            <FileText size={18} color="#2A2312" />
          </View>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontSize: 14, color: "#2A2312", fontFamily: "Manrope_600SemiBold" }}>
              {a.name || "Plik"}
            </Text>
            <Text numberOfLines={1} style={{ fontSize: 11, color: "#6E685A", fontFamily: "Manrope_500Medium", marginTop: 2 }}>
              {meta(item, fmtSize(a.size))}
            </Text>
          </View>
        </Pressable>
        {jumpButton(item)}
      </View>
    );
  };

  const renderLinkRow = ({ item }: { item: ConversationFileItem }) => {
    if (!safeHttp(item.url)) return null;
    return (
      <View style={rowStyle}>
        <Pressable
          onPress={() => void Linking.openURL(item.url!)}
          accessibilityRole="link"
          accessibilityLabel={`Otwórz link ${item.title || item.domain || item.url}`}
          className="active:opacity-70"
          style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12 }}
        >
          <View style={iconBox}>
            <Link2 size={18} color="#2A2312" />
          </View>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontSize: 14, color: "#2A2312", fontFamily: "Manrope_600SemiBold" }}>
              {item.title || item.domain || item.url}
            </Text>
            <Text numberOfLines={1} style={{ fontSize: 11, color: "#6E685A", fontFamily: "Manrope_500Medium", marginTop: 2 }}>
              {meta(item, item.site_name || item.domain)}
            </Text>
          </View>
        </Pressable>
        {jumpButton(item)}
      </View>
    );
  };

  const renderVoiceRow = ({ item }: { item: ConversationFileItem }) => {
    const a = item.attachment;
    if (!a?.url) return null;
    return (
      <View style={rowStyle}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text numberOfLines={1} style={{ fontSize: 11, color: "#6E685A", fontFamily: "Manrope_500Medium" }}>
            {meta(item)}
          </Text>
          <AudioPlayer uri={a.url} mime={a.type} durationHintMs={voiceDurationMs(a)} variant="dark" />
        </View>
        {jumpButton(item)}
      </View>
    );
  };

  const footer = isFetchingNextPage ? (
    <View style={{ paddingVertical: 18 }}>
      <ActivityIndicator color="#2A2312" />
    </View>
  ) : null;
  const empty = (
    <Text style={{ textAlign: "center", marginTop: 48, color: "#6B6557", fontFamily: "Manrope_500Medium" }}>{EMPTY[tab]}</Text>
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
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Zamknij">
            <X size={22} color="#2A2312" />
          </Pressable>
          <Text style={{ flex: 1, fontSize: 16, color: "#2A2312", fontFamily: "Manrope_700Bold", letterSpacing: -0.3 }}>
            Media, pliki i linki
          </Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ gap: 6, paddingHorizontal: 16, paddingVertical: 12 }}
        >
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => {
                  setTab(t.key);
                  setPreviewIdx(null);
                }}
                accessibilityRole="tab"
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
                <Text numberOfLines={1} style={{ fontSize: 13, color: active ? "#ffffff" : "#2A2312", fontFamily: "Manrope_600SemiBold" }}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {isLoading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color="#2A2312" />
          </View>
        ) : isError && !data ? (
          <Text style={{ textAlign: "center", marginTop: 48, marginHorizontal: 24, color: "#4A463E", fontFamily: "Manrope_500Medium" }}>
            {friendlyError(error, "Nie udało się wczytać materiałów rozmowy.")}
          </Text>
        ) : tab === "media" ? (
          <FlatList
            key="media"
            data={items}
            keyExtractor={(it) => it.key}
            numColumns={3}
            contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 32 }}
            renderItem={renderMediaCell}
            onEndReached={more}
            onEndReachedThreshold={0.6}
            ListFooterComponent={footer}
            ListEmptyComponent={empty}
          />
        ) : (
          <FlatList
            key={tab}
            data={items}
            keyExtractor={(it) => it.key}
            renderItem={tab === "files" ? renderFileRow : tab === "links" ? renderLinkRow : renderVoiceRow}
            onEndReached={more}
            onEndReachedThreshold={0.6}
            ListFooterComponent={footer}
            ListEmptyComponent={empty}
            contentContainerStyle={{ paddingBottom: 32 }}
          />
        )}
      </View>

      {/* Pełnoekranowy podgląd zdjęcia */}
      <Modal visible={previewIdx !== null} transparent animationType="fade" onRequestClose={() => setPreviewIdx(null)}>
        <Pressable
          onPress={() => setPreviewIdx(null)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)", alignItems: "center", justifyContent: "center" }}
        >
          {previewIdx !== null && images[previewIdx]?.attachment?.url ? (
            <AttachmentImage url={images[previewIdx].attachment!.url} style={{ width: "100%", height: "100%" }} resizeMode="contain" dark />
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
