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
      const ok = await authenticateWithBiometric('Odblokuj SCH TOMY');
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
          backgroundColor: '#ffffff',
        }}
      >
        <ActivityIndicator color="#ec4899" />
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
          backgroundColor: '#ffffff',
          paddingHorizontal: 24,
        }}
      >
        <View style={{ marginBottom: 20 }}>
          <GradientIcon Icon={Lock} size={64} iconSize={28} from="#f97316" to="#ec4899" rounded />
        </View>
        <Text
          style={{
            fontSize: 18,
            color: '#0c0a09',
            marginBottom: 8,
            letterSpacing: -0.4,
            fontFamily: 'Inter_700Bold',
          }}
        >
          Aplikacja zablokowana
        </Text>
        <Text
          style={{
            fontSize: 13,
            color: '#78716c',
            textAlign: 'center',
            marginBottom: 20,
            fontFamily: 'Inter_500Medium',
          }}
        >
          Odblokuj biometryką żeby kontynuować.
        </Text>
        <Pressable
          onPress={async () => {
            const ok = await authenticateWithBiometric('Odblokuj SCH TOMY');
            setLock(ok ? 'unlocked' : 'locked');
          }}
          style={{
            backgroundColor: '#ec4899',
            borderRadius: 14,
            paddingHorizontal: 24,
            paddingVertical: 12,
          }}
        >
          <Text style={{ color: '#ffffff', fontSize: 15, fontFamily: 'Inter_700Bold' }}>
            Odblokuj
          </Text>
        </Pressable>
        <Pressable
          onPress={async () => {
            await signOut();
            setLock('unlocked');
          }}
          style={{ marginTop: 12, paddingHorizontal: 24, paddingVertical: 10 }}
        >
          <Text style={{ fontSize: 13, color: '#78716c', fontFamily: 'Inter_500Medium' }}>
            Wyloguj
          </Text>
        </Pressable>
      </View>
    );
  }

  return <Redirect href={POST_LOGIN_TARGET} />;
}
