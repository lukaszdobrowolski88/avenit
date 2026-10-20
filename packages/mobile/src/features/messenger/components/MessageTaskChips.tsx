import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SquareCheckBig } from 'lucide-react-native';
import { B } from '../../../components/ui/brand';
import { FONT as F } from '../../../lib/fonts';
import { StatusPill } from '../../tasks/components/bits';
import { openTask } from '../../tasks/navigation';
import type { MessageTaskRow } from '../messageTasks';

// Pod wiadomością: „Zadanie: <nazwa>” + status, gdy z wiadomości utworzono zadanie (widać je, gdy widzę
// tablicę zadania — zakres pilnuje serwer). Stuknięcie → ekran zadania.
export const MessageTaskChips = ({ tasks, mine }: { tasks: MessageTaskRow[] | null; mine: boolean }) => {
  const router = useRouter();
  if (!tasks?.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4, marginBottom: 2, justifyContent: mine ? 'flex-end' : 'flex-start', paddingLeft: mine ? 48 : 40 }}>
      {tasks.map((t) => (
        <Pressable
          key={t.id}
          onPress={() => openTask(router, { itemId: t.id, boardId: t.boardId })}
          accessibilityRole="link"
          accessibilityLabel={`Zadanie: ${t.name || 'Bez nazwy'}${t.status?.title ? `, ${t.status.title}` : ''}`}
          className="active:opacity-70"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            maxWidth: '100%',
            paddingLeft: 10,
            paddingRight: t.status?.title ? 4 : 10,
            paddingVertical: 4,
            borderRadius: 999,
            backgroundColor: B.card,
            borderWidth: 1,
            borderColor: B.line,
          }}
        >
          <SquareCheckBig size={13} color={B.ink3} />
          <Text
            numberOfLines={1}
            style={{
              flexShrink: 1,
              fontSize: 12,
              color: t.done ? B.ink3 : B.ink,
              fontFamily: F.semibold,
              textDecorationLine: t.done ? 'line-through' : 'none',
            }}
          >
            Zadanie: {t.name || 'Bez nazwy'}
          </Text>
          {t.status?.title ? <StatusPill title={t.status.title} color={t.status.color} size="sm" /> : null}
        </Pressable>
      ))}
    </View>
  );
};
