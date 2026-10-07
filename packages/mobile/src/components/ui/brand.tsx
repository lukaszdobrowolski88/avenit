import { Children, isValidElement, type ReactNode } from 'react';
import { Pressable, Text, View, type ViewStyle } from 'react-native';
import { ArrowUpRight, ChevronRight, type LucideIcon } from 'lucide-react-native';

// Klocki list w stylu księgi znaku Avenit (grafiki_avenit): papier, słód, kurkuma.
// Różnorodność bez tęczy kolorów: grupowanie, etykiety sekcji, ciemna karta wyróżnienia
// i treść na początku wiersza (dzień, tonacja, monogram) zamiast identycznych ikon.
export const B = {
  paper: '#F6F4EE',
  paper2: '#ECE8DE',
  card: '#FFFFFF',
  line: '#ECE8DE',
  ink: '#2A2312', // słód
  ink2: '#4A463E',
  ink3: '#6B6557',
  // Tekst drugorzędny/podpowiedzi: #6E685A = 5,5:1 na bieli i 5,0:1 na papierze (jak web po
  // audycie; dawny jaśniejszy odcień miał 3,9/3,6:1 — poniżej WCAG 1.4.3).
  ink4: '#6E685A',
  kurkuma: '#FFBE0B',
  kurkumaSoft: '#FFF1C2',
  gold: '#8A6606',
  goldDeep: '#6B4F05',
  onDark: '#F6F4EE',
  onDarkMuted: '#CFC8B6',
  // Pola formularzy (jak web): biel + ramka #B5AD99 (2,2:1 — widać, gdzie zaczyna się pole).
  field: '#FFFFFF',
  fieldBorder: '#B5AD99',
  // Statusy: stonowane, tekst ≥ 4,5:1 na swoim tle — bez tęczy.
  okBg: '#E7F3EA',
  okFg: '#1E6B34',
  dangerBg: '#FDE7E4',
  danger: '#B42318',
} as const;

// Styl pola tekstowego zgodny z webem — do rozwinięcia w `style` TextInput:
//   <TextInput style={fieldStyle} placeholderTextColor={B.ink4} … />
export const fieldStyle = {
  minHeight: 48,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: B.fieldBorder,
  backgroundColor: B.field,
  paddingHorizontal: 14,
  paddingVertical: 12,
  fontSize: 15,
  color: B.ink,
  fontFamily: 'Manrope_500Medium',
} as const;

const FONT = {
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
} as const;

// Etykieta sekcji jak „PROGRAMY” na plakacie: musztarda, wersaliki, rozstrzelone.
export const SectionLabel = ({ children, count, style }: { children: string; count?: number; style?: ViewStyle }) => (
  <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18, marginBottom: 10, paddingHorizontal: 4 }, style]}>
    <Text style={{ fontSize: 12, letterSpacing: 1.3, textTransform: 'uppercase', color: B.gold, fontFamily: FONT.bold }}>
      {children}
    </Text>
    {count != null ? (
      <Text style={{ fontSize: 12, color: B.ink4, fontFamily: FONT.semibold }}>· {count}</Text>
    ) : null}
  </View>
);

// Grupa wierszy w jednej białej karcie — zamiast stosu osobnych pudełek.
// Ostatniemu wierszowi automatycznie wyłącza separator.
export const ListCard = ({ children, style }: { children: ReactNode; style?: ViewStyle }) => {
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <View style={[{ borderRadius: 22, backgroundColor: B.card, overflow: 'hidden' }, style]}>
      {items.map((child, i) =>
        i === items.length - 1 && child.type === ListRow
          ? { ...child, props: { ...(child.props as object), last: true } }
          : child,
      )}
    </View>
  );
};

interface RowProps {
  leading?: ReactNode;
  title: string;
  subtitle?: string | null;
  // Dodatkowa linia pod podtytułem (np. kampus, rola).
  meta?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  // Bez strzałki (np. wiersz z własną akcją po prawej).
  noChevron?: boolean;
  last?: boolean;
  // Wcięcie separatora (domyślnie pod treścią, za elementem wiodącym).
  dividerInset?: number;
}

export const ListRow = ({
  leading,
  title,
  subtitle,
  meta,
  right,
  onPress,
  onLongPress,
  noChevron,
  last,
  dividerInset,
}: RowProps) => (
  <Pressable
    onPress={onPress}
    onLongPress={onLongPress}
    disabled={!onPress && !onLongPress}
    className="active:opacity-70"
    style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14 }}
  >
    {leading}
    <View style={{ flex: 1 }}>
      <Text numberOfLines={1} style={{ fontSize: 16, color: B.ink, letterSpacing: -0.3, fontFamily: FONT.semibold }}>
        {title}
      </Text>
      {subtitle ? (
        <Text numberOfLines={2} style={{ fontSize: 13, color: B.ink3, marginTop: 2, fontFamily: FONT.medium }}>
          {subtitle}
        </Text>
      ) : null}
      {meta}
    </View>
    {right}
    {!noChevron && onPress ? <ChevronRight size={18} color={B.ink4} /> : null}
    {!last ? (
      <View
        style={{
          position: 'absolute',
          left: dividerInset ?? (leading ? 76 : 16),
          right: 0,
          bottom: 0,
          height: 1,
          backgroundColor: B.line,
        }}
      />
    ) : null}
  </Pressable>
);

