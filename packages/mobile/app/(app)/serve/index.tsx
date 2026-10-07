import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StatusBar, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CalendarOff, Check, ChevronRight, Plus, Search, Trash2 } from 'lucide-react-native';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { B, Monogram } from '../../../src/components/ui/brand';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { FormInput, FormLabel, PrimaryButton, Sheet } from '../../../src/components/ui/Sheet';
import { DateField, toYmd } from '../../../src/components/ui/DateField';
import { NoModuleAccess } from '../../../src/components/ModuleGate';
import { usePermissions } from '../../../src/lib/permissions';
import { useCampusQuery } from '../../../src/hooks/useCampusQuery';
import { friendlyError } from '../../../src/lib/errors';
import { toast } from '../../../src/lib/toast';
import {
  useAddVolunteerBlockout,
  useDeleteVolunteerBlockout,
  useVolunteerAvailability,
  type Volunteer,
  type VolunteerBlockout,
} from '../../../src/features/serve/api';
import { daysLabel, rangeLabel, todayIso } from '../../../src/features/serve/format';

// Moduł „Dostępność” (jak web: Dostępność — kto z wolontariuszy nie może służyć i kiedy).
// Tylko niedostępności wolontariuszy; Raport CCLI jest w Analityce na webie. Własne
// nieobecności każdy zgłasza w „Moje nieobecności” (link na górze).

