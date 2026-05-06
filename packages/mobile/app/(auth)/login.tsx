import { useState } from 'react';
import {
  View,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { ThemedView } from '../../src/components/ThemedView';
import { ThemedText } from '../../src/components/ThemedText';
import { AccentButton } from '../../src/components/AccentButton';
import { useAuth } from '../../src/contexts/AuthContext';
import { useTheme } from '../../src/contexts/ThemeContext';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const { theme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      setError('Wprowadź email i hasło');
      return;
    }

    setLoading(true);
    setError('');

    const result = await signIn(email.trim(), password);

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    // Zapisz credentials dla biometrii
    try {
      await SecureStore.setItemAsync('saved_email', email.trim());
      await SecureStore.setItemAsync('saved_password', password);
    } catch {}

    setLoading(false);
    router.replace('/(tabs)');
  }

  async function handleBiometricLogin() {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) return;

      const savedEmail = await SecureStore.getItemAsync('saved_email');
      const savedPassword = await SecureStore.getItemAsync('saved_password');

      if (!savedEmail || !savedPassword) return;

      const auth = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Zaloguj się do SCH TOMY',
        cancelLabel: 'Anuluj',
        fallbackLabel: 'Użyj hasła',
      });

      if (auth.success) {
        setLoading(true);
        setEmail(savedEmail);
        const result = await signIn(savedEmail, savedPassword);
        if (result.error) {
          setError('Sesja wygasła. Zaloguj się ponownie.');
          setLoading(false);
        } else {
          router.replace('/(tabs)');
        }
      }
    } catch (err) {
      console.error('Biometric error:', err);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          {/* Logo */}
          <View style={styles.logoContainer}>
            <View style={[styles.logoCircle, { backgroundColor: theme.colors.accent.primaryLightest }]}>
              <ThemedText size="3xl" weight="bold" style={{ color: theme.colors.accent.primary }}>
                SCH
              </ThemedText>
            </View>
            <ThemedText size="2xl" weight="bold" style={styles.appName}>
              SCH TOMY
            </ThemedText>
            <ThemedText variant="muted" size="sm">
              Aplikacja do zarządzania kościołem
            </ThemedText>
          </View>

          {/* Formularz */}
          <View style={styles.form}>
            {error ? (
              <View style={styles.errorContainer}>
                <ThemedText size="sm" style={styles.errorText}>
                  {error}
                </ThemedText>
              </View>
            ) : null}

            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.colors.input.background,
                  borderColor: theme.colors.input.border,
                  color: theme.colors.text.primary,
                },
              ]}
              placeholder="Email"
              placeholderTextColor={theme.colors.input.placeholder}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
            />

            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.colors.input.background,
                  borderColor: theme.colors.input.border,
                  color: theme.colors.text.primary,
                },
              ]}
              placeholder="Hasło"
              placeholderTextColor={theme.colors.input.placeholder}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="password"
              autoComplete="password"
            />

            <AccentButton
              title="Zaloguj się"
              onPress={handleLogin}
              loading={loading}
              size="lg"
              style={styles.loginButton}
            />

            <TouchableOpacity onPress={handleBiometricLogin} style={styles.biometricButton}>
              <ThemedText variant="secondary" size="sm">
                Zaloguj biometrycznie
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  appName: {
    marginBottom: 4,
  },
  form: {
    gap: 12,
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: 'Inter',
  },
  loginButton: {
    marginTop: 8,
  },
  biometricButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  errorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 8,
    padding: 12,
  },
  errorText: {
    color: '#ef4444',
    textAlign: 'center',
  },
});
