import { View } from 'react-native';
import { Image } from 'expo-image';
import { User } from 'lucide-react-native';
import { useAuthSession } from '../../lib/auth';
import { useMyProfile } from '../../features/account/api';

// Zakładka Konto: zdjęcie profilowe zamiast ikony (aktywna — czarna obwódka).
export const AccountTabIcon = ({ focused, color }: { focused: boolean; color: string }) => {
  const { user } = useAuthSession();
  const profile = useMyProfile(user?.email ?? null);
  const avatarUrl = profile.data?.avatar_url ?? null;

  if (!avatarUrl) return <User color={color} size={24} strokeWidth={focused ? 2.4 : 1.8} />;
  return (
    <View
      style={{
        width: 32,
        height: 32,
        borderRadius: 16,
        borderWidth: 2,
        borderColor: focused ? color : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Image source={{ uri: avatarUrl }} style={{ width: 26, height: 26, borderRadius: 13 }} contentFit="cover" />
    </View>
  );
};
