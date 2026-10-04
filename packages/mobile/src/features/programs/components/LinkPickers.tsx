import type { ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Calendar, ChevronRight, ClipboardList, Plus, X } from 'lucide-react-native';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { B } from '../../../components/ui/brand';
import { useEventsAround, useProgramsAround, type LinkedEvent, type ProgramListItem } from '../api';

type AroundEvent = LinkedEvent & { hasProgram: boolean };

// Arkusze podpinania: program → wydarzenie (z ekranu programu) i wydarzenie → program
// (z ekranu wydarzenia). Pokazują pozycje z okolicy daty, najbliższe dniu na górze.

const F = { medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold' } as const;

const dayText = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const out = format(new Date(y, m - 1, d), 'EEEE, d MMMM', { locale: pl });
  return out.charAt(0).toUpperCase() + out.slice(1);
};
const distance = (a: string, b: string) => Math.abs(new Date(`${a}T12:00:00`).getTime() - new Date(`${b}T12:00:00`).getTime());

const Sheet = ({ visible, title, subtitle, onClose, children }: { visible: boolean; title: string; subtitle?: string; onClose: () => void; children: ReactNode }) => (
  <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <View style={{ flex: 1, backgroundColor: B.paper }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', padding: 16, paddingBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, color: B.ink, fontFamily: F.bold }}>{title}</Text>
          {subtitle ? <Text style={{ marginTop: 2, fontSize: 13, color: B.ink3, fontFamily: F.medium }}>{subtitle}</Text> : null}
        </View>
        <Pressable onPress={onClose} hitSlop={10} className="active:opacity-60">
          <X size={22} color={B.ink2} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 40, gap: 10 }}>{children}</ScrollView>
    </View>
  </Modal>
);

const Row = ({ Icon, title, subtitle, note, onPress, highlight }: { Icon: typeof Calendar; title: string; subtitle: string; note?: string | null; onPress: () => void; highlight?: boolean }) => (
  <Pressable
    onPress={onPress}
    className="active:opacity-70"
    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 20, backgroundColor: highlight ? B.kurkumaSoft : B.card }}
  >
    <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: highlight ? B.card : B.paper, alignItems: 'center', justifyContent: 'center' }}>
      <Icon size={18} color={B.ink} />
    </View>
    <View style={{ flex: 1 }}>
      <Text numberOfLines={1} style={{ fontSize: 15, color: B.ink, fontFamily: F.semibold }}>
        {title}
      </Text>
      <Text numberOfLines={1} style={{ marginTop: 1, fontSize: 12, color: B.ink3, fontFamily: F.medium }}>
        {subtitle}
      </Text>
      {note ? <Text style={{ marginTop: 2, fontSize: 12, color: B.gold, fontFamily: F.semibold }}>{note}</Text> : null}
    </View>
    <ChevronRight size={16} color={B.ink4} />
  </Pressable>
);

const Empty = ({ text }: { text: string }) => (
  <Text style={{ paddingVertical: 24, textAlign: 'center', fontSize: 14, color: B.ink3, fontFamily: F.medium }}>{text}</Text>
);

// Program → wydarzenie.
export const EventPickerSheet = ({
  visible,
  date,
  currentProgramId,
  onClose,
  onPick,
}: {
  visible: boolean;
  date: string;
  currentProgramId: number;
  onClose: () => void;
  onPick: (event: { id: number; title: string; hasOtherProgram: boolean }) => void;
}) => {
  const q = useEventsAround(date, visible);
  const list = (q.data ?? [])
    .filter((e: AroundEvent) => e.programId !== currentProgramId)
    .sort((a: AroundEvent, b: AroundEvent) => distance(a.date, date) - distance(b.date, date));
  return (
    <Sheet visible={visible} title="Podepnij do wydarzenia" subtitle="Wydarzenia ±2 tygodnie od daty programu" onClose={onClose}>
      {q.isLoading ? <ActivityIndicator color={B.ink} /> : null}
      {!q.isLoading && !list.length ? <Empty text="Brak wydarzeń w tym okresie." /> : null}
      {list.map((e: AroundEvent) => (
        <Row
          key={e.id}
          Icon={Calendar}
          title={e.title}
          subtitle={`${dayText(e.date)}${e.time ? ` · ${e.time}` : ''}`}
          note={e.hasProgram ? 'Ma już inny program — zostanie zastąpiony' : null}
          highlight={e.date === date}
          onPress={() => onPick({ id: e.id, title: e.title, hasOtherProgram: e.hasProgram })}
        />
      ))}
    </Sheet>
  );
};

// Wydarzenie → program (istniejący albo nowy).
export const ProgramPickerSheet = ({
  visible,
  date,
  onClose,
  onPick,
  onCreate,
  canCreate,
}: {
  visible: boolean;
  date: string;
  onClose: () => void;
  onPick: (programId: number) => void;
  onCreate: () => void;
  canCreate: boolean;
}) => {
  const q = useProgramsAround(date, visible);
  const list = (q.data ?? []).slice().sort((a: ProgramListItem, b: ProgramListItem) => distance(a.date, date) - distance(b.date, date));
  return (
    <Sheet visible={visible} title="Program wydarzenia" subtitle="Programy ±30 dni od daty wydarzenia" onClose={onClose}>
      {canCreate ? <Row Icon={Plus} title="Utwórz nowy program" subtitle="Z tytułem i datą tego wydarzenia" highlight onPress={onCreate} /> : null}
      {q.isLoading ? <ActivityIndicator color={B.ink} /> : null}
      {q.isError ? <Empty text="Nie udało się wczytać programów." /> : null}
      {!q.isLoading && !q.isError && !list.length ? <Empty text="Brak programów w tym okresie." /> : null}
      {list.map((p: ProgramListItem) => {
        const items = Array.isArray(p.schedule) ? p.schedule.length : 0;
        return (
          <Row
            key={p.id}
            Icon={ClipboardList}
            title={(p.title && p.title.trim()) || p.type?.name || 'Program'}
            subtitle={`${dayText(String(p.date).slice(0, 10))} · ${items} elem.`}
            onPress={() => onPick(p.id)}
          />
        );
      })}
    </Sheet>
  );
};
