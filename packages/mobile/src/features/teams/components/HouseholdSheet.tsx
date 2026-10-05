import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { Plus, Search, Trash2, X } from 'lucide-react-native';
import { B, Monogram } from '../../../components/ui/brand';
import { DangerLink, FormInput, FormLabel, PrimaryButton, Sheet } from '../../../components/ui/Sheet';
import {
  RELATIONSHIPS,
  useDeleteHousehold,
  useSaveHousehold,
  useSetStudentHousehold,
  type Household,
  type KidsData,
  type ParentContact,
} from '../kids';
import { fold } from '../tabs/ui';

// Rodzina (households + parent_contacts) jak HouseholdManager na webie: dane, opiekunowie
// (główny kontakt, kto może odebrać dziecko) i dzieci. Telefon głównego kontaktu
// daje 4 ostatnie cyfry do wyszukiwania przy check-inie.

const F = { medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold' } as const;

const blank = (primary: boolean): ParentContact => ({
  id: null,
  memberId: null,
  name: '',
  phone: '',
  email: '',
  relationship: 'Rodzic',
  isPrimary: primary,
  canPickup: true,
});

const Toggle = ({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
    <Text style={{ fontSize: 14, color: B.ink2, fontFamily: F.semibold }}>{label}</Text>
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ true: B.kurkuma, false: '#E3DDD0' }}
      thumbColor="#ffffff"
      ios_backgroundColor="#E3DDD0"
      style={{ transform: [{ scale: 0.85 }] }}
    />
  </View>
);

const smallInput = { height: 42, borderRadius: 12, paddingHorizontal: 12, backgroundColor: B.paper, fontSize: 15, color: B.ink, fontFamily: F.medium } as const;

