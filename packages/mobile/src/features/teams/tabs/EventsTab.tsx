import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CalendarDays, Check, ChevronRight, MapPin, Trash2 } from 'lucide-react-native';
import { B } from '../../../components/ui/brand';
import { EmptyState } from '../../../components/ui/EmptyState';
import { usePermissions } from '../../../lib/permissions';
import { friendlyError } from '../../../lib/errors';
import { toast } from '../../../lib/toast';
import {
  eventTypeLabel,
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
import { NewEventModal, type NewEventInput } from '../components/NewEventModal';
import { AddButton, Card, DateBlock, Loading, Pill, SegmentChips, dayLabel } from './ui';

// Zakładka „Wydarzenia” zespołu/modułu — jak web (src/modules/shared/EventsTab.jsx):
// własne wydarzenia modułu (nadchodzące / archiwum) + „Służymy na”: wydarzenia z innych
// kalendarzy, w których ten zespół służy (te same co w Grafiku).

const F = { medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold' } as const;

interface Props {
  cfg: EventsCfg;
  scope: { selectedCampusId: number | null; withCampusFilter: <T>(q: T) => T };
  campusIdForInsert: number | null;
  myEmail: string | null;
}

export const EventsTab = ({ cfg, scope, campusIdForInsert, myEmail }: Props) => {
  const router = useRouter();
  const perms = usePermissions();
  const [range, setRange] = useState<'upcoming' | 'archive'>('upcoming');
  const [modalOpen, setModalOpen] = useState(false);
  const events = useTeamEvents(cfg, scope);
  const types = useEventTypes(cfg.key);
  const create = useCreateTeamEvent(cfg, campusIdForInsert);
  const remove = useDeleteTeamEvent(cfg);
  const toggle = useToggleGoing(myEmail);
  const canCreate = perms.can('res:events:create');
  const canDeleteAny = perms.can('res:events:delete');

  const own: TeamEvent[] = events.data?.own ?? [];
  const serving: TeamEvent[] = events.data?.serving ?? [];
  const upcoming = useMemo(() => own.filter((e) => !e.archived), [own]);
  const archive = useMemo(() => own.filter((e) => e.archived).reverse(), [own]);
  const list = range === 'upcoming' ? upcoming : archive;

  // „Będę” działa na wspólnej tabeli events.
  const rsvpEnabled = cfg.eventsTable === 'events';
  const going = useEventGoing(rsvpEnabled ? list.map((e: TeamEvent) => e.id) : [], myEmail);
  const typeOptions: EventTypeOption[] = types.data ?? [];

  const openEvent = (id: string) => router.push({ pathname: '/(app)/events/[id]', params: { id } });

  const confirmDelete = (ev: TeamEvent) =>
    Alert.alert(
      'Usunąć wydarzenie?',
      `„${ev.title}” (${dayLabel(ev.date)}${ev.time ? `, ${ev.time}` : ''}) zniknie z kalendarza i grafików, a zaproszenia do służby na nie zostaną anulowane. Tej operacji nie można cofnąć.`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Usuń wydarzenie',
          style: 'destructive',
          onPress: () =>
            remove.mutate(ev.id, {
              onSuccess: () => toast.success('Usunięto wydarzenie', ev.title),
              onError: (e: unknown) => Alert.alert('Nie udało się usunąć wydarzenia', friendlyError(e, 'Spróbuj ponownie.')),
            }),
        },
      ],
    );

  const toggleGoing = (ev: TeamEvent, mine: boolean) =>
    toggle.mutate(
      { eventId: ev.id, going: mine },
      { onError: (e: unknown) => Alert.alert('Nie udało się zapisać obecności', friendlyError(e, 'Spróbuj ponownie.')) },
    );

  const submit = async (input: NewEventInput) => {
    if (!myEmail) {
      Alert.alert('Brak sesji', 'Zaloguj się ponownie.');
      return;
    }
    try {
      await create.mutateAsync({ ...input, authorEmail: myEmail });
      setModalOpen(false);
      setRange('upcoming');
      toast.success('Dodano wydarzenie', input.title);
    } catch (e: unknown) {
      // Okno zostaje otwarte — wpisane dane nie przepadają.
      Alert.alert('Nie udało się zapisać wydarzenia', friendlyError(e, 'Spróbuj ponownie.'));
    }
  };

  const showServing = range === 'upcoming' && serving.length > 0;

  return (
    <View>
      {canCreate ? <AddButton label="Nowe wydarzenie" onPress={() => setModalOpen(true)} /> : null}
      <SegmentChips
        options={[
          { key: 'upcoming', label: `Nadchodzące${events.data ? ` · ${upcoming.length + serving.length}` : ''}` },
          { key: 'archive', label: `Archiwum${events.data ? ` · ${archive.length}` : ''}` },
        ]}
        value={range}
        onChange={setRange}
      />

      {events.isLoading ? <Loading /> : null}
      {events.isError ? (
        <EmptyState
          Icon={CalendarDays}
          title="Nie udało się wczytać wydarzeń"
          hint={friendlyError(events.error, 'Pociągnij w dół, żeby spróbować ponownie.')}
          actionLabel="Spróbuj ponownie"
          onAction={() => events.refetch()}
        />
      ) : null}
      {!events.isLoading && !events.isError && list.length === 0 && !showServing ? (
        range === 'archive' ? (
          <EmptyState Icon={CalendarDays} title="Brak archiwalnych wydarzeń" />
        ) : (
          // Nabożeństwa tworzy się w Kalendarzu — tu nie zachęcamy do duplikatu.
          <EmptyState
            Icon={CalendarDays}
            title="Brak nadchodzących wydarzeń"
            hint="Nabożeństwa i wspólne wydarzenia dodajesz w Kalendarzu — pojawią się tutaj, gdy ten zespół będzie w nich służyć."
          />
        )
      ) : null}

      {list.map((ev: TeamEvent) => {
        const g = going.data?.[ev.id];
        const mineGoing = !!g?.mine;
        const canDelete = canDeleteAny || (!!myEmail && (ev.createdBy ?? '').toLowerCase() === myEmail.toLowerCase());
        const typeText = eventTypeLabel(ev.eventType, typeOptions);
        return (
          <Card key={ev.id} onPress={rsvpEnabled ? () => openEvent(ev.id) : undefined}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <DateBlock ymd={ev.date} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text numberOfLines={2} style={{ fontSize: 15, color: B.ink, fontFamily: F.semibold }}>
                  {ev.title}
                </Text>
                <Text style={{ fontSize: 12, color: B.ink3, fontFamily: F.medium }}>
                  {dayLabel(ev.date)}
                  {ev.time ? ` · ${ev.time}` : ''}
                  {ev.endTime ? `–${ev.endTime}` : ''}
                </Text>
                {ev.location ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <MapPin size={11} color={B.ink4} />
                    <Text numberOfLines={1} style={{ fontSize: 12, color: B.ink4, fontFamily: F.medium }}>
                      {ev.location}
                    </Text>
                  </View>
                ) : null}
                {ev.description ? (
                  <Text numberOfLines={3} style={{ fontSize: 13, color: B.ink2, marginTop: 2, fontFamily: 'Manrope_400Regular' }}>
                    {ev.description}
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
              {typeText ? <Pill text={typeText} tint={B.ink2} bg={B.paper2} /> : null}
              <View style={{ flex: 1 }} />
              {rsvpEnabled && !ev.archived ? (
                <Pressable
                  onPress={() => toggleGoing(ev, mineGoing)}
                  disabled={toggle.isPending}
                  accessibilityLabel={mineGoing ? `Rezygnuję: ${ev.title}` : `Będę: ${ev.title}`}
                  className="active:opacity-70"
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    paddingHorizontal: 11,
                    paddingVertical: 6,
                    borderRadius: 999,
                    backgroundColor: mineGoing ? B.kurkuma : B.paper,
                    opacity: toggle.isPending ? 0.6 : 1,
                  }}
                >
                  {mineGoing ? <Check size={13} color={B.ink} strokeWidth={3} /> : null}
                  <Text style={{ fontSize: 12, color: B.ink, fontFamily: F.semibold }}>
                    Będę{g?.count ? ` · ${g.count}` : ''}
                  </Text>
                </Pressable>
              ) : null}
              {canDelete ? (
                <Pressable
                  onPress={() => confirmDelete(ev)}
                  disabled={remove.isPending}
                  hitSlop={8}
                  accessibilityLabel={`Usuń wydarzenie: ${ev.title}`}
                  className="active:opacity-60"
                >
                  <Trash2 size={16} color={B.ink4} />
                </Pressable>
              ) : null}
            </View>
          </Card>
        );
      })}

      {showServing ? (
        <View style={{ marginTop: list.length ? 10 : 0 }}>
          <Text style={{ fontSize: 12, color: B.gold, letterSpacing: 1.3, textTransform: 'uppercase', fontFamily: F.bold, marginLeft: 4 }}>
            Służymy na
          </Text>
          <Text style={{ marginTop: 3, marginBottom: 10, marginLeft: 4, fontSize: 13, lineHeight: 18, color: B.ink3, fontFamily: F.medium }}>
            Wydarzenia z innych kalendarzy, w których służy ten zespół — te same co w Grafiku.
          </Text>
          <View style={{ backgroundColor: B.card, borderRadius: 20, overflow: 'hidden' }}>
            {serving.map((ev, i) => (
              <Pressable
                key={`serving_${ev.id}`}
                onPress={() => openEvent(ev.id)}
                accessibilityLabel={`${ev.title}, ${dayLabel(ev.date)}${ev.time ? `, ${ev.time}` : ''}`}
                className="active:opacity-70"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: B.line }}
              >
                <DateBlock ymd={ev.date} tint={B.ink} bg={B.paper2} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontSize: 15, color: B.ink, fontFamily: F.semibold }}>
                    {ev.title}
                  </Text>
                  <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 12, color: B.ink3, fontFamily: F.medium }}>
                    {[`${dayLabel(ev.date)}${ev.time ? `, ${ev.time}` : ''}`, ev.location].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <ChevronRight size={16} color={B.ink4} />
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {canCreate ? (
        <NewEventModal
          visible={modalOpen}
          onClose={() => setModalOpen(false)}
          isLoading={create.isPending}
          eventTypes={typeOptions}
          defaultType={typeOptions[0]?.key ?? 'inne'}
          onSubmit={submit}
        />
      ) : null}
    </View>
  );
};
