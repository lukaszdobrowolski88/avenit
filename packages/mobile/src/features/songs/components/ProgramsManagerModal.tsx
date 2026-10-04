import { useEffect, useMemo, useState } from 'react';
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
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FolderOpen,
  Music,
  Plus,
  Search,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react-native';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { KEYS, type Song } from '../../../lib/domain';
import {
  useAddSongToProgram,
  useDeleteSuggestion,
  useProgramSongs,
  useProgramSuggestionCounts,
  useReorderSuggestions,
  useSongsList,
  useUpcomingPrograms,
  useUpdateSuggestion,
  type ProgramSuggestionRow,
  type UpcomingProgram,
} from '../api';

interface Props {
  visible: boolean;
  onClose: () => void;
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

export const ProgramsManagerModal = ({ visible, onClose, myEmail }: Props) => {
  const [selectedProgram, setSelectedProgram] = useState<UpcomingProgram | null>(null);
  const [search, setSearch] = useState('');

  const { data: programs, isLoading } = useUpcomingPrograms(visible);
  const programIds = useMemo(() => (programs ?? []).map((p: UpcomingProgram) => p.id), [programs]);
  const { data: counts } = useProgramSuggestionCounts(programIds, visible);

  const filtered = useMemo(() => {
    const list = programs ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p: UpcomingProgram) =>
        (p.title ?? '').toLowerCase().includes(q) ||
        (p.date ?? '').toLowerCase().includes(q) ||
        formatProgramDate(p.date).toLowerCase().includes(q),
    );
  }, [programs, search]);

  const handleClose = () => {
    setSelectedProgram(null);
    setSearch('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
      presentationStyle="pageSheet"
    >
      <View style={{ flex: 1, backgroundColor: '#F6F4EE' }}>
        {selectedProgram ? (
          <ProgramSongsEditor
            program={selectedProgram}
            myEmail={myEmail}
            onBack={() => setSelectedProgram(null)}
            onClose={handleClose}
          />
        ) : (
          <>
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <FolderOpen size={20} color="#8A6606" />
                  <Text style={styles.headerTitle}>Programy</Text>
                </View>
                <Text style={styles.headerSubtitle}>
                  Aktywne programy (od dzisiaj). Wybierz, by zarządzać przypisanymi pieśniami.
                </Text>
              </View>
              <Pressable onPress={handleClose} hitSlop={10}>
                <X size={22} color="#2A2312" />
              </Pressable>
            </View>

            <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
              <View style={styles.searchBox}>
                <Search size={16} color="#857F70" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Szukaj programu…"
                  placeholderTextColor="#857F70"
                  value={search}
                  onChangeText={setSearch}
                  autoCapitalize="none"
                />
                {search ? (
                  <Pressable onPress={() => setSearch('')} hitSlop={8}>
                    <X size={14} color="#857F70" />
                  </Pressable>
                ) : null}
              </View>
            </View>

            {isLoading ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color="#2A2312" />
              </View>
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(p) => String(p.id)}
                contentContainerStyle={{ padding: 16, gap: 8 }}
                ListEmptyComponent={
                  <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                    <Calendar size={28} color="#9A9586" />
                    <Text style={styles.emptyText}>Brak nadchodzących programów.</Text>
                  </View>
                }
                renderItem={({ item }) => {
                  const count = counts?.[item.id] ?? 0;
                  return (
                    <Pressable
                      onPress={() => setSelectedProgram(item)}
                      className="active:opacity-70"
                      style={styles.programCardShadow}
                    >
                      <View style={styles.programCardInner}>
                        <View style={styles.programIcon}>
                          <Calendar size={18} color="#8A6606" strokeWidth={2.2} />
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
                              <Music size={9} color="#8A6606" strokeWidth={2.4} />
                              <Text style={styles.countPillText}>
                                {count} {count === 1 ? 'pieśń' : 'pieśni'}
                              </Text>
                            </View>
                          </View>
                        </View>
                        <ChevronRight size={18} color="#9A9586" />
                      </View>
                    </Pressable>
                  );
                }}
              />
            )}
          </>
        )}
      </View>
    </Modal>
  );
};

interface EditorProps {
  program: UpcomingProgram;
  myEmail: string | null;
  onBack: () => void;
  onClose: () => void;
}

