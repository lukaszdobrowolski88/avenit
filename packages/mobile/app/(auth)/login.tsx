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
import {
  universalLogin,
  sendPasswordReset,
  beginTwoFactor,
  type LoginTenant,
} from '../../src/lib/auth';
import { Image } from 'expo-image';
import { GradientButton } from '../../src/components/ui/GradientButton';
import { B, fieldStyle } from '../../src/components/ui/brand';
import { showError } from '../../src/lib/errors';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  // Gdy jeden e-mail jest w wielu kościołach — lista do wyboru.
  const [choices, setChoices] = useState<LoginTenant[] | null>(null);

  const submit = async (chosenTenant?: string) => {
    if (!email || !password) {
      Alert.alert('Uzupełnij dane', 'Wpisz adres e-mail i hasło.');
      return;
    }
    if (loading) return;
    setLoading(true);
    const trimmed = email.trim();
    let result: Awaited<ReturnType<typeof universalLogin>>;
    try {
      result = await universalLogin(trimmed, password, chosenTenant ? { tenant: chosenTenant } : undefined);
    } catch (e) {
      // Brak sieci / serwer nieosiągalny — wcześniej przycisk zostawał w nieskończoność w trybie ładowania.
      showError('Nie udało się zalogować', e);
      return;
    } finally {
      setLoading(false);
    }
    if ('ok' in result) {
      setChoices(null);
      router.replace('/(auth)/biometric');
      return;
    }
    if ('multiple' in result) {
      // Konto w wielu kościołach — pokaż wybór.
      setChoices(result.multiple);
      return;
    }
    if ('requires2fa' in result) {
      // Tenant już rozwiązany — przekaż go razem z poświadczeniami do ekranu 2FA (w pamięci).
      beginTwoFactor(trimmed, password, result.tenant);
      router.replace('/(auth)/totp');
      return;
    }
    showError('Nie udało się zalogować', result.error, 'Sprawdź adres e-mail i hasło, a potem spróbuj ponownie.');
  };

  const handleLogin = () => submit();

  const handleReset = async () => {
    if (!email.trim()) {
      Alert.alert('Wpisz adres e-mail', 'Podaj adres e-mail konta, a wyślemy link do ustawienia nowego hasła.');
      return;
    }
    if (resetting) return;
    setResetting(true);
    try {
      const { error } = await sendPasswordReset(email.trim());
      if (error) showError('Nie udało się wysłać linku', error);
      else Alert.alert('Sprawdź pocztę', 'Jeśli konto istnieje, wysłaliśmy na ten adres link do ustawienia nowego hasła.');
    } catch (e) {
      showError('Nie udało się wysłać linku', e);
    } finally {
      setResetting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: '#F6F4EE' }}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ alignItems: 'center', marginBottom: 22, gap: 18 }}>
          <Image source={require('../../assets/brand/znak-kurkuma.png')} style={{ width: 76, height: 76 }} contentFit="contain" />
          <Image
            source={require('../../assets/brand/logo-slod.png')}
            style={{ width: 137, height: 36 }}
            contentFit="contain"
            accessibilityLabel="avenit"
          />
        </View>
        <Text
          style={{
            fontSize: 14,
            color: '#6B6557',
            textAlign: 'center',
            marginBottom: 28,
            fontFamily: 'Manrope_500Medium',
          }}
        >
          {choices ? 'Wybierz swój kościół' : 'Zaloguj się do aplikacji'}
        </Text>

        {choices && (
          <View style={{ gap: 10 }}>
            {choices.map((c) => (
              <Pressable
                key={c.slug}
                onPress={() => submit(c.slug)}
                disabled={loading}
                style={{
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: B.fieldBorder,
                  backgroundColor: '#FFFFFF',
                  paddingHorizontal: 16,
                  paddingVertical: 16,
                  opacity: loading ? 0.6 : 1,
                }}
              >
                <Text
                  style={{
                    fontSize: 15,
                    color: '#2A2312',
                    fontFamily: 'Manrope_600SemiBold',
                  }}
                >
                  {c.name}
                </Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => setChoices(null)}
              disabled={loading}
              style={{ paddingVertical: 10 }}
            >
              <Text
                style={{
                  textAlign: 'center',
                  fontSize: 13,
                  color: '#6B6557',
                  fontFamily: 'Manrope_500Medium',
                }}
              >
                Wróć
              </Text>
            </Pressable>
          </View>
        )}

        {!choices && (
        <View
          style={{
            borderRadius: 20,
            backgroundColor: '#FFFFFF',
          }}
        >
          <View
            style={{
              borderRadius: 20,
              padding: 20,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                color: '#8A6606',
                marginBottom: 6,
                fontFamily: 'Manrope_600SemiBold',
                textTransform: 'uppercase',
                letterSpacing: 1.2,
              }}
            >
              Adres e-mail
            </Text>
            <TextInput
              style={[fieldStyle, { marginBottom: 14 }]}
              accessibilityLabel="Adres e-mail"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              placeholder="ty@avenit.pl"
              placeholderTextColor={B.ink4}
              value={email}
              onChangeText={setEmail}
              editable={!loading}
            />

            <Text
              style={{
                fontSize: 12,
                color: '#8A6606',
                marginBottom: 6,
                fontFamily: 'Manrope_600SemiBold',
                textTransform: 'uppercase',
                letterSpacing: 1.2,
              }}
            >
              Hasło
            </Text>
            <TextInput
              style={[fieldStyle, { marginBottom: 18 }]}
              accessibilityLabel="Hasło"
              autoCapitalize="none"
              autoComplete="password"
              textContentType="password"
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor={B.ink4}
              value={password}
              onChangeText={setPassword}
              editable={!loading}
            />

            <View style={{ marginBottom: 12 }}>
              <GradientButton onPress={handleLogin} loading={loading}>
                Zaloguj
              </GradientButton>
            </View>

            <Pressable
              onPress={handleReset}
              disabled={loading || resetting}
              accessibilityRole="button"
              hitSlop={8}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Text
                style={{
                  textAlign: 'center',
                  fontSize: 13,
                  color: '#8A6606',
                  fontFamily: 'Manrope_600SemiBold',
                }}
              >
                Nie pamiętam hasła
              </Text>
            </Pressable>
          </View>
        </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
