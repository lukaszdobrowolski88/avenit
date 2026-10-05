import { useMemo, useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { Baby, ChevronRight, Home, Phone, Plus, Users } from 'lucide-react-native';
import { B, Monogram } from '../../../components/ui/brand';
import { ageFrom, useHouseholds, useKidsData, type Household, type KidsData, type KidsGroup, type KidsStudent } from '../kids';
import { KidsGroupSheet } from '../components/KidsGroupSheet';
import { KidsStudentSheet } from '../components/KidsStudentSheet';
import { HouseholdSheet } from '../components/HouseholdSheet';
import { Empty, Loading, SearchBar, SegmentChips, fold } from './ui';

// Zakładki Dzieci: Grupy, Uczniowie, Rodziny — jak KidsModule + HouseholdManager na webie.

const F = { medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold' } as const;

interface Scope {
  selectedCampusId: number | null;
  withCampusFilter: <T>(q: T) => T;
}

const plural = (n: number, one: string, few: string, many: string) => {
  if (n === 1) return one;
  const d = n % 10;
  const t = n % 100;
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many;
};

// ─── Grupy ─────────────────────────────────────────────────────────────────────

export const KidsGroupsTab = ({
  scope,
  campusIdForInsert,
  canCreate,
  canEdit,
  canDelete,
}: {
  scope: Scope;
  campusIdForInsert: number | null;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) => {
  const kids = useKidsData(scope);
  const [open, setOpen] = useState<string | 'new' | null>(null);
  const data: KidsData | undefined = kids.data;
  if (kids.isLoading) return <Loading />;
  if (kids.isError || !data) return <Empty Icon={Users} title="Nie udało się wczytać grup" hint="Pociągnij w dół, żeby spróbować ponownie." />;

  return (
    <View>
      {canCreate ? (
        <Pressable
          onPress={() => setOpen('new')}
          className="active:opacity-80"
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 999, backgroundColor: B.kurkuma, marginBottom: 14 }}
        >
          <Plus size={18} color={B.ink} strokeWidth={2.6} />
          <Text style={{ fontSize: 15, color: B.ink, fontFamily: F.bold }}>Nowa grupa</Text>
        </Pressable>
      ) : null}
      {!data.groups.length ? <Empty Icon={Users} title="Nie ma jeszcze grup" hint={canCreate ? 'Utwórz grupy wiekowe, np. Maluchy 3–5 lat.' : undefined} /> : null}

      {data.groups.map((g: KidsGroup) => {
        const count = data.students.filter((s) => s.groupId === g.id).length;
        const allergic = data.students.filter((s) => s.groupId === g.id && s.allergies).length;
        const teachers = g.teacherIds.map((id) => data.teachers.find((t) => t.id === id)?.name).filter(Boolean) as string[];
        return (
          <Pressable key={g.id} onPress={() => setOpen(g.id)} className="active:opacity-80" style={{ borderRadius: 22, backgroundColor: B.card, padding: 16, marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 17, color: B.ink, letterSpacing: -0.4, fontFamily: F.bold }}>{g.name}</Text>
                <Text style={{ marginTop: 2, fontSize: 13, color: B.ink3, fontFamily: F.medium }}>
                  {[g.ageRange, g.room ? `sala ${g.room}` : null].filter(Boolean).join(' · ') || 'Bez opisu wieku i sali'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 22, color: B.ink, letterSpacing: -0.6, fontFamily: F.bold }}>{count}</Text>
                <Text style={{ fontSize: 12, color: B.ink3, fontFamily: F.medium }}>{plural(count, 'dziecko', 'dzieci', 'dzieci')}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 12 }}>
              {teachers.length ? (
                teachers.map((t) => (
                  <View key={t} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: B.paper }}>
                    <Text style={{ fontSize: 12, color: B.ink, fontFamily: F.semibold }}>{t}</Text>
                  </View>
                ))
              ) : (
                <Text style={{ fontSize: 12, color: B.ink4, fontFamily: F.medium }}>Bez przypisanych nauczycieli</Text>
              )}
              {allergic ? (
                <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: '#FDECEA' }}>
                  <Text style={{ fontSize: 12, color: '#B42318', fontFamily: F.bold }}>alergie: {allergic}</Text>
                </View>
              ) : null}
              {g.materials.length ? (
                <Text style={{ fontSize: 12, color: B.gold, fontFamily: F.bold }}>
                  {g.materials.length} {plural(g.materials.length, 'materiał', 'materiały', 'materiałów')}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}

      <KidsGroupSheet
        visible={!!open}
        groupId={open && open !== 'new' ? open : null}
        data={data}
        campusIdForInsert={campusIdForInsert}
        canEdit={open === 'new' ? canCreate : canEdit}
        canDelete={canDelete}
        onClose={() => setOpen(null)}
      />
    </View>
  );
};

