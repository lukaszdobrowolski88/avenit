import { Text, View } from 'react-native';

interface Props {
  title: string;
  subtitle?: string;
}

export const SectionHeader = ({ title, subtitle }: Props) => (
  <View className="px-5 mt-3 mb-3">
    <Text
      className="text-[11px]"
      style={{
        color: '#a8a29e',
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        fontFamily: 'Inter_700Bold',
      }}
    >
      {title}
    </Text>
    {subtitle ? (
      <Text
        className="text-[16px] mt-0.5"
        style={{
          color: '#0c0a09',
          letterSpacing: -0.4,
          fontFamily: 'Inter_700Bold',
        }}
      >
        {subtitle}
      </Text>
    ) : null}
  </View>
);
