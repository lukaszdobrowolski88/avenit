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

const ICON_BY_TYPE = {
  pdf: { Icon: FileText, tint: '#dc2626', bg: '#fee2e2' },
  image: { Icon: ImageIcon, tint: '#2563eb', bg: '#dbeafe' },
  audio: { Icon: FileAudio, tint: '#16a34a', bg: '#dcfce7' },
  video: { Icon: FileVideo, tint: '#7c3aed', bg: '#ede9fe' },
  doc: { Icon: FileText, tint: '#0891b2', bg: '#cffafe' },
  other: { Icon: FileIcon, tint: '#7A7466', bg: '#E3DDD0' },
} as const;

export default function SharedMaterialsScreen() {
  const { data, isLoading, isError, error, refetch, isRefetching } = useSharedMaterials();
  const files = (data ?? []) as SharedFile[];

  const open = async (file: SharedFile) => {
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
            <Text style={{ color: '#e11d48', textAlign: 'center', fontFamily: 'Manrope_500Medium' }}>
              {(error as Error)?.message ?? 'Błąd'}
            </Text>
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
                backgroundColor: '#ecfeff',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}
            >
              <Share2 size={28} color="#0891b2" />
            </View>
            <Text style={{ fontSize: 16, color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}>
              Nic tu jeszcze nie ma
            </Text>
            <Text
              style={{ fontSize: 13, color: '#7A7466', textAlign: 'center', marginTop: 4, fontFamily: 'Manrope_400Regular' }}
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
                    <Text style={{ fontSize: 12, color: '#A8A59E', marginTop: 2, fontFamily: 'Manrope_500Medium' }}>
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