// ─── Uczniowie ─────────────────────────────────────────────────────────────────

export const KidsStudentsTab = ({
  scope,
  campusIdForInsert,
  canReadHouseholds,
  canCreate,
  canEdit,
  canDelete,
}: {
  scope: Scope;
  campusIdForInsert: number | null;
  canReadHouseholds: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) => {
  const kids = useKidsData(scope);
  const households = useHouseholds(canReadHouseholds);
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<string>('all');
  const [open, setOpen] = useState<KidsStudent | 'new' | null>(null);
  const data: KidsData | undefined = kids.data;
  const hh: Household[] = households.data ?? [];

  const list = useMemo(() => {
    const all: KidsStudent[] = data?.students ?? [];
    const s = fold(q.trim());
    return all.filter(
      (st) =>
        (group === 'all' || (group === 'none' ? !st.groupId : st.groupId === group)) &&
        (!s || fold(`${st.name} ${st.parentInfo ?? ''}`).includes(s)),
    );
  }, [data, q, group]);

  if (kids.isLoading) return <Loading />;
  if (kids.isError || !data) return <Empty Icon={Baby} title="Nie udało się wczytać listy" hint="Pociągnij w dół, żeby spróbować ponownie." />;
  const groupName = (id: string | null) => data.groups.find((g) => g.id === id)?.name ?? null;
  const householdName = (id: string | null) => hh.find((h) => h.id === id)?.name ?? null;

  return (
    <View>
      <SearchBar
        value={q}
        onChange={setQ}
        placeholder={data.students.length ? `Szukaj wśród ${data.students.length} dzieci` : 'Szukaj dziecka'}
        onAdd={canCreate ? () => setOpen('new') : undefined}
        addLabel="Dodaj dziecko"
      />
      {data.groups.length ? (
        <SegmentChips
          options={[{ key: 'all', label: 'Wszystkie' }, ...data.groups.map((g) => ({ key: g.id, label: g.name })), { key: 'none', label: 'Bez grupy' }]}
          value={group}
          onChange={setGroup}
        />
      ) : null}

      {!list.length ? (
        <Empty Icon={Baby} title={q || group !== 'all' ? 'Nikogo tu nie ma' : 'Lista dzieci jest pusta'} hint={!q && group === 'all' && canCreate ? 'Dodaj pierwsze dziecko przyciskiem „+”.' : undefined} />
      ) : (
        <View style={{ backgroundColor: B.card, borderRadius: 22, overflow: 'hidden' }}>
          {list.map((st, i) => {
            const age = ageFrom(st.birthYear);
            const sub = [age != null ? `${age} ${plural(age, 'rok', 'lata', 'lat')}` : null, groupName(st.groupId), householdName(st.householdId)].filter(Boolean).join(' · ');
            return (
              <Pressable
                key={st.id}
                disabled={!canEdit}
                onPress={() => setOpen(st)}
                className="active:opacity-70"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderTopColor: B.line }}
              >
                <Monogram name={st.name} size={40} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontSize: 15, color: B.ink, letterSpacing: -0.2, fontFamily: F.semibold }}>{st.name}</Text>
                  {sub ? <Text numberOfLines={1} style={{ marginTop: 1, fontSize: 12, color: B.ink3, fontFamily: F.medium }}>{sub}</Text> : null}
                </View>
                {st.allergies ? (
                  <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: '#FDECEA', maxWidth: 120 }}>
                    <Text numberOfLines={1} style={{ fontSize: 11, color: '#B42318', fontFamily: F.bold }}>{st.allergies}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}

      <KidsStudentSheet
        visible={!!open}
        student={open && open !== 'new' ? open : null}
        data={data}
        households={canReadHouseholds ? hh : null}
        campusIdForInsert={campusIdForInsert}
        canDelete={canDelete}
        onClose={() => setOpen(null)}
      />
    </View>
  );
};

// ─── Rodziny ───────────────────────────────────────────────────────────────────

export const HouseholdsTab = ({
  scope,
  canCreate,
  canEdit,
  canDelete,
}: {
  scope: Scope;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) => {
  const kids = useKidsData(scope);
  const households = useHouseholds(true);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Household | 'new' | null>(null);
  const data: KidsData | undefined = kids.data;
  const all: Household[] = households.data ?? [];

  const list = useMemo(() => {
    const s = fold(q.trim());
    if (!s) return all;
    return all.filter((h) => {
      const kidsNames = (data?.students ?? []).filter((st) => st.householdId === h.id).map((st) => st.name);
      return fold([h.name, h.lastFour ?? '', ...h.contacts.flatMap((c) => [c.name, c.phone]), ...kidsNames].join(' ')).includes(s);
    });
  }, [all, q, data]);

  if (households.isLoading || kids.isLoading) return <Loading />;
  if (households.isError) return <Empty Icon={Home} title="Brak dostępu do rodzin" hint="Rodziny są częścią modułu Członkowie." />;

  return (
    <View>
      <SearchBar value={q} onChange={setQ} placeholder="Szukaj: nazwisko, opiekun, telefon, dziecko" onAdd={canCreate ? () => setOpen('new') : undefined} addLabel="Dodaj rodzinę" />
      {!list.length ? (
        <Empty Icon={Home} title={q ? 'Nic nie znaleziono' : 'Nie ma jeszcze rodzin'} hint={!q && canCreate ? 'Rodzina łączy dzieci z opiekunami — po numerze telefonu szybko zameldujesz dzieci.' : undefined} />
      ) : null}
      {list.map((h) => {
        const primary = h.contacts.find((c) => c.isPrimary) ?? h.contacts[0];
        const kidsOf = (data?.students ?? []).filter((st) => st.householdId === h.id);
        return (
          <Pressable key={h.id} onPress={() => setOpen(h)} className="active:opacity-80" style={{ borderRadius: 22, backgroundColor: B.card, padding: 16, marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontSize: 17, color: B.ink, letterSpacing: -0.4, fontFamily: F.bold }}>{h.name}</Text>
                <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 13, color: B.ink3, fontFamily: F.medium }}>
                  {primary ? `${primary.name}${primary.relationship ? ` (${primary.relationship.toLowerCase()})` : ''}` : 'Bez opiekunów'}
                  {h.contacts.length > 1 ? ` +${h.contacts.length - 1}` : ''}
                </Text>
              </View>
              {primary?.phone ? (
                <Pressable
                  onPress={() => Linking.openURL(`tel:${primary.phone.replace(/\s/g, '')}`).catch(() => Alert.alert('Nie udało się zadzwonić'))}
                  hitSlop={6}
                  accessibilityLabel={`Zadzwoń: ${primary.name}`}
                  style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: B.paper, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Phone size={16} color={B.ink} />
                </Pressable>
              ) : null}
              <ChevronRight size={18} color={B.ink4} />
            </View>
            {kidsOf.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                {kidsOf.map((k) => (
                  <View key={k.id} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: B.kurkumaSoft }}>
                    <Text style={{ fontSize: 12, color: B.goldDeep, fontFamily: F.bold }}>{k.name}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </Pressable>
        );
      })}

      {data ? (
        <HouseholdSheet
          visible={!!open}
          household={open && open !== 'new' ? open : null}
          data={data}
          canEdit={open === 'new' ? canCreate : canEdit}
          canDelete={canDelete}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </View>
  );
};
