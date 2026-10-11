import { Pressable, Text, View } from 'react-native';
import { Calendar, Check, Columns3, ListTree, Table2, type LucideIcon } from 'lucide-react-native';
import { isDoneLabel } from '@avenit/shared/src/lib/boardStatus.js';
import { B } from '../../../components/ui/brand';
import { FONT as F } from '../../../lib/fonts';
import { Sheet } from '../../../components/ui/Sheet';
import { PersonAvatar, StatusPill } from '../../tasks/components/bits';
import {
  dueLabel,
  dueOf,
  isOverdueYmd,
  labelFor,
  labelsOf,
  peopleIn,
  type BoardColumn,
  type BoardItem,
} from '../../tasks/board';
import type { BoardMeta, WorkBoardView } from '../boards';

// Klocki tablicy Projektów na telefonie: przełącznik widoku, karta elementu, arkusz etykiet.
// Karta = miękka pigułka (bez paska-akcentu); kolor etykiety niesie kropka w pigułce statusu.

// ── Przełącznik „Tabela” / „Kanban” ─────────────────────────────────────────
const VIEWS: { key: WorkBoardView; label: string; Icon: LucideIcon }[] = [
  { key: 'table', label: 'Tabela', Icon: Table2 },
  { key: 'kanban', label: 'Kanban', Icon: Columns3 },
];

export const ViewSwitch = ({ value, onChange }: { value: WorkBoardView; onChange: (v: WorkBoardView) => void }) => (
  <View
    accessibilityRole="tablist"
    style={{ flexDirection: 'row', alignSelf: 'flex-start', padding: 3, borderRadius: 999, backgroundColor: B.paper2 }}
  >
    {VIEWS.map(({ key, label, Icon }) => {
      const on = value === key;
      return (
        <Pressable
          key={key}
          onPress={() => onChange(key)}
          accessibilityRole="tab"
          accessibilityState={{ selected: on }}
          className="active:opacity-70"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 999,
            backgroundColor: on ? B.ink : 'transparent',
          }}
        >
          <Icon size={14} color={on ? '#FFFFFF' : B.ink3} />
          <Text numberOfLines={1} style={{ fontSize: 13, color: on ? '#FFFFFF' : B.ink2, fontFamily: F.semibold }}>
            {label}
          </Text>
        </Pressable>
      );
    })}
  </View>
);

