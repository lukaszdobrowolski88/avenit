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
import {
  File as FileIcon,
  FileAudio,
  FileText,
  FileVideo,
  Image as ImageIcon,
  Share2,
} from 'lucide-react-native';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import {
  useSharedMaterials,
  getDownloadUrl,
  formatBytes,
  fileIconType,
  type SharedFile,
} from '../../../src/features/materials/api';
import { friendlyError, showError } from '../../../src/lib/errors';

const ICON_BY_TYPE = {
  pdf: { Icon: FileText, tint: '#2A2312', bg: '#ECE8DE' },
  image: { Icon: ImageIcon, tint: '#2A2312', bg: '#ECE8DE' },
  audio: { Icon: FileAudio, tint: '#2A2312', bg: '#ECE8DE' },
  video: { Icon: FileVideo, tint: '#2A2312', bg: '#ECE8DE' },
  doc: { Icon: FileText, tint: '#2A2312', bg: '#ECE8DE' },
  other: { Icon: FileIcon, tint: '#6B6557', bg: '#E3DDD0' },
} as const;

export default function SharedMaterialsScreen() {
  const { data, isLoading, isError, error, refetch, isRefetching } = useSharedMaterials();
  const files = (data ?? []) as SharedFile[];

  const open = async (file: SharedFile) => {
    try {
      const url = await getDownloadUrl(file.storage_path);
      if (!url) {
        Alert.alert('Nie udało się otworzyć pliku', 'Brak adresu pliku. Spróbuj ponownie za chwilę.');
        return;
      }
      await Linking.openURL(url);
    } catch (e) {
      showError('Nie udało się otworzyć pliku', e, 'Spróbuj ponownie.');
    }
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: '#F6F4EE' }}>
        <PageHeader title="Udostępnione mi" subtitle="Pliki udostępnione Tobie i Twoim grupom" showBack />

        {isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#2A2312" />
          </View>
        ) : isError ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={{ color: '#4A463E', textAlign: 'center', fontFamily: 'Manrope_500Medium', lineHeight: 20 }}>
              {friendlyError(error, 'Nie udało się wczytać udostępnionych plików.')}
            </Text>
            <Pressable
              onPress={() => refetch()}
              className="active:opacity-70"
              style={{ marginTop: 14, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: '#2A2312' }}
            >
              <Text style={{ color: '#F6F4EE', fontFamily: 'Manrope_700Bold', fontSize: 14 }}>Spróbuj ponownie</Text>
            </Pressable>
          </View>
        ) : files.length === 0 ? (
          <ScrollView
            contentContainerStyle={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#2A2312" />}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 18,
                backgroundColor: '#F1EEE6',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}
            >
              <Share2 size={28} color="#2A2312" />
            </View>
            <Text style={{ fontSize: 16, color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}>
              Nic tu jeszcze nie ma
            </Text>
            <Text
              style={{ fontSize: 13, color: '#6B6557', textAlign: 'center', marginTop: 4, fontFamily: 'Manrope_400Regular' }}
            >
              Gdy ktoś udostępni Ci plik, pojawi się tutaj.
            </Text>
          </ScrollView>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#2A2312" />}
          >
            {files.map((f) => {
              const ic = ICON_BY_TYPE[fileIconType(f.mime_type)];
              return (
                <Pressable
                  key={f.id}
                  onPress={() => open(f)}
                  className="active:opacity-80"
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 14,
                    marginBottom: 8,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: '#E6E1D5',
                    backgroundColor: '#F6F4EE',
                  }}
                >
                  <View
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 12,
                      backgroundColor: ic.bg,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ic.Icon size={20} color={ic.tint} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }} numberOfLines={2}>
                      {f.name}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#6E685A', marginTop: 2, fontFamily: 'Manrope_500Medium' }}>
                      {formatBytes(f.file_size || 0)}
                      {f.shared_label && f.shared_label !== 'folder' ? ` · ${f.shared_label}` : ''}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>
    </>
  );
}
