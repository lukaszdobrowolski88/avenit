import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast, { type ToastConfig, type ToastConfigParams } from 'react-native-toast-message';
import { AlertCircle, Check, Info } from 'lucide-react-native';
import { B } from './brand';

// Toast w stylu marki: ciemna pigułka (słód), ikona w kółku — kurkuma = sukces,
// jasny czerwony = błąd, papier = informacja. Bez pasków-akcentów i tęczy.
type Tone = 'success' | 'error' | 'info';

const TONE: Record<Tone, { bg: string; fg: string; Icon: typeof Check }> = {
  success: { bg: B.kurkuma, fg: B.ink, Icon: Check },
  error: { bg: '#FDE7E4', fg: '#B42318', Icon: AlertCircle },
  info: { bg: B.paper2, fg: B.ink, Icon: Info },
};

const BrandToast = ({ tone, text1, text2, hide }: ToastConfigParams<unknown> & { tone: Tone }) => {
  const t = TONE[tone];
  return (
    <Pressable
      onPress={() => hide()}
      accessibilityRole="alert"
      accessibilityLabel={[text1, text2].filter(Boolean).join('. ')}
      style={{
        marginHorizontal: 16,
        alignSelf: 'stretch',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 22,
        backgroundColor: B.ink,
        shadowColor: B.ink,
        shadowOpacity: 0.18,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
        elevation: 10,
      }}
    >
      <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
        <t.Icon size={16} color={t.fg} strokeWidth={2.4} />
      </View>
      <View style={{ flex: 1 }}>
        {text1 ? (
          <Text numberOfLines={2} style={{ fontSize: 15, color: B.onDark, fontFamily: 'Manrope_700Bold', letterSpacing: -0.2 }}>
            {text1}
          </Text>
        ) : null}
        {text2 ? (
          <Text numberOfLines={4} style={{ marginTop: 2, fontSize: 13, lineHeight: 18, color: B.onDarkMuted, fontFamily: 'Manrope_500Medium' }}>
            {text2}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
};

const toastConfig: ToastConfig = {
  success: (p) => <BrandToast {...p} tone="success" />,
  error: (p) => <BrandToast {...p} tone="error" />,
  info: (p) => <BrandToast {...p} tone="info" />,
};

// Montowany raz w app/_layout.tsx (wewnątrz SafeAreaProvider).
export const ToastHost = () => {
  const insets = useSafeAreaInsets();
  return <Toast config={toastConfig} topOffset={insets.top + 8} />;
};
