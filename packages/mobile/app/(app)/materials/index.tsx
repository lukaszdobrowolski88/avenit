import { useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronRight,
  File as FileIcon,
  FileAudio,
  FileText,
  FileVideo,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  MoreHorizontal,
  Share2,
  Upload,
} from 'lucide-react-native';
import {
  useFolders,
  useFiles,
  useFolderPath,
  useUploadMaterial,
  useRenameMaterial,
  useDeleteMaterial,
  pickDocument,
  formatBytes,
  fileIconType,
  getDownloadUrl,
  type FileRow,
  type FolderRow,
} from '../../../src/features/materials/api';
import { useAuthSession } from '../../../src/lib/auth';
import { useModules } from '../../../src/features/modules/useModules';
import { usePermissions } from '../../../src/lib/permissions';
import { PromptModal } from '../../../src/components/ui/PromptModal';
import { GradientIcon } from '../../../src/components/ui/GradientIcon';
import { IconWell, ListCard, ListRow, SectionLabel, Tile } from '../../../src/components/ui/brand';
import { goBack } from '../../../src/lib/navigation';

const ICON_BY_TYPE = {
  pdf: { Icon: FileText, tint: '#dc2626', bg: '#fee2e2' },
  image: { Icon: ImageIcon, tint: '#2A2312', bg: '#ECE8DE' },
  audio: { Icon: FileAudio, tint: '#2A2312', bg: '#ECE8DE' },
  video: { Icon: FileVideo, tint: '#2A2312', bg: '#ECE8DE' },
  doc: { Icon: FileText, tint: '#2A2312', bg: '#ECE8DE' },
  other: { Icon: FileIcon, tint: '#6B6557', bg: '#E3DDD0' },
};



// Moduły, które mają na webie zakładkę „Pliki” (MaterialsTab z team_type = klucz modułu).
const FILE_SPACES = ['worship', 'media', 'atmosfera', 'kids', 'homegroups', 'teaching'];

