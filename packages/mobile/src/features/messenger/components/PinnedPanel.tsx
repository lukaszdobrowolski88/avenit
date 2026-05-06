import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { ChevronDown, ChevronUp, Pin, X } from "lucide-react-native";
import {
  memberDisplayName,
  type MemberMap,
  type MessageRow,
  type PinnedRow,
} from "../api";

interface Props {
  pinned: PinnedRow[];
  messageById: Map<string, MessageRow>;
  members: MemberMap;
  onJump?: (msg: MessageRow) => void;
  onUnpin?: (msg: MessageRow) => void;
}

export const PinnedPanel = ({ pinned, messageById, members, onJump, onUnpin }: Props) => {
  const [expanded, setExpanded] = useState(false);

  const items = useMemo(() => {
    return pinned
      .map((p) => ({ pin: p, msg: messageById.get(p.message_id) ?? null }))
      .filter((x): x is { pin: PinnedRow; msg: MessageRow } => x.msg !== null);
  }, [pinned, messageById]);

  if (items.length === 0) return null;

  if (!expanded) {
    const first = items[0];
    const senderName = memberDisplayName(members, first.msg.sender_email);
    return (
      <Pressable
        onPress={() => setExpanded(true)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingHorizontal: 16,
          paddingVertical: 10,
          backgroundColor: "#fff7ed",
          borderBottomWidth: 1,
          borderBottomColor: "#fed7aa",
        }}
      >
        <Pin size={14} color="#c2410c" strokeWidth={2.4} />
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 11,
              color: "#c2410c",
              fontFamily: "Inter_700Bold",
              letterSpacing: -0.1,
            }}
          >
            Przypięte ({items.length}) · {senderName}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              fontSize: 13,
              color: "#7c2d12",
              fontFamily: "Inter_500Medium",
              marginTop: 1,
            }}
          >
            {first.msg.content || "(załącznik)"}
          </Text>
        </View>
        <ChevronDown size={16} color="#c2410c" />
      </Pressable>
    );
  }

  return (
    <View
      style={{
        backgroundColor: "#fff7ed",
        borderBottomWidth: 1,
        borderBottomColor: "#fed7aa",
        maxHeight: 220,
      }}
    >
      <Pressable
        onPress={() => setExpanded(false)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 16,
          paddingVertical: 8,
          borderBottomWidth: 1,
          borderBottomColor: "#fed7aa",
        }}
      >
        <Pin size={14} color="#c2410c" strokeWidth={2.4} />
        <Text
          style={{
            flex: 1,
            fontSize: 12,
            color: "#c2410c",
            fontFamily: "Inter_700Bold",
            letterSpacing: -0.1,
          }}
        >
          Przypięte wiadomości ({items.length})
        </Text>
        <ChevronUp size={16} color="#c2410c" />
      </Pressable>
      <ScrollView style={{ maxHeight: 180 }}>
        {items.map(({ pin, msg }) => {
          const senderName = memberDisplayName(members, msg.sender_email);
          return (
            <View
              key={pin.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: "#fed7aa",
              }}
            >
              <Pressable
                onPress={() => onJump?.(msg)}
                style={{ flex: 1 }}
                hitSlop={4}
              >
                <Text
                  style={{
                    fontSize: 11,
                    color: "#c2410c",
                    fontFamily: "Inter_700Bold",
                  }}
                >
                  {senderName}
                </Text>
                <Text
                  numberOfLines={2}
                  style={{
                    fontSize: 13,
                    color: "#7c2d12",
                    fontFamily: "Inter_400Regular",
                    marginTop: 1,
                  }}
                >
                  {msg.content || "(załącznik)"}
                </Text>
              </Pressable>
              {onUnpin ? (
                <Pressable
                  onPress={() => onUnpin(msg)}
                  hitSlop={6}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <X size={14} color="#9a3412" />
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};
