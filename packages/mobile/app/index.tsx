import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { Lock } from 'lucide-react-native';
import { GradientIcon } from '../src/components/ui/GradientIcon';
import { useAuthSession, signOut } from '../src/lib/auth';
import { isBiometricEnabled, authenticateWithBiometric } from '../src/lib/biometric';

type LockState = 'checking' | 'locked' | 'unlocked';

const POST_LOGIN_TARGET = '/(app)/dashboard' as const;

export default function Index() {
  const { session, loading } = useAuthSession();
  const [lock, setLock] = useState<LockState>('checking');

  useEffect(() => {
    if (loading || !session) return;
    let cancelled = false;
    (async () => {
      const enabled = await isBiometricEnabled();
      if (cancelled) return;
      if (!enabled) {
        setLock('unlocked');
        return;
      }
      const ok = await authenticateWithBiometric('Odblokuj Avenit');
      if (!cancelled) setLock(ok ? 'unlocked' : 'locked');
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, session]);

  if (loading || (session && lock === 'checking')) {
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

  if (!session) return <Redirect href="/(auth)/login" />;

  if (lock === 'locked') {
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
        <View style={{ marginBottom: 20 }}>
          <GradientIcon Icon={Lock} size={64} iconSize={28} rounded />
        </View>
        <Text
          style={{
            fontSize: 18,
            color: '#2A2312',
            marginBottom: 8,
            letterSpacing: -0.4,
            fontFamily: 'Manrope_700Bold',
          }}
        >
          Aplikacja zablokowana
        </Text>
        <Text
          style={{
            fontSize: 13,
            color: '#6B6557',
            textAlign: 'center',
            marginBottom: 20,
            fontFamily: 'Manrope_500Medium',
          }}
        >
          Użyj Face ID lub odcisku palca, aby kontynuować.
        </Text>
        <Pressable
          onPress={async () => {
            const ok = await authenticateWithBiometric('Odblokuj Avenit');
            setLock(ok ? 'unlocked' : 'locked');
          }}
          accessibilityRole="button"
          style={{
            backgroundColor: '#2A2312',
            borderRadius: 14,
            paddingHorizontal: 24,
            paddingVertical: 12,
          }}
        >
          <Text style={{ color: '#ffffff', fontSize: 15, fontFamily: 'Manrope_700Bold' }}>
            Odblokuj
          </Text>
        </Pressable>
        <Pressable
          onPress={async () => {
            await signOut();
            setLock('unlocked');
          }}
          accessibilityRole="button"
          style={{ marginTop: 12, paddingHorizontal: 24, minHeight: 44, justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 13, color: '#6B6557', fontFamily: 'Manrope_500Medium' }}>
            Wyloguj
          </Text>
        </Pressable>
      </View>
    );
  }

  return <Redirect href={POST_LOGIN_TARGET} />;
}
