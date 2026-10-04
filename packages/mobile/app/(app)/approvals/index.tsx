import { Alert, Pressable, RefreshControl, ScrollView, StatusBar, Text, View } from 'react-native';
import { Check, Mail, UserCheck, X } from 'lucide-react-native';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { formatDate } from '../../../src/lib/domain';
import { useDecideAccount, usePendingAccounts, type PendingAccount } from '../../../src/features/admin/approvals';
import { Empty, Loading } from '../../../src/features/teams/tabs/ui';

export default function ApprovalsScreen() {
  const pending = usePendingAccounts(true);
  const decide = useDecideAccount();
  const list: PendingAccount[] = pending.data ?? [];
  const toApprove = list.filter((a) => a.kind === 'admin');
  const unverified = list.filter((a) => a.kind === 'email');

  const run = (a: PendingAccount, approve: boolean) => {
    const go = () =>
      decide.mutate(
        { userId: a.id, approve },
        {
          onSuccess: () => Alert.alert(approve ? 'Zatwierdzono' : 'Odrzucono', approve ? `${a.name} dostanie e-mail powitalny.` : `Wniosek ${a.email} został usunięty.`),
          onError: (e: any) => Alert.alert('Nie udało się', e?.message ?? ''),
        },
      );
    if (approve) go();
    else
      Alert.alert('Odrzucić konto?', `${a.name} (${a.email}) — wniosek zostanie usunięty.`, [
        { text: 'Anuluj', style: 'cancel' },
        { text: 'Odrzuć', style: 'destructive', onPress: go },
      ]);
  };

  const Row = ({ a, approveLabel }: { a: PendingAccount; approveLabel: string }) => (
    <View style={{ borderRadius: 18, backgroundColor: '#FFFFFF', padding: 14, marginBottom: 10, gap: 10 }}>
      <View>
        <Text style={{ fontSize: 15, color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}>{a.name}</Text>
        <Text style={{ fontSize: 12, color: '#6B6557', marginTop: 2, fontFamily: 'Manrope_500Medium' }}>
          {a.email}
          {a.createdAt ? ` · ${formatDate(a.createdAt, 'd MMM, HH:mm')}` : ''}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          onPress={() => run(a, true)}
          disabled={decide.isPending}
          className="active:opacity-70"
          style={{ flex: 1, height: 42, borderRadius: 12, backgroundColor: '#15803d', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <Check size={16} color="#ffffff" strokeWidth={2.6} />
          <Text style={{ fontSize: 14, color: '#ffffff', fontFamily: 'Manrope_600SemiBold' }}>{approveLabel}</Text>
        </Pressable>
        <Pressable
          onPress={() => run(a, false)}
          disabled={decide.isPending}
          className="active:opacity-70"
          style={{ flex: 1, height: 42, borderRadius: 12, backgroundColor: '#F6F4EE', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <X size={16} color="#b91c1c" strokeWidth={2.6} />
          <Text style={{ fontSize: 14, color: '#b91c1c', fontFamily: 'Manrope_600SemiBold' }}>Odrzuć</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: '#F6F4EE' }}>
        <PageHeader title="Nowe konta" subtitle="Zatwierdzanie rejestracji" Icon={UserCheck} showBack />
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 130 }}
          refreshControl={<RefreshControl refreshing={pending.isRefetching} onRefresh={() => pending.refetch()} tintColor="#2A2312" />}
        >
          {pending.isLoading ? <Loading /> : null}
          {!pending.isLoading && list.length === 0 ? (
            <Empty Icon={UserCheck} title="Nikt nie czeka" hint="Gdy ktoś zarejestruje się w kościele, pojawi się tutaj." />
          ) : null}

          {toApprove.length ? (
            <>
              <Text style={{ fontSize: 13, color: '#8A6606', letterSpacing: 1.2, textTransform: 'uppercase', fontFamily: 'Manrope_700Bold', marginBottom: 8 }}>
                Czekają na zatwierdzenie
              </Text>
              {toApprove.map((a) => (
                <Row key={a.id} a={a} approveLabel="Zatwierdź" />
              ))}
            </>
          ) : null}

          {unverified.length ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, marginBottom: 8 }}>
                <Mail size={13} color="#6B6557" />
                <Text style={{ fontSize: 13, color: '#8A6606', letterSpacing: 1.2, textTransform: 'uppercase', fontFamily: 'Manrope_700Bold' }}>
                  Nie potwierdzili e-maila
                </Text>
              </View>
              {unverified.map((a) => (
                <Row key={a.id} a={a} approveLabel="Aktywuj" />
              ))}
            </>
          ) : null}
        </ScrollView>
      </View>
    </>
  );
}
