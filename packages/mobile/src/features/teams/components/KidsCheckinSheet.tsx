import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { Check, DoorOpen, Search } from 'lucide-react-native';
import { B, Monogram } from '../../../components/ui/brand';
import { Chip, FormLabel, PrimaryButton, Sheet } from '../../../components/ui/Sheet';
import { friendlyError } from '../../../lib/errors';
import {
  ageFrom,
  useCheckInChildren,
  useCheckinLocations,
  useHouseholds,
  useKidsData,
  type CheckinLocation,
  type Household,
  type KidsStudent,
} from '../kids';
import { fold } from '../tabs/ui';

// Meldowanie dzieci z telefonu (jak web: wyszukanie rodziny → dzieci → sala → kod odbioru).
// Szukanie po imieniu dziecka, nazwie rodziny albo 4 ostatnich cyfrach telefonu opiekuna.
// Sala jest opcjonalna; bez sal dzieci trafiają do „Bez sali”. Kod odbioru pokazujemy
// po meldowaniu — rodzic podaje go przy odbiorze (zakładka „Meldowanie dzieci” → Odbiór).

const F = { medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold' } as const;

const digits = (s: string | null | undefined) => String(s || '').replace(/\D/g, '');

export const KidsCheckinSheet = ({
  visible,
  onClose,
  scope,
  canReadHouseholds,
  checkedInIds,
  myEmail,
}: {
  visible: boolean;
  onClose: () => void;
  scope: { selectedCampusId: number | null; withCampusFilter: <T>(q: T) => T };
  canReadHouseholds: boolean;
  checkedInIds: Set<string>; // dzieci już zameldowane dziś (nieodebrane)
  myEmail: string | null;
}) => {
  const kids = useKidsData(scope, visible);
  const households = useHouseholds(visible && canReadHouseholds);
  const locations = useCheckinLocations(visible);
  const checkIn = useCheckInChildren(myEmail);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [locationId, setLocationId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setQ('');
    setPicked([]);
    setLocationId(null);
  }, [visible]);

  const students: KidsStudent[] = kids.data?.students ?? [];
  const familyName = useMemo(() => {
    const m = new Map<string, Household>();
    for (const h of (households.data ?? []) as Household[]) m.set(String(h.id), h);
    return m;
  }, [households.data]);

  // 4 cyfry → rodziny po telefonie (główny numer rodziny i numery wszystkich opiekunów).
  const results = useMemo(() => {
    const s = q.trim();
    if (!s) return [] as KidsStudent[];
    if (/^\d{4}$/.test(s)) {
      const ids = new Set<string>();
      for (const h of (households.data ?? []) as Household[]) {
        const phones = [h.phoneFull, h.lastFour, ...h.contacts.map((c) => c.phone)];
        if (phones.some((p) => digits(p).endsWith(s))) ids.add(String(h.id));
      }
      return students.filter((k) => k.householdId && ids.has(String(k.householdId)));
    }
    const f = fold(s);
    return students.filter((k) => {
      const fam = k.householdId ? familyName.get(String(k.householdId))?.name ?? '' : '';
      return fold(`${k.name} ${fam}`).includes(f);
    });
  }, [q, students, households.data, familyName]);

  const byId = useMemo(() => new Map(students.map((k) => [k.id, k])), [students]);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  // Rodzeństwo: zaznaczenie dziecka z rodziny podpowiada resztę rodziny niżej na liście.
  const siblings = useMemo(() => {
    const fams = new Set(picked.map((id) => byId.get(id)?.householdId).filter(Boolean) as string[]);
    return students.filter((k) => k.householdId && fams.has(String(k.householdId)) && !picked.includes(k.id) && !results.some((r) => r.id === k.id));
  }, [picked, byId, students, results]);

  const rooms: CheckinLocation[] = locations.data ?? [];

  const submit = async () => {
    const children = picked.map((id) => byId.get(id)).filter(Boolean) as KidsStudent[];
    if (!children.length) {
      Alert.alert('Zaznacz dzieci', 'Wyszukaj dziecko i zaznacz je na liście.');
      return;
    }
    try {
      const r = await checkIn.mutateAsync({ children, locationId });
      onClose();
      const lines = r.groups.map((g) => `Kod odbioru ${g.code}: ${g.children.join(', ')}`);
      if (r.skipped.length) lines.push(`Już zameldowane wcześniej: ${r.skipped.join(', ')}`);
      Alert.alert(
        r.groups.length ? 'Zameldowano' : 'Nic nowego do zameldowania',
        `${lines.join('\n')}${r.groups.length ? '\n\nPrzekaż kod rodzicowi — będzie potrzebny przy odbiorze.' : ''}`,
      );
    } catch (e: unknown) {
      Alert.alert('Nie udało się zameldować', friendlyError(e, 'Sprawdź połączenie i spróbuj ponownie.'));
    }
  };

  const row = (k: KidsStudent, i: number) => {
    const done = checkedInIds.has(String(k.id));
    const on = picked.includes(k.id);
    const age = ageFrom(k.birthYear);
    const fam = k.householdId ? familyName.get(String(k.householdId))?.name ?? null : null;
    const sub = [age != null ? `${age} l.` : null, fam, done ? 'już zameldowane' : null].filter(Boolean).join(' · ');
    return (
      <Pressable
        key={k.id}
        onPress={() => toggle(k.id)}
        disabled={done}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: on, disabled: done }}
        accessibilityLabel={`${k.name}${sub ? `, ${sub}` : ''}${k.allergies ? `, alergia: ${k.allergies}` : ''}`}
        className="active:opacity-70"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderTopColor: B.line, opacity: done ? 0.5 : 1 }}
      >
        <Monogram name={k.name} size={38} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontSize: 15, color: B.ink, fontFamily: F.semibold }}>
            {k.name}
          </Text>
          {sub ? (
            <Text numberOfLines={1} style={{ marginTop: 1, fontSize: 12, color: B.ink3, fontFamily: F.medium }}>
              {sub}
            </Text>
          ) : null}
          {k.allergies ? (
            <Text numberOfLines={1} style={{ marginTop: 1, fontSize: 12, color: '#B42318', fontFamily: F.semibold }}>
              Alergia: {k.allergies}
            </Text>
          ) : null}
        </View>
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: on ? B.ink : 'transparent',
            borderWidth: on ? 0 : 1.5,
            borderColor: '#D3CCBC',
          }}
        >
          {on ? <Check size={15} color={B.kurkuma} strokeWidth={3} /> : null}
        </View>
      </Pressable>
    );
  };

  const pickedOutside = picked.filter((id) => !results.some((r) => r.id === id)).map((id) => byId.get(id)).filter(Boolean) as KidsStudent[];

  return (
    <Sheet
      visible={visible}
      title="Zamelduj dzieci"
      subtitle="Wyszukaj dziecko albo rodzinę, zaznacz i wybierz salę."
      onClose={onClose}
      footer={
        <PrimaryButton
          label={picked.length ? `Zamelduj (${picked.length})` : 'Zaznacz dzieci'}
          onPress={submit}
          busy={checkIn.isPending}
          disabled={!picked.length}
        />
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, paddingHorizontal: 14, borderRadius: 23, backgroundColor: B.card }}>
        <Search size={16} color={B.ink4} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Imię dziecka, rodzina albo 4 cyfry telefonu"
          placeholderTextColor={B.ink4}
          autoCorrect={false}
          accessibilityLabel="Szukaj dziecka"
          style={{ flex: 1, fontSize: 15, color: B.ink, fontFamily: F.medium }}
        />
      </View>

      {kids.isLoading ? (
        <Text style={{ paddingVertical: 16, textAlign: 'center', fontSize: 14, color: B.ink3, fontFamily: F.medium }}>Wczytywanie listy dzieci…</Text>
      ) : kids.isError ? (
        <Text style={{ paddingVertical: 16, textAlign: 'center', fontSize: 14, color: '#B42318', fontFamily: F.semibold }}>
          {friendlyError(kids.error, 'Nie udało się wczytać listy dzieci.')}
        </Text>
      ) : q.trim() && !results.length ? (
        <Text style={{ paddingVertical: 16, textAlign: 'center', fontSize: 14, lineHeight: 20, color: B.ink3, fontFamily: F.medium }}>
          Nie znaleziono dziecka. Nowe dzieci i rodziny dodasz w zakładkach Uczniowie i Rodziny.
        </Text>
      ) : null}

      {pickedOutside.length ? (
        <View style={{ marginTop: 12, backgroundColor: B.card, borderRadius: 20, overflow: 'hidden' }}>{pickedOutside.map(row)}</View>
      ) : null}
      {results.length ? <View style={{ marginTop: 12, backgroundColor: B.card, borderRadius: 20, overflow: 'hidden' }}>{results.slice(0, 40).map(row)}</View> : null}
      {siblings.length ? (
        <>
          <FormLabel>Rodzeństwo</FormLabel>
          <View style={{ backgroundColor: B.card, borderRadius: 20, overflow: 'hidden' }}>{siblings.map(row)}</View>
        </>
      ) : null}

      <FormLabel>Sala</FormLabel>
      {rooms.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <Chip label="Bez sali" on={locationId == null} onPress={() => setLocationId(null)} />
          {rooms.map((r) => (
            <Chip key={r.id} label={r.name} on={locationId === r.id} onPress={() => setLocationId(r.id)} />
          ))}
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 10, padding: 12, borderRadius: 16, backgroundColor: B.kurkumaSoft }}>
          <DoorOpen size={16} color={B.goldDeep} style={{ marginTop: 1 }} />
          <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: B.goldDeep, fontFamily: F.semibold }}>
            {locations.isLoading
              ? 'Wczytywanie sal…'
              : 'Nie dodano jeszcze sal — dzieci zameldujesz bez przydziału do sali. Sale dodasz na webie, w module Dzieci.'}
          </Text>
        </View>
      )}
    </Sheet>
  );
};
