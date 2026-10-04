import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import type { LucideIcon } from 'lucide-react-native';

// Wspólne klocki zakładek zespołu — miękkie karty bez ramek i pasków.

export const parseYmd = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};

export const dayLabel = (ymd: string) => {
  if (!ymd) return '';
  const date = parseYmd(ymd);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return 'Dziś';
  if (diff === 1) return 'Jutro';
  if (diff === -1) return 'Wczoraj';
  const w = format(date, diff > 0 && diff < 7 ? 'EEEE' : 'EEEE, d MMMM', { locale: pl });
  return w.charAt(0).toUpperCase() + w.slice(1);
};

export const DateBlock = ({ ymd, tint = '#0e7490', bg = '#f0fdff' }: { ymd: string; tint?: string; bg?: string }) => {
  const date = ymd ? parseYmd(ymd) : null;
  return (
    <View
      style={{
        width: 46,
        height: 48,
        borderRadius: 13,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: 17, lineHeight: 20, color: tint, fontFamily: 'Manrope_700Bold' }}>
        {date ? date.getDate() : '—'}
      </Text>
      <Text style={{ fontSize: 10, color: tint, fontFamily: 'Manrope_600SemiBold', textTransform: 'uppercase' }}>
        {date ? format(date, 'LLL', { locale: pl }) : ''}
      </Text>
    </View>
  );
};

export const Card = ({ children, onPress }: { children: ReactNode; onPress?: () => void }) =>
  onPress ? (
    <Pressable
      onPress={onPress}
      className="active:opacity-70"
      style={{ borderRadius: 18, backgroundColor: '#EFEBE2', padding: 14, marginBottom: 10 }}
    >
      {children}
    </Pressable>
  ) : (
    <View style={{ borderRadius: 18, backgroundColor: '#EFEBE2', padding: 14, marginBottom: 10 }}>{children}</View>
  );

export const Pill = ({ text, tint, bg }: { text: string; tint: string; bg: string }) => (
  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: bg }}>
    <Text style={{ fontSize: 11, color: tint, fontFamily: 'Manrope_700Bold' }}>{text}</Text>
  </View>
);

export const STATUS_PILL: Record<string, { text: string; tint: string; bg: string }> = {
  accepted: { text: 'Potwierdzone', tint: '#15803d', bg: '#dcfce7' },
  pending: { text: 'Czeka', tint: '#a16207', bg: '#fef3c7' },
  rejected: { text: 'Odrzucone', tint: '#b91c1c', bg: '#fee2e2' },
};

export const Empty = ({ Icon, title, hint }: { Icon: LucideIcon; title: string; hint?: string }) => (
  <View style={{ paddingVertical: 48, alignItems: 'center', paddingHorizontal: 24 }}>
    <View
      style={{
        width: 56,
        height: 56,
        borderRadius: 18,
        backgroundColor: '#ECE8DE',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
      }}
    >
      <Icon size={24} color="#A8A59E" />
    </View>
    <Text style={{ fontSize: 15, color: '#2A2312', fontFamily: 'Manrope_600SemiBold', textAlign: 'center' }}>{title}</Text>
    {hint ? (
      <Text
        style={{
          fontSize: 13,
          lineHeight: 18,
          color: '#7A7466',
          marginTop: 4,
          textAlign: 'center',
          fontFamily: 'Manrope_400Regular',
        }}
      >
        {hint}
      </Text>
    ) : null}
  </View>
);

export const Loading = () => (
  <View style={{ paddingVertical: 40, alignItems: 'center' }}>
    <ActivityIndicator color="#2A2312" />
  </View>
);

export const AddButton = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <Pressable
    onPress={onPress}
    className="active:opacity-70"
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 46,
      borderRadius: 14,
      backgroundColor: '#2A2312',
      marginBottom: 14,
    }}
  >
    <Text style={{ fontSize: 14, color: '#ffffff', fontFamily: 'Manrope_600SemiBold' }}>+ {label}</Text>
  </Pressable>
);

export const SegmentChips = <T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) => (
  <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
    {options.map((o) => {
      const on = o.key === value;
      return (
        <Pressable
          key={o.key}
          onPress={() => onChange(o.key)}
          className="active:opacity-70"
          style={{
            paddingHorizontal: 12,
            paddingVertical: 7,
            borderRadius: 999,
            backgroundColor: on ? '#FFF1C2' : '#ECE8DE',
          }}
        >
          <Text style={{ fontSize: 13, color: on ? '#8A6606' : '#4A463E', fontFamily: 'Manrope_600SemiBold' }}>
            {o.label}
          </Text>
        </Pressable>
      );
    })}
  </View>
);

// Kwota bez Intl: 12 340 zł.
export const money = (n: number) =>
  `${Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} zł`;
