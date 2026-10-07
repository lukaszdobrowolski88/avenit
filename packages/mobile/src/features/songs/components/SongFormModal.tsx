import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Plus, X } from 'lucide-react-native';
import { B } from '../../../components/ui/brand';
import { KEYS } from '../../../lib/domain';
import { friendlyError } from '../../../lib/errors';
import { toast } from '../../../lib/toast';
import { useDeleteSong, useSaveSong, useSongTagOp, type SongInput, type SongRecord } from '../library';

// Nowa pieśń / edycja (jak SongForm na webie: dane podstawowe, tagi, tekst).
// Rozpiskę akordów w taktach edytuje się na webie (edytor taktów) — tu jej nie ruszamy.
// Tonacja może zostać „Nie ustalono” (pusta, nie „C”); tagi pochodzą ze wspólnego słownika
// w bazie (app_settings.song_tags) — nowy tag trafia do słownika dla wszystkich liderów.

const F = { medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold' } as const;
const METERS = ['4/4', '3/4', '6/8', '2/4', '12/8'];

const Label = ({ children }: { children: string }) => (
  <Text style={{ fontSize: 12, color: B.gold, fontFamily: F.bold, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 18, marginBottom: 8 }}>
    {children}
  </Text>
);
const Chip = ({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) => (
  <Pressable onPress={onPress} className="active:opacity-70" style={{ paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, backgroundColor: on ? B.ink : B.paper2 }}>
    <Text style={{ fontSize: 13, color: on ? '#fff' : B.ink, fontFamily: F.semibold }}>{label}</Text>
  </Pressable>
);
const input = {
  minHeight: 46,
  borderRadius: 14,
  paddingHorizontal: 14,
  paddingVertical: 12,
  backgroundColor: B.paper2,
  fontSize: 15,
  color: B.ink,
  fontFamily: F.medium,
} as const;

export const SongFormModal = ({
  visible,
  song,
  allTags,
  canDelete,
  onClose,
  onSaved,
  onDeleted,
}: {
  visible: boolean;
  song: SongRecord | null; // null = nowa pieśń
  allTags: string[];
  canDelete?: boolean;
  onClose: () => void;
  onSaved?: (id: number) => void;
  onDeleted?: () => void;
}) => {
  const save = useSaveSong(song?.id ?? null);
  const del = useDeleteSong();
  const tagOp = useSongTagOp();
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [key, setKey] = useState<string>('');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [tempo, setTempo] = useState('');
  const [meter, setMeter] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [lyrics, setLyrics] = useState('');

  useEffect(() => {
    if (!visible) return;
    setTitle(song?.title ?? '');
    setAuthor(song?.author ?? '');
    setKey(song?.key ?? '');
    setTitleError(null);
    setTempo(song?.tempo ?? '');
    setMeter(song?.meter ?? '');
    setTags(song?.tags ?? []);
    setNewTag('');
    setLyrics(song?.lyrics ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const tagOptions = useMemo(() => Array.from(new Set([...allTags, ...tags])).sort((a, b) => a.localeCompare(b, 'pl')), [allTags, tags]);

  const submit = () => {
    if (save.isPending) return;
    if (!title.trim()) {
      setTitleError('Podaj tytuł pieśni.');
      return;
    }
    const t = tempo.trim().replace(',', '.');
    if (t && !(Number(t) > 0 && Number(t) <= 300)) return Alert.alert('Tempo', 'Podaj tempo w BPM (1–300).');
    const payload: SongInput = {
      title: title.trim(),
      author: author.trim() || null,
      key: key || null,
      tempo: t || null,
      meter: meter.trim() || null,
      tags,
      lyrics: lyrics.replace(/\s+$/, '') || null,
    };
    save.mutate(payload, {
      onSuccess: (id) => {
        onClose();
        toast.success(song ? 'Zapisano pieśń' : 'Dodano pieśń', payload.title);
        onSaved?.(id);
      },
      onError: (e: unknown) => Alert.alert('Nie udało się zapisać pieśni', friendlyError(e, 'Zmiany są nadal w oknie — spróbuj ponownie.')),
    });
  };

  const remove = () =>
    Alert.alert('Usunąć pieśń?', `„${song?.title}” zniknie z bazy pieśni. Programy, w których była, zachowają swój plan.`, [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: () =>
          del.mutate(song!.id, {
            onSuccess: () => {
              onClose();
              onDeleted?.();
            },
            onError: (e: unknown) => Alert.alert('Nie udało się usunąć pieśni', friendlyError(e, 'Spróbuj ponownie.')),
          }),
      },
    ]);

  // Nowy tag: istniejący (bez względu na wielkość liter) tylko zaznaczamy; nowy zapisujemy
  // w słowniku w bazie, żeby widzieli go wszyscy (web: „Dodaj tag”).
  const addTag = () => {
    const t = newTag.replace(/\s+/g, ' ').trim();
    if (!t || tagOp.isPending) return;
    const existing = tagOptions.find((x) => x.toLowerCase() === t.toLowerCase());
    if (existing) {
      if (!tags.includes(existing)) setTags([...tags, existing]);
      setNewTag('');
      return;
    }
    tagOp.mutate(
      { action: 'add', tag: t },
      {
        onSuccess: () => {
          setTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
          setNewTag('');
        },
        onError: (e: unknown) => Alert.alert('Nie udało się dodać tagu', friendlyError(e, 'Spróbuj ponownie.')),
      },
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: B.paper }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 4 }}>
          <Text style={{ flex: 1, fontSize: 20, color: B.ink, fontFamily: F.bold }}>{song ? 'Edytuj pieśń' : 'Nowa pieśń'}</Text>
          <Pressable onPress={onClose} hitSlop={10} className="active:opacity-60">
            <X size={22} color={B.ink2} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Label>Tytuł</Label>
          <TextInput
            value={title}
            onChangeText={(v) => {
              setTitle(v);
              if (titleError && v.trim()) setTitleError(null);
            }}
            placeholder="np. Wielki jest nasz Bóg"
            placeholderTextColor={B.ink4}
            accessibilityLabel="Tytuł pieśni"
            style={[input, titleError ? { borderWidth: 1, borderColor: '#B42318' } : null]}
          />
          {titleError ? (
            <Text accessibilityRole="alert" style={{ marginTop: 6, marginLeft: 2, fontSize: 13, color: '#B42318', fontFamily: F.semibold }}>
              {titleError}
            </Text>
          ) : null}

          <Label>Autor</Label>
          <TextInput value={author} onChangeText={setAuthor} placeholder="np. Chris Tomlin" placeholderTextColor={B.ink4} style={input} />

          <Label>Tonacja</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Chip label="Nie ustalono" on={!key} onPress={() => setKey('')} />
            {KEYS.map((k) => (
              <Chip key={k} label={k} on={key === k} onPress={() => setKey(k)} />
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Label>Tempo (BPM)</Label>
              <TextInput value={tempo} onChangeText={setTempo} keyboardType="decimal-pad" placeholder="np. 72" placeholderTextColor={B.ink4} style={input} />
            </View>
            <View style={{ flex: 1 }}>
              <Label>Metrum</Label>
              <TextInput value={meter} onChangeText={setMeter} placeholder="np. 4/4" placeholderTextColor={B.ink4} style={input} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {METERS.map((m) => (
              <Chip key={m} label={m} on={meter === m} onPress={() => setMeter(m)} />
            ))}
          </View>

          <Label>Tagi</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {tagOptions.map((t) => (
              <Chip key={t} label={t} on={tags.includes(t)} onPress={() => setTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t])} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TextInput
              value={newTag}
              onChangeText={setNewTag}
              onSubmitEditing={addTag}
              placeholder="Nowy tag"
              placeholderTextColor={B.ink4}
              returnKeyType="done"
              style={[input, { flex: 1 }]}
            />
            <Pressable
              onPress={addTag}
              disabled={tagOp.isPending}
              accessibilityLabel="Dodaj tag"
              style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: B.card, opacity: tagOp.isPending ? 0.5 : 1 }}
            >
              {tagOp.isPending ? <ActivityIndicator size="small" color={B.ink} /> : <Plus size={18} color={B.ink} />}
            </Pressable>
          </View>

          <Label>Tekst</Label>
          <TextInput
            value={lyrics}
            onChangeText={setLyrics}
            placeholder={'Zwrotka…\n\nRefren…\n\n(pusta linia = nowy slajd)'}
            placeholderTextColor={B.ink4}
            multiline
            style={[input, { minHeight: 220, textAlignVertical: 'top' as const, lineHeight: 21 }]}
          />
          <Text style={{ marginTop: 8, marginHorizontal: 4, fontSize: 12, lineHeight: 17, color: B.ink4, fontFamily: F.medium }}>
            Pusta linia oddziela slajdy w prezentacji. Rozpiskę akordów w taktach edytujesz na webie.
          </Text>

          <Pressable
            onPress={submit}
            disabled={save.isPending}
            className="active:opacity-80"
            style={{ marginTop: 22, height: 52, borderRadius: 999, backgroundColor: B.kurkuma, alignItems: 'center', justifyContent: 'center', opacity: save.isPending ? 0.6 : 1 }}
          >
            {save.isPending ? <ActivityIndicator color={B.ink} /> : <Text style={{ fontSize: 15, color: B.ink, fontFamily: F.bold }}>{song ? 'Zapisz' : 'Dodaj pieśń'}</Text>}
          </Pressable>
          {song && canDelete ? (
            <Pressable onPress={remove} disabled={del.isPending} className="active:opacity-70" style={{ marginTop: 10, height: 48, alignItems: 'center', justifyContent: 'center' }}>
              {del.isPending ? <ActivityIndicator color="#B42318" /> : <Text style={{ fontSize: 15, color: '#B42318', fontFamily: F.semibold }}>Usuń pieśń</Text>}
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};
