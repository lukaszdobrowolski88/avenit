import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { ChevronRight, FileText, Headphones, Image as ImageIcon, Link2, Paperclip, Plus, Trash2 } from 'lucide-react-native';
import { B } from '../../../components/ui/brand';
import { SermonAudioPlayer } from '../../sermons/components/SermonAudioPlayer';
import { useSetSongAttachments, type SongAttachment } from '../library';
import { FileTooLarge, isAudio, isImage, isPdf, pickAndUploadSongFile } from '../attachments';

// Materiały pieśni (jak zakładka „Materiały” na webie): pliki (PDF, nuty, obrazy, audio)
// i linki; MP3 odtwarzane w miejscu. Z prawem edycji pieśni — dodawanie i usuwanie.

const F = { medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold' } as const;

const open = (url: string) => Linking.openURL(url).catch(() => Alert.alert('Błąd', 'Nie udało się otworzyć materiału.'));

export const SongMaterials = ({
  songId,
  attachments,
  sheetMusicUrl,
  canEdit,
}: {
  songId: number;
  attachments: SongAttachment[];
  sheetMusicUrl: string | null;
  canEdit: boolean;
}) => {
  const save = useSetSongAttachments(songId);
  const [playing, setPlaying] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkName, setLinkName] = useState('');
  const [linkUrl, setLinkUrl] = useState('');

  const persist = (next: SongAttachment[], ok?: () => void) =>
    save.mutate(next, { onSuccess: ok, onError: (e: any) => Alert.alert('Nie udało się zapisać', e?.message ?? 'Spróbuj ponownie.') });

  const addFile = async () => {
    setUploading(true);
    try {
      const att = await pickAndUploadSongFile();
      if (att) persist([...attachments, att]);
    } catch (e: any) {
      Alert.alert(e instanceof FileTooLarge ? 'Za duży plik' : 'Nie udało się dodać pliku', e?.message ?? 'Spróbuj ponownie.');
    } finally {
      setUploading(false);
    }
  };
  const addLink = () => {
    const url = linkUrl.trim();
    if (!/^https?:\/\//i.test(url)) return Alert.alert('Link', 'Podaj pełny adres, np. https://youtube.com/…');
    persist([...attachments, { type: 'link', name: linkName.trim() || url.replace(/^https?:\/\//, ''), url, description: '', date: new Date().toISOString() }], () => {
      setLinkOpen(false);
      setLinkName('');
      setLinkUrl('');
    });
  };
  const remove = (i: number) =>
    Alert.alert('Usunąć materiał?', attachments[i]?.name, [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Usuń', style: 'destructive', onPress: () => persist(attachments.filter((_, j) => j !== i)) },
    ]);

  const all = attachments;
  const empty = !all.length && !sheetMusicUrl;

  return (
    <View style={{ gap: 10 }}>
      {empty ? (
        <Text style={{ paddingVertical: 12, textAlign: 'center', fontSize: 14, color: B.ink3, fontFamily: F.medium }}>
          Brak materiałów do tej pieśni.
        </Text>
      ) : (
        <View style={{ backgroundColor: B.card, borderRadius: 22, overflow: 'hidden' }}>
          {all.map((a, i) => {
            const audio = a.type === 'file' && isAudio(a);
            const Icon = a.type === 'link' ? Link2 : audio ? Headphones : isImage(a) ? ImageIcon : FileText;
            return (
              <View key={`${a.url}-${i}`} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: B.line }}>
                <Pressable
                  onPress={() => (audio ? setPlaying(playing === a.url ? null : a.url) : open(a.url))}
                  className="active:opacity-70"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13 }}
                >
                  <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: isPdf(a) || audio ? B.kurkumaSoft : B.paper, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={17} color={isPdf(a) || audio ? B.gold : B.ink2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={2} style={{ fontSize: 15, color: B.ink, fontFamily: F.semibold }}>
                      {a.name}
                    </Text>
                    <Text numberOfLines={1} style={{ marginTop: 1, fontSize: 12, color: B.ink3, fontFamily: F.medium }}>
                      {a.description || (a.type === 'link' ? 'Link' : audio ? (playing === a.url ? 'Odtwarzanie' : 'Nagranie — stuknij, by odtworzyć') : isPdf(a) ? 'PDF' : 'Plik')}
                    </Text>
                  </View>
                  {canEdit ? (
                    <Pressable onPress={() => remove(i)} hitSlop={10} accessibilityLabel="Usuń materiał" style={{ padding: 4 }}>
                      <Trash2 size={16} color={B.ink4} />
                    </Pressable>
                  ) : (
                    <ChevronRight size={16} color={B.ink4} />
                  )}
                </Pressable>
                {audio && playing === a.url ? (
                  <View style={{ paddingHorizontal: 16, paddingBottom: 14 }}>
                    <SermonAudioPlayer uri={a.url} />
                  </View>
                ) : null}
              </View>
            );
          })}
          {sheetMusicUrl ? (
            <Pressable
              onPress={() => open(sheetMusicUrl)}
              className="active:opacity-70"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: all.length ? 1 : 0, borderTopColor: B.line }}
            >
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: B.paper, alignItems: 'center', justifyContent: 'center' }}>
                <FileText size={17} color={B.ink2} />
              </View>
              <Text style={{ flex: 1, fontSize: 15, color: B.ink, fontFamily: F.semibold }}>Nuty / PDF</Text>
              <ChevronRight size={16} color={B.ink4} />
            </Pressable>
          ) : null}
        </View>
      )}

      {canEdit ? (
        linkOpen ? (
          <View style={{ backgroundColor: B.card, borderRadius: 22, padding: 14, gap: 8 }}>
            <TextInput
              value={linkName}
              onChangeText={setLinkName}
              placeholder="Nazwa (np. Nagranie na YouTube)"
              placeholderTextColor={B.ink4}
              style={{ height: 44, borderRadius: 12, paddingHorizontal: 12, backgroundColor: B.paper2, fontSize: 15, color: B.ink, fontFamily: F.medium }}
            />
            <TextInput
              value={linkUrl}
              onChangeText={setLinkUrl}
              placeholder="https://…"
              placeholderTextColor={B.ink4}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={{ height: 44, borderRadius: 12, paddingHorizontal: 12, backgroundColor: B.paper2, fontSize: 15, color: B.ink, fontFamily: F.medium }}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => setLinkOpen(false)} style={{ flex: 1, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: B.paper2 }}>
                <Text style={{ fontSize: 14, color: B.ink, fontFamily: F.bold }}>Anuluj</Text>
              </Pressable>
              <Pressable onPress={addLink} disabled={save.isPending} style={{ flex: 2, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: B.kurkuma }}>
                <Text style={{ fontSize: 14, color: B.ink, fontFamily: F.bold }}>Dodaj link</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={addFile}
              disabled={uploading || save.isPending}
              className="active:opacity-70"
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 999, backgroundColor: B.card }}
            >
              {uploading ? <ActivityIndicator size="small" color={B.ink} /> : <Paperclip size={16} color={B.ink} />}
              <Text style={{ fontSize: 14, color: B.ink, fontFamily: F.bold }}>{uploading ? 'Wysyłanie…' : 'Dodaj plik'}</Text>
            </Pressable>
            <Pressable
              onPress={() => setLinkOpen(true)}
              className="active:opacity-70"
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 999, backgroundColor: B.card }}
            >
              <Plus size={16} color={B.ink} />
              <Text style={{ fontSize: 14, color: B.ink, fontFamily: F.bold }}>Dodaj link</Text>
            </Pressable>
          </View>
        )
      ) : null}
    </View>
  );
};
