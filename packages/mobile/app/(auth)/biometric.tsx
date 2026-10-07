import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Fingerprint } from 'lucide-react-native';
import { GradientIcon } from '../../src/components/ui/GradientIcon';
import {
  getBiometricCapability,
  setBiometricEnabled,
  authenticateWithBiometric,
  wasBiometricAsked,
  markBiometricAsked,
} from '../../src/lib/biometric';

export default function BiometricScreen() {
  const router = useRouter();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [hint, setHint] = useState('Face ID / Touch ID');

  useEffect(() => {
    // To konto już zdecydowało (włączone albo „Nie teraz”) — nie pytamy przy każdym logowaniu.
    Promise.all([getBiometricCapability(), wasBiometricAsked()]).then(([cap, asked]) => {
      setAvailable(cap.available && !asked);
      if (cap.types.length > 0) {
        const labels: string[] = [];
        for (const t of cap.types) {
          if (t === 1) labels.push('Touch ID');
          else if (t === 2) labels.push('Face ID');
          else if (t === 3) labels.push('biometryka');
        }
        if (labels.length) setHint(labels.join(' / '));
      }
    });
  }, []);

  useEffect(() => {
    if (available === false) {
      router.replace('/(app)/dashboard');
    }
  }, [available, router]);

  const enableBiometric = async () => {
    const ok = await authenticateWithBiometric('Włącz odblokowanie biometryczne');
    if (ok) {
      await setBiometricEnabled(true);
    }
    await markBiometricAsked();
    router.replace('/(app)/dashboard');
  };

  const skip = async () => {
    // „Nie teraz” też zapamiętujemy — włączyć można później w Koncie.
    await markBiometricAsked();
    router.replace('/(app)/dashboard');
  };

  if (available !== true) {
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

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#F6F4EE',
        paddingHorizontal: 24,
        justifyContent: 'center',
      }}
    >
      <View style={{ alignItems: 'center', marginBottom: 28 }}>
        <GradientIcon Icon={Fingerprint} size={80} iconSize={40} rounded />
      </View>
      <Text
        style={{
          fontSize: 24,
          color: '#2A2312',
          textAlign: 'center',
          marginBottom: 10,
          letterSpacing: -0.5,
          fontFamily: 'Manrope_700Bold',
        }}
      >
        Włączyć {hint}?
      </Text>
      <Text
        style={{
          fontSize: 14,
          color: '#6B6557',
          textAlign: 'center',
          marginBottom: 28,
          lineHeight: 20,
          fontFamily: 'Manrope_500Medium',
        }}
      >
        Aplikacja będzie chroniona — przy każdym otwarciu odblokujesz ją jednym spojrzeniem lub dotknięciem.
      </Text>

      <Pressable
        onPress={enableBiometric}
        accessibilityRole="button"
        style={{
          backgroundColor: '#FFBE0B',
          borderRadius: 26,
          paddingVertical: 14,
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <Text style={{ color: '#2A2312', fontSize: 15, fontFamily: 'Manrope_700Bold' }}>Włącz</Text>
      </Pressable>
      <Pressable onPress={skip} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text
          style={{
            textAlign: 'center',
            fontSize: 13,
            color: '#6B6557',
            fontFamily: 'Manrope_500Medium',
          }}
        >
          Nie teraz
        </Text>
      </Pressable>
    </View>
  );
}
