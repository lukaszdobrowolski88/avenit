import { useMemo, useRef, type ReactNode } from "react";
import { Animated, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import { Reply } from "lucide-react-native";
import { B } from "../../../components/ui/brand";

// „Przesuń, aby odpowiedzieć” (jak WhatsApp): przeciągnięcie dymka w prawo poza próg ustawia
// odpowiedź; dymek wraca na miejsce. Tylko poziomy ruch w prawo — przewijanie listy w pionie
// i przytrzymanie (menu wiadomości) działają jak dotąd.
const THRESHOLD = 64;
const MAX = 96;

export function SwipeToReply({ enabled, onReply, children }: { enabled: boolean; onReply: () => void; children: ReactNode }) {
  const x = useRef(new Animated.Value(0)).current;
  const armed = useRef(false);
  const onReplyRef = useRef(onReply);
  onReplyRef.current = onReply;

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .runOnJS(true)
        .activeOffsetX(18)
        .failOffsetX(-12)
        .failOffsetY([-14, 14])
        .onUpdate((e) => {
          // Opór za progiem — dymek nie ucieka za daleko.
          const dx = Math.max(0, e.translationX);
          const v = dx <= THRESHOLD ? dx : Math.min(MAX, THRESHOLD + (dx - THRESHOLD) * 0.35);
          x.setValue(v);
          const over = dx >= THRESHOLD;
          if (over && !armed.current) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
          armed.current = over;
        })
        .onEnd(() => {
          if (armed.current) onReplyRef.current();
        })
        .onFinalize(() => {
          armed.current = false;
          Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 6, speed: 18 }).start();
        }),
    [enabled, x],
  );

  if (!enabled) return <>{children}</>;
  const iconOpacity = x.interpolate({ inputRange: [0, 24, THRESHOLD], outputRange: [0, 0.4, 1], extrapolate: "clamp" });
  const iconScale = x.interpolate({ inputRange: [0, THRESHOLD], outputRange: [0.6, 1], extrapolate: "clamp" });
  return (
    <GestureDetector gesture={gesture}>
      <View>
        <Animated.View
          pointerEvents="none"
          style={{ position: "absolute", left: 12, top: 0, bottom: 0, justifyContent: "center", opacity: iconOpacity, transform: [{ scale: iconScale }] }}
        >
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: B.paper2, alignItems: "center", justifyContent: "center" }}>
            <Reply size={16} color={B.ink} />
          </View>
        </Animated.View>
        <Animated.View style={{ transform: [{ translateX: x }] }}>{children}</Animated.View>
      </View>
    </GestureDetector>
  );
}
