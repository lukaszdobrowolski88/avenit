import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, View } from 'react-native';
import { useRootNavigationState, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar, Home, LayoutGrid, MessageCircle, type LucideIcon } from 'lucide-react-native';
import { usePermissions } from '../../lib/permissions';
import { useT } from '../../i18n';
import { goToTab, readTabsState, setOnTabs, type TabName } from '../../lib/navigation';
import { AccountTabIcon } from './AccountTabIcon';

// Kolory marki: słód (ikony) i kurkuma (aktywna zakładka).
const INK = '#2A2312';
const KURKUMA = '#FFBE0B';

const TABS: { name: TabName; label: string; Icon?: LucideIcon; module?: string }[] = [
  { name: 'dashboard', label: 'Start', Icon: Home },
  { name: 'calendar', label: 'Kalendarz', Icon: Calendar, module: 'calendar' },
  { name: 'messenger', label: 'Czat', Icon: MessageCircle, module: 'komunikator' },
  { name: 'modules', label: 'Moduły', Icon: LayoutGrid },
  { name: 'account', label: 'Konto' },
];

// Pływający pasek zakładek (pigułka nad krawędzią ekranu, same ikony) — nakładka nad całym
// stosem (app), więc widoczny także na ekranach otwartych nad zakładkami. Aktywna zakładka =
// ta pod spodem (z niej zaczęła się ścieżka). Stuknięcie zamyka otwarte ekrany i przechodzi
// do zakładki. Zajmuje ~84 pt od dołu na iPhonie z paskiem domowym — mieści się w odstępie,
// który ekrany rezerwują pod pasek (czat: composerBottomPad = 88).
export const FloatingTabBar = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const perms = usePermissions();
  const { onTabs, active } = readTabsState(useRootNavigationState() as never);
  useEffect(() => {
    setOnTabs(onTabs);
  }, [onTabs]);

  // Android z adjustResize podniósłby pasek nad klawiaturę — chowamy go wtedy.
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  if (keyboardOpen) return null;

  // Zakładki według uprawnień jak na webie; do pierwszego wczytania wszystkie (bez migania).
  const tabs = TABS.filter((tab) => !tab.module || !perms.ready || perms.moduleVisible(tab.module));
  const bottom = insets.bottom > 0 ? Math.max(insets.bottom - 10, 16) : 12;

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, bottom }}>
      <View
        style={{
          height: 60,
          borderRadius: 30,
          backgroundColor: 'rgba(255,255,255,0.97)',
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 6,
          shadowColor: INK,
          shadowOpacity: 0.08,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 8 },
          elevation: 14,
        }}
      >
        {tabs.map(({ name, label, Icon }) => {
          const focused = name === active;
          return (
            <Pressable
              key={name}
              onPress={() => {
                // Na tej samej zakładce bez nic otwartego nad nią — nic do zrobienia.
                if (focused && onTabs) return;
                goToTab(router, name);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={t(label)}
              style={{
                flex: 1,
                height: 48,
                borderRadius: 24,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: focused ? KURKUMA : 'transparent',
              }}
            >
              {Icon ? (
                <Icon color={INK} size={24} strokeWidth={focused ? 2.4 : 1.8} />
              ) : (
                <AccountTabIcon color={INK} focused={focused} />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};
