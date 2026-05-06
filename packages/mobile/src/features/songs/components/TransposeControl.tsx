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
        borderColor: '#eef0f3',
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
            color: '#78716c',
            letterSpacing: 0.4,
            textTransform: 'uppercase',
            fontFamily: 'Inter_700Bold',
          }}
        >
          Tonacja {originalKey ? `(oryg. ${originalKey})` : ''}
        </Text>
        {originalKey && value !== originalKey && (
          <Pressable onPress={() => onChange(originalKey)} hitSlop={8}>
            <Text
              style={{
                fontSize: 12,
                color: '#be185d',
                fontFamily: 'Inter_600SemiBold',
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
                backgroundColor: active ? '#0c0a09' : '#fafaf9',
                borderWidth: 1,
                borderColor: active ? '#0c0a09' : '#eef0f3',
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  color: active ? '#ffffff' : '#1c1917',
                  fontFamily: 'Inter_600SemiBold',
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