export const HouseholdSheet = ({
  visible,
  household,
  data,
  canEdit,
  canDelete,
  onClose,
}: {
  visible: boolean;
  household: Household | null; // null = nowa rodzina
  data: KidsData;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
}) => {
  const save = useSaveHousehold();
  const del = useDeleteHousehold();
  const setHousehold = useSetStudentHousehold();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [contacts, setContacts] = useState<ParentContact[]>([]);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!visible) return;
    setName(household?.name ?? '');
    setPhone(household?.phoneFull ?? '');
    setAddress(household?.address ?? '');
    setNotes(household?.notes ?? '');
    setContacts(household?.contacts.length ? household.contacts.map((c) => ({ ...c })) : [blank(true)]);
    setAdding(false);
    setQ('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const kids = useMemo(() => (household ? data.students.filter((s) => s.householdId === household.id) : []), [household, data.students]);
  const candidates = useMemo(() => {
    const s = fold(q.trim());
    return data.students
      .filter((st) => !st.householdId && (!s || fold(st.name).includes(s)))
      .slice(0, 8);
  }, [data.students, q]);

  const patch = (i: number, p: Partial<ParentContact>) =>
    setContacts((list) =>
      list.map((c, j) => {
        if (j === i) return { ...c, ...p };
        // Tylko jeden główny kontakt.
        return p.isPrimary ? { ...c, isPrimary: false } : c;
      }),
    );

  const submit = () => {
    const n = name.trim();
    if (!n) return Alert.alert('Podaj nazwę rodziny', 'np. Kowalscy');
    save.mutate(
      { household, name: n, phoneFull: phone.trim() || null, address: address.trim() || null, notes: notes.trim() || null, contacts },
      { onSuccess: onClose, onError: (e: any) => Alert.alert('Nie udało się zapisać', e?.message ?? 'Spróbuj ponownie.') },
    );
  };

  const remove = () =>
    Alert.alert('Usunąć rodzinę?', 'Dzieci zostaną na liście uczniów, ale bez powiązania z rodziną.', [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Usuń', style: 'destructive', onPress: () => del.mutate(household!.id, { onSuccess: onClose, onError: (e: any) => Alert.alert('Nie udało się usunąć', e?.message ?? '') }) },
    ]);

  return (
    <Sheet
      visible={visible}
      eyebrow={household ? 'Rodzina' : 'Nowa rodzina'}
      title={household ? household.name : 'Dodaj rodzinę'}
      subtitle={household?.lastFour ? `Check-in po numerze …${household.lastFour}` : null}
      onClose={onClose}
      footer={canEdit ? <PrimaryButton label={household ? 'Zapisz' : 'Dodaj rodzinę'} busy={save.isPending} onPress={submit} /> : undefined}
    >
      <FormLabel first>Nazwa rodziny</FormLabel>
      <FormInput value={name} onChangeText={setName} placeholder="np. Kowalscy" editable={canEdit} />

      <FormLabel>Opiekunowie</FormLabel>
      <View style={{ gap: 10 }}>
        {contacts.map((c, i) => (
          <View key={c.id ?? `n${i}`} style={{ backgroundColor: B.card, borderRadius: 20, padding: 14, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput
                value={c.name}
                onChangeText={(t) => patch(i, { name: t })}
                editable={canEdit}
                placeholder="Imię i nazwisko"
                placeholderTextColor={B.ink4}
                autoCapitalize="words"
                style={[smallInput, { flex: 1 }]}
              />
              {canEdit && contacts.length > 1 ? (
                <Pressable onPress={() => setContacts((l) => l.filter((_, j) => j !== i))} hitSlop={8} accessibilityLabel="Usuń opiekuna" style={{ padding: 6 }}>
                  <Trash2 size={16} color={B.ink4} />
                </Pressable>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput value={c.phone} onChangeText={(t) => patch(i, { phone: t })} editable={canEdit} placeholder="Telefon" placeholderTextColor={B.ink4} keyboardType="phone-pad" style={[smallInput, { flex: 1 }]} />
              <TextInput
                value={c.email}
                onChangeText={(t) => patch(i, { email: t })}
                editable={canEdit}
                placeholder="E-mail"
                placeholderTextColor={B.ink4}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                style={[smallInput, { flex: 1.3 }]}
              />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {RELATIONSHIPS.map((r) => (
                <Pressable
                  key={r}
                  disabled={!canEdit}
                  onPress={() => patch(i, { relationship: r })}
                  style={{ paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, backgroundColor: c.relationship === r ? B.ink : B.paper }}
                >
                  <Text style={{ fontSize: 12, color: c.relationship === r ? '#FFFFFF' : B.ink, fontFamily: F.semibold }}>{r}</Text>
                </Pressable>
              ))}
            </View>
            {canEdit ? (
              <View>
                <Toggle label="Główny kontakt" value={c.isPrimary} onChange={(v) => patch(i, { isPrimary: v })} />
                <Toggle label="Może odebrać dziecko" value={c.canPickup} onChange={(v) => patch(i, { canPickup: v })} />
              </View>
            ) : (
              <Text style={{ fontSize: 12, color: B.ink3, fontFamily: F.medium }}>
                {[c.isPrimary ? 'główny kontakt' : null, c.canPickup ? 'może odebrać' : 'nie odbiera'].filter(Boolean).join(' · ')}
              </Text>
            )}
          </View>
        ))}
      </View>
      {canEdit ? (
        <Pressable onPress={() => setContacts((l) => [...l, blank(false)])} className="active:opacity-70" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 10, marginLeft: 2, paddingVertical: 6 }}>
          <Plus size={16} color={B.gold} strokeWidth={2.6} />
          <Text style={{ fontSize: 14, color: B.gold, fontFamily: F.bold }}>Dodaj opiekuna</Text>
        </Pressable>
      ) : null}

      {household ? (
        <>
          <FormLabel>Dzieci</FormLabel>
          <View style={{ backgroundColor: B.card, borderRadius: 20, overflow: 'hidden' }}>
            {kids.map((k, i) => (
              <View key={k.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: B.line }}>
                <Monogram name={k.name} size={34} />
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: B.ink, fontFamily: F.semibold }}>
                  {k.name}
                  {k.birthYear ? <Text style={{ color: B.ink4, fontFamily: F.medium }}>{`  ${k.birthYear}`}</Text> : null}
                </Text>
                {canEdit ? (
                  <Pressable onPress={() => setHousehold.mutate({ studentId: k.id, householdId: null })} hitSlop={10} accessibilityLabel={`Odłącz: ${k.name}`} style={{ padding: 4 }}>
                    <X size={16} color={B.ink4} />
                  </Pressable>
                ) : null}
              </View>
            ))}
            {!kids.length ? <Text style={{ padding: 14, fontSize: 14, color: B.ink3, fontFamily: F.medium }}>Brak przypisanych dzieci.</Text> : null}
          </View>
          {canEdit ? (
            adding ? (
              <View style={{ marginTop: 10, backgroundColor: B.card, borderRadius: 20, padding: 12, gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 12, borderRadius: 20, backgroundColor: B.paper }}>
                  <Search size={15} color={B.ink4} />
                  <TextInput value={q} onChangeText={setQ} autoFocus placeholder="Szukaj dziecka bez rodziny" placeholderTextColor={B.ink4} style={{ flex: 1, fontSize: 15, color: B.ink, fontFamily: F.medium }} />
                  <Pressable onPress={() => setAdding(false)} hitSlop={8}>
                    <X size={16} color={B.ink3} />
                  </Pressable>
                </View>
                {candidates.map((st) => (
                  <Pressable
                    key={st.id}
                    onPress={() => setHousehold.mutate({ studentId: st.id, householdId: household.id }, { onError: (e: any) => Alert.alert('Nie udało się dodać', e?.message ?? '') })}
                    className="active:opacity-70"
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}
                  >
                    <Plus size={16} color={B.gold} strokeWidth={2.6} />
                    <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: B.ink, fontFamily: F.semibold }}>{st.name}</Text>
                  </Pressable>
                ))}
                {!candidates.length ? (
                  <Text style={{ paddingVertical: 6, fontSize: 13, color: B.ink3, fontFamily: F.medium }}>
                    Wszystkie dzieci mają już rodzinę. Nowe dziecko dodasz w zakładce Uczniowie.
                  </Text>
                ) : null}
              </View>
            ) : (
              <Pressable onPress={() => setAdding(true)} className="active:opacity-70" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 10, marginLeft: 2, paddingVertical: 6 }}>
                <Plus size={16} color={B.gold} strokeWidth={2.6} />
                <Text style={{ fontSize: 14, color: B.gold, fontFamily: F.bold }}>Przypisz dziecko</Text>
              </Pressable>
            )
          ) : null}
        </>
      ) : null}

      <FormLabel>Telefon domowy</FormLabel>
      <FormInput value={phone} onChangeText={setPhone} placeholder="Opcjonalnie" keyboardType="phone-pad" editable={canEdit} />

      <FormLabel>Adres</FormLabel>
      <FormInput value={address} onChangeText={setAddress} placeholder="Opcjonalnie" editable={canEdit} />

      <FormLabel>Notatki</FormLabel>
      <FormInput value={notes} onChangeText={setNotes} placeholder="Np. kto zwykle odbiera" multiline editable={canEdit} />

      {household && canDelete ? <DangerLink label="Usuń rodzinę" onPress={remove} busy={del.isPending} /> : null}
    </Sheet>
  );
};
