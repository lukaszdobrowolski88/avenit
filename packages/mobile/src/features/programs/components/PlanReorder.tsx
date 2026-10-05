import { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, Text, View } from 'react-native';
import { GripVertical } from 'lucide-react-native';
import { B } from '../../../components/ui/brand';
import { KIND_META, type PlanItem, type ScheduleKind } from '../schedule';

// Zmiana kolejności planu przeciąganiem (jak drag & drop na webie). Wiersze mają stałą
// wysokość, więc pozycję docelową liczymy z przesunięcia palca. Na czas przeciągania
// rodzic wyłącza przewijanie (setScrollEnabled), żeby gest nie przewijał ekranu.

const F = { medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold' } as const;
const ROW = 58;

export const PlanReorder = ({
  items,
  onDone,
  onCancel,
  setScrollEnabled,
}: {
  items: PlanItem[];
  onDone: (items: PlanItem[]) => void;
  onCancel: () => void;
  setScrollEnabled: (on: boolean) => void;
}) => {
  const [order, setOrder] = useState(() => items.map((_, i) => i));
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const dragRef = useRef<{ from: number; to: number } | null>(null);
  const dy = useRef(new Animated.Value(0)).current;
  const orderRef = useRef(order);
  orderRef.current = order;

  const clamp = (i: number) => Math.max(0, Math.min(items.length - 1, i));

  // Jeden uchwyt na pozycję (nie na element) — po przestawieniu pozycje są te same.
  const responders = useMemo(
    () =>
      items.map((_, pos) => {
        const finish = () => {
          const d = dragRef.current;
          dragRef.current = null;
          if (d && d.from !== d.to) {
            const next = orderRef.current.slice();
            const [moved] = next.splice(d.from, 1);
            next.splice(d.to, 0, moved);
            setOrder(next);
          }
          dy.setValue(0);
          setDrag(null);
          setScrollEnabled(true);
        };
        return PanResponder.create({
          onStartShouldSetPanResponder: () => true,
          onMoveShouldSetPanResponder: () => true,
          onPanResponderTerminationRequest: () => false,
          onPanResponderGrant: () => {
            setScrollEnabled(false);
            dragRef.current = { from: pos, to: pos };
            dy.setValue(0);
            setDrag({ from: pos, to: pos });
          },
          onPanResponderMove: (_e, g) => {
            dy.setValue(g.dy);
            const to = clamp(pos + Math.round(g.dy / ROW));
            if (dragRef.current && to !== dragRef.current.to) {
              dragRef.current = { from: pos, to };
              setDrag({ from: pos, to });
            }
          },
          onPanResponderRelease: finish,
          onPanResponderTerminate: finish,
        });
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items.length],
  );

  const changed = order.some((v, i) => v !== i);

  return (
    <View>
      <Text style={{ marginLeft: 4, marginBottom: 10, fontSize: 13, color: B.ink3, fontFamily: F.semibold }}>
        Przytrzymaj uchwyt ≡ i przeciągnij punkt na nowe miejsce.
      </Text>
      <View style={{ backgroundColor: B.card, borderRadius: 22 }}>
        {order.map((itemIdx, pos) => {
          const it = items[itemIdx];
          const kind = ((it?.type as ScheduleKind) in KIND_META ? it.type : 'item') as ScheduleKind;
          const active = drag?.from === pos;
          let shift = 0;
          if (drag && !active) {
            if (drag.from < drag.to && pos > drag.from && pos <= drag.to) shift = -ROW;
            if (drag.from > drag.to && pos < drag.from && pos >= drag.to) shift = ROW;
          }
          const { Icon } = KIND_META[kind];
          return (
            <Animated.View
              key={String(it?.id ?? itemIdx)}
              style={{
                height: ROW,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingLeft: 16,
                borderTopWidth: pos === 0 ? 0 : 1,
                borderTopColor: B.line,
                backgroundColor: active ? B.kurkumaSoft : kind === 'header' ? '#FFF8E1' : B.card,
                borderRadius: active ? 16 : 0,
                zIndex: active ? 10 : 0,
                elevation: active ? 8 : 0,
                shadowColor: B.ink,
                shadowOpacity: active ? 0.18 : 0,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 6 },
                transform: [{ translateY: active ? dy : shift }],
              }}
            >
              <Icon size={16} color={kind === 'song' ? B.gold : B.ink3} />
              <Text
                numberOfLines={1}
                style={{
                  flex: 1,
                  fontSize: kind === 'header' ? 12 : 15,
                  letterSpacing: kind === 'header' ? 1 : 0,
                  textTransform: kind === 'header' ? 'uppercase' : 'none',
                  color: kind === 'header' ? B.goldDeep : B.ink,
                  fontFamily: kind === 'header' ? F.bold : F.semibold,
                }}
              >
                {it?.title || KIND_META[kind].label}
              </Text>
              <View {...responders[pos].panHandlers} hitSlop={8} accessibilityLabel="Przeciągnij" style={{ width: 52, height: ROW, alignItems: 'center', justifyContent: 'center' }}>
                <GripVertical size={20} color={B.ink4} />
              </View>
            </Animated.View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <Pressable onPress={onCancel} className="active:opacity-80" style={{ flex: 1, height: 50, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: B.paper2 }}>
          <Text style={{ fontSize: 15, color: B.ink, fontFamily: F.bold }}>Anuluj</Text>
        </Pressable>
        <Pressable
          onPress={() => (changed ? onDone(order.map((i) => items[i])) : onCancel())}
          className="active:opacity-80"
          style={{ flex: 2, height: 50, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: B.kurkuma }}
        >
          <Text style={{ fontSize: 15, color: B.ink, fontFamily: F.bold }}>{changed ? 'Zapisz kolejność' : 'Gotowe'}</Text>
        </Pressable>
      </View>
    </View>
  );
};
