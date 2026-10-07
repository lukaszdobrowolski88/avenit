import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { D, F } from '../theme';

interface HeadingProps {
  title: string;
  // Licznik obok tytułu (kółko w kurkumie) — tylko gdy > 0.
  count?: number;
  // Własny element po prawej albo link tekstowy (actionLabel + onAction).
  action?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}

// Nagłówek sekcji pulpitu: na tle strony, nad kartą — tytuł, licznik, „Zobacz wszystko”.
export const SectionHeading = ({ title, count, action, actionLabel, onAction }: HeadingProps) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, marginBottom: 12 }}>
    <Text style={{ fontSize: 20, lineHeight: 25, letterSpacing: -0.6, color: D.ink, fontFamily: F.bold }}>{title}</Text>
    {count ? (
      <View
        style={{
          minWidth: 24,
          height: 24,
          paddingHorizontal: 7,
          borderRadius: 12,
          backgroundColor: D.accent,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 12, color: D.ink, fontFamily: F.bold }}>{count > 99 ? '99+' : count}</Text>
      </View>
    ) : null}
    <View style={{ flex: 1 }} />
    {action ??
      (actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={10} className="active:opacity-60">
          <Text style={{ fontSize: 14, color: D.ink2, fontFamily: F.semibold }}>{actionLabel}</Text>
        </Pressable>
      ) : null)}
  </View>
);

// Pusty stan w jednej linii (bez dużej ikony) — pulpit zostaje zwarty. `hint` mówi, kiedy
// coś się tu pojawi (jak podtytuł EmptyState na webie), akcja — pierwszy krok.
export const EmptyRow = ({
  text,
  hint,
  actionLabel,
  onAction,
}: {
  text: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
}) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 }}>
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 14, color: D.ink, fontFamily: F.semibold }}>{text}</Text>
      {hint ? <Text style={{ marginTop: 2, fontSize: 13, lineHeight: 18, color: D.ink2, fontFamily: F.medium }}>{hint}</Text> : null}
    </View>
    {actionLabel && onAction ? (
      <Pressable
        onPress={onAction}
        accessibilityRole="button"
        className="active:opacity-70"
        style={{ paddingHorizontal: 14, minHeight: 36, borderRadius: 18, backgroundColor: D.accentSoft, justifyContent: 'center' }}
      >
        <Text style={{ fontSize: 13, color: D.ink, fontFamily: F.semibold }}>{actionLabel}</Text>
      </Pressable>
    ) : null}
  </View>
);

interface Props extends HeadingProps {
  children: ReactNode;
  // Treść bez wspólnej białej karty (np. osobne karty zaproszeń).
  bare?: boolean;
}

// Sekcja pulpitu: nagłówek na tle strony + biała karta. Kartę oddziela od strony
// samo tło — bez ramek, cieni i kolorowych ikon przy tytule.
export const WidgetCard = ({ children, bare, ...heading }: Props) => (
  <View style={{ marginBottom: 28 }}>
    <SectionHeading {...heading} />
    {bare ? (
      children
    ) : (
      <View style={{ marginHorizontal: 16, borderRadius: D.radius, backgroundColor: D.card, overflow: 'hidden' }}>
        {children}
      </View>
    )}
  </View>
);
