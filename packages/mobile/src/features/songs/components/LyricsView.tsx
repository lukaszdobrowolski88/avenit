import { Platform, Text, View } from 'react-native';
import { transposeChord } from '../../../lib/domain';

interface Props {
  lyrics: string;
  fromKey: string;
  toKey: string;
}

const CHORD_RE = /\[([^\]]+)\]/g;
const monospace = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

const parseLine = (line: string, fromKey: string, toKey: string) => {
  const chords: { idx: number; chord: string }[] = [];
  let lastIndex = 0;
  let plain = '';
  for (const match of line.matchAll(CHORD_RE)) {
    const before = line.slice(lastIndex, match.index ?? 0);
    plain += before;
    const original = match[1];
    const transposed =
      fromKey && toKey && fromKey !== toKey ? transposeChord(original, fromKey, toKey) : original;
    chords.push({ idx: plain.length, chord: transposed });
    lastIndex = (match.index ?? 0) + match[0].length;
  }
  plain += line.slice(lastIndex);
  return { plain, chords };
};

export const LyricsView = ({ lyrics, fromKey, toKey }: Props) => {
  const lines = lyrics.split('\n');
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 16 }}>
      {lines.map((line, i) => {
        const { plain, chords } = parseLine(line, fromKey, toKey);
        if (chords.length === 0) {
          return (
            <Text
              key={i}
              style={{
                fontSize: 15,
                color: '#0c0a09',
                marginBottom: 4,
                fontFamily: monospace,
              }}
            >
              {plain || ' '}
            </Text>
          );
        }
        const chordRow = chords
          .map((c, j) => {
            const prevIdx = j === 0 ? 0 : chords[j - 1].idx + chords[j - 1].chord.length;
            const padding = Math.max(0, c.idx - prevIdx);
            return ' '.repeat(padding) + c.chord;
          })
          .join('');
        return (
          <View key={i} style={{ marginBottom: 8 }}>
            <Text
              style={{
                fontSize: 13,
                color: '#be185d',
                fontFamily: monospace,
                fontWeight: '700',
              }}
            >
              {chordRow}
            </Text>
            <Text
              style={{
                fontSize: 15,
                color: '#0c0a09',
                fontFamily: monospace,
              }}
            >
              {plain || ' '}
            </Text>
          </View>
        );
      })}
    </View>
  );
};
