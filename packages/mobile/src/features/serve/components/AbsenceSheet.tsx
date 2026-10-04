import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react-native';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { B } from '../../../components/ui/brand';
import { DateField, toYmd } from '../../../components/ui/DateField';
import { supabase } from '../../../lib/supabase';
import { useAddBlockout } from '../api';

// Zgłoszenie nieobecności — JEDNO miejsce w apce (dawniej osobno „Moje nieobecności”
// przy programach i „Moja dostępność”). Zapis do volunteer_blockouts (fn my-blockouts),
// które lider widzi na webie (Służba → Dostępność). Szybki wybór: nadchodzące wydarzenia.

const F = { medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold' } as const;

const Label = ({ children }: { children: string }) => (
  <Text style={{ fontSize: 12, color: B.gold, fontFamily: F.bold, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 16, marginBottom: 8 }}>
    {children}
  </Text>
);

interface UpcomingEvent {
  id: number;
  title: string;
  date: string;
}

// Nadchodzące wydarzenia (6 tygodni) do szybkiego zgłoszenia nieobecności na konkretny dzień.
const useUpcomingEventDays = (enabled: boolean) =>
  useQuery({
    queryKey: ['absence', 'upcoming-events'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<UpcomingEvent[]> => {
      const today = toYmd(new Date());
      const to = new Date();
      to.setDate(to.getDate() + 42);
      const { data, error } = await supabase
        .from('events')
        .select('id, title, date')
        .gte('date', today)
        .lte('date', toYmd(to))
        .order('date', { ascending: true })
        .limit(12);
      if (error) return [];
      return ((data ?? []) as any[]).map((e) => ({ id: Number(e.id), title: e.title || 'Wydarzenie', date: String(e.date).slice(0, 10) }));
    },
  });

const dayLabel = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return format(new Date(y, m - 1, d), 'EEE d.MM', { locale: pl });
};

export const AbsenceSheet = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
  const add = useAddBlockout();
  const events = useUpcomingEventDays(visible);
  const [start, setStart] = useState(toYmd(new Date()));
  const [end, setEnd] = useState(toYmd(new Date()));
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!visible) return;
    const today = toYmd(new Date());
    setStart(today);
    setEnd(today);
    setReason('');
  }, [visible]);

  const pickDay = (ymd: string) => {
    setStart(ymd);
    setEnd(ymd);
  };

  const save = () => {
    if (end < start) return Alert.alert('Zakres dat', 'Data „do” nie może być wcześniejsza niż „od”.');
    add.mutate(
      { start_date: start, end_date: end, reason: reason.trim() || null },
      {
        onSuccess: onClose,
        onError: (e: any) => Alert.alert('Nie udało się zgłosić', e?.message ?? 'Spróbuj ponownie.'),
      },
    );
  };

  const list = (events.data ?? []) as UpcomingEvent[];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: B.paper }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', padding: 16, paddingBottom: 4 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 20, color: B.ink, fontFamily: F.bold }}>Zgłoś nieobecność</Text>
            <Text style={{ marginTop: 2, fontSize: 13, color: B.ink3, fontFamily: F.medium }}>
              Lider zobaczy ją przy układaniu grafiku służb.
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10} className="active:opacity-60">
            <X size={22} color={B.ink2} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {list.length ? (
            <>
              <Label>Nie będzie mnie na</Label>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {list.map((e) => {
                  const on = start === e.date && end === e.date;
                  return (
                    <Pressable
                      key={e.id}
                      onPress={() => pickDay(e.date)}
                      className="active:opacity-70"
                      style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: on ? B.ink : B.card }}
                    >
                      <Text numberOfLines={1} style={{ maxWidth: 260, fontSize: 13, color: on ? '#fff' : B.ink, fontFamily: F.semibold }}>
                        {dayLabel(e.date)} · {e.title}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : events.isLoading ? (
            <ActivityIndicator color={B.ink} style={{ marginTop: 16, alignSelf: 'flex-start' }} />
          ) : null}

          <Label>{list.length ? 'Albo zakres dat' : 'Zakres dat'}</Label>
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ width: 28, fontSize: 13, color: B.ink3, fontFamily: F.semibold }}>Od</Text>
              <View style={{ flex: 1 }}>
                <DateField
                  value={start}
                  onChange={(v) => {
                    setStart(v);
                    if (end < v) setEnd(v);
                  }}
                />
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ width: 28, fontSize: 13, color: B.ink3, fontFamily: F.semibold }}>Do</Text>
              <View style={{ flex: 1 }}>
                <DateField value={end} onChange={setEnd} />
              </View>
            </View>
          </View>

          <Label>Powód (opcjonalnie)</Label>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="np. urlop, wyjazd, choroba"
            placeholderTextColor={B.ink4}
            multiline
            style={{ minHeight: 70, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: B.paper2, fontSize: 15, color: B.ink, fontFamily: F.medium, textAlignVertical: 'top' }}
          />

          <Pressable
            onPress={save}
            disabled={add.isPending}
            className="active:opacity-80"
            style={{ marginTop: 22, height: 52, borderRadius: 999, backgroundColor: B.kurkuma, alignItems: 'center', justifyContent: 'center', opacity: add.isPending ? 0.6 : 1 }}
          >
            {add.isPending ? <ActivityIndicator color={B.ink} /> : <Text style={{ fontSize: 15, color: B.ink, fontFamily: F.bold }}>Zgłoś nieobecność</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};
