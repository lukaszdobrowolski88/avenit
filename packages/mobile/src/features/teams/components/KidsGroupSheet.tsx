import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { FileText, Paperclip, Plus, Search, Trash2, X } from 'lucide-react-native';
import { B, Monogram } from '../../../components/ui/brand';
import { Chip, DangerLink, FormInput, FormLabel, PrimaryButton, Sheet } from '../../../components/ui/Sheet';
import {
  MATERIAL_TYPES,
  ageFrom,
  pickKidsMaterialFile,
  useAddMaterial,
  useDeleteGroup,
  useDeleteMaterial,
  useSaveGroup,
  useSetStudentGroup,
  type KidsData,
  type KidsGroup,
} from '../kids';
import { fold } from '../tabs/ui';

// Grupa dzieci: dane (nazwa, wiek, sala, nauczyciele), dzieci w grupie i materiały
// (lekcje, kolorowanki… z plikiem). Dzieci i materiały zapisują się od razu.

const F = { medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold' } as const;

const Section = ({ children, count }: { children: string; count?: number }) => (
  <Text style={{ marginTop: 22, marginBottom: 8, marginLeft: 2, fontSize: 11, color: B.gold, letterSpacing: 1.3, textTransform: 'uppercase', fontFamily: F.bold }}>
    {children}
    {count != null ? <Text style={{ color: B.ink4 }}>{` · ${count}`}</Text> : null}
  </Text>
);

export const KidsGroupSheet = ({
  visible,
  groupId,
  data,
  campusIdForInsert,
  canEdit,
  canDelete,
  onClose,
}: {
  visible: boolean;
  groupId: string | null; // null = nowa grupa
  data: KidsData;
  campusIdForInsert: number | null;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
}) => {
  const group: KidsGroup | null = groupId ? data.groups.find((g) => g.id === groupId) ?? null : null;
  const save = useSaveGroup(campusIdForInsert);
  const del = useDeleteGroup();
  const setGroup = useSetStudentGroup();
  const addMat = useAddMaterial();
  const delMat = useDeleteMaterial();

  const [name, setName] = useState('');
  const [ageRange, setAgeRange] = useState('');
  const [room, setRoom] = useState('');
  const [teacherIds, setTeacherIds] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [matOpen, setMatOpen] = useState(false);
  const [matTitle, setMatTitle] = useState('');
  const [matType, setMatType] = useState('Lekcja');
  const [matFile, setMatFile] = useState<{ uri: string; name: string; type: string } | null>(null);

  useEffect(() => {
    if (!visible) return;
    setName(group?.name ?? '');
    setAgeRange(group?.ageRange ?? '');
    setRoom(group?.room ?? '');
    setTeacherIds(group?.teacherIds ?? []);
    setAdding(false);
    setQ('');
    setMatOpen(false);
    setMatTitle('');
    setMatType('Lekcja');
    setMatFile(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const kids = useMemo(() => (group ? data.students.filter((s) => s.groupId === group.id) : []), [group, data.students]);
  const candidates = useMemo(() => {
    if (!group) return [];
    const s = fold(q.trim());
    return data.students
      .filter((st) => st.groupId !== group.id && (!s || fold(st.name).includes(s)))
      // Najpierw dzieci bez grupy.
      .sort((a, b) => Number(!!a.groupId) - Number(!!b.groupId) || a.name.localeCompare(b.name, 'pl'))
      .slice(0, 8);
  }, [group, data.students, q]);
  const groupName = (id: string | null) => data.groups.find((g) => g.id === id)?.name ?? null;

  const submit = () => {
    const n = name.trim();
    if (!n) return Alert.alert('Podaj nazwę grupy');
    save.mutate(
      { id: group?.id ?? null, name: n, room: room.trim() || null, ageRange: ageRange.trim() || null, teacherIds },
      { onSuccess: onClose, onError: (e: any) => Alert.alert('Nie udało się zapisać', e?.message ?? 'Spróbuj ponownie.') },
    );
  };

  const remove = () =>
    Alert.alert('Usunąć grupę?', `„${group?.name}” zniknie. Dzieci zostaną na liście uczniów, bez grupy.`, [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Usuń', style: 'destructive', onPress: () => del.mutate(group!.id, { onSuccess: onClose, onError: (e: any) => Alert.alert('Nie udało się usunąć', e?.message ?? '') }) },
    ]);

  const attach = (studentId: string, other: string | null) => {
    const run = () => setGroup.mutate({ studentId, groupId: group!.id }, { onError: (e: any) => Alert.alert('Nie udało się dodać', e?.message ?? '') });
    if (other) Alert.alert('Przenieść dziecko?', `Jest teraz w grupie „${other}”.`, [{ text: 'Anuluj', style: 'cancel' }, { text: 'Przenieś', onPress: run }]);
    else run();
  };

  const addMaterial = () => {
    const t = matTitle.trim();
    if (!t) return Alert.alert('Podaj nazwę materiału');
    addMat.mutate(
      { group: group!, title: t, type: matType, file: matFile },
      {
        onSuccess: () => {
          setMatOpen(false);
          setMatTitle('');
          setMatFile(null);
        },
        onError: (e: any) => Alert.alert('Nie udało się dodać', e?.message ?? 'Spróbuj ponownie.'),
      },
    );
  };

  const teachers = data.teachers;

  return (
    <Sheet
      visible={visible}
      eyebrow={group ? 'Grupa dzieci' : 'Nowa grupa'}
      title={group ? group.name : 'Dodaj grupę'}
      subtitle={group ? [group.ageRange, group.room ? `sala ${group.room}` : null].filter(Boolean).join(' · ') || null : null}
      onClose={onClose}
      footer={canEdit ? <PrimaryButton label={group ? 'Zapisz dane grupy' : 'Dodaj grupę'} busy={save.isPending} onPress={submit} /> : undefined}
    >
      {canEdit ? (
        <>
          <FormLabel first>Nazwa</FormLabel>
          <FormInput value={name} onChangeText={setName} placeholder="np. Maluchy" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <FormLabel>Wiek</FormLabel>
              <FormInput value={ageRange} onChangeText={setAgeRange} placeholder="np. 3–5 lat" />
            </View>
            <View style={{ flex: 1 }}>
              <FormLabel>Sala</FormLabel>
              <FormInput value={room} onChangeText={setRoom} placeholder="np. 2" />
            </View>
          </View>
          <FormLabel>Nauczyciele</FormLabel>
          {teachers.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {teachers.map((t) => (
                <Chip
                  key={t.id}
                  label={t.name}
                  on={teacherIds.includes(t.id)}
                  onPress={() => setTeacherIds((ids) => (ids.includes(t.id) ? ids.filter((x) => x !== t.id) : [...ids, t.id]))}
                />
              ))}
            </View>
          ) : (
            <Text style={{ fontSize: 14, color: B.ink3, fontFamily: F.medium }}>Najpierw dodaj nauczycieli w zakładce Nauczyciele.</Text>
          )}
        </>
      ) : group ? (
        <Text style={{ marginTop: 6, fontSize: 14, color: B.ink2, fontFamily: F.medium }}>
          Nauczyciele: {group.teacherIds.map((id) => teachers.find((t) => t.id === id)?.name).filter(Boolean).join(', ') || '—'}
        </Text>
      ) : null}

      {group ? (
        <>
          <Section count={kids.length}>Dzieci w grupie</Section>
          <View style={{ backgroundColor: B.card, borderRadius: 20, overflow: 'hidden' }}>
            {kids.map((k, i) => {
              const age = ageFrom(k.birthYear);
              return (
                <View key={k.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: B.line }}>
                  <Monogram name={k.name} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ fontSize: 15, color: B.ink, fontFamily: F.semibold }}>{k.name}</Text>
                    {age != null || k.allergies ? (
                      <Text numberOfLines={1} style={{ fontSize: 12, color: k.allergies ? '#B42318' : B.ink3, fontFamily: F.medium }}>
                        {[age != null ? `${age} l.` : null, k.allergies ? `alergie: ${k.allergies}` : null].filter(Boolean).join(' · ')}
                      </Text>
                    ) : null}
                  </View>
                  {canEdit ? (
                    <Pressable
                      onPress={() => setGroup.mutate({ studentId: k.id, groupId: null })}
                      hitSlop={10}
                      accessibilityLabel={`Wypisz z grupy: ${k.name}`}
                      style={{ padding: 4 }}
                    >
                      <X size={16} color={B.ink4} />
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
            {!kids.length ? <Text style={{ padding: 14, fontSize: 14, color: B.ink3, fontFamily: F.medium }}>W tej grupie nie ma jeszcze dzieci.</Text> : null}
          </View>

          {canEdit ? (
            adding ? (
              <View style={{ marginTop: 10, backgroundColor: B.card, borderRadius: 20, padding: 12, gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 12, borderRadius: 20, backgroundColor: B.paper }}>
                  <Search size={15} color={B.ink4} />
                  <TextInput value={q} onChangeText={setQ} autoFocus placeholder="Szukaj dziecka" placeholderTextColor={B.ink4} style={{ flex: 1, fontSize: 15, color: B.ink, fontFamily: F.medium }} />
                  <Pressable onPress={() => setAdding(false)} hitSlop={8}>
                    <X size={16} color={B.ink3} />
                  </Pressable>
                </View>
                {candidates.map((st) => {
                  const other = groupName(st.groupId);
                  return (
                    <Pressable key={st.id} onPress={() => attach(st.id, other)} className="active:opacity-70" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
                      <Plus size={16} color={B.gold} strokeWidth={2.6} />
                      <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: B.ink, fontFamily: F.semibold }}>{st.name}</Text>
                      {other ? <Text style={{ fontSize: 12, color: B.ink4, fontFamily: F.medium }}>{other}</Text> : null}
                    </Pressable>
                  );
                })}
                {!candidates.length ? (
                  <Text style={{ paddingVertical: 6, fontSize: 13, color: B.ink3, fontFamily: F.medium }}>
                    {q ? 'Nie ma takiego dziecka na liście uczniów.' : 'Wszystkie dzieci są już w tej grupie.'}
                  </Text>
                ) : null}
              </View>
            ) : (
              <Pressable onPress={() => setAdding(true)} className="active:opacity-70" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 10, marginLeft: 2, paddingVertical: 6 }}>
                <Plus size={16} color={B.gold} strokeWidth={2.6} />
                <Text style={{ fontSize: 14, color: B.gold, fontFamily: F.bold }}>Dodaj dziecko do grupy</Text>
              </Pressable>
            )
          ) : null}

          <Section count={group.materials.length}>Materiały</Section>
          {group.materials.length ? (
            <View style={{ backgroundColor: B.card, borderRadius: 20, overflow: 'hidden' }}>
              {group.materials.map((m, i) => (
                <Pressable
                  key={m.id}
                  disabled={!m.url}
                  onPress={() => m.url && Linking.openURL(m.url).catch(() => Alert.alert('Nie udało się otworzyć pliku'))}
                  className="active:opacity-70"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderTopColor: B.line }}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: B.kurkumaSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <FileText size={16} color={B.gold} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ fontSize: 15, color: B.ink, fontFamily: F.semibold }}>{m.title}</Text>
                    <Text numberOfLines={1} style={{ fontSize: 12, color: B.ink3, fontFamily: F.medium }}>
                      {[m.type, m.fileName].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  {canEdit ? (
                    <Pressable
                      onPress={() =>
                        Alert.alert('Usunąć materiał?', m.title, [
                          { text: 'Anuluj', style: 'cancel' },
                          { text: 'Usuń', style: 'destructive', onPress: () => delMat.mutate({ group, materialId: m.id }) },
                        ])
                      }
                      hitSlop={10}
                      style={{ padding: 4 }}
                    >
                      <Trash2 size={16} color={B.ink4} />
                    </Pressable>
                  ) : null}
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={{ marginLeft: 2, fontSize: 14, color: B.ink3, fontFamily: F.medium }}>Brak materiałów.</Text>
          )}

          {canEdit ? (
            matOpen ? (
              <View style={{ marginTop: 10, backgroundColor: B.card, borderRadius: 20, padding: 14, gap: 10 }}>
                <FormInput value={matTitle} onChangeText={setMatTitle} placeholder="np. Lekcja o Dawidzie" style={{ backgroundColor: B.paper }} />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {MATERIAL_TYPES.map((t) => (
                    <Pressable key={t} onPress={() => setMatType(t)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: matType === t ? B.ink : B.paper }}>
                      <Text style={{ fontSize: 13, color: matType === t ? '#FFFFFF' : B.ink, fontFamily: F.semibold }}>{t}</Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable
                  onPress={async () => {
                    try {
                      const f = await pickKidsMaterialFile();
                      if (f) setMatFile(f);
                    } catch (e: any) {
                      Alert.alert('Nie udało się wybrać pliku', e?.message ?? '');
                    }
                  }}
                  className="active:opacity-70"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, paddingHorizontal: 14, borderRadius: 999, backgroundColor: B.paper, alignSelf: 'flex-start' }}
                >
                  <Paperclip size={15} color={B.ink} />
                  <Text numberOfLines={1} style={{ maxWidth: 220, fontSize: 14, color: B.ink, fontFamily: F.semibold }}>{matFile ? matFile.name : 'Dołącz plik (opcjonalnie)'}</Text>
                </Pressable>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onPress={() => setMatOpen(false)} style={{ flex: 1, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: B.paper }}>
                    <Text style={{ fontSize: 14, color: B.ink, fontFamily: F.bold }}>Anuluj</Text>
                  </Pressable>
                  <Pressable onPress={addMaterial} disabled={addMat.isPending} style={{ flex: 2, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: B.kurkuma }}>
                    {addMat.isPending ? <ActivityIndicator color={B.ink} /> : <Text style={{ fontSize: 14, color: B.ink, fontFamily: F.bold }}>Dodaj materiał</Text>}
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable onPress={() => setMatOpen(true)} className="active:opacity-70" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 10, marginLeft: 2, paddingVertical: 6 }}>
                <Plus size={16} color={B.gold} strokeWidth={2.6} />
                <Text style={{ fontSize: 14, color: B.gold, fontFamily: F.bold }}>Dodaj materiał</Text>
              </Pressable>
            )
          ) : null}

          {canDelete ? <DangerLink label="Usuń grupę" onPress={remove} busy={del.isPending} /> : null}
        </>
      ) : null}
    </Sheet>
  );
};
