import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Pencil, Trash2, X } from 'lucide-react-native';
import { B } from '../../../components/ui/brand';
import { useRetagSongs, type SongListItem } from '../library';

// Tagi pieśni w całej bazie (jak „Zarządzaj tagami” na webie): ile pieśni ma tag,
// zmiana nazwy i usunięcie — we wszystkich pieśniach naraz.

const F = { medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold' } as const;

export const TagsSheet = ({
  visible,
  songs,
  canDelete,
  onClose,
}: {
  visible: boolean;
  songs: SongListItem[];
  canDelete: boolean;
  onClose: () => void;
}) => {
  const retag = useRetagSongs();
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');

  const counts = new Map<string, number>();
  for (const s of songs) for (const t of s.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  const tags = Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0], 'pl'));

  const rename = (from: string) => {
    const to = name.trim();
    if (!to || to === from) return setEditing(null);
    retag.mutate(
      { songs, from, to },
      {
        onSuccess: (n) => {
          setEditing(null);
          Alert.alert('Zmieniono tag', `„${from}” → „${to}” w ${n} pieśniach.`);
        },
        onError: (e: any) => Alert.alert('Nie udało się', e?.message ?? 'Spróbuj ponownie.'),
      },
    );
  };
  const remove = (tag: string, n: number) =>
    Alert.alert('Usunąć tag?', `„${tag}” zniknie z ${n} pieśni. Same pieśni zostają.`, [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: () => retag.mutate({ songs, from: tag, to: null }, { onError: (e: any) => Alert.alert('Nie udało się', e?.message ?? 'Spróbuj ponownie.') }),
      },
    ]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: B.paper }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', padding: 16, paddingBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 20, color: B.ink, fontFamily: F.bold }}>Tagi pieśni</Text>
            <Text style={{ marginTop: 2, fontSize: 13, color: B.ink3, fontFamily: F.medium }}>
              Zmiana nazwy i usunięcie działają we wszystkich pieśniach.
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10} className="active:opacity-60">
            <X size={22} color={B.ink2} />
          </Pressable>
        </View>
        {retag.isPending ? <ActivityIndicator color={B.ink} style={{ marginVertical: 8 }} /> : null}
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View style={{ backgroundColor: B.card, borderRadius: 22, overflow: 'hidden' }}>
            {tags.map(([tag, n], i) => (
              <View key={tag} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, minHeight: 56, borderTopWidth: i ? 1 : 0, borderTopColor: B.line }}>
                {editing === tag ? (
                  <>
                    <TextInput
                      value={name}
                      onChangeText={setName}
                      autoFocus
                      onSubmitEditing={() => rename(tag)}
                      returnKeyType="done"
                      style={{ flex: 1, height: 40, borderRadius: 10, paddingHorizontal: 10, backgroundColor: B.paper2, fontSize: 15, color: B.ink, fontFamily: F.medium }}
                    />
                    <Pressable onPress={() => rename(tag)} style={{ paddingHorizontal: 12, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: B.kurkuma }}>
                      <Text style={{ fontSize: 13, color: B.ink, fontFamily: F.bold }}>Zapisz</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: B.ink, fontFamily: F.semibold }}>
                      {tag}
                    </Text>
                    <Text style={{ fontSize: 13, color: B.ink4, fontFamily: F.semibold }}>{n}</Text>
                    <Pressable
                      onPress={() => {
                        setEditing(tag);
                        setName(tag);
                      }}
                      hitSlop={8}
                      accessibilityLabel="Zmień nazwę tagu"
                      style={{ padding: 6 }}
                    >
                      <Pencil size={16} color={B.ink3} />
                    </Pressable>
                    {canDelete ? (
                      <Pressable onPress={() => remove(tag, n)} hitSlop={8} accessibilityLabel="Usuń tag" style={{ padding: 6 }}>
                        <Trash2 size={16} color={B.ink4} />
                      </Pressable>
                    ) : null}
                  </>
                )}
              </View>
            ))}
            {!tags.length ? <Text style={{ padding: 16, fontSize: 14, color: B.ink3, fontFamily: F.medium }}>Brak tagów.</Text> : null}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};
