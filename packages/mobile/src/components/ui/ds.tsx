// Komponenty design-systemu „north-star". Spójne karty, chipy modułów, kafle,
// nagłówki sekcji, pill-buttony, hero. Wszystko przez useDS() (tryb jasny/ciemny).
import type { ReactNode } from 'react';
import { Pressable, Text, View, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import type { LucideIcon } from 'lucide-react-native';
import {
  useDS, radius, font, space, cardShadow, accentShadow, tintBg, tintInk, grad, type Tint,
} from '../../theme/ds';

/** Nagłówek sekcji: tytuł + opcjonalny link po prawej. */
export const SectionHeader = ({
  title, actionLabel, onAction,
}: { title: string; actionLabel?: string; onAction?: () => void }) => {
  const { c } = useDS();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: space.section, paddingTop: space.section, paddingBottom: 12 }}>
      <Text style={{ fontFamily: font.display, fontSize: 18, letterSpacing: -0.3, color: c.ink }}>{title}</Text>
      {actionLabel ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={{ fontFamily: font.semibold, fontSize: 13, color: c.amberDeep }}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
};

/** Karta bazowa. */
export const DSCard = ({ children, style }: { children: ReactNode; style?: ViewStyle }) => {
  const { dark, c } = useDS();
  return (
    <View style={[{ backgroundColor: c.card, borderRadius: radius.card, borderWidth: 1, borderColor: c.line, marginHorizontal: space.screen }, cardShadow(dark), style]}>
      {children}
    </View>
  );
};

/** Kwadratowy chip ikony (kolorowy kod modułu). */
export const IconChip = ({ Icon, tint, size = 44, iconSize = 21 }: { Icon: LucideIcon; tint: Tint; size?: number; iconSize?: number }) => {
  const { c } = useDS();
  return (
    <View style={{ width: size, height: size, borderRadius: radius.icon, backgroundColor: tintBg(c, tint), alignItems: 'center', justifyContent: 'center' }}>
      <Icon size={iconSize} color={tintInk(c, tint)} strokeWidth={1.9} />
    </View>
  );
};

/** Szybki dostęp: chip 60px + etykieta. */
export const ModuleChip = ({ Icon, tint, label, onPress }: { Icon: LucideIcon; tint: Tint; label: string; onPress?: () => void }) => {
  const { dark, c } = useDS();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ alignItems: 'center', gap: 8, flex: 1, opacity: pressed ? 0.7 : 1 })}>
      <View style={[{ width: 60, height: 60, borderRadius: radius.chip, backgroundColor: tintBg(c, tint), alignItems: 'center', justifyContent: 'center' }, cardShadow(dark)]}>
        <Icon size={25} color={tintInk(c, tint)} strokeWidth={1.9} />
      </View>
      <Text style={{ fontFamily: font.semibold, fontSize: 12, color: c.ink, letterSpacing: -0.1 }}>{label}</Text>
    </Pressable>
  );
};

/** Kafel statystyki: chip ikony + duża liczba + etykieta. */
export const StatTile = ({ Icon, tint, value, label }: { Icon: LucideIcon; tint: Tint; value: number | string; label: string }) => {
  const { dark, c } = useDS();
  return (
    <View style={[{ flex: 1, backgroundColor: c.card, borderRadius: radius.tile, borderWidth: 1, borderColor: c.line, padding: 14 }, cardShadow(dark)]}>
      <IconChip Icon={Icon} tint={tint} size={30} iconSize={16} />
      <Text style={{ fontFamily: font.heavy, fontSize: 30, letterSpacing: -0.9, color: c.ink, marginTop: 10, fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text style={{ fontFamily: font.semibold, fontSize: 12, color: c.inkSoft, marginTop: 4 }}>{label}</Text>
    </View>
  );
};

/** Pill-button. warianty: primary (bursztyn), light (biały), tint. */
export const Pill = ({
  label, Icon, onPress, variant = 'primary', tint = 'amber', small,
}: { label: string; Icon?: LucideIcon; onPress?: () => void; variant?: 'primary' | 'light' | 'tint'; tint?: Tint; small?: boolean }) => {
  const { c } = useDS();
  let bg = c.amber, fg = c.onAccent, shadow: ViewStyle = accentShadow(c.amber);
  if (variant === 'light') { bg = '#FFFFFF'; fg = c.amberDeep; shadow = {}; }
  if (variant === 'tint') { bg = tintBg(c, tint); fg = tintInk(c, tint); shadow = {}; }
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: bg, borderRadius: small ? radius.sm : radius.pill, paddingVertical: small ? 9 : 11, paddingHorizontal: small ? 14 : 16, opacity: pressed ? 0.85 : 1 }, shadow]}>
      {Icon ? <Icon size={small ? 15 : 16} color={fg} strokeWidth={2.1} /> : null}
      <Text style={{ fontFamily: font.bold, fontSize: small ? 13 : 14, color: fg }}>{label}</Text>
    </Pressable>
  );
};

/** Hero — ciepła karta bursztynowa z gradientem (SVG), tag, tytuł, meta, akcja. */
export const HeroCard = ({
  tag, title, meta, actionLabel, onAction, right,
}: { tag?: string; title: string; meta?: ReactNode; actionLabel?: string; onAction?: () => void; right?: ReactNode }) => {
  const { c } = useDS();
  return (
    <View style={[{ marginHorizontal: space.screen, borderRadius: 26, overflow: 'hidden' }, accentShadow(c.amber)]}>
      <Svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0, bottom: 0, right: 0 }}>
        <Defs>
          <LinearGradient id="heroG" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={grad.amber[0]} />
            <Stop offset="0.55" stopColor={grad.amber[1]} />
            <Stop offset="1" stopColor={grad.amber[2]} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#heroG)" />
      </Svg>
      <View style={{ padding: 20 }}>
        {tag ? (
          <View style={{ alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.24)', paddingVertical: 5, paddingHorizontal: 11, borderRadius: 20 }}>
            <Text style={{ fontFamily: font.bold, fontSize: 11.5, letterSpacing: 0.6, color: '#fff', textTransform: 'uppercase' }}>{tag}</Text>
          </View>
        ) : null}
        <Text style={{ fontFamily: font.display, fontSize: 25, letterSpacing: -0.5, color: '#fff', marginTop: 13 }}>{title}</Text>
        {meta ? <View style={{ marginTop: 6 }}>{meta}</View> : null}
        {(actionLabel || right) ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
            <View>{right}</View>
            {actionLabel ? <Pill label={actionLabel} variant="light" onPress={onAction} /> : <View />}
          </View>
        ) : null}
      </View>
    </View>
  );
};
