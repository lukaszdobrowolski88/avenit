import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { B } from '../../../components/ui/brand';
import { Chip, DangerLink, FormInput, FormLabel, PrimaryButton, Sheet } from '../../../components/ui/Sheet';
import { useDeleteRole, useSaveRole, type RosterPerson, type RosterRole } from '../roster';
import { friendlyError } from '../../../lib/errors';

// Służba w zespole (team_roles) — nazwa, opis i kto ją pełni (team_member_roles).
// Służby są kolumnami grafiku; nowa służba od razu pojawia się na wydarzeniach.

const F = { medium: 'Manrope_500Medium' } as const;

export const RoleSheet = ({
  visible,
  team,
  table,
  role,
  roles,
  people,
  canDelete,
  onClose,
}: {
  visible: boolean;
  team: string;
  table: string;
  role: RosterRole | null; // null = nowa służba
  roles: RosterRole[];
  people: RosterPerson[];
  canDelete: boolean;
  onClose: () => void;
}) => {
  const save = useSaveRole(team, table);
  const del = useDeleteRole(team);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) return;
    setName(role?.name ?? '');
    setDescription(role?.description ?? '');
    setMemberIds(role?.memberIds ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const submit = () => {
    const n = name.trim();
    if (!n) return Alert.alert('Podaj nazwę służby');
    if (roles.some((r) => r.id !== role?.id && r.name.toLowerCase() === n.toLowerCase())) {
      return Alert.alert('Taka służba już jest', 'Wybierz inną nazwę.');
    }
    save.mutate(
      {
        role,
        name: n,
        description: description.trim() || null,
        memberIds,
        takenKeys: roles.map((r) => r.key),
        nextOrder: roles.reduce((m, r) => Math.max(m, r.order), 0) + 1,
      },
      { onSuccess: onClose, onError: (e: unknown) => Alert.alert('Nie udało się zapisać', friendlyError(e, 'Spróbuj ponownie.')) },
    );
  };

  const remove = () =>
    Alert.alert('Usunąć służbę?', `„${role?.name}” zniknie z zespołu i z kolumn grafiku. Osoby zostają w zespole.`, [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: () => del.mutate(role!.id, { onSuccess: onClose, onError: (e: unknown) => Alert.alert('Nie udało się usunąć', friendlyError(e, 'Spróbuj ponownie.')) }),
      },
    ]);

  const active = people.filter((p) => p.active || memberIds.includes(p.id));

  return (
    <Sheet
      visible={visible}
      eyebrow={role ? 'Służba' : 'Nowa służba'}
      title={role ? role.name : 'Dodaj służbę'}
      onClose={onClose}
      footer={<PrimaryButton label={role ? 'Zapisz' : 'Dodaj służbę'} busy={save.isPending} onPress={submit} />}
    >
      <FormLabel first>Nazwa</FormLabel>
      <FormInput value={name} onChangeText={setName} placeholder="np. Wokal, Nagłośnienie, Kamera" />

      <FormLabel>Opis</FormLabel>
      <FormInput value={description} onChangeText={setDescription} placeholder="Czym się zajmuje ta osoba (opcjonalnie)" multiline />

      <FormLabel>Kto pełni tę służbę</FormLabel>
      {active.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {active.map((p) => (
            <Chip
              key={p.id}
              label={p.name}
              on={memberIds.includes(p.id)}
              onPress={() => setMemberIds((ids) => (ids.includes(p.id) ? ids.filter((x) => x !== p.id) : [...ids, p.id]))}
            />
          ))}
        </View>
      ) : (
        <Text style={{ fontSize: 14, color: B.ink3, fontFamily: F.medium }}>W zespole nie ma jeszcze osób.</Text>
      )}
      <Text style={{ marginTop: 8, marginLeft: 2, fontSize: 12, lineHeight: 17, color: B.ink4, fontFamily: F.medium }}>
        W grafiku te osoby są proponowane jako pierwsze przy tej służbie.
      </Text>

      {role && canDelete ? <DangerLink label="Usuń służbę" onPress={remove} busy={del.isPending} /> : null}
    </Sheet>
  );
};
