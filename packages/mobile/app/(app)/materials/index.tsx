import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  ChevronRight,
  File as FileIcon,
  FileAudio,
  FileText,
  FileVideo,
  Folder,
  FolderOpen,
  Image as ImageIcon,
} from 'lucide-react-native';
import {
  useFolders,
  useFiles,
  useFolderPath,
  formatBytes,
  fileIconType,
  getDownloadUrl,
  type FileRow,
} from '../../../src/features/materials/api';

const ICON_BY_TYPE = {
  pdf: { Icon: FileText, tint: '#dc2626', bg: '#fee2e2' },
  image: { Icon: ImageIcon, tint: '#2563eb', bg: '#dbeafe' },
  audio: { Icon: FileAudio, tint: '#16a34a', bg: '#dcfce7' },
  video: { Icon: FileVideo, tint: '#7c3aed', bg: '#ede9fe' },
  doc: { Icon: FileText, tint: '#0891b2', bg: '#cffafe' },
  other: { Icon: FileIcon, tint: '#64748b', bg: '#e2e8f0' },
};

const itemCardStyle = {
  borderRadius: 16,
  backgroundColor: '#ffffff',
  shadowColor: '#0f172a',
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.04,
  shadowRadius: 10,
  elevation: 1,
} as const;

const itemBorderStyle = {
  borderRadius: 16,
  borderWidth: 1,
  borderColor: '#eef0f3',
} as const;

export default function MaterialsScreen() {
  const router = useRouter();
  const [folderId, setFolderId] = useState<string | null>(null);
  const folders = useFolders(folderId);
  const files = useFiles(folderId);
  const path = useFolderPath(folderId);

  const isLoading = folders.isLoading || files.isLoading;
  const isRefetching = folders.isRefetching || files.isRefetching;

  const onRefresh = () => {
    folders.refetch();
    files.refetch();
  };

  const handleOpenFile = async (file: FileRow) => {
    const url = await getDownloadUrl(file.storage_path);
    if (!url) {
      Alert.alert('Błąd', 'Nie udało się pobrać pliku.');
      return;
    }
    Linking.openURL(url);
  };

  const handleBack = () => {
    if (folderId === null) router.back();
    else {
      const parent = path.data?.[path.data.length - 2];
      setFolderId(parent?.id ?? null);
    }
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View className="flex-1" style={{ backgroundColor: '#ffffff' }}>
        <View className="px-5 pt-12 pb-3 flex-row items-center gap-3">
          <Pressable
            onPress={handleBack}
            className="active:opacity-60"
            hitSlop={10}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: '#fafaf9',
              borderWidth: 1,
              borderColor: '#e7e5e4',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ChevronRight
              size={20}
              color="#1c1917"
              strokeWidth={2.2}
              style={{ transform: [{ rotate: '180deg' }] }}
            />
          </Pressable>
          <View className="flex-1">
            <Text
              className="text-[12px]"
              style={{ color: '#78716c', fontFamily: 'Inter_500Medium' }}
            >
              Pliki i dokumenty
            </Text>
            <Text
              className="text-[24px] mt-0.5"
              style={{ color: '#0c0a09', letterSpacing: -0.6, fontFamily: 'Inter_700Bold' }}
              numberOfLines={1}
            >
              Materiały
            </Text>
          </View>
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
              <Folder size={12} color="#78716c" />
              <Text
                className="text-[12px]"
                style={{ color: '#57534e', fontFamily: 'Inter_500Medium' }}
              >
                Główny
              </Text>
            </Pressable>
            {path.data!.map((p) => (
              <View key={p.id} className="flex-row items-center gap-1">
                <ChevronRight size={12} color="#a8a29e" />
                <Pressable onPress={() => setFolderId(p.id)}>
                  <Text
                    className="text-[12px]"
                    style={{ color: '#57534e', fontFamily: 'Inter_500Medium' }}
                  >
                    {p.name}
                  </Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}

        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#ec4899" />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 120 }}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={onRefresh}
                tintColor="#ec4899"
              />
            }
          >
            {(folders.data?.length ?? 0) > 0 && (
              <View className="mb-3">
                <Text
                  className="text-[11px] uppercase mb-2 px-1"
                  style={{ color: '#78716c', letterSpacing: 0.6, fontFamily: 'Inter_700Bold' }}
                >
                  Foldery
                </Text>
                {folders.data!.map((f) => (
                  <Pressable
                    key={f.id}
                    onPress={() => setFolderId(f.id)}
                    className="mb-2 active:opacity-80"
                    style={itemCardStyle}
                  >
                    <View
                      className="flex-row items-center gap-3 p-3.5"
                      style={itemBorderStyle}
                    >
                      <View
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 12,
                          backgroundColor: '#fef3c7',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <FolderOpen size={18} color="#d97706" />
                      </View>
                      <Text
                        className="flex-1 text-[15px]"
                        style={{
                          color: '#0c0a09',
                          letterSpacing: -0.2,
                          fontFamily: 'Inter_500Medium',
                        }}
                        numberOfLines={1}
                      >
                        {f.name}
                      </Text>
                      <ChevronRight size={16} color="#a8a29e" />
                    </View>
                  </Pressable>
                ))}
              </View>
            )}

            {(files.data?.length ?? 0) > 0 && (
              <View>
                <Text
                  className="text-[11px] uppercase mb-2 px-1"
                  style={{ color: '#78716c', letterSpacing: 0.6, fontFamily: 'Inter_700Bold' }}
                >
                  Pliki
                </Text>
                {files.data!.map((file) => {
                  const meta = ICON_BY_TYPE[fileIconType(file.mime_type)];
                  return (
                    <Pressable
                      key={file.id}
                      onPress={() => handleOpenFile(file)}
                      className="mb-2 active:opacity-80"
                      style={itemCardStyle}
                    >
                      <View
                        className="flex-row items-center gap-3 p-3.5"
                        style={itemBorderStyle}
                      >
                        <View
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 12,
                            backgroundColor: meta.bg,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <meta.Icon size={18} color={meta.tint} />
                        </View>
                        <View className="flex-1">
                          <Text
                            className="text-[15px]"
                            style={{
                              color: '#0c0a09',
                              letterSpacing: -0.2,
                              fontFamily: 'Inter_500Medium',
                            }}
                            numberOfLines={1}
                          >
                            {file.name}
                          </Text>
                          <Text
                            className="text-[12px] mt-0.5"
                            style={{ color: '#78716c', fontFamily: 'Inter_400Regular' }}
                          >
                            {formatBytes(file.file_size)}
                            {file.download_count > 0
                              ? ` · ${file.download_count} pobrań`
                              : ''}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {(folders.data?.length ?? 0) === 0 && (files.data?.length ?? 0) === 0 ? (
              <View className="items-center mt-12 px-6">
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 18,
                    backgroundColor: '#cffafe',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 12,
                  }}
                >
                  <FolderOpen size={28} color="#0891b2" />
                </View>
                <Text
                  className="text-[16px]"
                  style={{ color: '#0c0a09', fontFamily: 'Inter_600SemiBold' }}
                >
                  Pusty folder
                </Text>
                <Text
                  className="text-[13px] text-center mt-1"
                  style={{ color: '#78716c', fontFamily: 'Inter_400Regular' }}
                >
                  Brak plików i podfolderów.
                </Text>
              </View>
            ) : null}
          </ScrollView>
        )}
      </View>
    </>
  );
}
