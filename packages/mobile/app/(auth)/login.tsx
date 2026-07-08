import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { signInWithPassword, sendPasswordReset } from '../../src/lib/auth';
import { checkTwoFactorStatus } from '../../src/lib/totp';
import { GradientAvatar } from '../../src/components/ui/GradientAvatar';
import { GradientButton } from '../../src/components/ui/GradientButton';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Brak danych', 'Wpisz email i hasło.');
      return;
    }
    setLoading(true);
    const trimmed = email.trim();
    const { error } = await signInWithPassword(trimmed, password);
    if (error) {
      setLoading(false);
      Alert.alert('Błąd logowania', error.message);
      return;
    }
    const status = await checkTwoFactorStatus(trimmed);
    setLoading(false);
    if (status.enabled || status.required) {
      router.replace({ pathname: '/(auth)/totp', params: { email: trimmed } });
      return;
    }
    router.replace('/(auth)/biometric');
  };

  const handleReset = async () => {
    if (!email) {
      Alert.alert('Wpisz email', 'Podaj adres email aby zresetować hasło.');
      return;
    }
    const { error } = await sendPasswordReset(email.trim());
    if (error) Alert.alert('Błąd', error.message);
    else Alert.alert('Sprawdź pocztę', 'Wysłaliśmy link do resetu hasła.');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: '#ffffff' }}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ alignItems: 'center', marginBottom: 24 }}>
          <GradientAvatar initial="S" size={80} rounded={false} />
        </View>

        <Text
          style={{
            fontSize: 28,
            color: '#0c0a09',
            textAlign: 'center',
            marginBottom: 6,
            letterSpacing: -0.6,
            fontFamily: 'Inter_700Bold',
          }}
        >
          Avenit
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: '#78716c',
            textAlign: 'center',
            marginBottom: 28,
            fontFamily: 'Inter_500Medium',
          }}
        >
          Zaloguj się do aplikacji
        </Text>

        <View
          style={{
            borderRadius: 20,
            backgroundColor: '#ffffff',
            shadowColor: '#0f172a',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.05,
            shadowRadius: 14,
            elevation: 2,
          }}
        >
          <View
            style={{
              borderRadius: 20,
              borderWidth: 1,
              borderColor: '#eef0f3',
              padding: 20,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                color: '#57534e',
                marginBottom: 6,
                fontFamily: 'Inter_600SemiBold',
                textTransform: 'uppercase',
                letterSpacing: 0.4,
              }}
            >
              Email
            </Text>
            <TextInput
              style={{
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
              }}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              placeholder="ty@avenit.pl"
              placeholderTextColor="#a8a29e"
              value={email}
              onChangeText={setEmail}
              editable={!loading}
            />

            <Text
              style={{
                fontSize: 12,
                color: '#57534e',
                marginBottom: 6,
                fontFamily: 'Inter_600SemiBold',
                textTransform: 'uppercase',
                letterSpacing: 0.4,
              }}
            >
              Hasło
            </Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: '#eef0f3',
                borderRadius: 14,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 15,
                color: '#0c0a09',
                backgroundColor: '#fafaf9',
                marginBottom: 18,
                fontFamily: 'Inter_500Medium',
              }}
              autoCapitalize="none"
              autoComplete="password"
              textContentType="password"
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor="#a8a29e"
              value={password}
              onChangeText={setPassword}
              editable={!loading}
            />

            <View style={{ marginBottom: 12 }}>
              <GradientButton onPress={handleLogin} loading={loading}>
                Zaloguj
              </GradientButton>
            </View>

            <Pressable onPress={handleReset} disabled={loading}>
              <Text
                style={{
                  textAlign: 'center',
                  fontSize: 13,
                  color: '#be185d',
                  fontFamily: 'Inter_600SemiBold',
                }}
              >
                Nie pamiętam hasła
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
