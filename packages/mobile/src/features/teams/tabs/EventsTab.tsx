import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { CalendarDays, Check, MapPin, Trash2 } from 'lucide-react-native';
import {
  useCreateTeamEvent,
  useDeleteTeamEvent,
  useEventGoing,
  useEventTypes,
  useTeamEvents,
  useToggleGoing,
  type EventTypeOption,
  type EventsCfg,
  type TeamEvent,
} from '../data';
import { NewEventModal } from '../components/NewEventModal';
import { AddButton, Card, DateBlock, Empty, Loading, Pill, SegmentChips, dayLabel } from './ui';

interface Props {
  cfg: EventsCfg;
  scope: { selectedCampusId: number | null; withCampusFilter: <T>(q: T) => T };
  campusIdForInsert: number | null;
  myEmail: string | null;
}

export const EventsTab = ({ cfg, scope, campusIdForInsert, myEmail }: Props) => {
  const [range, setRange] = useState<'upcoming' | 'archive'>('upcoming');
  const [modalOpen, setModalOpen] = useState(false);
  const events = useTeamEvents(cfg, scope);
  const types = useEventTypes(cfg.key);
  const create = useCreateTeamEvent(cfg, campusIdForInsert);
  const remove = useDeleteTeamEvent(cfg);
  const toggle = useToggleGoing(myEmail);

  const list = useMemo(() => {
    const all: TeamEvent[] = events.data ?? [];
    return range === 'upcoming' ? all.filter((e) => !e.archived) : all.filter((e) => e.archived).reverse();
  }, [events.data, range]);

  // „Będę” działa na wspólnej tabeli events (Młodzieżówka ma własne wydarzenia).
  const rsvpEnabled = cfg.eventsTable === 'events';
  const going = useEventGoing(rsvpEnabled ? list.map((e: TeamEvent) => e.id) : [], myEmail);
  const typeOptions: EventTypeOption[] = types.data ?? [];
  const typeLabel = (k: string | null) => typeOptions.find((t) => t.key === k)?.label ?? k;

  const confirmDelete = (id: string, title: string) =>
    Alert.alert('Usunąć wydarzenie?', `„${title}” zniknie dla całego zespołu.`, [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: () => remove.mutate(id, { onError: (e: any) => Alert.alert('Błąd', e?.message ?? 'Nie udało się usunąć.') }),
      },
    ]);

  return (
    <View>
      <AddButton label="Nowe wydarzenie" onPress={() => setModalOpen(true)} />
      <SegmentChips
        options={[
          { key: 'upcoming', label: 'Nadchodzące' },
          { key: 'archive', label: 'Archiwum' },
        ]}
        value={range}
        onChange={setRange}
      />

      {events.isLoading ? <Loading /> : null}
      {!events.isLoading && list.length === 0 ? (
        <Empty
          Icon={CalendarDays}
          title={range === 'upcoming' ? 'Brak nadchodzących wydarzeń' : 'Archiwum jest puste'}
          hint={range === 'upcoming' ? 'Dodaj próbę, spotkanie albo wyjazd — zobaczy je cały zespół i web.' : undefined}
        />
      ) : null}

      {list.map((ev: TeamEvent) => {
        const g = going.data?.[ev.id];
        const mineGoing = !!g?.mine;
        return (
          <Card key={ev.id}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <DateBlock ymd={ev.date} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text numberOfLines={2} style={{ fontSize: 15, color: '#0c0a09', fontFamily: 'Inter_600SemiBold' }}>
                  {ev.title}
                </Text>
                <Text style={{ fontSize: 12, color: '#78716c', fontFamily: 'Inter_500Medium' }}>
                  {dayLabel(ev.date)}
                  {ev.time ? ` · ${ev.time}` : ''}
                  {ev.endTime ? `–${ev.endTime}` : ''}
                </Text>
                {ev.location ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <MapPin size={11} color="#a8a29e" />
                    <Text numberOfLines={1} style={{ fontSize: 12, color: '#a8a29e', fontFamily: 'Inter_500Medium' }}>
                      {ev.location}
                    </Text>
                  </View>
                ) : null}
                {ev.description ? (
                  <Text numberOfLines={3} style={{ fontSize: 13, color: '#44403c', marginTop: 2, fontFamily: 'Inter_400Regular' }}>
                    {ev.description}
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
              {ev.eventType ? <Pill text={String(typeLabel(ev.eventType))} tint="#57534e" bg="#ece9e6" /> : null}
              <View style={{ flex: 1 }} />
              {rsvpEnabled && !ev.archived ? (
                <Pressable
                  onPress={() => toggle.mutate({ eventId: ev.id, going: mineGoing })}
                  disabled={toggle.isPending}
                  className="active:opacity-70"
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    paddingHorizontal: 11,
                    paddingVertical: 6,
                    borderRadius: 999,
                    backgroundColor: mineGoing ? '#15803d' : '#ffffff',
                  }}
                >
                  {mineGoing ? <Check size={13} color="#ffffff" strokeWidth={3} /> : null}
                  <Text style={{ fontSize: 12, color: mineGoing ? '#ffffff' : '#1c1917', fontFamily: 'Inter_600SemiBold' }}>
                    Będę{g?.count ? ` · ${g.count}` : ''}
                  </Text>
                </Pressable>
              ) : null}
              {myEmail && ev.createdBy === myEmail ? (
                <Pressable onPress={() => confirmDelete(ev.id, ev.title)} hitSlop={8} className="active:opacity-60">
                  <Trash2 size={16} color="#a8a29e" />
                </Pressable>
              ) : null}
            </View>
          </Card>
        );
      })}

      <NewEventModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        isLoading={create.isPending}
        eventTypes={typeOptions}
        defaultType={typeOptions[0]?.key ?? 'inne'}
        onSubmit={async (input) => {
          if (!myEmail) {
            Alert.alert('Brak sesji', 'Zaloguj się ponownie.');
            return;
          }
          await create.mutateAsync({
            title: input.title,
            description: input.description,
            eventType: input.eventType,
            startDate: input.startDate,
            location: input.location,
            authorEmail: myEmail,
          });
          setModalOpen(false);
        }}
      />
    </View>
  );
};
