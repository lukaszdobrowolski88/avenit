import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';

const inputStyle = {
  borderWidth: 1,
  borderColor: '#E6E1D5',
  borderRadius: 14,
  paddingHorizontal: 14,
  paddingVertical: 12,
  fontSize: 15,
  color: '#2A2312',
  backgroundColor: '#F1EEE6',
  marginBottom: 14,
  fontFamily: 'Manrope_500Medium',
} as const;

const labelStyle = {
  fontSize: 12,
  color: '#4A463E',
  marginBottom: 6,
  fontFamily: 'Manrope_600SemiBold',
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
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    if (params.access_token && params.refresh_token) {
      supabase.auth
        .setSession({
          access_token: String(params.access_token),
          refresh_token: String(params.refresh_token),
        })
        .then(({ error }) => {
          // Błędny/wygasły link: ZAWSZE zdejmij spinner (wcześniej bez setSessionReady
          // ekran wisiał w nieskończoność bez wyjścia) i pokaż ekran z powrotem do logowania.
          if (error) {
            setLinkError('Link do zmiany hasła wygasł lub jest nieprawidłowy. Poproś o nowy.');
          }
          setSessionReady(true);
        })
        .catch(() => {
          setLinkError('Nie udało się otworzyć linku. Poproś o nowy link do zmiany hasła.');
          setSessionReady(true);
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
          backgroundColor: '#F6F4EE',
        }}
      >
        <ActivityIndicator color="#2A2312" />
      </View>
    );
  }

  if (linkError) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#F6F4EE',
          paddingHorizontal: 24,
        }}
      >
        <Text
          style={{
            fontSize: 18,
            color: '#2A2312',
            textAlign: 'center',
            marginBottom: 8,
            fontFamily: 'Manrope_700Bold',
          }}
        >
          Link nieaktywny
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: '#7A7466',
            textAlign: 'center',
            marginBottom: 22,
            fontFamily: 'Manrope_500Medium',
          }}
        >
          {linkError}
        </Text>
        <Pressable
          onPress={() => router.replace('/(auth)/login')}
          style={{
            backgroundColor: '#2A2312',
            borderRadius: 14,
            paddingVertical: 14,
            paddingHorizontal: 28,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#ffffff', fontSize: 15, fontFamily: 'Manrope_700Bold' }}>
            Wróć do logowania
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#F6F4EE',
        paddingHorizontal: 24,
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontSize: 24,
          color: '#2A2312',
          marginBottom: 6,
          letterSpacing: -0.5,
          fontFamily: 'Manrope_700Bold',
        }}
      >
        Nowe hasło
      </Text>
      <Text
        style={{
          fontSize: 14,
          color: '#7A7466',
          marginBottom: 24,
          fontFamily: 'Manrope_500Medium',
        }}
      >
        Wprowadź nowe hasło do konta.
      </Text>

      <Text style={labelStyle}>Nowe hasło</Text>
      <TextInput
        style={inputStyle}
        secureTextEntry
        placeholder="••••••••"
        placeholderTextColor="#A8A59E"
        value={password}
        onChangeText={setPassword}
        editable={!loading}
      />

      <Text style={labelStyle}>Powtórz</Text>
      <TextInput
        style={[inputStyle, { marginBottom: 22 }]}
        secureTextEntry
        placeholder="••••••••"
        placeholderTextColor="#A8A59E"
        value={confirm}
        onChangeText={setConfirm}
        editable={!loading}
      />

      <Pressable
        onPress={handleSubmit}
        disabled={loading}
        style={{
          backgroundColor: '#2A2312',
          borderRadius: 14,
          paddingVertical: 14,
          alignItems: 'center',
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={{ color: '#ffffff', fontSize: 15, fontFamily: 'Manrope_700Bold' }}>
            Zapisz hasło
          </Text>
        )}
      </Pressable>
    </View>
  );
}
