import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';

export interface TeamTabDef {
  key: string;
  label: string;
  Icon: LucideIcon;
}

// Zakładki zespołu jak na webie (do 9) — przewijany rząd chipów zamiast stałego
// segmentu na 4 pozycje. Aktywny chip ciemny, reszta miękkie tło.
export const TeamTabsBar = ({
  tabs,
  active,
  onChange,
}: {
  tabs: TeamTabDef[];
  active: string;
  onChange: (key: string) => void;
}) => {
  const ref = useRef<ScrollView>(null);
  const offsets = useRef<Record<string, number>>({});

  // Po zmianie zakładki przewiń tak, by aktywny chip był widoczny.
  useEffect(() => {
    const x = offsets.current[active];
    if (x != null) ref.current?.scrollTo({ x: Math.max(0, x - 24), animated: true });
  }, [active]);

  return (
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 4 }}
    >
      {tabs.map(({ key, label, Icon }) => {
        const on = key === active;
        return (
          <View key={key} onLayout={(e) => (offsets.current[key] = e.nativeEvent.layout.x)}>
            <Pressable
              onPress={() => onChange(key)}
              className="active:opacity-70"
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 13,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: on ? '#0c0a09' : '#f5f5f4',
              }}
            >
              <Icon size={14} color={on ? '#ffffff' : '#57534e'} strokeWidth={2.3} />
              <Text
                style={{
                  fontSize: 13,
                  color: on ? '#ffffff' : '#44403c',
                  fontFamily: 'Inter_600SemiBold',
                }}
              >
                {label}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
};
