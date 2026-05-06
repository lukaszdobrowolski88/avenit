import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Fingerprint } from 'lucide-react-native';
import { GradientIcon } from '../../src/components/ui/GradientIcon';
import {
  getBiometricCapability,
  setBiometricEnabled,
  authenticateWithBiometric,
} from '../../src/lib/biometric';

export default function BiometricScreen() {
  const router = useRouter();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [hint, setHint] = useState('Face ID / Touch ID');

  useEffect(() => {
    getBiometricCapability().then((cap) => {
      setAvailable(cap.available);
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
    const ok = await authenticateWithBiometric('Włącz biometrykę dla SCH TOMY');
    if (ok) {
      await setBiometricEnabled(true);
    }
    router.replace('/(app)/dashboard');
  };

  const skip = () => {
    router.replace('/(app)/dashboard');
  };

  if (available !== true) {
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
      <View style={{ alignItems: 'center', marginBottom: 28 }}>
        <GradientIcon Icon={Fingerprint} size={80} iconSize={40} from="#f97316" to="#ec4899" rounded />
      </View>
      <Text
        style={{
          fontSize: 24,
          color: '#0c0a09',
          textAlign: 'center',
          marginBottom: 10,
          letterSpacing: -0.5,
          fontFamily: 'Inter_700Bold',
        }}
      >
        Włączyć {hint}?
      </Text>
      <Text
        style={{
          fontSize: 14,
          color: '#78716c',
          textAlign: 'center',
          marginBottom: 28,
          lineHeight: 20,
          fontFamily: 'Inter_500Medium',
        }}
      >
        Następnym razem zalogujesz się jednym dotknięciem zamiast wpisywać hasło.
      </Text>

      <Pressable
        onPress={enableBiometric}
        style={{
          backgroundColor: '#ec4899',
          borderRadius: 14,
          paddingVertical: 14,
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <Text style={{ color: '#ffffff', fontSize: 15, fontFamily: 'Inter_700Bold' }}>Włącz</Text>
      </Pressable>
      <Pressable onPress={skip} style={{ paddingVertical: 10 }}>
        <Text
          style={{
            textAlign: 'center',
            fontSize: 13,
            color: '#78716c',
            fontFamily: 'Inter_500Medium',
          }}
        >
          Pomiń
        </Text>
      </Pressable>
    </View>
  );
}
