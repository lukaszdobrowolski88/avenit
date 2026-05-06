import type { ReactNode } from 'react';
import { ScrollView, StatusBar, View, type ScrollViewProps } from 'react-native';

interface Props extends ScrollViewProps {
  children: ReactNode;
  padded?: boolean;
  /** Extra bottom padding to clear floating tab bar (default 120) */
  bottomInset?: number;
}

export const ScreenContainer = ({
  children,
  padded = false,
  bottomInset = 120,
  contentContainerStyle,
  ...rest
}: Props) => {
  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: '#ffffff' }}
        contentContainerStyle={[
          { paddingBottom: bottomInset, paddingHorizontal: padded ? 16 : 0 },
          contentContainerStyle,
        ]}
        showsVerticalScrollIndicator={false}
        {...rest}
      >
        {children}
      </ScrollView>
    </>
  );
};

/** For non-scrolling screens (lists with FlatList etc) */
export const Screen = ({ children }: { children: ReactNode }) => (
  <>
    <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
    <View className="flex-1" style={{ backgroundColor: '#ffffff' }}>
      {children}
    </View>
  </>
);
