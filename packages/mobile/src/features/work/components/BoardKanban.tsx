import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Columns3 } from 'lucide-react-native';
import { B } from '../../../components/ui/brand';
import { FONT as F } from '../../../lib/fonts';
import { EmptyState } from '../../../components/ui/EmptyState';
import { labelFor, labelsOf, type BoardColumn, type BoardItem } from '../../tasks/board';
import type { BoardMeta, WorkBoard } from '../boards';
import { ItemCard } from './boardBits';

// Widok „Kanban” na telefonie: kolumny według etykiet kolumny grupującej (Status, a gdy go nie ma —
// Priorytet; jak zapisany widok kanbanu na webie), przewijane w poziomie z przyciąganiem do kolumny.
// Bez przeciągania — status zmienia się stuknięciem w pigułkę na karcie (arkusz etykiet).

interface Lane {
  key: string;
  title: string;
  color: string;
  items: BoardItem[];
}

const GAP = 12;

export const BoardKanban = ({
  data,
  meta,
  canEdit,
  refreshing,
  onRefresh,
  onOpen,
  onLabel,
}: {
  data: WorkBoard;
  meta: BoardMeta;
  canEdit: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onOpen: (item: BoardItem) => void;
  onLabel: (item: BoardItem, column: BoardColumn) => void;
}) => {
  const { width } = useWindowDimensions();
  // Wysokość obszaru kanbanu — kolumny sięgają do dołu ekranu (pod pływający pasek zakładek),
  // a ich listy przewijają się w pionie niezależnie.
  const [height, setHeight] = useState(0);
  const laneWidth = Math.min(320, Math.round(width * 0.8));
  const groupCol = data.columns.find((c) => c.id === data.kanbanColumnId) ?? null;

  const lanes = useMemo((): Lane[] => {
    if (!groupCol) return [];
    const out: Lane[] = labelsOf(groupCol).map((l) => ({ key: l.id, title: l.title, color: l.color, items: [] }));
    const empty: Lane = { key: '__empty__', title: 'Bez wartości', color: B.ink4, items: [] };
    const byKey = new Map(out.map((l) => [l.key, l]));
    for (const it of data.items) {
      const l = labelFor(groupCol, it.cells[groupCol.id]);
      (l ? byKey.get(l.id) ?? empty : empty).items.push(it);
    }
    // „Bez wartości” tylko gdy coś w niej jest (albo tablica nie ma jeszcze etykiet).
    if (empty.items.length || !out.length) out.push(empty);
    return out;
  }, [groupCol, data.items]);

  if (!groupCol) {
    return (
      <EmptyState
        Icon={Columns3}
        title="Brak kolumny statusu"
        hint="Kanban układa zadania według statusu albo priorytetu. Dodaj taką kolumnę na tablicy w wersji przeglądarkowej."
      />
    );
  }

  return (
    <View style={{ flex: 1 }} onLayout={(e) => setHeight(Math.round(e.nativeEvent.layout.height))}>
      <ScrollView
        horizontal
        style={{ flex: 1 }}
        showsHorizontalScrollIndicator={false}
        snapToInterval={laneWidth + GAP}
        snapToAlignment="start"
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: 16, gap: GAP }}
      >
        {lanes.map((lane) => (
          <View
            key={lane.key}
            style={{ width: laneWidth, height: height || undefined }}
            accessibilityLabel={`${lane.title}, ${lane.items.length}`}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 6, paddingBottom: 8 }}>
              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: lane.color }} />
              <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 14, color: B.ink, fontFamily: F.bold }}>
                {lane.title}
              </Text>
              <Text style={{ fontSize: 13, color: B.ink4, fontFamily: F.semibold }}>{lane.items.length}</Text>
            </View>
            <View style={{ flex: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: B.paper2 }}>
              <ScrollView
                nestedScrollEnabled
                contentContainerStyle={{ padding: 8, paddingBottom: 120, gap: 8 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={B.ink} />}
              >
                {lane.items.length === 0 ? (
                  <Text style={{ textAlign: 'center', paddingVertical: 22, fontSize: 13, color: B.ink4, fontFamily: F.medium }}>
                    Brak zadań
                  </Text>
                ) : (
                  lane.items.map((it) => (
                    <ItemCard
                      key={it.id}
                      item={it}
                      meta={meta}
                      pillColumn={groupCol}
                      canEdit={canEdit}
                      subCount={data.subCount[it.id] ?? 0}
                      onOpen={onOpen}
                      onLabel={onLabel}
                    />
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};
