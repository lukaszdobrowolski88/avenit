import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, View } from 'react-native';
import { GripVertical } from 'lucide-react-native';

// Lista z przeciąganiem za uchwyt (wiersze o stałej wysokości): pozycję docelową liczymy
// z przesunięcia palca. Rodzic wyłącza przewijanie na czas gestu (setScrollEnabled).
// Kolejność zmienia się dopiero po puszczeniu — onReorder(from, to).

export const SortableList = <T,>({
  items,
  rowHeight,
  keyOf,
  renderRow,
  onReorder,
  setScrollEnabled,
  rowStyle,
  handleColor = '#6E685A',
  activeBackground = '#FFF1C2',
}: {
  items: T[];
  rowHeight: number;
  keyOf: (item: T) => string;
  renderRow: (item: T, index: number) => ReactNode;
  onReorder: (from: number, to: number) => void;
  setScrollEnabled: (on: boolean) => void;
  rowStyle?: (item: T, index: number) => object;
  handleColor?: string;
  activeBackground?: string;
}) => {
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const dragRef = useRef<{ from: number; to: number } | null>(null);
  const dy = useRef(new Animated.Value(0)).current;
  const reorderRef = useRef(onReorder);
  reorderRef.current = onReorder;
  const countRef = useRef(items.length);
  countRef.current = items.length;

  const responders = useMemo(
    () =>
      items.map((_, pos) => {
        const finish = () => {
          const d = dragRef.current;
          dragRef.current = null;
          dy.setValue(0);
          setDrag(null);
          setScrollEnabled(true);
          if (d && d.from !== d.to) reorderRef.current(d.from, d.to);
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
            const to = Math.max(0, Math.min(countRef.current - 1, pos + Math.round(g.dy / rowHeight)));
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
    [items.length, rowHeight],
  );

  return (
    <View>
      {items.map((item, pos) => {
        const active = drag?.from === pos;
        let shift = 0;
        if (drag && !active) {
          if (drag.from < drag.to && pos > drag.from && pos <= drag.to) shift = -rowHeight;
          if (drag.from > drag.to && pos < drag.from && pos >= drag.to) shift = rowHeight;
        }
        return (
          <Animated.View
            key={keyOf(item)}
            style={[
              { height: rowHeight, flexDirection: 'row', alignItems: 'center' },
              rowStyle?.(item, pos),
              active
                ? {
                    backgroundColor: activeBackground,
                    borderRadius: 16,
                    zIndex: 10,
                    elevation: 8,
                    shadowColor: '#2A2312',
                    shadowOpacity: 0.18,
                    shadowRadius: 12,
                    shadowOffset: { width: 0, height: 6 },
                  }
                : null,
              { transform: [{ translateY: active ? dy : shift }] },
            ]}
          >
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>{renderRow(item, pos)}</View>
            <View
              {...responders[pos]?.panHandlers}
              hitSlop={8}
              accessibilityLabel="Przeciągnij, aby zmienić kolejność"
              style={{ width: 48, height: rowHeight, alignItems: 'center', justifyContent: 'center' }}
            >
              <GripVertical size={20} color={handleColor} />
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
};