// Ikona w kółku. Ton „slod” = ciemne kółko (wyróżnienie), „kurkuma” = znak marki.
export const IconWell = ({
  Icon,
  tone = 'paper',
  size = 46,
}: {
  Icon: LucideIcon;
  tone?: 'paper' | 'kurkuma' | 'slod';
  size?: number;
}) => {
  const bg = tone === 'slod' ? B.ink : tone === 'kurkuma' ? B.kurkuma : B.paper2;
  const fg = tone === 'slod' ? B.kurkuma : B.ink;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon size={Math.round(size * 0.44)} color={fg} strokeWidth={2} />
    </View>
  );
};

// Trzy tony marki dla monogramów — różnorodność bez tęczy (stały ton dla tej samej nazwy).
const TONES = [
  { bg: B.paper2, fg: B.ink },
  { bg: B.kurkumaSoft, fg: B.goldDeep },
  { bg: B.ink, fg: B.kurkuma },
] as const;

export const toneFor = (seed: string) => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return TONES[Math.abs(h) % TONES.length];
};

export const initials = (name: string) => {
  const parts = name.replace(/["„”]/g, '').trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? '?';
  const b = parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] ?? '';
  return (a + b).toUpperCase();
};

// `onDark` — na ciemnej karcie (słód) zawsze kurkuma, żeby kółko nie zlało się z tłem.
export const Monogram = ({ name, size = 46, onDark }: { name: string; size?: number; onDark?: boolean }) => {
  const tone = onDark ? { bg: B.kurkuma, fg: B.ink } : toneFor(name);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tone.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: Math.round(size * 0.34), color: tone.fg, fontFamily: FONT.bold, letterSpacing: -0.3 }}>
        {initials(name)}
      </Text>
    </View>
  );
};

// Blok informacji na początku wiersza: duży skrót (dzień, data, tonacja) + mały dopisek.
export const InfoBlock = ({ top, bottom, dark }: { top: string; bottom?: string | null; dark?: boolean }) => (
  <View
    style={{
      width: 52,
      height: 52,
      borderRadius: 16,
      backgroundColor: dark ? B.ink : B.paper2,
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <Text style={{ fontSize: top.length > 3 ? 14 : 17, lineHeight: 20, color: dark ? B.kurkuma : B.ink, fontFamily: FONT.bold, letterSpacing: -0.4 }}>
      {top}
    </Text>
    {bottom ? (
      <Text style={{ fontSize: 11, color: dark ? B.onDarkMuted : B.ink3, fontFamily: FONT.semibold }}>{bottom}</Text>
    ) : null}
  </View>
);

// Ciemna karta wyróżnienia (wariant „słód” z grafik marki) — główne wejście na ekranie.
export const FeatureCard = ({
  Icon,
  title,
  subtitle,
  onPress,
  style,
}: {
  Icon: LucideIcon;
  title: string;
  subtitle?: string;
  onPress: () => void;
  style?: ViewStyle;
}) => (
  <Pressable
    onPress={onPress}
    className="active:opacity-85"
    style={[{ borderRadius: 24, backgroundColor: B.ink, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 }, style]}
  >
    <IconWell Icon={Icon} tone="kurkuma" />
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 17, color: B.onDark, letterSpacing: -0.4, fontFamily: FONT.bold }}>{title}</Text>
      {subtitle ? (
        <Text style={{ fontSize: 13, color: B.onDarkMuted, marginTop: 2, fontFamily: FONT.medium }}>{subtitle}</Text>
      ) : null}
    </View>
    <View
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: 'rgba(246,244,238,0.25)',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <ArrowUpRight size={17} color={B.onDark} strokeWidth={2} />
    </View>
  </Pressable>
);

// Kafel 1/2 szerokości (jak „Twoje moduły” na pulpicie). `dark` = wariant słód.
export const Tile = ({
  Icon,
  title,
  subtitle,
  onPress,
  dark,
  width,
}: {
  Icon: LucideIcon;
  title: string;
  subtitle?: string;
  onPress: () => void;
  dark?: boolean;
  width: number;
}) => (
  <Pressable
    onPress={onPress}
    className="active:opacity-80"
    style={{
      width,
      minHeight: 136,
      borderRadius: 24,
      padding: 16,
      backgroundColor: dark ? B.ink : B.card,
      justifyContent: 'space-between',
    }}
  >
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <IconWell Icon={Icon} tone={dark ? 'kurkuma' : 'paper'} size={44} />
      <ArrowUpRight size={17} color={dark ? B.onDarkMuted : B.ink4} strokeWidth={2} />
    </View>
    <View style={{ marginTop: 14 }}>
      <Text style={{ fontSize: 16, color: dark ? B.onDark : B.ink, letterSpacing: -0.3, fontFamily: FONT.bold }}>{title}</Text>
      {subtitle ? (
        <Text numberOfLines={2} style={{ fontSize: 12, color: dark ? B.onDarkMuted : B.ink3, marginTop: 2, fontFamily: FONT.medium }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  </Pressable>
);