// ── Karta elementu ──────────────────────────────────────────────────────────
// pillColumn — kolumna etykiet, którą zmienia stuknięcie w pigułkę (tabela: Status, kanban:
// kolumna grupująca). Druga kolumna etykiet (Status/Priorytet) — tylko podgląd.
export const ItemCard = ({
  item,
  meta,
  pillColumn,
  canEdit,
  subCount = 0,
  onOpen,
  onLabel,
}: {
  item: BoardItem;
  meta: BoardMeta;
  pillColumn: BoardColumn | null;
  canEdit: boolean;
  subCount?: number;
  onOpen: (item: BoardItem) => void;
  onLabel: (item: BoardItem, column: BoardColumn) => void;
}) => {
  const statusLabel = labelFor(meta.status, item.cells[meta.status?.id ?? '']);
  const done = isDoneLabel(statusLabel);
  const pillLabel = pillColumn ? labelFor(pillColumn, item.cells[pillColumn.id]) : null;
  const pillEditable = !!pillColumn && canEdit && labelsOf(pillColumn).length > 0;
  const other = [meta.status, meta.priority].find((c) => c && c.id !== pillColumn?.id) ?? null;
  const otherLabel = other ? labelFor(other, item.cells[other.id]) : null;
  const due = dueOf(meta.due, item.cells);
  const overdue = !done && isOverdueYmd(due);
  const people = meta.people ? peopleIn(item.cells[meta.people.id]) : [];
  const shown = people.slice(0, 3);

  return (
    <Pressable
      onPress={() => onOpen(item)}
      accessibilityRole="button"
      accessibilityLabel={[item.name || 'Zadanie', pillLabel?.title, due ? `termin ${dueLabel(due)}` : null]
        .filter(Boolean)
        .join(', ')}
      className="active:opacity-70"
      style={{ padding: 14, borderRadius: 16, backgroundColor: B.card, opacity: done ? 0.62 : 1 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <Text
          numberOfLines={2}
          style={{
            flex: 1,
            fontSize: 15,
            lineHeight: 20,
            color: B.ink,
            fontFamily: F.semibold,
            textDecorationLine: done ? 'line-through' : 'none',
          }}
        >
          {item.name || '(bez nazwy)'}
        </Text>
        {shown.length ? (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {shown.map((p, i) => (
              <View
                key={p.email}
                style={{ marginLeft: i ? -7 : 0, borderRadius: 13, borderWidth: 2, borderColor: B.card }}
              >
                <PersonAvatar name={p.name} email={p.email} avatarUrl={p.avatar_url} size={22} />
              </View>
            ))}
            {people.length > shown.length ? (
              <Text style={{ marginLeft: 4, fontSize: 11, color: B.ink3, fontFamily: F.semibold }}>
                +{people.length - shown.length}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
        {pillColumn ? (
          pillEditable ? (
            <Pressable
              onPress={() => onLabel(item, pillColumn)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Zmień ${pillColumn.name || 'status'}: ${pillLabel?.title ?? 'brak'}`}
              className="active:opacity-60"
              style={{ maxWidth: '100%' }}
            >
              <StatusPill title={pillLabel?.title ?? null} color={pillLabel?.color ?? null} size="sm" />
            </Pressable>
          ) : pillLabel ? (
            <StatusPill title={pillLabel.title} color={pillLabel.color} size="sm" />
          ) : null
        ) : null}
        {otherLabel ? <StatusPill title={otherLabel.title} color={otherLabel.color} size="sm" /> : null}
        {due ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 999,
              backgroundColor: overdue ? B.dangerBg : B.paper,
            }}
          >
            <Calendar size={11} color={overdue ? B.danger : B.ink3} />
            <Text numberOfLines={1} style={{ fontSize: 11, color: overdue ? B.danger : B.ink2, fontFamily: F.bold }}>
              {dueLabel(due)}
            </Text>
          </View>
        ) : null}
        {subCount > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 3 }}>
            <ListTree size={11} color={B.ink4} />
            <Text style={{ fontSize: 11, color: B.ink3, fontFamily: F.semibold }}>{subCount}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
};

// ── Arkusz wyboru etykiety (Status/Priorytet) ───────────────────────────────
// Arkusz zamiast Alert: na Androidzie Alert mieści tylko 3 przyciski, a etykiet bywa więcej.
export const LabelSheet = ({
  target,
  onPick,
  onClose,
}: {
  target: { item: BoardItem; column: BoardColumn } | null;
  onPick: (labelId: string | null) => void;
  onClose: () => void;
}) => {
  const column = target?.column ?? null;
  const labels = labelsOf(column);
  const current = target && column ? String(target.item.cells[column.id] ?? '') : '';
  const row = (id: string | null, title: string, color: string | null) => {
    const on = (id ?? '') === current;
    return (
      <Pressable
        key={id ?? '__clear__'}
        onPress={() => onPick(id)}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        className="active:opacity-70"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: 14,
          marginBottom: 8,
          borderRadius: 16,
          backgroundColor: B.card,
        }}
      >
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color ?? B.ink4 }} />
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: id ? B.ink : B.ink3, fontFamily: F.semibold }}>
          {title}
        </Text>
        {on ? <Check size={18} color={B.ink} /> : null}
      </Pressable>
    );
  };
  return (
    <Sheet
      visible={!!target}
      title={column?.name || 'Status'}
      eyebrow="Zmień"
      subtitle={target?.item.name || null}
      onClose={onClose}
    >
      <View style={{ paddingTop: 6 }}>
        {labels.map((l) => row(l.id, l.title, l.color))}
        {current ? row(null, 'Wyczyść', null) : null}
      </View>
    </Sheet>
  );
};
