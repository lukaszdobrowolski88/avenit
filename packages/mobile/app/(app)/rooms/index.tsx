import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
} from 'react-native';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, DoorOpen, Trash2, X } from 'lucide-react-native';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { DateField, TimeField, isValidTime, toYmd } from '../../../src/components/ui/DateField';
import { useAuthSession } from '../../../src/lib/auth';
import { usePermissions } from '../../../src/lib/permissions';
import { useCampusQuery } from '../../../src/hooks/useCampusQuery';
import {
  BookingConflict,
  useBookingsForDay,
  useCancelBooking,
  useCreateBooking,
  useResources,
  type Booking,
  type Resource,
} from '../../../src/features/rooms/api';
import { Empty, Loading, dayLabel } from '../../../src/features/teams/tabs/ui';

const shiftDay = (ymd: string, delta: number) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return toYmd(new Date(y, m - 1, d + delta));
};
const at = (ymd: string, hm: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const [h, min] = hm.split(':').map(Number);
  return new Date(y, m - 1, d, h, min);
};
const hm = (iso: string) => format(new Date(iso), 'HH:mm');

const Label = ({ children }: { children: string }) => (
  <Text style={{ fontSize: 12, color: '#8A6606', fontFamily: 'Manrope_700Bold', letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 16, marginBottom: 6 }}>
    {children}
  </Text>
);

