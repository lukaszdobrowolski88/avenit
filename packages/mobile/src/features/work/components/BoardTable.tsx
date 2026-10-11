import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { ChevronDown, ChevronRight, Inbox } from 'lucide-react-native';
import { B } from '../../../components/ui/brand';
import { FONT as F } from '../../../lib/fonts';
import { EmptyState } from '../../../components/ui/EmptyState';
import { boardColor, type BoardColumn, type BoardItem } from '../../tasks/board';
import type { BoardMeta, WorkBoard } from '../boards';
import { ItemCard } from './boardBits';

// Widok „Tabela” na telefonie: grupy tablicy jako sekcje (kropka w kolorze grupy, nazwa, liczba),
// elementy jako karty z kluczowymi kolumnami (status, priorytet, osoby, termin). Sekcję można
// zwinąć stuknięciem w nagłówek. Elementy bez grupy (albo z usuniętej) — na końcu „Bez grupy”.

interface Section {
  id: string;
  name: string;
  color: string;
  items: BoardItem[];
}

export const BoardTable = ({
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
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const pillColumn = meta.status ?? meta.priority;

  const sections = useMemo((): Section[] => {
    const byGroup = new Map<string, BoardItem[]>();
    const orphans: BoardItem[] = [];
    const known = new Set(data.groups.map((g) => g.id));
    for (const it of data.items) {
      if (it.group_id && known.has(it.group_id)) {
        if (!byGroup.has(it.group_id)) byGroup.set(it.group_id, []);
        byGroup.get(it.group_id)!.push(it);
      } else orphans.push(it);
    }
    const out: Section[] = data.groups
      .map((g) => ({ id: g.id, name: g.name, color: boardColor(g.color), items: byGroup.get(g.id) ?? [] }))
      .filter((s) => s.items.length > 0);
    if (orphans.length) out.push({ id: '__none__', name: 'Bez grupy', color: B.ink4, items: orphans });
    return out;
  }, [data.groups, data.items]);

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={B.ink} />}
    >
      {sections.length === 0 ? (
        <EmptyState Icon={Inbox} title="Brak zadań" hint="Na tej tablicy nie ma jeszcze żadnych elementów." />
      ) : (
        sections.map((s) => {
          const closed = collapsed.has(s.id);
          const Chevron = closed ? ChevronRight : ChevronDown;
          return (
            <View key={s.id} style={{ marginBottom: 14 }}>
              <Pressable
                onPress={() => toggle(s.id)}
                accessibilityRole="button"
                accessibilityState={{ expanded: !closed }}
                accessibilityLabel={`${s.name}, ${s.items.length}`}
                className="active:opacity-70"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, paddingVertical: 8 }}
              >
                <Chevron size={16} color={B.ink3} />
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: s.color }} />
                <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 15, color: B.ink, fontFamily: F.bold, letterSpacing: -0.2 }}>
                  {s.name}
                </Text>
                <Text style={{ fontSize: 13, color: B.ink4, fontFamily: F.semibold }}>{s.items.length}</Text>
              </Pressable>
              {closed ? null : (
                <View style={{ gap: 8 }}>
                  {s.items.map((it) => (
                    <ItemCard
                      key={it.id}
                      item={it}
                      meta={meta}
                      pillColumn={pillColumn}
                      canEdit={canEdit}
                      subCount={data.subCount[it.id] ?? 0}
                      onOpen={onOpen}
                      onLabel={onLabel}
                    />
                  ))}
                </View>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
};
