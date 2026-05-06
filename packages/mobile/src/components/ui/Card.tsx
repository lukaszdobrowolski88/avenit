import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';

interface Props extends ViewProps {
  children: ReactNode;
  /** Tighter padding (12 instead of 16) */
  compact?: boolean;
  /** Disable horizontal margin (useful inside lists with their own padding) */
  flush?: boolean;
}

/**
 * White card with soft shadow, matching dashboard widget aesthetic.
 * Use for any boxed content on subpages.
 */
export const Card = ({ children, compact, flush, style, ...rest }: Props) => {
  return (
    <View
      className={flush ? '' : 'mx-4 mb-3'}
      style={[
        {
          borderRadius: 20,
          backgroundColor: '#ffffff',
          shadowColor: '#0f172a',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.05,
          shadowRadius: 14,
          elevation: 2,
        },
        style,
      ]}
      {...rest}
    >
      <View
        className="overflow-hidden"
        style={{
          borderRadius: 20,
          borderWidth: 1,
          borderColor: '#eef0f3',
          padding: compact ? 12 : 16,
        }}
      >
        {children}
      </View>
    </View>
  );
};
