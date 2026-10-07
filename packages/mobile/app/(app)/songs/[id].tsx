import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StatusBar, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarPlus, ChevronLeft, ChevronRight, Minus, Pencil, Plus } from 'lucide-react-native';
import { B } from '../../../src/components/ui/brand';
import {
  buildSongTagList,
  useSongLibrary,
  useSongRecord,
  useSongTagDictionary,
  useSongUsage,
  type SongListItem,
  type SongRecord,
  type SongUse,
} from '../../../src/features/songs/library';
import { friendlyError } from '../../../src/lib/errors';
import { TransposeControl } from '../../../src/features/songs/components/TransposeControl';
import { LyricsView } from '../../../src/features/songs/components/LyricsView';
import { ChordsView } from '../../../src/features/songs/components/ChordsView';
import { SongMaterials } from '../../../src/features/songs/components/SongMaterials';
import { SongFormModal } from '../../../src/features/songs/components/SongFormModal';
import { AddSongToProgramModal } from '../../../src/features/songs/components/AddSongToProgramModal';
import { useAuthSession } from '../../../src/lib/auth';
import { usePermissions } from '../../../src/lib/permissions';
import { useCampusQuery } from '../../../src/hooks/useCampusQuery';
import { goBack } from '../../../src/lib/navigation';
import { formatDate } from '../../../src/lib/domain';

// Pieśń: tekst (sekcje, wielkość czcionki), rozpiska akordów z transpozycją, materiały
// (PDF, nagrania, linki), historia użycia w programach; edycja dla uprawnionych.

const F = { medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold', xbold: 'Manrope_800ExtraBold' } as const;
type Tab = 'text' | 'chords' | 'materials' | 'history';

const Pill = ({ label, value }: { label: string; value: string }) => (
  <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: B.card }}>
    <Text style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: B.ink4, fontFamily: F.bold }}>{label}</Text>
    <Text style={{ marginTop: 1, fontSize: 15, color: B.ink, fontFamily: F.bold }}>{value}</Text>
  </View>
);

