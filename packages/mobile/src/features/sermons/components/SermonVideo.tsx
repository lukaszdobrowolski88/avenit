import { Linking, Pressable, Text, View } from 'react-native';
import { PlaySquare } from 'lucide-react-native';

// react-native-webview to moduł NATYWNY — obecny dopiero w buildzie EAS z tą zależnością.
// require w try/catch chroni przed crashem (np. gdy JS trafi OTA na starszy build bez
// modułu) — wtedy pokazujemy przycisk „otwórz zewnętrznie" (dotychczasowe zachowanie).
let WV: any = null;
try {
  WV = require('react-native-webview');
} catch {
  WV = null;
}
const WebView: any = WV?.WebView ?? WV?.default ?? null;
const webviewAvailable = !!WebView;

// Zamiana linku na URL do osadzenia (YouTube/Vimeo); inne — ładujemy wprost.
const toEmbedUrl = (url: string): string => {
  try {
    const u = url.trim();
    // YouTube: watch?v= / youtu.be/ / shorts/ / embed/
    const yt =
      u.match(/[?&]v=([\w-]{6,})/) ||
      u.match(/youtu\.be\/([\w-]{6,})/) ||
      u.match(/youtube\.com\/shorts\/([\w-]{6,})/) ||
      u.match(/youtube\.com\/embed\/([\w-]{6,})/);
    if (yt) return `https://www.youtube.com/embed/${yt[1]}?playsinline=1&rel=0`;
    // Vimeo: vimeo.com/<id>
    const vm = u.match(/vimeo\.com\/(?:video\/)?(\d{6,})/);
    if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
    return u;
  } catch {
    return url;
  }
};

const OpenButton = ({ url }: { url: string }) => (
  <Pressable
    onPress={() => Linking.openURL(url)}
    className="flex-row items-center justify-center gap-2 mb-4 active:opacity-80"
    style={{ paddingVertical: 12, borderRadius: 14, backgroundColor: '#fee2e2' }}
  >
    <PlaySquare size={18} color="#dc2626" />
    <Text className="text-[14px]" style={{ color: '#dc2626', fontFamily: 'Inter_700Bold' }}>
      Obejrzyj wideo
    </Text>
  </Pressable>
);

export const SermonVideo = ({ url }: { url: string }) => {
  if (!webviewAvailable) return <OpenButton url={url} />;

  const embed = toEmbedUrl(url);
  return (
    <View className="mb-4">
      <View
        style={{
          width: '100%',
          aspectRatio: 16 / 9,
          borderRadius: 14,
          overflow: 'hidden',
          backgroundColor: '#000000',
        }}
      >
        <WebView
          source={{ uri: embed }}
          style={{ flex: 1, backgroundColor: '#000000' }}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction
          allowsFullscreenVideo
          javaScriptEnabled
          domStorageEnabled
          originWhitelist={['*']}
        />
      </View>
      <Pressable
        onPress={() => Linking.openURL(url)}
        className="flex-row items-center justify-center gap-1.5 mt-2 active:opacity-70"
        style={{ paddingVertical: 8 }}
      >
        <PlaySquare size={14} color="#dc2626" />
        <Text className="text-[12px]" style={{ color: '#dc2626', fontFamily: 'Inter_600SemiBold' }}>
          Otwórz w aplikacji wideo
        </Text>
      </Pressable>
    </View>
  );
};
