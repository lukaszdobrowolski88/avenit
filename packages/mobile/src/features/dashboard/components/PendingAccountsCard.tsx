import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, UserCheck } from 'lucide-react-native';
import { usePermissions } from '../../../lib/permissions';
import { usePendingAccounts, type PendingAccount } from '../../admin/approvals';
import { plural } from './Greeting';

// Dla osób zarządzających użytkownikami: ktoś czeka na zatwierdzenie konta.
export const PendingAccountsCard = () => {
  const router = useRouter();
  const perms = usePermissions();
  const can = perms.ready && perms.can('action:settings:manage_users');
  const pending = usePendingAccounts(can);
  const count = ((pending.data ?? []) as PendingAccount[]).filter((a) => a.kind === 'admin').length;
  if (!can || count === 0) return null;

  return (
    <Pressable
      onPress={() => router.push('/(app)/approvals')}
      className="active:opacity-70"
      style={{
        marginHorizontal: 16,
        marginBottom: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: 20,
        backgroundColor: '#ffffff',
      }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#dcfce7', alignItems: 'center', justifyContent: 'center' }}>
        <UserCheck size={19} color="#15803d" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, color: '#0c0a09', fontFamily: 'Inter_700Bold' }}>
          {count} {plural(count, 'konto czeka', 'konta czekają', 'kont czeka')} na zatwierdzenie
        </Text>
        <Text style={{ fontSize: 12, color: '#78716c', marginTop: 1, fontFamily: 'Inter_500Medium' }}>
          Nowe rejestracje w kościele
        </Text>
      </View>
      <ChevronRight size={18} color="#a8a29e" />
    </Pressable>
  );
};
