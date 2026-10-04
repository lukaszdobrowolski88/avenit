import { Pressable, Text, View } from 'react-native';
import { KEYS } from '../../../lib/domain';

interface Props {
  value: string;
  onChange: (key: string) => void;
  originalKey?: string | null;
}

export const TransposeControl = ({ value, onChange, originalKey }: Props) => {
  return (
    <View
      style={{
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: '#E6E1D5',
        paddingVertical: 12,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
          paddingHorizontal: 16,
        }}
      >
        <Text
          style={{
            fontSize: 11,
            color: '#6B6557',
            letterSpacing: 0.4,
            textTransform: 'uppercase',
            fontFamily: 'Manrope_700Bold',
          }}
        >
          Tonacja {originalKey ? `(oryg. ${originalKey})` : ''}
        </Text>
        {originalKey && value !== originalKey && (
          <Pressable onPress={() => onChange(originalKey)} hitSlop={8}>
            <Text
              style={{
                fontSize: 12,
                color: '#8A6606',
                fontFamily: 'Manrope_600SemiBold',
              }}
            >
              Reset
            </Text>
          </Pressable>
        )}
      </View>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          paddingHorizontal: 16,
          gap: 6,
        }}
      >
        {KEYS.map((k) => {
          const active = k === value;
          return (
            <Pressable
              key={k}
              onPress={() => onChange(k)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 10,
                backgroundColor: active ? '#2A2312' : '#F1EEE6',
                borderWidth: 1,
                borderColor: active ? '#2A2312' : '#E6E1D5',
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  color: active ? '#ffffff' : '#2A2312',
                  fontFamily: 'Manrope_600SemiBold',
                }}
              >
                {k}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};
