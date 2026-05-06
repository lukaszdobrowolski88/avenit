import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '../contexts/ThemeContext';

interface AvatarCircleProps {
  name?: string;
  imageUrl?: string;
  size?: number;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');
}

export function AvatarCircle({ name = '', imageUrl, size = 40 }: AvatarCircleProps) {
  const { theme } = useTheme();
  const fontSize = size * 0.38;

  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
        contentFit="cover"
        transition={200}
      />
    );
  }

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: theme.colors.accent.primaryLightest,
        },
      ]}
    >
      <Text
        style={[
          styles.initials,
          { fontSize, color: theme.colors.accent.primaryDark },
        ]}
      >
        {getInitials(name) || '?'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {},
  initials: {
    fontWeight: '600',
    fontFamily: 'Inter',
  },
});
