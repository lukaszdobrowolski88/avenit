import { useMemo, useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { Mail, MessageSquare, Phone, Users } from 'lucide-react-native';
import { B, Monogram } from '../../../components/ui/brand';
import { useRoster, type RosterPerson, type RosterRole } from '../roster';
import { PersonSheet } from '../components/PersonSheet';
import { Empty, Loading, SearchBar, fold } from './ui';

// Członkowie zespołu (worship_team / media_team / atmosfera_members / kids_teachers):
// lista z kontaktem jednym dotknięciem, wyszukiwanie po imieniu, służbie i e-mailu;
// z prawem edycji — dodawanie, edycja, służby osoby i usuwanie.

const F = { medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold' } as const;

const open = (url: string) => Linking.openURL(url).catch(() => Alert.alert('Nie udało się otworzyć', 'Ta akcja nie jest dostępna na tym urządzeniu.'));

const Action = ({ Icon, onPress, label }: { Icon: typeof Phone; onPress: () => void; label: string }) => (
  <Pressable
    onPress={onPress}
    accessibilityLabel={label}
    hitSlop={6}
    className="active:opacity-60"
    style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: B.paper, alignItems: 'center', justifyContent: 'center' }}
  >
    <Icon size={15} color={B.ink} strokeWidth={2.2} />
  </Pressable>
);

export const RosterTab = ({
  team,
  table,
  canCreate,
  canEdit,
  canDelete,
  withFunction,
}: {
  team: string;
  table: string;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  withFunction?: boolean;
}) => {
  const roster = useRoster(team, table);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<RosterPerson | 'new' | null>(null);
  const roles = roster.data?.roles ?? [];
  const roleName = useMemo(() => new Map((roles as RosterRole[]).map((r) => [r.id, r.name])), [roles]);

  const { active, inactive } = useMemo(() => {
    const all: RosterPerson[] = roster.data?.people ?? [];
    const s = fold(q.trim());
    const hit = (p: RosterPerson) =>
      !s || fold([p.name, p.email ?? '', p.role ?? '', ...p.roleIds.map((id) => roleName.get(id) ?? '')].join(' ')).includes(s);
    const list = all.filter(hit);
    return { active: list.filter((p) => p.active), inactive: list.filter((p) => !p.active) };
  }, [roster.data, q, roleName]);

  const row = (p: RosterPerson, i: number) => {
    const sub = p.roleIds.length ? p.roleIds.map((id) => roleName.get(id)).filter(Boolean).join(', ') : p.role;
    const body = (
      <>
        <View style={{ opacity: p.active ? 1 : 0.5 }}>
          <Monogram name={p.name} size={42} />
        </View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontSize: 15, color: p.active ? B.ink : B.ink3, letterSpacing: -0.2, fontFamily: F.semibold }}>
            {p.name}
          </Text>
          {sub ? (
            <Text numberOfLines={1} style={{ marginTop: 1, fontSize: 12, color: B.ink3, fontFamily: F.medium }}>
              {sub}
            </Text>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {p.phone ? <Action Icon={Phone} label={`Zadzwoń: ${p.name}`} onPress={() => open(`tel:${p.phone!.replace(/\s/g, '')}`)} /> : null}
          {p.phone ? <Action Icon={MessageSquare} label={`SMS: ${p.name}`} onPress={() => open(`sms:${p.phone!.replace(/\s/g, '')}`)} /> : null}
          {p.email ? <Action Icon={Mail} label={`E-mail: ${p.name}`} onPress={() => open(`mailto:${p.email}`)} /> : null}
        </View>
      </>
    );
    const style = {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderTopWidth: i ? 1 : 0,
      borderTopColor: B.line,
    };
    return canEdit ? (
      <Pressable key={p.id} onPress={() => setEditing(p)} className="active:opacity-70" style={style}>
        {body}
      </Pressable>
    ) : (
      <View key={p.id} style={style}>
        {body}
      </View>
    );
  };

  const total = roster.data?.people.length ?? 0;

  return (
    <View>
      <SearchBar
        value={q}
        onChange={setQ}
        placeholder={total ? `Szukaj wśród ${total} osób` : 'Szukaj osoby'}
        onAdd={canCreate ? () => setEditing('new') : undefined}
        addLabel="Dodaj osobę"
      />
      {roster.isLoading ? <Loading /> : null}
      {roster.isError ? <Empty Icon={Users} title="Nie udało się wczytać listy" hint="Możesz nie mieć dostępu do tej listy." /> : null}
      {!roster.isLoading && !roster.isError && !active.length && !inactive.length ? (
        <Empty
          Icon={Users}
          title={q ? 'Nikogo nie znaleziono' : 'Lista jest pusta'}
          hint={!q && canCreate ? 'Dodaj pierwszą osobę przyciskiem „+”.' : undefined}
        />
      ) : null}

      {active.length ? <View style={{ backgroundColor: B.card, borderRadius: 22, overflow: 'hidden' }}>{active.map(row)}</View> : null}
      {inactive.length ? (
        <>
          <Text style={{ marginTop: 20, marginBottom: 8, marginLeft: 4, fontSize: 12, color: B.gold, letterSpacing: 1.3, textTransform: 'uppercase', fontFamily: F.bold }}>
            Nieaktywni · {inactive.length}
          </Text>
          <View style={{ backgroundColor: B.card, borderRadius: 22, overflow: 'hidden' }}>{inactive.map(row)}</View>
        </>
      ) : null}

      <PersonSheet
        visible={!!editing}
        team={team}
        table={table}
        person={editing && editing !== 'new' ? editing : null}
        roles={roles}
        withFunction={withFunction}
        canDelete={canDelete}
        onClose={() => setEditing(null)}
      />
    </View>
  );
};
