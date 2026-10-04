import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

// Kolory marki: słód (ikony) i kurkuma (aktywna zakładka).
const INK = '#2A2312';
const KURKUMA = '#FFBE0B';

// Pływający pasek zakładek (pigułka nad krawędzią ekranu, same ikony).
// Zajmuje ~84 pt od dołu na iPhonie z paskiem domowym — mieści się w odstępie, który
// ekrany rezerwują pod pasek (czat: composerBottomPad = 88).
export const FloatingTabBar = ({ state, descriptors, navigation }: BottomTabBarProps) => {
  const insets = useSafeAreaInsets();
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

  const focusedKey = state.routes[state.index].key;
  const hidden = (style: unknown) => (StyleSheet.flatten(style as ViewStyle) as ViewStyle | undefined)?.display === 'none';
  if (keyboardOpen || hidden(descriptors[focusedKey].options.tabBarStyle)) {
    return null;
  }

  // Ekrany z `href: null` (expo-router) mają tabBarItemStyle display:none — nie są zakładkami.
  const routes = state.routes.filter((r) => !hidden(descriptors[r.key].options.tabBarItemStyle));
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
        {routes.map((route) => {
          const { options } = descriptors[route.key];
          const focused = route.key === focusedKey;
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? options.title}
              style={{
                flex: 1,
                height: 48,
                borderRadius: 24,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: focused ? KURKUMA : 'transparent',
              }}
            >
              {options.tabBarIcon?.({ focused, color: INK, size: 24 })}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};
