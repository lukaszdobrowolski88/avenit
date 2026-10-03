import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Lock } from 'lucide-react-native';
import { usePermissions } from '../lib/permissions';

// Bramka modułu jak ProtectedRoute na webie: bez module:<key> (lub gdy kościół wyłączył
// moduł) ekran pokazuje komunikat zamiast pustej listy. Dotyczy też wejść z deep linków
// i powiadomień. Dane i tak chroni serwer — to warstwa UX.
export const NoModuleAccess = ({ message }: { message?: string }) => {
  const router = useRouter();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#ffffff',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
        gap: 12,
      }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 18,
          backgroundColor: '#f5f5f4',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Lock size={24} color="#78716c" />
      </View>
      <Text style={{ fontSize: 18, color: '#0c0a09', fontFamily: 'Inter_700Bold', letterSpacing: -0.3 }}>
        Brak dostępu
      </Text>
      <Text
        style={{
          fontSize: 14,
          lineHeight: 20,
          color: '#78716c',
          textAlign: 'center',
          fontFamily: 'Inter_400Regular',
        }}
      >
        {message ??
          'Nie masz uprawnień do tego modułu albo kościół go wyłączył. Jeśli powinieneś go widzieć, poproś administratora o dostęp w Ustawienia → Uprawnienia.'}
      </Text>
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(app)/modules' as never))}
        className="active:opacity-70"
        style={{
          marginTop: 8,
          paddingHorizontal: 20,
          paddingVertical: 11,
          borderRadius: 999,
          backgroundColor: '#0c0a09',
        }}
      >
        <Text style={{ color: '#ffffff', fontSize: 14, fontFamily: 'Inter_600SemiBold' }}>Wróć</Text>
      </Pressable>
    </View>
  );
};

export const ModuleGate = ({ moduleKey, children }: { moduleKey: string; children: ReactNode }) => {
  const perms = usePermissions();
  if (!perms.ready) {
    return (
      <View style={{ flex: 1, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#ec4899" />
      </View>
    );
  }
  if (!perms.moduleVisible(moduleKey)) return <NoModuleAccess />;
  return <>{children}</>;
};
