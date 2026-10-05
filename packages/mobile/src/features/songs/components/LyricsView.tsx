import { Platform, Text, View } from 'react-native';
import { transposeChord } from '../../../lib/domain';

// Tekst pieśni (`songs.lyrics`) — jak na webie zwykły tekst: sekcje oddzielone pustą linią,
// „pusty slajd” = pusty slajd w prezentacji (pokazujemy wyciszony). Akordy w nawiasach
// ([Am], [D/F#]) obsługujemy tylko, gdy to naprawdę akordy — [Refren] to etykieta sekcji.

interface Props {
  lyrics: string;
  fromKey: string;
  toKey: string;
  scale?: number;
}

const BRACKET = /\[([^\]]+)\]/g;
const IS_CHORD = /^[A-G](#|b)?(maj|min|m|M|sus|add|dim|aug|\+|°|ø)?\d*(\([^)]*\))?((sus|add|maj)\d+)*(\/[A-G](#|b)?)?$/;
const monospace = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
const SECTION = /^\s*(\[[^\]]+\]|(zwrotka|refren|ref\.?|bridge|intro|outro|pre-?chorus|chorus|verse|tag|coda)\b[^a-ząćęłńóśźż]*)\s*:?\s*$/i;

const parseLine = (line: string, fromKey: string, toKey: string) => {
  const chords: { idx: number; chord: string }[] = [];
  let lastIndex = 0;
  let plain = '';
  for (const match of line.matchAll(BRACKET)) {
    const inner = match[1].trim();
    if (!IS_CHORD.test(inner)) continue; // etykieta, nie akord — zostaje w tekście
    plain += line.slice(lastIndex, match.index ?? 0);
    const chord = fromKey && toKey && fromKey !== toKey ? transposeChord(inner, fromKey, toKey) : inner;
    chords.push({ idx: plain.length, chord });
    lastIndex = (match.index ?? 0) + match[0].length;
  }
  plain += line.slice(lastIndex);
  return { plain, chords };
};

export const LyricsView = ({ lyrics, fromKey, toKey, scale = 1 }: Props) => {
  const sections = lyrics
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((s) => s.replace(/^\n+|\n+$/g, ''))
    .filter((s) => s.length > 0);
  const size = 17 * scale;

  return (
    <View style={{ gap: 18 * scale }}>
      {sections.map((section, si) => (
        <View key={si}>
          {section.split('\n').map((line, li) => {
            if (/^\s*pusty slajd\s*$/i.test(line)) {
              return (
                <Text key={li} style={{ fontSize: 12 * scale, color: '#B5AE9E', fontFamily: 'Manrope_600SemiBold', letterSpacing: 0.6 }}>
                  — pusty slajd —
                </Text>
              );
            }
            if (SECTION.test(line)) {
              return (
                <Text
                  key={li}
                  style={{ marginBottom: 4, fontSize: 11 * scale, letterSpacing: 1.2, textTransform: 'uppercase', color: '#8A6606', fontFamily: 'Manrope_700Bold' }}
                >
                  {line.trim().replace(/^\[|\]$/g, '').replace(/:$/, '')}
                </Text>
              );
            }
            const { plain, chords } = parseLine(line, fromKey, toKey);
            if (chords.length === 0) {
              return (
                <Text key={li} style={{ fontSize: size, lineHeight: size * 1.45, color: '#2A2312', fontFamily: 'Manrope_500Medium' }}>
                  {plain || ' '}
                </Text>
              );
            }
            const chordRow = chords
              .map((c, j) => {
                const prev = j === 0 ? 0 : chords[j - 1].idx + chords[j - 1].chord.length;
                return ' '.repeat(Math.max(j === 0 ? 0 : 1, c.idx - prev)) + c.chord;
              })
              .join('');
            return (
              <View key={li} style={{ marginBottom: 2 }}>
                <Text style={{ fontSize: 14 * scale, color: '#8A6606', fontFamily: monospace, fontWeight: '700' }}>{chordRow}</Text>
                <Text style={{ fontSize: 15 * scale, color: '#2A2312', fontFamily: monospace }}>{plain || ' '}</Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
};
