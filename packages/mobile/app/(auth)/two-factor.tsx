import { useState, useRef } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { ThemedView } from '../../src/components/ThemedView';
import { ThemedText } from '../../src/components/ThemedText';
import { AccentButton } from '../../src/components/AccentButton';
import { useAuth } from '../../src/contexts/AuthContext';
import { useTheme } from '../../src/contexts/ThemeContext';
import { supabase } from '../../src/lib/supabase';

export default function TwoFactorScreen() {
  const { user, setTotpVerified } = useAuth();
  const { theme } = useTheme();
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputs = useRef<(TextInput | null)[]>([]);

  function handleCodeChange(text: string, index: number) {
    const newCode = [...code];
    newCode[index] = text;
    setCode(newCode);

    // Auto-fokus na następne pole
    if (text && index < 5) {
      inputs.current[index + 1]?.focus();
    }

    // Auto-submit po wypełnieniu
    if (index === 5 && text) {
      verifyCode(newCode.join(''));
    }
  }

  function handleKeyPress(key: string, index: number) {
    if (key === 'Backspace' && !code[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  }

  async function verifyCode(fullCode: string) {
    setLoading(true);
    setError('');

    try {
      const { data, error: verifyError } = await supabase
        .from('totp_auth_logs')
        .insert({
          user_id: user?.id,
          success: false,
        })
        .select()
        .single();

      // Weryfikuj kod TOTP
      const { data: verifyData } = await supabase.auth.mfa.verify({
        factorId: '', // TODO: pobierz factor ID z ustawień użytkownika
        challengeId: '',
        code: fullCode,
      });

      setTotpVerified(true);
      router.replace('/(tabs)');
    } catch (err: any) {
      setError('Nieprawidłowy kod. Spróbuj ponownie.');
      setCode(['', '', '', '', '', '']);
      inputs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <ThemedText size="2xl" weight="bold" style={styles.title}>
          Weryfikacja 2FA
        </ThemedText>
        <ThemedText variant="secondary" size="sm" style={styles.subtitle}>
          Wprowadź 6-cyfrowy kod z aplikacji uwierzytelniającej
        </ThemedText>

        {error ? (
          <View style={styles.errorContainer}>
            <ThemedText size="sm" style={styles.errorText}>{error}</ThemedText>
          </View>
        ) : null}

        <View style={styles.codeContainer}>
          {code.map((digit, index) => (
            <TextInput
              key={index}
              ref={ref => { inputs.current[index] = ref; }}
              style={[
                styles.codeInput,
                {
                  backgroundColor: theme.colors.input.background,
                  borderColor: digit ? theme.colors.accent.primary : theme.colors.input.border,
                  color: theme.colors.text.primary,
                },
              ]}
              value={digit}
              onChangeText={text => handleCodeChange(text.replace(/[^0-9]/g, ''), index)}
              onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, index)}
              keyboardType="number-pad"
              maxLength={1}
              textAlign="center"
              autoFocus={index === 0}
            />
          ))}
        </View>

        <AccentButton
          title="Weryfikuj"
          onPress={() => verifyCode(code.join(''))}
          loading={loading}
          disabled={code.some(d => !d)}
          size="lg"
          style={styles.verifyButton}
        />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 32,
  },
  codeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 32,
  },
  codeInput: {
    width: 48,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    fontSize: 24,
    fontWeight: '700',
    fontFamily: 'Inter',
  },
  verifyButton: {
    marginTop: 8,
  },
  errorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#ef4444',
    textAlign: 'center',
  },
});
