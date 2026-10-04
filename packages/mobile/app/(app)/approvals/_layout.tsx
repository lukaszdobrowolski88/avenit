import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { usePermissions } from '../../../src/lib/permissions';
import { NoModuleAccess } from '../../../src/components/ModuleGate';

// Kolejka kont: tylko admin albo action:settings:manage_users (jak approve-user na serwerze).
export default function ApprovalsLayout() {
  const perms = usePermissions();
  if (!perms.ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' }}>
        <ActivityIndicator color="#ec4899" />
      </View>
    );
  }
  if (!perms.can('action:settings:manage_users')) {
    return <NoModuleAccess message="Zatwierdzanie kont wymaga uprawnienia do zarządzania użytkownikami." />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
