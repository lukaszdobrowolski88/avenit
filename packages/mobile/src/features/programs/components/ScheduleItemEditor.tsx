import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ArrowDown, ArrowUp, Copy, FileText, Minus, Music, Paperclip, Plus, Search, Trash2, X } from 'lucide-react-native';
import { B } from '../../../components/ui/brand';
import { useProgramSongs, useSongsList, type ProgramSuggestionRow } from '../../songs/api';
import type { Song } from '../../../lib/domain';
import { KIND_META, MEDIA_TYPES, MUSICAL_KEYS, TIMING, fmtDuration, type PlanItem, type ScheduleKind } from '../schedule';
import { useWorshipTeamNames } from '../api';
import { AttachmentTooLarge, pickAndUploadPdf, type PlanAttachment } from '../attachments';

// Arkusz edycji jednego elementu planu (jak panel elementu w edytorze programu na webie):
// rodzaj, pieśń z biblioteki (najpierw propozycje zespołu) + tonacja, tytuł, osoba,
// czas trwania, moment (przed/w trakcie/po), szczegóły i notatki.

const F = { medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold' } as const;

const Label = ({ children }: { children: string }) => (
  <Text
    style={{
      fontSize: 12,
      color: B.gold,
      fontFamily: F.bold,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      marginTop: 18,
      marginBottom: 8,
    }}
  >
    {children}
  </Text>
);

const inputStyle = {
  minHeight: 46,
  borderRadius: 14,
  paddingHorizontal: 14,
  paddingVertical: 12,
  backgroundColor: B.paper2,
  fontSize: 15,
  color: B.ink,
  fontFamily: F.medium,
} as const;

const Chip = ({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) => (
  <Pressable
    onPress={onPress}
    className="active:opacity-70"
    style={{ paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, backgroundColor: on ? B.ink : B.paper2 }}
  >
    <Text style={{ fontSize: 13, color: on ? '#fff' : B.ink, fontFamily: F.semibold }}>{label}</Text>
  </Pressable>
);

const DURATIONS = [1, 2, 3, 5, 10, 15, 20, 30, 45, 60];

interface Props {
  visible: boolean;
  item: PlanItem | null;
  isNew: boolean;
  programId: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onClose: () => void;
  onSave: (item: PlanItem) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
}

export const ScheduleItemEditor = ({
  visible,
  item,
  isNew,
  programId,
  canMoveUp,
  canMoveDown,
  onClose,
  onSave,
  onDelete,
  onMove,
  onDuplicate,
}: Props) => {
  const [draft, setDraft] = useState<PlanItem | null>(item);
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState('');
  const [personFocus, setPersonFocus] = useState(false);
  const [uploading, setUploading] = useState(false);
  const team = useWorshipTeamNames(visible);

  useEffect(() => {
    if (!visible) return;
    setDraft(item);
    setSearch('');
    setPicking(!!item && item.type === 'song' && !item.songId && isNew);
    // Tylko przy otwarciu (albo zmianie edytowanego elementu po „Wyżej/Niżej”) — nie przy
    // każdym renderze rodzica.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, item?.id]);

  const songs = useSongsList(search);
  const suggestions = useProgramSongs(visible && draft?.type === 'song' ? programId : null);
  const suggested = useMemo(
    () => (suggestions.data ?? []).filter((s: ProgramSuggestionRow) => s.song && (!search.trim() || s.song.title.toLowerCase().includes(search.trim().toLowerCase()))),
    [suggestions.data, search],
  );

  if (!draft) return null;
  const personQuery = String(draft.person ?? '').trim().toLowerCase();
  const personHints = personFocus
    ? (team.data ?? []).filter((n: string) => n.toLowerCase() !== personQuery && (!personQuery || n.toLowerCase().includes(personQuery))).slice(0, 8)
    : [];
  const attachments = (Array.isArray(draft.customAttachments) ? draft.customAttachments : []) as PlanAttachment[];
  const addPdf = async () => {
    setUploading(true);
    try {
      const att = await pickAndUploadPdf();
      if (att) set({ customAttachments: [...attachments, att] as never });
    } catch (e: any) {
      Alert.alert(e instanceof AttachmentTooLarge ? 'Za duży plik' : 'Nie udało się dodać pliku', e?.message ?? 'Spróbuj ponownie.');
    } finally {
      setUploading(false);
    }
  };
  const set = (patch: Partial<PlanItem>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const kind = (draft.type as ScheduleKind) ?? 'item';
  const minutes = Math.floor((Number(draft.duration) || 0) / 60);
  const secs = (Number(draft.duration) || 0) % 60;
  const setMinutes = (m: number) => set({ duration: Math.max(0, m) * 60 + secs });

  const pickSong = (song: { id: number; title: string; key: string | null }, suggestion?: { song_key: string | null; note: string | null }) => {
    set({
      songId: song.id,
      songKey: suggestion?.song_key || song.key || null,
      title: song.title,
      ...(suggestion?.note && !draft.notes ? { notes: suggestion.note } : {}),
    });
    setPicking(false);
    setSearch('');
  };

  const save = () => {
    const out = { ...draft };
    if (out.type === 'header' && !String(out.title ?? '').trim()) out.title = 'SEKCJA';
    onSave(out);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: B.paper }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 4 }}>
          <Text style={{ flex: 1, fontSize: 20, color: B.ink, fontFamily: F.bold }}>
            {isNew ? `Nowy: ${KIND_META[kind].label.toLowerCase()}` : 'Edytuj element'}
          </Text>
          <Pressable onPress={onClose} hitSlop={10} className="active:opacity-60">
            <X size={22} color={B.ink2} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Label>Rodzaj</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {(Object.keys(KIND_META) as ScheduleKind[]).map((k) => (
              <Chip
                key={k}
                label={KIND_META[k].label}
                on={kind === k}
                onPress={() =>
                  set({
                    type: k,
                    ...(k === 'header' ? { duration: 0 } : kind === 'header' ? { duration: 180, title: '' } : {}),
                    ...(k !== 'song' ? { songId: null, songKey: null } : {}),
                  })
                }
              />
            ))}
          </View>

          {kind === 'song' ? (
            <>
              <Label>Pieśń</Label>
              {draft.songId && !picking ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: B.card }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: B.kurkumaSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Music size={17} color={B.gold} />
                  </View>
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: B.ink, fontFamily: F.semibold }}>
                    {draft.title || 'Pieśń'}
                  </Text>
                  <Pressable onPress={() => setPicking(true)} className="active:opacity-70" style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: B.paper2 }}>
                    <Text style={{ fontSize: 13, color: B.ink, fontFamily: F.semibold }}>Zmień</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={{ borderRadius: 16, backgroundColor: B.card, overflow: 'hidden' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, height: 46, borderBottomWidth: 1, borderBottomColor: B.line }}>
                    <Search size={16} color={B.ink4} />
                    <TextInput
                      value={search}
                      onChangeText={setSearch}
                      placeholder="Szukaj pieśni…"
                      placeholderTextColor={B.ink4}
                      autoCorrect={false}
                      style={{ flex: 1, fontSize: 15, color: B.ink, fontFamily: F.medium }}
                    />
                  </View>
                  <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                    {suggested.length ? (
                      <>
                        <Text style={{ paddingHorizontal: 14, paddingTop: 10, fontSize: 11, letterSpacing: 1.1, color: B.gold, fontFamily: F.bold }}>
                          PROPOZYCJE ZESPOŁU
                        </Text>
                        {suggested.map((s: ProgramSuggestionRow) => (
                          <SongRow key={`s-${s.id}`} title={s.song!.title} songKey={s.song_key || s.song!.key} note={s.note} onPress={() => pickSong(s.song!, s)} />
                        ))}
                        <Text style={{ paddingHorizontal: 14, paddingTop: 10, fontSize: 11, letterSpacing: 1.1, color: B.gold, fontFamily: F.bold }}>
                          WSZYSTKIE
                        </Text>
                      </>
                    ) : null}
                    {(songs.data ?? []).map((s: Song) => (
                      <SongRow key={s.id} title={s.title} songKey={s.key ?? null} onPress={() => pickSong({ id: s.id, title: s.title, key: s.key ?? null })} />
                    ))}
                    {songs.isError ? (
                      <Text style={{ padding: 14, fontSize: 13, color: B.ink3, fontFamily: F.medium }}>
                        Brak dostępu do biblioteki pieśni — wpisz tytuł niżej.
                      </Text>
                    ) : !songs.isLoading && !(songs.data ?? []).length ? (
                      <Text style={{ padding: 14, fontSize: 13, color: B.ink3, fontFamily: F.medium }}>Nie znaleziono pieśni.</Text>
                    ) : null}
                  </ScrollView>
                </View>
              )}
              {draft.songId ? (
                <>
                  <Label>Tonacja</Label>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {MUSICAL_KEYS.map((k) => (
                      <Chip key={k} label={k} on={draft.songKey === k} onPress={() => set({ songKey: k })} />
                    ))}
                  </View>

                  <Label>Załączniki PDF</Label>
                  <View style={{ gap: 6 }}>
                    {attachments.map((att, i) => (
                      <View key={`${att.url}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, paddingLeft: 12, borderRadius: 14, backgroundColor: B.card }}>
                        <FileText size={16} color={B.gold} />
                        <Text
                          numberOfLines={1}
                          onPress={() => Linking.openURL(att.url).catch(() => undefined)}
                          style={{ flex: 1, fontSize: 14, color: B.ink, fontFamily: F.semibold }}
                        >
                          {att.name}
                        </Text>
                        <Pressable
                          onPress={() => set({ customAttachments: attachments.filter((_, j) => j !== i) as never })}
                          hitSlop={8}
                          accessibilityLabel="Usuń załącznik"
                        >
                          <X size={16} color={B.ink4} />
                        </Pressable>
                      </View>
                    ))}
                    <Pressable
                      onPress={addPdf}
                      disabled={uploading}
                      className="active:opacity-70"
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#D9D2C2' }}
                    >
                      {uploading ? <ActivityIndicator size="small" color={B.ink} /> : <Paperclip size={16} color={B.ink2} />}
                      <Text style={{ fontSize: 14, color: B.ink2, fontFamily: F.semibold }}>{uploading ? 'Wysyłanie…' : 'Dodaj PDF (maks. 10 MB)'}</Text>
                    </Pressable>
                  </View>
                </>
              ) : null}
            </>
          ) : null}

          {kind === 'media' ? (
            <>
              <Label>Rodzaj mediów</Label>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {MEDIA_TYPES.map((m) => (
                  <Chip key={m.value} label={m.label} on={(draft.mediaType ?? 'video') === m.value} onPress={() => set({ mediaType: m.value })} />
                ))}
              </View>
              <Label>Adres pliku</Label>
              <TextInput
                value={String(draft.mediaUrl ?? '')}
                onChangeText={(t) => set({ mediaUrl: t })}
                placeholder="https://… albo ścieżka do pliku"
                placeholderTextColor={B.ink4}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={inputStyle}
              />
            </>
          ) : null}

          <Label>{kind === 'header' ? 'Nazwa sekcji' : 'Tytuł'}</Label>
          <TextInput
            value={String(draft.title ?? '')}
            onChangeText={(t) => set({ title: t })}
            placeholder={kind === 'header' ? 'np. UWIELBIENIE' : kind === 'song' ? 'Tytuł pieśni' : 'np. Powitanie, Ogłoszenia'}
            placeholderTextColor={B.ink4}
            style={inputStyle}
          />

          {kind !== 'header' ? (
            <>
              <Label>Osoba</Label>
              <TextInput
                value={String(draft.person ?? '')}
                onChangeText={(t) => set({ person: t })}
                onFocus={() => setPersonFocus(true)}
                onBlur={() => setTimeout(() => setPersonFocus(false), 150)}
                placeholder="Kto prowadzi ten punkt?"
                placeholderTextColor={B.ink4}
                style={inputStyle}
              />
              {personHints.length ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {personHints.map((n: string) => (
                    <Chip
                      key={n}
                      label={n}
                      on={false}
                      onPress={() => {
                        set({ person: n });
                        setPersonFocus(false);
                      }}
                    />
                  ))}
                </View>
              ) : null}

              <Label>Czas trwania</Label>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4, borderRadius: 999, backgroundColor: B.paper2 }}>
                  <Pressable
                    onPress={() => setMinutes(minutes - 1)}
                    disabled={minutes === 0}
                    accessibilityLabel="Krócej"
                    style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: B.card, opacity: minutes === 0 ? 0.4 : 1 }}
                  >
                    <Minus size={17} color={B.ink} />
                  </Pressable>
                  <Text style={{ minWidth: 74, textAlign: 'center', fontSize: 16, color: B.ink, fontFamily: F.bold, fontVariant: ['tabular-nums'] }}>
                    {fmtDuration(draft.duration) || '0 min'}
                  </Text>
                  <Pressable
                    onPress={() => setMinutes(minutes + 1)}
                    accessibilityLabel="Dłużej"
                    style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: B.card }}
                  >
                    <Plus size={17} color={B.ink} />
                  </Pressable>
                </View>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {DURATIONS.map((m) => (
                  <Chip key={m} label={`${m} min`} on={minutes === m && secs === 0} onPress={() => set({ duration: m * 60 })} />
                ))}
              </View>

              <Label>Kiedy</Label>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {TIMING.map((t) => (
                  <Chip key={t.value} label={t.label} on={(draft.timing ?? 'during') === t.value} onPress={() => set({ timing: t.value })} />
                ))}
              </View>
            </>
          ) : null}

          <Label>Szczegóły</Label>
          <TextInput
            value={String(draft.details ?? '')}
            onChangeText={(t) => set({ details: t })}
            placeholder="Np. werset, kolejność zwrotek, uwagi dla prowadzącego"
            placeholderTextColor={B.ink4}
            multiline
            style={[inputStyle, { minHeight: 84, textAlignVertical: 'top' as const }]}
          />

          {kind !== 'header' ? (
            <>
              <Label>Notatki dla zespołu</Label>
              <TextInput
                value={String(draft.notes ?? '')}
                onChangeText={(t) => set({ notes: t })}
                placeholder="Widoczne w zakładce Notatki"
                placeholderTextColor={B.ink4}
                multiline
                style={[inputStyle, { minHeight: 84, textAlignVertical: 'top' as const }]}
              />
            </>
          ) : null}

          <Pressable
            onPress={save}
            className="active:opacity-80"
            style={{ marginTop: 22, height: 52, borderRadius: 999, backgroundColor: B.kurkuma, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 15, color: B.ink, fontFamily: F.bold }}>{isNew ? 'Dodaj do planu' : 'Zapisz'}</Text>
          </Pressable>

          {!isNew ? (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <ActionButton Icon={ArrowUp} label="Wyżej" disabled={!canMoveUp} onPress={() => onMove(-1)} />
              <ActionButton Icon={ArrowDown} label="Niżej" disabled={!canMoveDown} onPress={() => onMove(1)} />
              <ActionButton Icon={Copy} label="Duplikuj" onPress={onDuplicate} />
              <ActionButton Icon={Trash2} label="Usuń" danger onPress={onDelete} />
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const SongRow = ({ title, songKey, note, onPress }: { title: string; songKey: string | null; note?: string | null; onPress: () => void }) => (
  <Pressable onPress={onPress} className="active:opacity-70" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 }}>
    <View style={{ flex: 1 }}>
      <Text numberOfLines={1} style={{ fontSize: 15, color: B.ink, fontFamily: F.semibold }}>
        {title}
      </Text>
      {note ? (
        <Text numberOfLines={1} style={{ fontSize: 12, color: B.ink3, fontFamily: F.medium }}>
          {note}
        </Text>
      ) : null}
    </View>
    {songKey ? (
      <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: B.kurkumaSoft }}>
        <Text style={{ fontSize: 12, color: B.goldDeep, fontFamily: F.bold }}>{songKey}</Text>
      </View>
    ) : null}
  </Pressable>
);

const ActionButton = ({
  Icon,
  label,
  onPress,
  disabled,
  danger,
}: {
  Icon: typeof Trash2;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    className="active:opacity-70"
    style={{ flex: 1, alignItems: 'center', gap: 5, paddingVertical: 10, borderRadius: 16, backgroundColor: B.card, opacity: disabled ? 0.4 : 1 }}
  >
    <Icon size={18} color={danger ? '#B42318' : B.ink} />
    <Text style={{ fontSize: 12, color: danger ? '#B42318' : B.ink2, fontFamily: F.semibold }}>{label}</Text>
  </Pressable>
);
