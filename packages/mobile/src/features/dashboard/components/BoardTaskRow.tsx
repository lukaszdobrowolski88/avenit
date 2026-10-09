import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { CheckCircle, Circle } from 'lucide-react-native';
import { StatusPill } from '../../tasks/components/bits';
import { dueLabel, isOverdueYmd } from '../../tasks/board';
import type { BoardTaskItem } from '../board-tasks';
import { D, F } from '../theme';

// Wiersz zadania z tablicy w „Moich zadaniach”: kółko „gotowe” (gdy tablica ma etykietę
// gotowe), nazwa, termin (po terminie — wyróżniony), status i tablica/służba. Stuknięcie →
// ekran zadania.
export const BoardTaskRow = ({
  task,
  where,
  last,
  busy,
  onOpen,
  onDone,
}: {
  task: BoardTaskItem;
  where: string;
  last: boolean;
  busy: boolean;
  onOpen: () => void;
  onDone: (() => void) | null;
}) => {
  const overdue = !task.done && isOverdueYmd(task.due);
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Zadanie: ${task.name}${overdue ? ', po terminie' : ''}`}
      className="active:opacity-70"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: '#ECE8DE',
      }}
    >
      <Pressable
        onPress={onDone ?? onOpen}
        disabled={busy}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={onDone ? 'Oznacz jako gotowe' : 'Otwórz zadanie'}
        className="active:opacity-60"
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: task.done ? '#d1fae5' : '#ECE8DE',
        }}
      >
        {busy ? (
          <ActivityIndicator size="small" color={D.ink} />
        ) : task.done ? (
          <CheckCircle size={14} color="#047857" />
        ) : (
          <Circle size={14} color="#4A463E" />
        )}
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: 14,
            color: task.done ? '#6E685A' : D.ink,
            textDecorationLine: task.done ? 'line-through' : 'none',
            fontFamily: F.medium,
          }}
        >
          {task.name}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
          {task.due ? (
            <Text
              style={{
                fontSize: 11,
                color: overdue ? '#be123c' : '#6B6557',
                fontFamily: overdue ? F.bold : F.medium,
              }}
            >
              {dueLabel(task.due)}
              {overdue ? ' · po terminie' : ''}
            </Text>
          ) : null}
          {task.statusTitle ? <StatusPill title={task.statusTitle} color={task.statusColor} size="sm" /> : null}
        </View>
      </View>
      <View style={{ maxWidth: 110, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: '#ECE8DE' }}>
        <Text numberOfLines={1} style={{ fontSize: 10, color: D.ink, fontFamily: F.bold }}>
          {where}
        </Text>
      </View>
    </Pressable>
  );
};
