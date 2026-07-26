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
        Weryfikacja dwustopniowa
      </Text>
      <Text
        style={{
          fontSize: 14,
          color: '#78716c',
          marginBottom: 24,
          fontFamily: 'Inter_500Medium',
        }}
      >
        Wpisz 6-cyfrowy kod z aplikacji uwierzytelniającej.
      </Text>

      <TextInput
        style={{
          borderWidth: 1,
          borderColor: '#eef0f3',
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: 14,
          fontSize: 22,
          textAlign: 'center',
          letterSpacing: 8,
          color: '#0c0a09',
          backgroundColor: '#fafaf9',
          marginBottom: 24,
          fontFamily: 'Inter_600SemiBold',
        }}
        keyboardType="number-pad"
        maxLength={8}
        autoFocus
        placeholder="123456"
        placeholderTextColor="#a8a29e"
        value={code}
        onChangeText={setCode}
        editable={!loading}
      />

      <Pressable
        onPress={handleVerify}
        disabled={loading}
        style={{
          backgroundColor: '#ec4899',
          borderRadius: 14,
          paddingVertical: 14,
          alignItems: 'center',
          marginBottom: 12,
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={{ color: '#ffffff', fontSize: 15, fontFamily: 'Inter_700Bold' }}>
            Zweryfikuj
          </Text>
        )}
      </Pressable>

      <Pressable onPress={handleCancel} disabled={loading} style={{ paddingVertical: 8 }}>
        <Text
          style={{
            textAlign: 'center',
            fontSize: 13,
            color: '#78716c',
            fontFamily: 'Inter_500Medium',
          }}
        >
          Anuluj i wyloguj
        </Text>
      </Pressable>
    </View>
  );
}
