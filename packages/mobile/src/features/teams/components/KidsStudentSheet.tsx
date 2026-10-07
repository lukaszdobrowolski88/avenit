import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { B } from '../../../components/ui/brand';
import { Chip, DangerLink, FormInput, FormLabel, PrimaryButton, Sheet } from '../../../components/ui/Sheet';
import { useDeleteStudent, useSaveStudent, type Household, type KidsData, type KidsStudent } from '../kids';
import { friendlyError } from '../../../lib/errors';

// Dziecko (kids_students) — jak „Nowy uczeń” na webie + alergie (pokazywane przy check-inie).

const F = { medium: 'Manrope_500Medium' } as const;

export const KidsStudentSheet = ({
  visible,
  student,
  data,
  households,
  campusIdForInsert,
  canDelete,
  onClose,
}: {
  visible: boolean;
  student: KidsStudent | null; // null = nowe dziecko
  data: KidsData;
  households: Household[] | null; // null = brak dostępu do rodzin
  campusIdForInsert: number | null;
  canDelete: boolean;
  onClose: () => void;
}) => {
  const save = useSaveStudent(campusIdForInsert);
  const del = useDeleteStudent();
  const [name, setName] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [groupId, setGroupId] = useState<string | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [parentInfo, setParentInfo] = useState('');
  const [allergies, setAllergies] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!visible) return;
    setName(student?.name ?? '');
    setBirthYear(student?.birthYear ?? '');
    setGroupId(student?.groupId ?? null);
    setHouseholdId(student?.householdId ?? null);
    setParentInfo(student?.parentInfo ?? '');
    setAllergies(student?.allergies ?? '');
    setNotes(student?.notes ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const submit = () => {
    const n = name.trim().replace(/\s+/g, ' ');
    if (!n) return Alert.alert('Podaj imię i nazwisko dziecka');
    const y = birthYear.trim();
    if (y && !/^(19|20)\d{2}$/.test(y)) return Alert.alert('Rocznik', 'Podaj rok urodzenia, np. 2019.');
    save.mutate(
      {
        id: student?.id ?? null,
        input: {
          name: n,
          birthYear: y || null,
          groupId,
          householdId,
          parentInfo: parentInfo.trim() || null,
          allergies: allergies.trim() || null,
          notes: notes.trim() || null,
        },
      },
      { onSuccess: onClose, onError: (e: unknown) => Alert.alert('Nie udało się zapisać', friendlyError(e, 'Spróbuj ponownie.')) },
    );
  };

  const remove = () =>
    Alert.alert('Usunąć dziecko z listy?', `${student?.name} zniknie z uczniów i grup.`, [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Usuń', style: 'destructive', onPress: () => del.mutate(student!.id, { onSuccess: onClose, onError: (e: unknown) => Alert.alert('Nie udało się usunąć', friendlyError(e, 'Spróbuj ponownie.')) }) },
    ]);

  return (
    <Sheet
      visible={visible}
      eyebrow={student ? 'Dziecko' : 'Nowe dziecko'}
      title={student ? student.name : 'Dodaj dziecko'}
      onClose={onClose}
      footer={<PrimaryButton label={student ? 'Zapisz' : 'Dodaj'} busy={save.isPending} onPress={submit} />}
    >
      <FormLabel first>Imię i nazwisko</FormLabel>
      <FormInput value={name} onChangeText={setName} placeholder="np. Zosia Nowak" autoCapitalize="words" />

      <FormLabel>Rocznik</FormLabel>
      <FormInput value={birthYear} onChangeText={setBirthYear} placeholder="np. 2019" keyboardType="number-pad" maxLength={4} />

      <FormLabel>Grupa</FormLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Chip label="Bez grupy" on={!groupId} onPress={() => setGroupId(null)} />
        {data.groups.map((g) => (
          <Chip key={g.id} label={g.name} on={groupId === g.id} onPress={() => setGroupId(g.id)} />
        ))}
      </View>

      {households ? (
        <>
          <FormLabel>Rodzina</FormLabel>
          {households.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <Chip label="Brak" on={!householdId} onPress={() => setHouseholdId(null)} />
              {households.map((h) => (
                <Chip key={h.id} label={h.name} on={householdId === h.id} onPress={() => setHouseholdId(h.id)} />
              ))}
            </View>
          ) : (
            <Text style={{ fontSize: 14, color: B.ink3, fontFamily: F.medium }}>Nie ma jeszcze rodzin — dodasz je w zakładce Rodziny.</Text>
          )}
        </>
      ) : null}

      <FormLabel>Alergie</FormLabel>
      <FormInput value={allergies} onChangeText={setAllergies} placeholder="np. orzechy, gluten" />
      <Text style={{ marginTop: 6, marginLeft: 2, fontSize: 12, lineHeight: 17, color: B.ink4, fontFamily: F.medium }}>
        Widoczne dla nauczycieli przy meldowaniu dziecka.
      </Text>

      <FormLabel>Kontakt do rodzica</FormLabel>
      <FormInput value={parentInfo} onChangeText={setParentInfo} placeholder="np. mama Anna, 600 100 200" />

      <FormLabel>Notatki</FormLabel>
      <FormInput value={notes} onChangeText={setNotes} placeholder="Co warto wiedzieć" multiline />

      {student && canDelete ? <DangerLink label="Usuń z listy" onPress={remove} busy={del.isPending} /> : null}
    </Sheet>
  );
};
