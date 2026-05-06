import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';

const inputStyle = {
  borderWidth: 1,
  borderColor: '#eef0f3',
  borderRadius: 14,
  paddingHorizontal: 14,
  paddingVertical: 12,
  fontSize: 15,
  color: '#0c0a09',
  backgroundColor: '#fafaf9',
  marginBottom: 14,
  fontFamily: 'Inter_500Medium',
} as const;

const labelStyle = {
  fontSize: 12,
  color: '#57534e',
  marginBottom: 6,
  fontFamily: 'Inter_600SemiBold',
  textTransform: 'uppercase' as const,
  letterSpacing: 0.4,
};

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    access_token?: string;
    refresh_token?: string;
    type?: string;
  }>();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    if (params.access_token && params.refresh_token) {
      supabase.auth
        .setSession({
          access_token: String(params.access_token),
          refresh_token: String(params.refresh_token),
        })
        .then(({ error }) => {
          if (error) Alert.alert('Błąd', error.message);
          else setSessionReady(true);
        });
    } else {
      setSessionReady(true);
    }
  }, [params.access_token, params.refresh_token]);

  const handleSubmit = async () => {
    if (password.length < 8) {
      Alert.alert('Hasło za krótkie', 'Minimum 8 znaków.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Hasła się różnią', 'Wpisz to samo hasło dwa razy.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      Alert.alert('Błąd', error.message);
      return;
    }
    Alert.alert('Hasło zmienione', 'Możesz się teraz zalogować.');
    router.replace('/(auth)/login');
  };

  if (!sessionReady) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#ffffff',
        }}
      >
        <ActivityIndicator color="#ec4899" />
      </View>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#ffffff',
        paddingHorizontal: 24,
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontSize: 24,
          color: '#0c0a09',
          marginBottom: 6,
          letterSpacing: -0.5,
          fontFamily: 'Inter_700Bold',
        }}
      >
        Nowe hasło
      </Text>
      <Text
        style={{
          fontSize: 14,
          color: '#78716c',
          marginBottom: 24,
          fontFamily: 'Inter_500Medium',
        }}
      >
        Wprowadź nowe hasło do konta.
      </Text>

      <Text style={labelStyle}>Nowe hasło</Text>
      <TextInput
        style={inputStyle}
        secureTextEntry
        placeholder="••••••••"
        placeholderTextColor="#a8a29e"
        value={password}
        onChangeText={setPassword}
        editable={!loading}
      />

      <Text style={labelStyle}>Powtórz</Text>
      <TextInput
        style={[inputStyle, { marginBottom: 22 }]}
        secureTextEntry
        placeholder="••••••••"
        placeholderTextColor="#a8a29e"
        value={confirm}
        onChangeText={setConfirm}
        editable={!loading}
      />

      <Pressable
        onPress={handleSubmit}
        disabled={loading}
        style={{
          backgroundColor: '#ec4899',
          borderRadius: 14,
          paddingVertical: 14,
          alignItems: 'center',
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={{ color: '#ffffff', fontSize: 15, fontFamily: 'Inter_700Bold' }}>
            Zapisz hasło
          </Text>
        )}
      </Pressable>
    </View>
  );
}
