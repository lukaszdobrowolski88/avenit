import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Search, X } from "lucide-react-native";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import {
  useSearchMessages,
  memberDisplayName,
  type MemberMap,
  type MessageRow,
} from "../api";

interface Props {
  visible: boolean;
  onClose: () => void;
  conversationId: string;
  members: MemberMap;
  onJump?: (msg: MessageRow) => void;
}

export const SearchModal = ({
  visible,
  onClose,
  conversationId,
  members,
  onJump,
}: Props) => {
  const [query, setQuery] = useState("");
  const trimmed = query.trim();
  const { data, isFetching } = useSearchMessages(
    conversationId,
    trimmed,
    visible,
  );

  const handleClose = () => {
    setQuery("");
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
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
            gap: 10,
            borderBottomWidth: 1,
            borderBottomColor: "#eef0f3",
          }}
        >
          <Pressable onPress={handleClose} hitSlop={10}>
            <X size={22} color="#1c1917" />
          </Pressable>
          <View
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingHorizontal: 14,
              height: 42,
              borderRadius: 14,
              backgroundColor: "#fafaf9",
              borderWidth: 1,
              borderColor: "#eef0f3",
            }}
          >
            <Search size={16} color="#a8a29e" />
            <TextInput
              style={{
                flex: 1,
                fontSize: 14,
                color: "#0c0a09",
                fontFamily: "Inter_500Medium",
              }}
              placeholder="Szukaj wiadomości…"
              placeholderTextColor="#a8a29e"
              value={query}
              onChangeText={setQuery}
              autoFocus
              autoCapitalize="none"
            />
            {query ? (
              <Pressable onPress={() => setQuery("")} hitSlop={8}>
                <X size={14} color="#a8a29e" />
              </Pressable>
            ) : null}
          </View>
        </View>

        {trimmed.length < 2 ? (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 32,
            }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 18,
                backgroundColor: "#fef3f2",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 12,
              }}
            >
              <Search size={26} color="#ec4899" />
            </View>
            <Text
              style={{
                fontSize: 15,
                color: "#0c0a09",
                fontFamily: "Inter_700Bold",
                marginBottom: 4,
              }}
            >
              Wyszukaj wiadomości
            </Text>
            <Text
              style={{
                textAlign: "center",
                fontSize: 13,
                color: "#78716c",
                fontFamily: "Inter_500Medium",
              }}
            >
              Wpisz co najmniej 2 znaki, aby rozpocząć wyszukiwanie
            </Text>
          </View>
        ) : isFetching ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color="#ec4899" />
          </View>
        ) : (
          <FlatList
            data={data ?? []}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
            ItemSeparatorComponent={() => (
              <View style={{ height: 1, backgroundColor: "#f5f5f4" }} />
            )}
            ListEmptyComponent={
              <Text
                style={{
                  textAlign: "center",
                  marginTop: 48,
                  color: "#78716c",
                  fontFamily: "Inter_500Medium",
                }}
              >
                Brak wyników.
              </Text>
            }
            renderItem={({ item }) => {
              const senderName = memberDisplayName(members, item.sender_email);
              const date = format(new Date(item.created_at), "d MMM, HH:mm", {
                locale: pl,
              });
              return (
                <Pressable
                  onPress={() => {
                    onJump?.(item);
                    handleClose();
                  }}
                  style={{ paddingVertical: 12 }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 4,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        color: "#be185d",
                        fontFamily: "Inter_700Bold",
                      }}
                    >
                      {senderName}
                    </Text>
                    <Text
                      style={{
                        fontSize: 11,
                        color: "#a8a29e",
                        fontFamily: "Inter_500Medium",
                      }}
                    >
                      {date}
                    </Text>
                  </View>
                  <Text
                    numberOfLines={2}
                    style={{
                      fontSize: 14,
                      color: "#1c1917",
                      fontFamily: "Inter_400Regular",
                      lineHeight: 19,
                    }}
                  >
                    {item.content || "(załącznik)"}
                  </Text>
                </Pressable>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
};
