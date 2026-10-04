import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, UserCheck } from 'lucide-react-native';
import { usePermissions } from '../../../lib/permissions';
import { usePendingAccounts, type PendingAccount } from '../../admin/approvals';
import { plural } from './Greeting';
import { D, F } from '../theme';

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
        marginBottom: 28,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: D.radius,
        backgroundColor: D.card,
      }}
    >
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: D.well, alignItems: 'center', justifyContent: 'center' }}>
        <UserCheck size={20} color={D.ink} strokeWidth={1.9} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, color: D.ink, letterSpacing: -0.2, fontFamily: F.bold }}>
          {count} {plural(count, 'konto czeka', 'konta czekają', 'kont czeka')} na zatwierdzenie
        </Text>
        <Text style={{ fontSize: 13, color: D.ink2, marginTop: 1, fontFamily: F.medium }}>
          Nowe rejestracje w kościele
        </Text>
      </View>
      <ChevronRight size={18} color={D.ink3} />
    </Pressable>
  );
};