const F = { medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold' } as const;
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');

export default function AvailabilityModuleScreen() {
  const router = useRouter();
  const perms = usePermissions();
  const { selectedCampusId, withCampusFilter, campusIdForInsert } = useCampusQuery();
  const q = useVolunteerAvailability({ selectedCampusId, withCampusFilter });
  const del = useDeleteVolunteerBlockout();
  const [search, setSearch] = useState('');
  const [onlyUpcoming, setOnlyUpcoming] = useState(true);
  const [adding, setAdding] = useState(false);

  const canAdd = perms.can('res:volunteer_blockouts:create');
  const canDelete = perms.can('res:volunteer_blockouts:delete');

  const all: VolunteerBlockout[] = q.data?.blockouts ?? [];
  const today = todayIso();
  const upcomingCount = all.filter((b) => b.end_date >= today).length;
  const list = useMemo(() => {
    const s = fold(search.trim());
    const rows = all.filter((b) => (!onlyUpcoming || b.end_date >= today) && (!s || fold(`${b.memberName} ${b.reason ?? ''}`).includes(s)));
    return onlyUpcoming ? rows : [...rows].reverse();
  }, [all, search, onlyUpcoming, today]);

  if (!perms.ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: B.paper }}>
        <ActivityIndicator color={B.ink} />
      </View>
    );
  }
  if (!perms.moduleVisible('serve')) return <NoModuleAccess />;

  const confirmDelete = (b: VolunteerBlockout) =>
    Alert.alert(
      'Usunąć niedostępność?',
      `${b.memberName}: ${rangeLabel(b)}${b.reason ? ` (${b.reason})` : ''}. Osoba znów będzie widoczna jako dostępna przy układaniu grafiku.`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Usuń',
          style: 'destructive',
          onPress: () =>
            del.mutate(b.id, {
              onSuccess: () => toast.success('Usunięto niedostępność', b.memberName),
              onError: (e: unknown) => Alert.alert('Nie udało się usunąć', friendlyError(e, 'Spróbuj ponownie.')),
            }),
        },
      ],
    );

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: B.paper }}>
        <PageHeader title="Dostępność" subtitle="Kto z wolontariuszy nie może służyć i kiedy" Icon={CalendarOff} showBack />
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 130, gap: 12 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={B.ink} />}
        >
          <Pressable
            onPress={() => router.push('/(app)/serve/availability')}
            className="active:opacity-70"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 20, backgroundColor: B.card }}
          >
            <CalendarOff size={17} color={B.gold} />
            <Text style={{ flex: 1, fontSize: 15, color: B.ink, fontFamily: F.semibold }}>Moje nieobecności</Text>
            <ChevronRight size={16} color={B.ink4} />
          </Pressable>

          {canAdd ? (
            <Pressable
              onPress={() => setAdding(true)}
              className="active:opacity-80"
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 999, backgroundColor: B.kurkuma }}
            >
              <Plus size={18} color={B.ink} strokeWidth={2.6} />
              <Text style={{ fontSize: 15, color: B.ink, fontFamily: F.bold }}>Dodaj niedostępność</Text>
            </Pressable>
          ) : null}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, paddingHorizontal: 14, borderRadius: 23, backgroundColor: B.card }}>
            <Search size={16} color={B.ink4} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Szukaj wolontariusza albo powodu"
              placeholderTextColor={B.ink4}
              accessibilityLabel="Szukaj wolontariusza albo powodu"
              style={{ flex: 1, fontSize: 15, color: B.ink, fontFamily: F.medium }}
            />
          </View>

          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[
              { on: true, label: `Nadchodzące · ${upcomingCount}` },
              { on: false, label: `Wszystkie · ${all.length}` },
            ].map((o) => (
              <Pressable
                key={String(o.on)}
                onPress={() => setOnlyUpcoming(o.on)}
                className="active:opacity-80"
                style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: onlyUpcoming === o.on ? B.ink : B.paper2 }}
              >
                <Text style={{ fontSize: 13, color: onlyUpcoming === o.on ? '#fff' : B.ink, fontFamily: F.semibold }}>{o.label}</Text>
              </Pressable>
            ))}
          </View>

          {q.isLoading ? (
            <ActivityIndicator color={B.ink} style={{ marginTop: 24 }} />
          ) : q.isError ? (
            <EmptyState
              Icon={CalendarOff}
              title="Nie udało się wczytać niedostępności"
              hint={friendlyError(q.error, 'Sprawdź połączenie i spróbuj ponownie.')}
              actionLabel="Spróbuj ponownie"
              onAction={() => q.refetch()}
            />
          ) : !list.length ? (
            <EmptyState
              Icon={CalendarOff}
              title={search ? 'Brak wyników' : onlyUpcoming ? 'Brak nadchodzących niedostępności' : 'Brak zgłoszonych niedostępności'}
              hint={search ? 'Zmień wyszukiwanie.' : 'Wolontariusze zgłaszają nieobecności w aplikacji — „Moje nieobecności”.'}
            />
          ) : (
            <View style={{ backgroundColor: B.card, borderRadius: 22, overflow: 'hidden' }}>
              {list.map((b, i) => {
                const past = b.end_date < today;
                return (
                  <View
                    key={b.id}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: i ? 1 : 0, borderTopColor: B.line, opacity: past ? 0.55 : 1 }}
                  >
                    <Monogram name={b.memberName} size={38} />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ fontSize: 15, color: B.ink, fontFamily: F.semibold }}>
                        {b.memberName}
                      </Text>
                      <Text numberOfLines={2} style={{ marginTop: 2, fontSize: 13, color: B.ink3, fontFamily: F.medium }}>
                        {[rangeLabel(b), daysLabel(b), b.reason].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    {canDelete ? (
                      <Pressable
                        onPress={() => confirmDelete(b)}
                        disabled={del.isPending}
                        hitSlop={10}
                        accessibilityLabel={`Usuń niedostępność: ${b.memberName}, ${rangeLabel(b)}`}
                        style={{ padding: 4 }}
                      >
                        <Trash2 size={17} color={B.ink4} />
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      </View>
      {canAdd ? (
        <AddBlockoutSheet visible={adding} onClose={() => setAdding(false)} members={q.data?.members ?? []} campusIdForInsert={campusIdForInsert} />
      ) : null}
    </>
  );
}

const AddBlockoutSheet = ({
  visible,
  onClose,
  members,
  campusIdForInsert,
}: {
  visible: boolean;
  onClose: () => void;
  members: Volunteer[];
  campusIdForInsert: number | null;
}) => {
  const add = useAddVolunteerBlockout(campusIdForInsert);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [start, setStart] = useState(toYmd(new Date()));
  const [end, setEnd] = useState(toYmd(new Date()));
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!visible) return;
    setMemberId(null);
    setQ('');
    setStart(toYmd(new Date()));
    setEnd(toYmd(new Date()));
    setReason('');
  }, [visible]);

  const picked = members.find((m) => m.id === memberId) ?? null;
  const s = fold(q.trim());
  const matches = s ? members.filter((m) => fold(m.name).includes(s)).slice(0, 30) : [];

  const save = async () => {
    if (!memberId) return Alert.alert('Wskaż wolontariusza', 'Wyszukaj osobę i wybierz ją z listy.');
    if (end < start) return Alert.alert('Zakres dat', 'Data „do” nie może być wcześniejsza niż data „od”.');
    try {
      await add.mutateAsync({ memberId, start_date: start, end_date: end, reason: reason.trim() || null });
      onClose();
      toast.success('Dodano niedostępność', picked?.name);
    } catch (e: unknown) {
      Alert.alert('Nie udało się zapisać niedostępności', friendlyError(e, 'Spróbuj ponownie.'));
    }
  };

  return (
    <Sheet
      visible={visible}
      title="Nowa niedostępność"
      subtitle="Wolontariusz nie może służyć w tych dniach — lider zobaczy to przy grafiku."
      onClose={onClose}
      footer={<PrimaryButton label="Zapisz" onPress={save} busy={add.isPending} disabled={!memberId} />}
    >
      <FormLabel first>Wolontariusz</FormLabel>
      {picked ? (
        <Pressable
          onPress={() => setMemberId(null)}
          accessibilityLabel={`Wybrano: ${picked.name}. Zmień osobę`}
          className="active:opacity-70"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: B.kurkumaSoft }}
        >
          <Monogram name={picked.name} size={34} />
          <Text style={{ flex: 1, fontSize: 15, color: B.ink, fontFamily: F.semibold }}>{picked.name}</Text>
          <Text style={{ fontSize: 13, color: B.gold, fontFamily: F.bold }}>Zmień</Text>
        </Pressable>
      ) : (
        <>
          <FormInput value={q} onChangeText={setQ} placeholder="Wpisz imię lub nazwisko" autoCorrect={false} />
          {matches.length ? (
            <View style={{ marginTop: 8, backgroundColor: B.card, borderRadius: 18, overflow: 'hidden' }}>
              {matches.map((m, i) => (
                <Pressable
                  key={m.id}
                  onPress={() => setMemberId(m.id)}
                  className="active:opacity-70"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: B.line }}
                >
                  <Monogram name={m.name} size={32} />
                  <Text style={{ flex: 1, fontSize: 15, color: B.ink, fontFamily: F.semibold }}>{m.name}</Text>
                  {memberId === m.id ? <Check size={16} color={B.ink} /> : null}
                </Pressable>
              ))}
            </View>
          ) : q.trim() ? (
            <Text style={{ marginTop: 8, fontSize: 13, color: B.ink3, fontFamily: F.medium }}>Nie znaleziono osoby.</Text>
          ) : null}
        </>
      )}

      <FormLabel>Od</FormLabel>
      <DateField
        value={start}
        onChange={(v) => {
          setStart(v);
          if (end < v) setEnd(v);
        }}
      />
      <FormLabel>Do</FormLabel>
      <DateField value={end} onChange={setEnd} />

      <FormLabel>Powód (opcjonalnie)</FormLabel>
      <FormInput value={reason} onChangeText={setReason} placeholder="np. urlop, wyjazd, choroba" />
    </Sheet>
  );
};