export default function RoomsScreen() {
  const { user } = useAuthSession();
  const perms = usePermissions();
  const { selectedCampusId, withCampusFilter, campusIdForInsert } = useCampusQuery();
  const [day, setDay] = useState(toYmd(new Date()));
  const resources = useResources({ selectedCampusId, withCampusFilter });
  const bookings = useBookingsForDay(day);
  const create = useCreateBooking(user?.email ?? null, campusIdForInsert);
  const cancel = useCancelBooking();
  const canBook = perms.can('res:resource_bookings:create');
  const canDeleteAny = perms.can('res:resource_bookings:delete');

  const [open, setOpen] = useState(false);
  const [resourceId, setResourceId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(day);
  const [start, setStart] = useState('18:00');
  const [end, setEnd] = useState('20:00');
  const [note, setNote] = useState('');

  const rooms: Resource[] = resources.data ?? [];
  const list: Booking[] = bookings.data ?? [];

  useEffect(() => {
    if (open) setDate(day);
  }, [open, day]);

  const save = async () => {
    if (!resourceId) return Alert.alert('Wybierz salę');
    if (!title.trim()) return Alert.alert('Podaj tytuł', 'Np. „Próba zespołu” albo „Spotkanie grupy”.');
    if (!isValidTime(start) || !isValidTime(end)) return Alert.alert('Błędna godzina', 'Wpisz godziny jako GG:MM.');
    try {
      await create.mutateAsync({ resourceId, title: title.trim(), startAt: at(date, start), endAt: at(date, end), note: note.trim() || null });
      setOpen(false);
      setTitle('');
      setNote('');
      setDay(date);
    } catch (e: any) {
      if (e instanceof BookingConflict) {
        Alert.alert(
          'Sala zajęta',
          e.conflicts.map((c) => `• ${hm(c.startAt)}–${hm(c.endAt)} ${c.title}`).join('\n'),
        );
      } else {
        Alert.alert('Nie udało się', e?.message ?? 'Spróbuj ponownie.');
      }
    }
  };

  const confirmCancel = (b: Booking) =>
    Alert.alert('Anulować rezerwację?', `${b.title} · ${hm(b.startAt)}–${hm(b.endAt)}`, [
      { text: 'Nie', style: 'cancel' },
      { text: 'Anuluj rezerwację', style: 'destructive', onPress: () => cancel.mutate(b.id, { onError: (e: any) => Alert.alert('Nie udało się', e?.message ?? '') }) },
    ]);

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: '#F6F4EE' }}>
        <PageHeader title="Rezerwacje sal" subtitle={dayLabel(day)} Icon={DoorOpen} showBack />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginBottom: 10 }}>
          <Pressable onPress={() => setDay(shiftDay(day, -1))} hitSlop={8} className="active:opacity-60" style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#ECE8DE', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={18} color="#2A2312" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <DateField value={day} onChange={setDay} />
          </View>
          <Pressable onPress={() => setDay(shiftDay(day, 1))} hitSlop={8} className="active:opacity-60" style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#ECE8DE', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronRight size={18} color="#2A2312" />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 130 }}
          refreshControl={<RefreshControl refreshing={bookings.isRefetching} onRefresh={() => { resources.refetch(); bookings.refetch(); }} tintColor="#2A2312" />}
        >
          {canBook && rooms.length ? (
            <Pressable onPress={() => setOpen(true)} className="active:opacity-70" style={{ height: 46, borderRadius: 14, backgroundColor: '#2A2312', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <Text style={{ fontSize: 14, color: '#ffffff', fontFamily: 'Manrope_600SemiBold' }}>+ Zarezerwuj salę</Text>
            </Pressable>
          ) : null}
          {resources.isLoading || bookings.isLoading ? <Loading /> : null}
          {!resources.isLoading && !rooms.length ? (
            <Empty Icon={DoorOpen} title="Brak sal do rezerwacji" hint="Sale i sprzęt dodaje się na webie w module Rezerwacje sal." />
          ) : null}
          {rooms.map((r) => {
            const own = list.filter((b) => b.resourceId === r.id);
            return (
              <View key={r.id} style={{ borderRadius: 18, backgroundColor: '#FFFFFF', padding: 14, marginBottom: 10, gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: r.color ?? '#A8A59E' }} />
                  <Text style={{ flex: 1, fontSize: 15, color: '#2A2312', fontFamily: 'Manrope_700Bold' }}>{r.name}</Text>
                  {r.capacity ? <Text style={{ fontSize: 12, color: '#6B6557', fontFamily: 'Manrope_500Medium' }}>{r.capacity} os.</Text> : null}
                </View>
                {own.length === 0 ? (
                  <Text style={{ fontSize: 13, color: '#15803d', fontFamily: 'Manrope_600SemiBold' }}>Wolna cały dzień</Text>
                ) : (
                  own.map((b) => {
                    const mine = !!user?.email && (b.bookedBy ?? '').toLowerCase() === user.email.toLowerCase();
                    return (
                      <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, backgroundColor: '#F6F4EE', padding: 10 }}>
                        <Text style={{ fontSize: 13, color: '#2A2312', fontFamily: 'Manrope_700Bold', minWidth: 92 }}>
                          {hm(b.startAt)}–{hm(b.endAt)}
                        </Text>
                        <View style={{ flex: 1 }}>
                          <Text numberOfLines={1} style={{ fontSize: 14, color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}>{b.title}</Text>
                          {b.bookedBy ? <Text numberOfLines={1} style={{ fontSize: 11, color: '#857F70', fontFamily: 'Manrope_500Medium' }}>{mine ? 'Twoja rezerwacja' : b.bookedBy}</Text> : null}
                        </View>
                        {mine || canDeleteAny ? (
                          <Pressable onPress={() => confirmCancel(b)} hitSlop={8} className="active:opacity-60">
                            <Trash2 size={15} color="#857F70" />
                          </Pressable>
                        ) : null}
                      </View>
                    );
                  })
                )}
              </View>
            );
          })}
        </ScrollView>
      </View>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: '#F6F4EE' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 4 }}>
            <Text style={{ flex: 1, fontSize: 20, color: '#2A2312', fontFamily: 'Manrope_700Bold' }}>Nowa rezerwacja</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={10} className="active:opacity-60">
              <X size={22} color="#4A463E" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <Label>Sala</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {rooms.map((r) => {
                const on = r.id === resourceId;
                return (
                  <Pressable key={r.id} onPress={() => setResourceId(r.id)} className="active:opacity-70" style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: on ? '#2A2312' : '#ECE8DE' }}>
                    <Text style={{ fontSize: 13, color: on ? '#ffffff' : '#3A3427', fontFamily: 'Manrope_600SemiBold' }}>{r.name}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Label>Tytuł</Label>
            <TextInput value={title} onChangeText={setTitle} placeholder="np. Próba zespołu" placeholderTextColor="#857F70" style={{ height: 46, borderRadius: 14, paddingHorizontal: 14, backgroundColor: '#FFFFFF', fontSize: 15, color: '#2A2312', fontFamily: 'Manrope_500Medium' }} />
            <Label>Data</Label>
            <DateField value={date} onChange={setDate} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Label>Od</Label>
                <TimeField value={start} onChange={setStart} />
              </View>
              <View style={{ flex: 1 }}>
                <Label>Do</Label>
                <TimeField value={end} onChange={setEnd} />
              </View>
            </View>
            <Label>Notatka</Label>
            <TextInput value={note} onChangeText={setNote} placeholder="opcjonalnie" placeholderTextColor="#857F70" style={{ height: 46, borderRadius: 14, paddingHorizontal: 14, backgroundColor: '#FFFFFF', fontSize: 15, color: '#2A2312', fontFamily: 'Manrope_500Medium' }} />
            <Pressable
              onPress={save}
              disabled={create.isPending}
              className="active:opacity-80"
              style={{ marginTop: 22, height: 52, borderRadius: 16, backgroundColor: '#2A2312', alignItems: 'center', justifyContent: 'center', opacity: create.isPending ? 0.6 : 1 }}
            >
              {create.isPending ? <ActivityIndicator color="#ffffff" /> : <Text style={{ fontSize: 15, color: '#ffffff', fontFamily: 'Manrope_600SemiBold' }}>Zarezerwuj</Text>}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
