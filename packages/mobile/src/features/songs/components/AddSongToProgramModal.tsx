import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Calendar, Check, Music, Search, X } from 'lucide-react-native';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { KEYS, type Song } from '../../../lib/domain';
import {
  useAddSongToProgram,
  useProgramSuggestionCounts,
  useSongProgramAssignments,
  useUpcomingPrograms,
  type UpcomingProgram,
} from '../api';

interface Props {
  visible: boolean;
  onClose: () => void;
  song: Song | null;
  myEmail: string | null;
}

const formatProgramDate = (date: string) => {
  try {
    const out = format(new Date(date), 'EEEE, d MMMM yyyy', { locale: pl });
    return out.charAt(0).toUpperCase() + out.slice(1);
  } catch {
    return date;
  }
};

export const AddSongToProgramModal = ({ visible, onClose, song, myEmail }: Props) => {
  const songId = song?.id;
  const { data: programs, isLoading } = useUpcomingPrograms(visible);
  const { data: existingIds } = useSongProgramAssignments(songId, visible);
  const programIds = useMemo(() => (programs ?? []).map((p) => p.id), [programs]);
  const { data: counts } = useProgramSuggestionCounts(programIds, visible);
  const addMutation = useAddSongToProgram(myEmail);

  const [search, setSearch] = useState('');
  const [selectedProgramId, setSelectedProgramId] = useState<number | null>(null);
  const [songKey, setSongKey] = useState<string>(song?.key ?? 'C');
  const [note, setNote] = useState('');

  const filtered = useMemo(() => {
    const list = programs ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => {
      return (
        (p.title ?? '').toLowerCase().includes(q) ||
        (p.date ?? '').toLowerCase().includes(q) ||
        formatProgramDate(p.date).toLowerCase().includes(q)
      );
    });
  }, [programs, search]);

  const handleClose = () => {
    if (addMutation.isPending) return;
    setSearch('');
    setSelectedProgramId(null);
    setNote('');
    setSongKey(song?.key ?? 'C');
    onClose();
  };

  const handleSave = async () => {
    if (!selectedProgramId || !songId) return;
    try {
      await addMutation.mutateAsync({
        programId: selectedProgramId,
        songId,
        songKey: songKey || null,
        note: note.trim() || null,
      });
      Alert.alert('Dodano do programu', 'Pieśń została zaproponowana w wybranym programie.');
      handleClose();
    } catch (e: any) {
      Alert.alert('Błąd', e?.message ?? 'Nie udało się dodać pieśni do programu.');
    }
  };

  const renderProgram = ({ item }: { item: UpcomingProgram }) => {
    const isSelected = selectedProgramId === item.id;
    const alreadyAdded = existingIds?.has(item.id) ?? false;
    const count = counts?.[item.id] ?? 0;
    return (
      <Pressable
        disabled={alreadyAdded}
        onPress={() => setSelectedProgramId(item.id)}
        style={({ pressed }) => [
          styles.programCardShadow,
          alreadyAdded && { opacity: 0.55 },
          pressed && !alreadyAdded && { opacity: 0.85 },
        ]}
      >
        <View style={[styles.programCardInner, isSelected && styles.programCardInnerSelected]}>
          <View style={[styles.programIcon, isSelected && styles.programIconSelected]}>
            <Calendar size={18} color={isSelected ? '#ffffff' : '#ec4899'} strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={styles.programTitle}>
              {item.title || formatProgramDate(item.date)}
            </Text>
            <View style={styles.programMetaRow}>
              {item.title ? (
                <Text numberOfLines={1} style={styles.programMetaText}>
                  {formatProgramDate(item.date)}
                </Text>
              ) : null}
              <View style={styles.countPill}>
                <Music size={9} color="#be185d" strokeWidth={2.4} />
                <Text style={styles.countPillText}>
                  {count} {count === 1 ? 'pieśń' : 'pieśni'}
                </Text>
              </View>
            </View>
          </View>
          {alreadyAdded ? (
            <View style={styles.addedBadge}>
              <Check size={11} color="#a8a29e" strokeWidth={2.6} />
              <Text style={styles.addedBadgeText}>DODANA</Text>
            </View>
          ) : isSelected ? (
            <View style={styles.checkBubble}>
              <Check size={14} color="#ffffff" strokeWidth={3} />
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
      presentationStyle="pageSheet"
    >
      <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
        <View style={styles.header}>
          <Pressable onPress={handleClose} hitSlop={10}>
            <X size={22} color="#1c1917" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Dodaj do programu</Text>
            {song?.title ? (
              <View style={styles.songRow}>
                <Music size={12} color="#ec4899" />
                <Text numberOfLines={1} style={styles.headerSubtitle}>
                  {song.title}
                </Text>
              </View>
            ) : null}
          </View>
          <Pressable
            onPress={handleSave}
            disabled={!selectedProgramId || addMutation.isPending}
            style={[styles.saveBtn, !selectedProgramId && styles.saveBtnDisabled]}
          >
            {addMutation.isPending ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.saveBtnText}>Dodaj</Text>
            )}
          </Pressable>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
          <Text style={styles.section}>WYBIERZ PROGRAM (od dzisiaj)</Text>
          <View style={styles.searchBox}>
            <Search size={16} color="#a8a29e" />
            <TextInput
              style={styles.searchInput}
              placeholder="Szukaj programu…"
              placeholderTextColor="#a8a29e"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
            />
            {search ? (
              <Pressable onPress={() => setSearch('')} hitSlop={8}>
                <X size={14} color="#a8a29e" />
              </Pressable>
            ) : null}
          </View>

          {isLoading ? (
            <View style={{ paddingVertical: 32, alignItems: 'center' }}>
              <ActivityIndicator color="#ec4899" />
            </View>
          ) : filtered.length === 0 ? (
            <View style={{ paddingVertical: 32, paddingHorizontal: 16, alignItems: 'center' }}>
              <Calendar size={28} color="#cbd5e1" />
              <Text
                style={{
                  marginTop: 8,
                  color: '#78716c',
                  fontFamily: 'Inter_500Medium',
                  textAlign: 'center',
                }}
              >
                Brak nadchodzących programów.
              </Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(p) => String(p.id)}
              renderItem={renderProgram}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
              contentContainerStyle={styles.programsListContent}
            />
          )}

          <View style={{ paddingHorizontal: 16, marginTop: 18 }}>
            <Text style={styles.section}>
              TONACJA WYKONANIA{song?.key ? `  ·  pieśń: ${song.key}` : ''}
            </Text>
            <View style={styles.keysGrid}>
              {KEYS.map((k) => {
                const active = songKey === k;
                return (
                  <Pressable
                    key={k}
                    onPress={() => setSongKey(k)}
                    style={[styles.keyBtn, active && styles.keyBtnActive]}
                  >
                    <Text style={[styles.keyText, active && styles.keyTextActive]}>{k}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ paddingHorizontal: 16, marginTop: 18, marginBottom: 32 }}>
            <Text style={styles.section}>NOTATKA</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="Opcjonalna notatka, np. fragment, zwrotka, kiedy zaśpiewać…"
              placeholderTextColor="#a8a29e"
              value={note}
              onChangeText={setNote}
              multiline
              textAlignVertical="top"
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 16,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eef0f3',
  },
  headerTitle: {
    fontSize: 16,
    color: '#0c0a09',
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.3,
  },
  songRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  headerSubtitle: {
    flex: 1,
    fontSize: 12,
    color: '#78716c',
    fontFamily: 'Inter_500Medium',
  },
  saveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#ec4899',
    minWidth: 70,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    backgroundColor: '#fafaf9',
  },
  saveBtnText: {
    fontSize: 13,
    color: '#ffffff',
    fontFamily: 'Inter_700Bold',
  },
  section: {
    fontSize: 11,
    letterSpacing: 1.2,
    color: '#78716c',
    fontFamily: 'Inter_700Bold',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  searchBox: {
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#fafaf9',
    borderWidth: 1,
    borderColor: '#eef0f3',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0c0a09',
    fontFamily: 'Inter_500Medium',
  },
  programsListContent: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  programCardShadow: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 1,
  },
  programCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#eef0f3',
  },
  programCardInnerSelected: {
    borderColor: '#ec4899',
    backgroundColor: '#fdf2f8',
  },
  programIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#fef3f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  programIconSelected: {
    backgroundColor: '#ec4899',
  },
  programTitle: {
    fontSize: 15,
    color: '#0c0a09',
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: -0.3,
  },
  programMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
    flexWrap: 'wrap',
  },
  programMetaText: {
    fontSize: 12,
    color: '#78716c',
    fontFamily: 'Inter_500Medium',
  },
  countPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#fdf2f8',
  },
  countPillText: {
    fontSize: 10,
    color: '#be185d',
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.2,
  },
  checkBubble: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#ec4899',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#f5f5f4',
  },
  addedBadgeText: {
    fontSize: 9,
    letterSpacing: 0.6,
    color: '#78716c',
    fontFamily: 'Inter_700Bold',
  },
  keysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  keyBtn: {
    width: '15%',
    minWidth: 48,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#fafaf9',
    borderWidth: 1,
    borderColor: '#eef0f3',
    alignItems: 'center',
  },
  keyBtnActive: {
    backgroundColor: '#ec4899',
    borderColor: '#ec4899',
  },
  keyText: {
    fontSize: 13,
    color: '#1c1917',
    fontFamily: 'Inter_700Bold',
  },
  keyTextActive: {
    color: '#ffffff',
  },
  noteInput: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: '#eef0f3',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0c0a09',
    fontFamily: 'Inter_400Regular',
    backgroundColor: '#fafaf9',
  },
});
