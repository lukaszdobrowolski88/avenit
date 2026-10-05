import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { B } from '../../../components/ui/brand';
import { Chip, DangerLink, FormInput, FormLabel, PrimaryButton, Sheet } from '../../../components/ui/Sheet';
import { useDeletePerson, useSavePerson, type RosterPerson, type RosterRole } from '../roster';

// Dodanie / edycja osoby w zespole (jak formularz „Dodaj członka” na webie):
// imię i nazwisko, kontakt, służby (team_member_roles), aktywność; dla Nauczycieli — funkcja.

const F = { medium: 'Manrope_500Medium' } as const;

export const PersonSheet = ({
  visible,
  team,
  table,
  person,
  roles,
  withFunction,
  canDelete,
  onClose,
}: {
  visible: boolean;
  team: string;
  table: string;
  person: RosterPerson | null; // null = nowa osoba
  roles: RosterRole[];
  withFunction?: boolean; // pole „Funkcja” (kids_teachers.role)
  canDelete: boolean;
  onClose: () => void;
}) => {
  const save = useSavePerson(team, table);
  const del = useDeletePerson(team, table);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [fn, setFn] = useState('');
  const [active, setActive] = useState(true);
  const [roleIds, setRoleIds] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) return;
    setName(person?.name ?? '');
    setEmail(person?.email ?? '');
    setPhone(person?.phone ?? '');
    setFn(person?.role ?? (withFunction ? 'Nauczyciel' : ''));
    setActive(person?.active ?? true);
    setRoleIds(person?.roleIds ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const submit = () => {
    const n = name.trim().replace(/\s+/g, ' ');
    if (!n) return Alert.alert('Podaj imię i nazwisko');
    const e = email.trim().toLowerCase();
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return Alert.alert('E-mail', 'Ten adres wygląda na niepoprawny.');
    save.mutate(
      {
        person,
        input: { name: n, email: e || null, phone: phone.trim() || null, role: withFunction ? fn.trim() || null : null, active, roleIds },
      },
      { onSuccess: onClose, onError: (err: any) => Alert.alert('Nie udało się zapisać', err?.message ?? 'Spróbuj ponownie.') },
    );
  };

  const remove = () =>
    Alert.alert('Usunąć z zespołu?', `${person?.name} zniknie z listy i z wyboru w grafiku. Wpisy w dawnych grafikach zostaną.`, [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: () =>
          del.mutate(person!.id, { onSuccess: onClose, onError: (err: any) => Alert.alert('Nie udało się usunąć', err?.message ?? 'Spróbuj ponownie.') }),
      },
    ]);

  return (
    <Sheet
      visible={visible}
      eyebrow={person ? 'Osoba w zespole' : 'Nowa osoba'}
      title={person ? person.name : 'Dodaj do zespołu'}
      onClose={onClose}
      footer={<PrimaryButton label={person ? 'Zapisz' : 'Dodaj'} busy={save.isPending} onPress={submit} />}
    >
      <FormLabel first>Imię i nazwisko</FormLabel>
      <FormInput value={name} onChangeText={setName} placeholder="np. Anna Kowalska" autoCapitalize="words" />

      <FormLabel>Telefon</FormLabel>
      <FormInput value={phone} onChangeText={setPhone} placeholder="np. 600 100 200" keyboardType="phone-pad" />

      <FormLabel>E-mail</FormLabel>
      <FormInput value={email} onChangeText={setEmail} placeholder="np. anna@przyklad.pl" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
      <Text style={{ marginTop: 6, marginLeft: 2, fontSize: 12, lineHeight: 17, color: B.ink4, fontFamily: F.medium }}>
        Na ten adres przychodzą zaproszenia do służby z grafiku.
      </Text>

      {withFunction ? (
        <>
          <FormLabel>Funkcja</FormLabel>
          <FormInput value={fn} onChangeText={setFn} placeholder="np. Nauczyciel" />
        </>
      ) : null}

      {roles.length ? (
        <>
          <FormLabel>Służby</FormLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {roles.map((r) => (
              <Chip
                key={r.id}
                label={r.name}
                on={roleIds.includes(r.id)}
                onPress={() => setRoleIds((ids) => (ids.includes(r.id) ? ids.filter((x) => x !== r.id) : [...ids, r.id]))}
              />
            ))}
          </View>
        </>
      ) : null}

      <FormLabel>Status osoby</FormLabel>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Chip label="Aktywna" on={active} onPress={() => setActive(true)} />
        <Chip label="Nieaktywna" on={!active} onPress={() => setActive(false)} />
      </View>

      {person && canDelete ? <DangerLink label="Usuń z zespołu" onPress={remove} busy={del.isPending} /> : null}
    </Sheet>
  );
};
