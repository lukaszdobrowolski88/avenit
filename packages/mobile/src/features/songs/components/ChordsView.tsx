import { useMemo, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { chordsDocument, isHtml, renderChordsBars } from '../chordsBars';

// react-native-webview to moduł natywny — jak w SermonVideo: require w try/catch, a bez
// modułu (np. stary build) pokazujemy rozpiskę jako zwykły tekst.
let WV: any = null;
try {
  WV = require('react-native-webview');
} catch {
  WV = null;
}
const WebView: any = WV?.WebView ?? WV?.default ?? null;

const stripHtml = (s: string) =>
  s
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*div\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/​/g, '');

// Rozpiska akordów (takty) z transpozycją — wygląd jak na webie, wysokość dopasowana do treści.
export const ChordsView = ({ source, fromKey, toKey, scale }: { source: string; fromKey: string | null; toKey: string | null; scale: number }) => {
  const [height, setHeight] = useState(120);
  const html = useMemo(() => chordsDocument(renderChordsBars(source, fromKey, toKey), scale), [source, fromKey, toKey, scale]);

  if (!WebView) {
    return (
      <Text style={{ fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 14 * scale, lineHeight: 22 * scale, color: '#2A2312' }}>
        {isHtml(source) ? stripHtml(source) : source}
      </Text>
    );
  }
  return (
    <View style={{ height }}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        scrollEnabled={false}
        style={{ backgroundColor: 'transparent' }}
        containerStyle={{ backgroundColor: 'transparent' }}
        onMessage={(e: { nativeEvent: { data: string } }) => {
          const h = Number(e.nativeEvent.data);
          if (Number.isFinite(h) && h > 0) setHeight(Math.ceil(h * scale) + 4);
        }}
      />
    </View>
  );
};
