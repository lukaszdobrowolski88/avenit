import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Camera } from 'lucide-react-native';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { GradientButton } from '../../../src/components/ui/GradientButton';
import { GradientAvatar } from '../../../src/components/ui/GradientAvatar';
import { useAuthSession } from '../../../src/lib/auth';
import { useMyProfile, useUpdateProfile, pickAvatar, uploadAvatar } from '../../../src/features/account/api';
import { goBack } from '../../../src/lib/navigation';

export default function EditProfileScreen() {
  const router = useRouter();
  const { user } = useAuthSession();
  const email = user?.email ?? null;
  const profile = useMyProfile(email);
  const update = useUpdateProfile(email);

  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Wypełnij formularz raz, gdy profil się załaduje.
  useEffect(() => {
    if (profile.data && !hydrated) {
      setFullName(profile.data.full_name ?? '');
      setAvatarUrl(profile.data.avatar_url ?? null);
      setHydrated(true);
    }
  }, [profile.data, hydrated]);

  const initial = (fullName || email || '?').charAt(0).toUpperCase();

  const changeAvatar = async () => {
    try {
      const asset = await pickAvatar();
      if (!asset) return;
      setUploading(true);
      const url = await uploadAvatar(asset, String(user?.app_user_id ?? email ?? 'me'));
      await update.mutateAsync({ avatar_url: url });
      setAvatarUrl(url);
    } catch (e: any) {
      Alert.alert('Błąd', e?.message ?? 'Nie udało się zaktualizować zdjęcia.');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    const name = fullName.trim();
    if (!name) {
      Alert.alert('Imię i nazwisko', 'Pole nie może być puste.');
      return;
    }
    try {
      // name = zgodność wstecz (część kodu czyta app_users.name).
      await update.mutateAsync({ full_name: name, name });
      goBack(router);
    } catch (e: any) {
      Alert.alert('Błąd', e?.message ?? 'Nie udało się zapisać profilu.');
    }
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: '#F6F4EE' }}
      >
        <PageHeader title="Edytuj profil" subtitle="Imię i zdjęcie profilowe" showBack />

        {profile.isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#2A2312" />
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
            <View style={{ alignItems: 'center', marginTop: 8, marginBottom: 24 }}>
              <Pressable onPress={changeAvatar} disabled={uploading} style={{ position: 'relative' }}>
                {avatarUrl ? (
                  <Image
                    source={{ uri: avatarUrl }}
                    style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: '#ECE8DE' }}
                    contentFit="cover"
                  />
                ) : (
                  <GradientAvatar initial={initial} size={96} />
                )}
                <View
                  style={{
                    position: 'absolute',
                    right: -2,
                    bottom: -2,
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: '#2A2312',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 3,
                    borderColor: '#ffffff',
                  }}
                >
                  {uploading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Camera size={15} color="#ffffff" strokeWidth={2.4} />
                  )}
                </View>
              </Pressable>
              <Text style={{ fontSize: 12, color: '#6B6557', marginTop: 10, fontFamily: 'Manrope_500Medium' }}>
                Dotknij, aby zmienić zdjęcie
              </Text>
            </View>

            <Text style={styles.label}>Imię i nazwisko</Text>
            <TextInput
              style={styles.input}
              placeholder="np. Anna Kowalska"
              placeholderTextColor="#857F70"
              value={fullName}
              onChangeText={setFullName}
              editable={!update.isPending}
            />

            <Text style={styles.label}>E-mail</Text>
            <View style={[styles.input, { justifyContent: 'center', backgroundColor: '#ECE8DE' }]}>
              <Text style={{ fontSize: 15, color: '#6B6557', fontFamily: 'Manrope_400Regular' }}>
                {email ?? '—'}
              </Text>
            </View>
            <Text style={{ fontSize: 12, color: '#857F70', marginTop: -8, marginBottom: 16, fontFamily: 'Manrope_400Regular' }}>
              E-maila nie można zmienić w aplikacji.
            </Text>

            <GradientButton onPress={save} loading={update.isPending}>
              Zapisz zmiany
            </GradientButton>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </>
  );
}

const styles = {
  label: {
    fontSize: 12,
    color: '#8A6606',
    marginBottom: 6,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
    fontFamily: 'Manrope_700Bold',
  } as const,
  input: {
    borderWidth: 1,
    borderColor: '#E6E1D5',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
    fontSize: 15,
    color: '#2A2312',
    backgroundColor: '#FFFFFF',
    marginBottom: 16,
    fontFamily: 'Manrope_400Regular',
  } as const,
};
