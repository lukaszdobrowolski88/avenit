import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { completeTwoFactorLogin, signOut } from '../../src/lib/auth';

export default function TotpScreen() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    if (code.trim().length < 6) {
      Alert.alert(
        'Wpisz kod',
        'Wpisz 6-cyfrowy kod z aplikacji uwierzytelniającej (lub kod zapasowy).',
      );
      return;
    }
    setLoading(true);
    // Serwer weryfikuje kod i dopiero wtedy wydaje sesję (kod zapasowy też obsłuży).
    const { error } = await completeTwoFactorLogin(code.trim());
    setLoading(false);
    if (error) {
      Alert.alert('Błąd', error.message);
      return;
    }
    router.replace('/(auth)/biometric');
  };

  const handleCancel = async () => {
    await signOut();
    router.replace('/(auth)/login');
  };

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
        Weryfikacja dwustopniowa
      </Text>
      <Text
        style={{
          fontSize: 14,
          color: '#6B6557',
          marginBottom: 24,
          fontFamily: 'Manrope_500Medium',
        }}
      >
        Wpisz 6-cyfrowy kod z aplikacji uwierzytelniającej.
      </Text>

      <TextInput
        style={{
          borderWidth: 1,
          borderColor: '#E6E1D5',
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: 14,
          fontSize: 22,
          textAlign: 'center',
          letterSpacing: 8,
          color: '#2A2312',
          backgroundColor: '#FFFFFF',
          marginBottom: 24,
          fontFamily: 'Manrope_600SemiBold',
        }}
        keyboardType="number-pad"
        maxLength={8}
        autoFocus
        placeholder="123456"
        placeholderTextColor="#857F70"
        value={code}
        onChangeText={setCode}
        editable={!loading}
      />

      <Pressable
        onPress={handleVerify}
        disabled={loading}
        style={{
          backgroundColor: '#FFBE0B',
          borderRadius: 26,
          paddingVertical: 14,
          alignItems: 'center',
          marginBottom: 12,
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? (
          <ActivityIndicator color="#2A2312" />
        ) : (
          <Text style={{ color: '#2A2312', fontSize: 15, fontFamily: 'Manrope_700Bold' }}>
            Zweryfikuj
          </Text>
        )}
      </Pressable>

      <Pressable onPress={handleCancel} disabled={loading} style={{ paddingVertical: 8 }}>
        <Text
          style={{
            textAlign: 'center',
            fontSize: 13,
            color: '#6B6557',
            fontFamily: 'Manrope_500Medium',
          }}
        >
          Anuluj i wyloguj
        </Text>
      </Pressable>
    </View>
  );
}
