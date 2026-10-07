import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Pencil, Plus, Trash2, X } from 'lucide-react-native';
import { B } from '../../../components/ui/brand';
import { friendlyError } from '../../../lib/errors';
import { toast } from '../../../lib/toast';
import { buildSongTagList, useRetagSongs, useSongTagDictionary, useSongTagOp, type SongListItem } from '../library';

// Tagi pieśni (jak „Zarządzaj tagami” na webie): wspólny słownik w bazie + tagi z pieśni,
// ile pieśni ma tag, dodanie, zmiana nazwy i usunięcie — we wszystkich pieśniach naraz.

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
  const dict = useSongTagDictionary();
  const retag = useRetagSongs();
  const tagOp = useSongTagOp();
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [newTag, setNewTag] = useState('');
  const busy = retag.isPending || tagOp.isPending;

  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of songs) for (const t of s.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return buildSongTagList(dict.data ?? [], songs).map((t) => [t, counts.get(t) ?? 0] as const);
  }, [songs, dict.data]);

  const rename = (from: string) => {
    const to = name.replace(/\s+/g, ' ').trim();
    if (!to || to === from) return setEditing(null);
    if (busy) return;
    retag.mutate(
      { songs, from, to },
      {
        onSuccess: (n) => {
          setEditing(null);
          toast.success('Zmieniono nazwę tagu', n ? `„${from}” → „${to}” w ${n} ${n === 1 ? 'pieśni' : 'pieśniach'}` : `„${from}” → „${to}”`);
        },
        onError: (e: unknown) => Alert.alert('Nie udało się zmienić nazwy tagu', friendlyError(e, 'Spróbuj ponownie.')),
      },
    );
  };

  const remove = (tag: string, n: number) =>
    Alert.alert(
      `Usunąć tag „${tag}”?`,
      n ? `Tag zniknie ze wszystkich pieśni, które go mają (${n}). Same pieśni zostają.` : 'Tag nie jest użyty w żadnej pieśni — zniknie tylko z listy tagów.',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Usuń tag',
          style: 'destructive',
          onPress: () =>
            retag.mutate(
              { songs, from: tag, to: null },
              {
                onSuccess: () => toast.success('Usunięto tag', tag),
                onError: (e: unknown) => Alert.alert('Nie udało się usunąć tagu', friendlyError(e, 'Spróbuj ponownie.')),
              },
            ),
        },
      ],
    );

  const add = () => {
    const t = newTag.replace(/\s+/g, ' ').trim();
    if (!t || busy) return;
    if (tags.some(([x]) => x.toLowerCase() === t.toLowerCase())) {
      Alert.alert('Taki tag już jest', `Tag „${t}” już istnieje.`);
      return;
    }
    tagOp.mutate(
      { action: 'add', tag: t },
      {
        onSuccess: () => {
          setNewTag('');
          toast.success('Dodano tag', t);
        },
        onError: (e: unknown) => Alert.alert('Nie udało się dodać tagu', friendlyError(e, 'Spróbuj ponownie.')),
      },
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: B.paper }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', padding: 16, paddingBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 20, color: B.ink, fontFamily: F.bold }}>Tagi pieśni</Text>
            <Text style={{ marginTop: 2, fontSize: 13, color: B.ink3, fontFamily: F.medium }}>
              Wspólna lista dla wszystkich liderów. Zmiana nazwy i usunięcie działają we wszystkich pieśniach.
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Zamknij" className="active:opacity-60">
            <X size={22} color={B.ink2} />
          </Pressable>
        </View>
        {busy ? <ActivityIndicator color={B.ink} style={{ marginVertical: 8 }} /> : null}
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            <TextInput
              value={newTag}
              onChangeText={setNewTag}
              onSubmitEditing={add}
              placeholder="Nowy tag, np. Uwielbienie"
              placeholderTextColor={B.ink4}
              returnKeyType="done"
              accessibilityLabel="Nowy tag"
              style={{ flex: 1, height: 46, borderRadius: 14, paddingHorizontal: 14, backgroundColor: B.card, fontSize: 15, color: B.ink, fontFamily: F.medium }}
            />
            <Pressable
              onPress={add}
              disabled={busy || !newTag.trim()}
              accessibilityLabel="Dodaj tag"
              className="active:opacity-70"
              style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: newTag.trim() ? B.kurkuma : B.paper2 }}
            >
              <Plus size={18} color={B.ink} />
            </Pressable>
          </View>
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
                      accessibilityLabel={`Nowa nazwa tagu ${tag}`}
                      style={{ flex: 1, height: 40, borderRadius: 10, paddingHorizontal: 10, backgroundColor: B.paper2, fontSize: 15, color: B.ink, fontFamily: F.medium }}
                    />
                    <Pressable
                      onPress={() => rename(tag)}
                      disabled={busy}
                      style={{ paddingHorizontal: 12, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: B.kurkuma, opacity: busy ? 0.6 : 1 }}
                    >
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
                      accessibilityLabel={`Zmień nazwę tagu ${tag}`}
                      style={{ padding: 6 }}
                    >
                      <Pencil size={16} color={B.ink3} />
                    </Pressable>
                    {canDelete ? (
                      <Pressable onPress={() => remove(tag, n)} disabled={busy} hitSlop={8} accessibilityLabel={`Usuń tag ${tag}`} style={{ padding: 6 }}>
                        <Trash2 size={16} color={B.ink4} />
                      </Pressable>
                    ) : null}
                  </>
                )}
              </View>
            ))}
            {!tags.length ? (
              <Text style={{ padding: 16, fontSize: 14, color: B.ink3, fontFamily: F.medium }}>
                {dict.isLoading ? 'Wczytywanie…' : 'Nie ma jeszcze tagów. Dodaj pierwszy powyżej.'}
              </Text>
            ) : null}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};