export default function MaterialsScreen() {
  const router = useRouter();
  const { user } = useAuthSession();
  const insets = useSafeAreaInsets();
  const { team } = useLocalSearchParams<{ team?: string }>();
  const { items: modules } = useModules();
  // Przestrzeń plików jak na webie: undefined = wybór, null = ogólne, 'media' = pliki zespołu.
  const [space, setSpace] = useState<string | null | undefined>(team ? String(team) : undefined);
  const [folderId, setFolderId] = useState<string | null>(null);
  const teamType = space ?? null;
  const folders = useFolders(folderId, teamType);
  const files = useFiles(folderId, teamType);
  const path = useFolderPath(folderId);
  const upload = useUploadMaterial(folderId, user?.email ?? null, teamType);
  const rename = useRenameMaterial();
  const remove = useDeleteMaterial();
  const perms = usePermissions();
  const [renaming, setRenaming] = useState<FileRow | null>(null);

  // Jak serwer: własne pliki zawsze, cudze tylko z uprawnieniem z roli.
  const isMine = (f: FileRow) => !!user?.email && (f.uploaded_by ?? '').toLowerCase() === user.email.toLowerCase();
  const canRename = (f: FileRow) => isMine(f) || perms.can('res:materials_files:update');
  const canDelete = (f: FileRow) => isMine(f) || perms.can('res:materials_files:delete');

  const fileActions = (file: FileRow) => {
    const actions: { label: string; destructive?: boolean; run: () => void }[] = [
      { label: 'Otwórz', run: () => handleOpenFile(file) },
    ];
    if (canRename(file)) actions.push({ label: 'Zmień nazwę', run: () => setRenaming(file) });
    if (canDelete(file)) {
      actions.push({
        label: 'Usuń',
        destructive: true,
        run: () =>
          Alert.alert('Usunąć plik?', `„${file.name}” zniknie dla wszystkich.`, [
            { text: 'Anuluj', style: 'cancel' },
            {
              text: 'Usuń',
              style: 'destructive',
              onPress: () =>
                remove.mutate(file, { onError: (e: any) => Alert.alert('Nie udało się usunąć', e?.message ?? '') }),
            },
          ]),
      });
    }
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: file.name,
          options: [...actions.map((a) => a.label), 'Anuluj'],
          cancelButtonIndex: actions.length,
          destructiveButtonIndex: actions.findIndex((a) => a.destructive),
        },
        (i) => actions[i]?.run(),
      );
    } else {
      Alert.alert(file.name, undefined, [
        ...actions.map((a) => ({ text: a.label, style: a.destructive ? ('destructive' as const) : undefined, onPress: a.run })),
        { text: 'Anuluj', style: 'cancel' as const },
      ]);
    }
  };

  const { width } = useWindowDimensions();
  const tileW = Math.floor((width - 32 - 10) / 2);

  const spaces = useMemo(
    () =>
      modules
        .filter((m) => FILE_SPACES.includes(m.key))
        .map((m) => ({ key: m.key, label: m.label, Icon: m.Icon, tint: m.tint, bg: m.bg })),
    [modules],
  );
  const spaceLabel =
    space === undefined ? 'Materiały' : space === null ? 'Ogólne' : spaces.find((x) => x.key === space)?.label ?? 'Pliki';

  const handleUpload = async () => {
    try {
      const asset = await pickDocument();
      if (!asset) return;
      await upload.mutateAsync(asset);
      Alert.alert('Wysłano', 'Plik został dodany do materiałów.');
    } catch (e: any) {
      Alert.alert('Błąd', e?.message ?? 'Nie udało się wysłać pliku.');
    }
  };

  const isLoading = folders.isLoading || files.isLoading;
  const isError = folders.isError || files.isError;
  const isRefetching = folders.isRefetching || files.isRefetching;

  const onRefresh = () => {
    folders.refetch();
    files.refetch();
  };

  const handleOpenFile = async (file: FileRow) => {
    try {
      const url = await getDownloadUrl(file.storage_path);
      if (!url) {
        Alert.alert('Błąd', 'Nie udało się otworzyć pliku.');
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert('Błąd', 'Nie udało się otworzyć pliku.');
    }
  };

  const handleBack = () => {
    if (folderId === null) {
      // Z przestrzeni wróć do wyboru (chyba że weszliśmy z zakładki zespołu).
      if (space !== undefined && !team) setSpace(undefined);
      else goBack(router);
    } else {
      const parent = path.data?.[path.data.length - 2];
      setFolderId(parent?.id ?? null);
    }
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View className="flex-1" style={{ backgroundColor: '#F6F4EE' }}>
        <View className="px-5 pb-3 flex-row items-center gap-3" style={{ paddingTop: insets.top + 10 }}>
          <Pressable
            onPress={handleBack}
            className="active:opacity-60"
            hitSlop={10}
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: '#FFFFFF',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ChevronRight
              size={20}
              color="#2A2312"
              strokeWidth={2.2}
              style={{ transform: [{ rotate: '180deg' }] }}
            />
          </Pressable>
          <View className="flex-1">
            <Text
              style={{ fontSize: 11, color: '#8A6606', letterSpacing: 1.2, textTransform: 'uppercase', fontFamily: 'Manrope_700Bold' }}
            >
              {space === undefined ? 'Pliki i dokumenty' : 'Materiały'}
            </Text>
            <Text
              className="text-[27px] mt-0.5"
              style={{ color: '#2A2312', letterSpacing: -0.9, fontFamily: 'Manrope_700Bold' }}
              numberOfLines={1}
            >
              {spaceLabel}
            </Text>
          </View>
          {space !== undefined ? (
            <Pressable onPress={handleUpload} disabled={upload.isPending} className="active:opacity-80">
              {upload.isPending ? (
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: '#2A2312',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ActivityIndicator color="#ffffff" />
                </View>
              ) : (
                <GradientIcon Icon={Upload} size={40} iconSize={19} rounded />
              )}
            </Pressable>
          ) : null}
        </View>

        {(path.data?.length ?? 0) > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingBottom: 8,
              gap: 6,
              alignItems: 'center',
            }}
            style={{ height: 36 }}
          >
            <Pressable
              onPress={() => setFolderId(null)}
              className="flex-row items-center gap-1"
            >
              <Folder size={12} color="#6B6557" />
              <Text
                className="text-[12px]"
                style={{ color: '#4A463E', fontFamily: 'Manrope_500Medium' }}
              >
                {spaceLabel}
              </Text>
            </Pressable>
            {path.data!.map((p: FolderRow) => (
              <View key={p.id} className="flex-row items-center gap-1">
                <ChevronRight size={12} color="#857F70" />
                <Pressable onPress={() => setFolderId(p.id)}>
                  <Text
                    className="text-[12px]"
                    style={{ color: '#4A463E', fontFamily: 'Manrope_500Medium' }}
                  >
                    {p.name}
                  </Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}

        {space === undefined ? (
          <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 120 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Tile
                dark
                width={tileW}
                Icon={Share2}
                title="Udostępnione mi"
                subtitle="Pliki dla Ciebie i Twoich grup"
                onPress={() => router.push('/(app)/materials/shared')}
              />
              <Tile
                width={tileW}
                Icon={FolderOpen}
                title="Ogólne"
                subtitle="Pliki wspólne kościoła"
                onPress={() => {
                  setFolderId(null);
                  setSpace(null);
                }}
              />
            </View>
            {spaces.length > 0 ? (
              <>
                <SectionLabel count={spaces.length}>Pliki zespołów</SectionLabel>
                <ListCard>
                  {spaces.map((x) => (
                    <ListRow
                      key={x.key}
                      leading={<IconWell Icon={x.Icon} size={42} />}
                      dividerInset={72}
                      title={x.label}
                      onPress={() => {
                        setFolderId(null);
                        setSpace(x.key);
                      }}
                    />
                  ))}
                </ListCard>
              </>
            ) : null}
          </ScrollView>
        ) : isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#2A2312" />
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center px-8">
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 18,
                backgroundColor: '#fee2e2',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}
            >
              <FolderOpen size={28} color="#dc2626" />
            </View>
            <Text
              className="text-[16px] text-center"
              style={{ color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}
            >
              Nie udało się wczytać materiałów
            </Text>
            <Text
              className="text-[13px] text-center mt-1"
              style={{ color: '#6B6557', fontFamily: 'Manrope_400Regular' }}
            >
              Sprawdź połączenie i spróbuj ponownie.
            </Text>
            <Pressable
              onPress={onRefresh}
              className="mt-4 active:opacity-70"
              style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, backgroundColor: '#2A2312' }}
            >
              <Text style={{ color: '#ffffff', fontFamily: 'Manrope_600SemiBold' }}>Spróbuj ponownie</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 120 }}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={onRefresh}
                tintColor="#2A2312"
              />
            }
          >

            {(folders.data?.length ?? 0) > 0 && (
              <>
                <SectionLabel count={folders.data!.length} style={{ marginTop: 6 }}>Foldery</SectionLabel>
                <ListCard>
                  {folders.data!.map((f: FolderRow) => (
                    <ListRow
                      key={f.id}
                      leading={<IconWell Icon={FolderOpen} tone="kurkuma" size={42} />}
                      dividerInset={72}
                      title={f.name}
                      onPress={() => setFolderId(f.id)}
                    />
                  ))}
                </ListCard>
              </>
            )}

            {(files.data?.length ?? 0) > 0 && (
              <>
                <SectionLabel count={files.data!.length}>Pliki</SectionLabel>
                <ListCard>
                  {files.data!.map((file: FileRow) => {
                    const meta = ICON_BY_TYPE[fileIconType(file.mime_type)];
                    return (
                      <ListRow
                        key={file.id}
                        leading={
                          <View
                            style={{
                              width: 42,
                              height: 42,
                              borderRadius: 21,
                              backgroundColor: meta.bg,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <meta.Icon size={18} color={meta.tint} />
                          </View>
                        }
                        dividerInset={72}
                        title={file.name}
                        subtitle={`${formatBytes(file.file_size)}${file.download_count > 0 ? ` · ${file.download_count} pobrań` : ''}`}
                        onPress={() => handleOpenFile(file)}
                        onLongPress={() => fileActions(file)}
                        noChevron
                        right={
                          <Pressable
                            onPress={() => fileActions(file)}
                            hitSlop={10}
                            accessibilityLabel={`Więcej akcji: ${file.name}`}
                            className="active:opacity-60"
                            style={{ padding: 4 }}
                          >
                            <MoreHorizontal size={18} color="#857F70" />
                          </Pressable>
                        }
                      />
                    );
                  })}
                </ListCard>
              </>
            )}

            {(folders.data?.length ?? 0) === 0 && (files.data?.length ?? 0) === 0 ? (
              <View className="items-center mt-12 px-6">
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 18,
                    backgroundColor: '#ECE8DE',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 12,
                  }}
                >
                  <FolderOpen size={28} color="#2A2312" />
                </View>
                <Text
                  className="text-[16px]"
                  style={{ color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}
                >
                  Pusty folder
                </Text>
                <Text
                  className="text-[13px] text-center mt-1"
                  style={{ color: '#6B6557', fontFamily: 'Manrope_400Regular' }}
                >
                  Brak plików i podfolderów.
                </Text>
              </View>
            ) : null}
          </ScrollView>
        )}
      </View>
      <PromptModal
        visible={!!renaming}
        title="Zmień nazwę pliku"
        initialValue={renaming?.name ?? ''}
        onCancel={() => setRenaming(null)}
        onConfirm={(name) => {
          const f = renaming;
          setRenaming(null);
          if (f && name !== f.name) {
            rename.mutate({ id: f.id, name }, { onError: (e: any) => Alert.alert('Nie udało się', e?.message ?? '') });
          }
        }}
      />
    </>
  );
}