export default function SongDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const songId = Number(id);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuthSession();
  const perms = usePermissions();
  const { withCampusFilter } = useCampusQuery();
  const q = useSongRecord(Number.isFinite(songId) ? songId : null);
  const library = useSongLibrary();
  const usage = useSongUsage(Number.isFinite(songId) ? songId : null, withCampusFilter);
  const song: SongRecord | null | undefined = q.data;
  const [tab, setTab] = useState<Tab | null>(null);
  const [targetKey, setTargetKey] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);

  const canEdit = perms.can('res:songs:update');
  const dict = useSongTagDictionary();
  const allTags = useMemo(() => buildSongTagList(dict.data ?? [], (library.data ?? []) as SongListItem[]), [dict.data, library.data]);

  // Domyślna zakładka: tekst, a bez tekstu — akordy albo materiały.
  useEffect(() => {
    if (!song || tab) return;
    setTab(song.lyrics ? 'text' : song.chordsBars ? 'chords' : 'materials');
  }, [song, tab]);

  if (q.isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: B.paper }}>
        <ActivityIndicator color={B.ink} />
      </View>
    );
  }
  if (!song) {
    return (
      <View style={{ flex: 1, backgroundColor: B.paper, paddingTop: insets.top + 10, paddingHorizontal: 20 }}>
        <Pressable onPress={() => goBack(router)} hitSlop={10} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: B.card, alignItems: 'center', justifyContent: 'center' }}>
          <ChevronLeft size={20} color={B.ink} />
        </Pressable>
        <Text style={{ marginTop: 40, textAlign: 'center', color: B.ink3, fontFamily: F.medium }}>
          {q.isError ? friendlyError(q.error, 'Nie udało się wczytać pieśni.') : 'Pieśń nie istnieje albo została usunięta.'}
        </Text>
      </View>
    );
  }

  const fromKey = song.key ?? '';
  const currentKey = targetKey ?? fromKey;
  const uses = (usage.data ?? []) as SongUse[];
  const tabs: { key: Tab; label: string }[] = [
    { key: 'text', label: 'Tekst' },
    ...(song.chordsBars ? [{ key: 'chords' as Tab, label: 'Akordy' }] : []),
    { key: 'materials', label: `Materiały${song.attachments.length ? ` · ${song.attachments.length}` : ''}` },
    { key: 'history', label: `Historia${uses.length ? ` · ${uses.length}` : ''}` },
  ];
  const active = tab ?? 'text';
  const textHasChords = !!song.lyrics && /\[[A-G](#|b)?[^\]]{0,8}\]/.test(song.lyrics);

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <ScrollView style={{ flex: 1, backgroundColor: B.paper }} contentContainerStyle={{ paddingBottom: 130 }}>
        <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 6, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable onPress={() => goBack(router)} hitSlop={10} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: B.card, alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={20} color={B.ink} strokeWidth={2.2} />
          </Pressable>
          <View style={{ flex: 1 }} />
          {canEdit ? (
            <Pressable
              onPress={() => setEditing(true)}
              hitSlop={10}
              accessibilityLabel="Edytuj pieśń"
              style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: B.card, alignItems: 'center', justifyContent: 'center' }}
            >
              <Pencil size={18} color={B.ink} />
            </Pressable>
          ) : null}
        </View>

        {/* Nagłówek pieśni */}
        <View style={{ paddingHorizontal: 20, marginTop: 14 }}>
          <Text style={{ fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase', color: B.gold, fontFamily: F.bold }}>
            {song.author || 'Pieśń'}
          </Text>
          <Text style={{ marginTop: 4, fontSize: 30, lineHeight: 35, color: B.ink, letterSpacing: -1, fontFamily: F.xbold }}>{song.title}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14, marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
            {song.key ? <Pill label="Tonacja" value={song.key} /> : null}
            {song.tempo ? <Pill label="Tempo" value={`${song.tempo} BPM`} /> : null}
            {song.meter ? <Pill label="Metrum" value={song.meter} /> : null}
            {song.category ? <Pill label="Kategoria" value={song.category} /> : null}
          </ScrollView>
          {song.tags.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {song.tags.map((t) => (
                <View key={t} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: B.paper2 }}>
                  <Text style={{ fontSize: 12, color: B.ink2, fontFamily: F.semibold }}>{t}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <Pressable
              onPress={() => setAdding(true)}
              className="active:opacity-80"
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 999, backgroundColor: B.kurkuma }}
            >
              <CalendarPlus size={17} color={B.ink} strokeWidth={2.3} />
              <Text style={{ fontSize: 15, color: B.ink, fontFamily: F.bold }}>Do programu</Text>
            </Pressable>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4, borderRadius: 999, backgroundColor: B.card }}>
              <Pressable onPress={() => setScale((s) => Math.max(0.8, +(s - 0.1).toFixed(1)))} accessibilityLabel="Mniejszy tekst" style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}>
                <Minus size={16} color={B.ink} />
              </Pressable>
              <Text style={{ fontSize: 13, color: B.ink2, fontFamily: F.bold }}>Aa</Text>
              <Pressable onPress={() => setScale((s) => Math.min(1.8, +(s + 0.1).toFixed(1)))} accessibilityLabel="Większy tekst" style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}>
                <Plus size={16} color={B.ink} />
              </Pressable>
            </View>
          </View>
        </View>

        {/* Zakładki */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 18 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}>
          {tabs.map((t) => (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              className="active:opacity-80"
              style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: active === t.key ? B.ink : B.paper2 }}
            >
              <Text style={{ fontSize: 13, color: active === t.key ? '#fff' : B.ink, fontFamily: F.semibold }}>{t.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={{ marginTop: 14 }}>
          {active === 'text' ? (
            <>
              {textHasChords && fromKey ? <TransposeControl value={currentKey} onChange={setTargetKey} originalKey={fromKey} /> : null}
              <View style={{ marginHorizontal: 16, marginTop: textHasChords ? 12 : 0, padding: 18, borderRadius: 22, backgroundColor: B.card }}>
                {song.lyrics ? (
                  <LyricsView lyrics={song.lyrics} fromKey={fromKey} toKey={currentKey} scale={scale} />
                ) : (
                  <Text style={{ textAlign: 'center', color: B.ink3, fontFamily: F.medium }}>
                    Brak tekstu{canEdit ? ' — dodasz go w edycji pieśni.' : '.'}
                  </Text>
                )}
              </View>
            </>
          ) : null}

          {active === 'chords' && song.chordsBars ? (
            <>
              {fromKey ? <TransposeControl value={currentKey} onChange={setTargetKey} originalKey={fromKey} /> : null}
              <View style={{ marginHorizontal: 16, marginTop: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22, backgroundColor: B.card }}>
                <ChordsView source={song.chordsBars} fromKey={fromKey || null} toKey={currentKey || null} scale={scale} />
              </View>
              <Text style={{ marginTop: 8, marginHorizontal: 22, fontSize: 12, color: B.ink4, fontFamily: F.medium }}>
                Rozpiskę akordów edytujesz na webie (edytor taktów).
              </Text>
            </>
          ) : null}

          {active === 'materials' ? (
            <View style={{ marginHorizontal: 16 }}>
              <SongMaterials songId={song.id} attachments={song.attachments} sheetMusicUrl={song.sheetMusicUrl} canEdit={canEdit} />
            </View>
          ) : null}

          {active === 'history' ? (
            <View style={{ marginHorizontal: 16 }}>
              {usage.isLoading ? (
                <ActivityIndicator color={B.ink} />
              ) : !uses.length ? (
                <Text style={{ paddingVertical: 12, textAlign: 'center', fontSize: 14, color: B.ink3, fontFamily: F.medium }}>
                  Pieśń nie była jeszcze w żadnym programie.
                </Text>
              ) : (
                <View style={{ backgroundColor: B.card, borderRadius: 22, overflow: 'hidden' }}>
                  {uses.map((u, i) => (
                    <Pressable
                      key={u.programId}
                      onPress={() => router.push({ pathname: '/(app)/programs/[id]', params: { id: String(u.programId) } })}
                      className="active:opacity-70"
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: i ? 1 : 0, borderTopColor: B.line }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={{ fontSize: 15, color: B.ink, fontFamily: F.semibold }}>
                          {u.title || 'Program'}
                        </Text>
                        <Text style={{ marginTop: 1, fontSize: 12, color: B.ink3, fontFamily: F.medium }}>
                          {formatDate(u.date, 'EEEE, d MMMM yyyy')}
                          {u.key ? ` · tonacja ${u.key}` : ''}
                        </Text>
                      </View>
                      <ChevronRight size={16} color={B.ink4} />
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          ) : null}
        </View>
      </ScrollView>

      <AddSongToProgramModal visible={adding} onClose={() => setAdding(false)} song={song as never} myEmail={user?.email ?? null} />
      {canEdit ? (
        <SongFormModal
          visible={editing}
          song={song}
          allTags={allTags}
          canDelete={perms.can('res:songs:delete')}
          onClose={() => setEditing(false)}
          onDeleted={() => goBack(router)}
        />
      ) : null}
    </>
  );
}
