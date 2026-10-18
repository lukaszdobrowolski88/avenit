import type { ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View, type ViewStyle } from 'react-native';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { B } from '../../../components/ui/brand';
import { FONT as F } from '../../../lib/fonts';
import { useAsyncPress } from '../../../hooks/useAsyncPress';
import { STATUS_META, type CampaignStatus } from '../api';

export const StatusPill = ({ status }: { status: CampaignStatus }) => {
  const meta = STATUS_META[status] ?? STATUS_META.draft;
  return (
    <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: meta.bg }}>
      <Text numberOfLines={1} style={{ fontSize: 11, color: meta.fg, fontFamily: F.bold }}>
        {meta.label}
      </Text>
    </View>
  );
};

// Biała karta sekcji formularza (miękka pigułka, bez ramek i pasków).
export const Card = ({ children, style }: { children: ReactNode; style?: ViewStyle }) => (
  <View style={[{ borderRadius: 22, backgroundColor: B.card, padding: 16 }, style]}>{children}</View>
);

export const SectionTitle = ({ children, right }: { children: string; right?: ReactNode }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 22, marginBottom: 10, paddingHorizontal: 4 }}>
    <Text style={{ flex: 1, fontSize: 12, letterSpacing: 1.3, textTransform: 'uppercase', color: B.gold, fontFamily: F.bold }}>
      {children}
    </Text>
    {right}
  </View>
);

// Podpowiedź / licznik pod polem.
export const Hint = ({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'warn' | 'danger' }) => (
  <Text
    style={{
      marginTop: 6,
      marginLeft: 2,
      fontSize: 12,
      lineHeight: 17,
      color: tone === 'warn' ? B.goldDeep : tone === 'danger' ? B.danger : B.ink4,
      fontFamily: F.medium,
    }}
  >
    {children}
  </Text>
);

// Drugorzędny przycisk — biała miękka pigułka (obok głównego PrimaryButton).
export const SecondaryButton = ({ label, onPress, disabled }: { label: string; onPress: () => unknown; disabled?: boolean }) => {
  const { busy, press } = useAsyncPress(onPress);
  return (
    <Pressable
      onPress={press}
      disabled={busy || disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy }}
      className="active:opacity-70"
      style={{
        height: 50,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: B.card,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {busy ? <ActivityIndicator color={B.ink} /> : <Text style={{ fontSize: 15, color: B.ink, fontFamily: F.bold }}>{label}</Text>}
    </Pressable>
  );
};

// Kafel wskaźnika (statystyki): wartość + podpis; podpis nie łamie się w środku słowa.
export const StatTile = ({ label, value, sub, dark }: { label: string; value: string; sub?: string | null; dark?: boolean }) => (
  <View style={{ flexBasis: '30%', flexGrow: 1, minWidth: 96, borderRadius: 18, padding: 12, backgroundColor: dark ? B.ink : B.card }}>
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.75}
      style={{ fontSize: 11, color: dark ? B.kurkuma : B.gold, letterSpacing: 1, textTransform: 'uppercase', fontFamily: F.bold }}
    >
      {label}
    </Text>
    <Text numberOfLines={1} adjustsFontSizeToFit style={{ marginTop: 3, fontSize: 21, color: dark ? B.onDark : B.ink, letterSpacing: -0.5, fontFamily: F.bold }}>
      {value}
    </Text>
    {sub ? (
      <Text numberOfLines={1} style={{ fontSize: 11, color: dark ? B.onDarkMuted : B.ink4, fontFamily: F.semibold }}>
        {sub}
      </Text>
    ) : null}
  </View>
);

export const fmtDay = (iso: string | null | undefined) => (iso ? format(new Date(iso), 'd MMM yyyy', { locale: pl }) : '—');
export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? format(new Date(iso), 'd MMM yyyy, HH:mm', { locale: pl }) : '—';

// Alert z potwierdzeniem jako Promise<boolean>.
export const confirmAsync = (title: string, message: string, okLabel: string, destructive = false) =>
  new Promise<boolean>((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Anuluj', style: 'cancel', onPress: () => resolve(false) },
        { text: okLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });

// „1 odbiorca”, „2 odbiorców”… — polska odmiana dla liczników.
export const recipientsWord = (n: number) => {
  if (n === 1) return 'odbiorca';
  const d = n % 10;
  const t = n % 100;
  if (d >= 2 && d <= 4 && (t < 12 || t > 14)) return 'odbiorcy';
  return 'odbiorców';
};