const ProgramSongsEditor = ({ program, myEmail, onBack, onClose }: EditorProps) => {
  const { data: items, isLoading } = useProgramSongs(program.id);
  const updateMut = useUpdateSuggestion(program.id);
  const deleteMut = useDeleteSuggestion(program.id);
  const reorderMut = useReorderSuggestions(program.id);
  const addMut = useAddSongToProgram(myEmail);

  const [localOrder, setLocalOrder] = useState<ProgramSuggestionRow[] | null>(null);
  useEffect(() => {
    setLocalOrder(items ?? null);
  }, [items]);

  const [showPicker, setShowPicker] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingMode, setEditingMode] = useState<'key' | 'note' | null>(null);
  const [draftKey, setDraftKey] = useState('C');
  const [draftNote, setDraftNote] = useState('');

  const rows = localOrder ?? [];
  const rowsByIdx = useMemo(() => rows.map((r, i) => ({ ...r, _idx: i })), [rows]);

  const move = (id: string, dir: -1 | 1) => {
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) return;
    const next = idx + dir;
    if (next < 0 || next >= rows.length) return;
    const copy = rows.slice();
    [copy[idx], copy[next]] = [copy[next], copy[idx]];
    setLocalOrder(copy);
    reorderMut.mutate(copy.map((r) => r.id));
  };

  const startKeyEdit = (row: ProgramSuggestionRow) => {
    setEditingId(row.id);
    setEditingMode('key');
    setDraftKey(row.song_key ?? row.song?.key ?? 'C');
  };
  const startNoteEdit = (row: ProgramSuggestionRow) => {
    setEditingId(row.id);
    setEditingMode('note');
    setDraftNote(row.note ?? '');
  };
  const closeEdit = () => {
    setEditingId(null);
    setEditingMode(null);
  };
  const saveKey = (id: string) => {
    updateMut.mutate({ id, patch: { song_key: draftKey } });
    closeEdit();
  };
  const saveNote = (id: string) => {
    updateMut.mutate({ id, patch: { note: draftNote.trim() || null } });
    closeEdit();
  };

  const confirmDelete = (id: string) => {
    Alert.alert('Usunąć pieśń z programu?', 'Tej operacji nie można cofnąć.', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: () => deleteMut.mutate(id),
      },
    ]);
  };

  const handleAddSong = (song: Song) => {
    addMut.mutate(
      {
        programId: program.id,
        songId: song.id,
        songKey: song.key ?? null,
        note: null,
      },
      {
        onSuccess: () => setShowPicker(false),
        onError: (e: any) => Alert.alert('Błąd', e?.message ?? 'Nie udało się dodać.'),
      },
    );
  };

  const assignedIds = useMemo(() => new Set(rows.map((r) => r.song_id)), [rows]);

  return (
    <>
      <View style={styles.editorHeader}>
        <Pressable onPress={onBack} hitSlop={10}>
          <ChevronLeft size={22} color="#2A2312" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={styles.editorTitle}>
            {program.title || formatProgramDate(program.date)}
          </Text>
          <Text style={styles.editorSubtitle}>
            {program.title ? `${formatProgramDate(program.date)} · ` : ''}
            Sugerowane pieśni
          </Text>
        </View>
        <Pressable onPress={onClose} hitSlop={10}>
          <X size={22} color="#2A2312" />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        {isLoading ? (
          <View style={{ paddingVertical: 32, alignItems: 'center' }}>
            <ActivityIndicator color="#2A2312" />
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.emptyBox}>
            <Music size={28} color="#9A9586" />
            <Text style={styles.emptyText}>Brak pieśni przypisanych do tego programu.</Text>
          </View>
        ) : (
          rowsByIdx.map((row) => {
            const isFirst = row._idx === 0;
            const isLast = row._idx === rows.length - 1;
            const isEditingKey = editingId === row.id && editingMode === 'key';
            const isEditingNote = editingId === row.id && editingMode === 'note';
            const usedKey = row.song_key ?? row.song?.key ?? null;
            return (
              <View key={row.id} style={styles.suggestionCardShadow}>
                <View style={styles.suggestionCardInner}>
                  <View style={styles.suggestionTopRow}>
                    <View style={styles.songIcon}>
                      <Music size={18} color="#8A6606" strokeWidth={2.2} />
                      <View style={styles.idxBubble}>
                        <Text style={styles.idxBubbleText}>{row._idx + 1}</Text>
                      </View>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={styles.songTitle}>
                        {row.song?.title ?? `#${row.song_id}`}
                      </Text>
                      <View style={styles.pillsRow}>
                        <Pressable onPress={() => startKeyEdit(row)} style={styles.pill}>
                          <Text style={styles.pillText}>{usedKey ? usedKey : 'Tonacja'}</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => startNoteEdit(row)}
                          style={[styles.pill, { flexShrink: 1 }]}
                        >
                          <StickyNote size={10} color="#4A463E" />
                          <Text style={styles.pillText} numberOfLines={1}>
                            {row.note ? row.note : 'Notatka'}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>

                  <View style={styles.actionsRow}>
                    <Pressable
                      disabled={isFirst}
                      onPress={() => move(row.id, -1)}
                      hitSlop={6}
                      style={[styles.actionBtn, isFirst && { opacity: 0.3 }]}
                    >
                      <ChevronUp size={14} color="#4A463E" />
                    </Pressable>
                    <Pressable
                      disabled={isLast}
                      onPress={() => move(row.id, 1)}
                      hitSlop={6}
                      style={[styles.actionBtn, isLast && { opacity: 0.3 }]}
                    >
                      <ChevronDown size={14} color="#4A463E" />
                    </Pressable>
                    <View style={{ flex: 1 }} />
                    <Pressable
                      onPress={() => confirmDelete(row.id)}
                      hitSlop={6}
                      style={[styles.actionBtn, styles.actionBtnDanger]}
                    >
                      <Trash2 size={13} color="#ef4444" />
                    </Pressable>
                  </View>

                  {isEditingKey ? (
                    <View style={styles.inlineEditor}>
                      <Text style={styles.section}>WYBIERZ TONACJĘ</Text>
                      <View style={styles.keysGrid}>
                        {KEYS.map((k) => {
                          const active = draftKey === k;
                          return (
                            <Pressable
                              key={k}
                              onPress={() => setDraftKey(k)}
                              style={[styles.keyBtn, active && styles.keyBtnActive]}
                            >
                              <Text style={[styles.keyText, active && styles.keyTextActive]}>
                                {k}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                      <View style={styles.inlineActions}>
                        <Pressable onPress={closeEdit} style={styles.btnGhost}>
                          <Text style={styles.btnGhostText}>Anuluj</Text>
                        </Pressable>
                        <Pressable onPress={() => saveKey(row.id)} style={styles.btnPrimary}>
                          <Text style={styles.btnPrimaryText}>Zapisz</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : null}

                  {isEditingNote ? (
                    <View style={styles.inlineEditor}>
                      <Text style={styles.section}>NOTATKA</Text>
                      <TextInput
                        style={styles.noteInput}
                        placeholder="Np. fragment, zwrotka, kiedy zaśpiewać…"
                        placeholderTextColor="#857F70"
                        value={draftNote}
                        onChangeText={setDraftNote}
                        multiline
                        textAlignVertical="top"
                      />
                      <View style={styles.inlineActions}>
                        <Pressable onPress={closeEdit} style={styles.btnGhost}>
                          <Text style={styles.btnGhostText}>Anuluj</Text>
                        </Pressable>
                        <Pressable onPress={() => saveNote(row.id)} style={styles.btnPrimary}>
                          <Text style={styles.btnPrimaryText}>Zapisz</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })
        )}

        {showPicker ? (
          <SongPickerInline
            assignedIds={assignedIds}
            onPick={handleAddSong}
            onCancel={() => setShowPicker(false)}
            disabled={addMut.isPending}
          />
        ) : (
          <Pressable onPress={() => setShowPicker(true)} style={styles.addBtn}>
            <Plus size={16} color="#8A6606" />
            <Text style={styles.addBtnText}>Dodaj pieśń z bazy</Text>
          </Pressable>
        )}
      </ScrollView>
    </>
  );
};

interface PickerProps {
  assignedIds: Set<number>;
  onPick: (song: Song) => void;
  onCancel: () => void;
  disabled?: boolean;
}

const SongPickerInline = ({ assignedIds, onPick, onCancel, disabled }: PickerProps) => {
  const [query, setQuery] = useState('');
  const { data: songs, isLoading } = useSongsList('');

  const filtered = useMemo(() => {
    const list = (songs ?? []).filter((s: Song) => !assignedIds.has(s.id));
    const q = query.trim().toLowerCase();
    if (!q) return list.slice(0, 50);
    return list.filter((s: Song) => s.title.toLowerCase().includes(q)).slice(0, 50);
  }, [songs, query, assignedIds]);

  return (
    <View style={styles.pickerBox}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <Text style={styles.section}>WYBIERZ PIEŚŃ</Text>
        <Pressable onPress={onCancel} hitSlop={8}>
          <X size={16} color="#857F70" />
        </Pressable>
      </View>
      <View style={styles.searchBox}>
        <Search size={16} color="#857F70" />
        <TextInput
          style={styles.searchInput}
          placeholder="Szukaj po tytule…"
          placeholderTextColor="#857F70"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />
      </View>
      {isLoading ? (
        <View style={{ paddingVertical: 16, alignItems: 'center' }}>
          <ActivityIndicator color="#2A2312" />
        </View>
      ) : filtered.length === 0 ? (
        <Text
          style={{
            paddingVertical: 16,
            textAlign: 'center',
            color: '#857F70',
            fontFamily: 'Manrope_500Medium',
          }}
        >
          Brak wyników.
        </Text>
      ) : (
        <View style={{ marginTop: 8, gap: 6 }}>
          {filtered.map((s: Song) => (
            <Pressable
              key={s.id}
              disabled={disabled}
              onPress={() => onPick(s)}
              className="active:opacity-70"
              style={[styles.pickerRow, disabled && { opacity: 0.5 }]}
            >
              <View style={styles.pickerIcon}>
                <Music size={14} color="#8A6606" strokeWidth={2.2} />
              </View>
              <Text numberOfLines={1} style={styles.pickerTitle}>
                {s.title}
              </Text>
              {s.key ? <Text style={styles.pickerKey}>{s.key}</Text> : null}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: 16,
    paddingBottom: 12,
    paddingHorizontal: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E6E1D5',
  },
  headerTitle: {
    fontSize: 18,
    color: '#2A2312',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: -0.4,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#6B6557',
    fontFamily: 'Manrope_500Medium',
    marginTop: 4,
    lineHeight: 17,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E6E1D5',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#2A2312',
    fontFamily: 'Manrope_500Medium',
  },
  programCardShadow: {
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
  },
  programCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
  },
  programIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFF8E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  programTitle: {
    fontSize: 15,
    color: '#2A2312',
    fontFamily: 'Manrope_600SemiBold',
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
    color: '#6B6557',
    fontFamily: 'Manrope_500Medium',
  },
  countPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#FFF8E1',
  },
  countPillText: {
    fontSize: 10,
    color: '#8A6606',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 0.2,
  },
  emptyText: {
    marginTop: 8,
    color: '#6B6557',
    fontFamily: 'Manrope_500Medium',
    textAlign: 'center',
  },
  emptyBox: {
    paddingVertical: 28,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#E3DDD0',
    backgroundColor: '#FFFFFF',
  },

  editorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 16,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E6E1D5',
  },
  editorTitle: {
    fontSize: 16,
    color: '#2A2312',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: -0.3,
  },
  editorSubtitle: {
    fontSize: 12,
    color: '#6B6557',
    fontFamily: 'Manrope_500Medium',
    marginTop: 1,
  },
  suggestionCardShadow: {
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    marginBottom: 8,
  },
  suggestionCardInner: {
    padding: 14,
    borderRadius: 16,
  },
  suggestionTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  songIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFF8E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  idxBubble: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: '#2A2312',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  idxBubbleText: {
    fontSize: 10,
    color: '#ffffff',
    fontFamily: 'Manrope_700Bold',
  },
  songTitle: {
    fontSize: 15,
    color: '#2A2312',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: -0.3,
  },
  pillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#ECE8DE',
  },
  pillText: {
    fontSize: 10,
    color: '#4A463E',
    fontFamily: 'Manrope_500Medium',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#ECE8DE',
  },
  actionBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#F1EEE6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnDanger: {
    backgroundColor: '#fef2f2',
  },
  inlineEditor: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#ECE8DE',
  },
  section: {
    fontSize: 11,
    letterSpacing: 1.0,
    color: '#6B6557',
    fontFamily: 'Manrope_700Bold',
    marginBottom: 8,
  },
  keysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  keyBtn: {
    width: '15%',
    minWidth: 44,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E6E1D5',
    alignItems: 'center',
  },
  keyBtnActive: {
    backgroundColor: '#2A2312',
    borderColor: '#FFBE0B',
  },
  keyText: {
    fontSize: 12,
    color: '#2A2312',
    fontFamily: 'Manrope_700Bold',
  },
  keyTextActive: {
    color: '#ffffff',
  },
  noteInput: {
    minHeight: 70,
    borderWidth: 1,
    borderColor: '#E6E1D5',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#2A2312',
    fontFamily: 'Manrope_400Regular',
    backgroundColor: '#FFFFFF',
  },
  inlineActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 10,
  },
  btnGhost: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F1EEE6',
  },
  btnGhostText: {
    fontSize: 13,
    color: '#4A463E',
    fontFamily: 'Manrope_600SemiBold',
  },
  btnPrimary: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#2A2312',
  },
  btnPrimaryText: {
    fontSize: 13,
    color: '#ffffff',
    fontFamily: 'Manrope_700Bold',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#F3E3B0',
    backgroundColor: '#FFF8E1',
  },
  addBtnText: {
    fontSize: 13,
    color: '#8A6606',
    fontFamily: 'Manrope_700Bold',
  },
  pickerBox: {
    marginTop: 8,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E6E1D5',
    backgroundColor: '#F6F4EE',
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#F1EEE6',
  },
  pickerIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: '#FFF8E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerTitle: {
    flex: 1,
    fontSize: 13,
    color: '#2A2312',
    fontFamily: 'Manrope_500Medium',
  },
  pickerKey: {
    fontSize: 10,
    color: '#8A6606',
    fontFamily: 'Manrope_700Bold',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#FFF8E1',
  },
});
