import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StatusBar, Text, View } from 'react-native';
import { Check, Mail, UserCheck, X } from 'lucide-react-native';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { formatDate } from '../../../src/lib/domain';
import { useDecideAccount, usePendingAccounts, type PendingAccount } from '../../../src/features/admin/approvals';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { B } from '../../../src/components/ui/brand';
import { friendlyError, showError } from '../../../src/lib/errors';
import { toast } from '../../../src/lib/toast';

export default function ApprovalsScreen() {
  const pending = usePendingAccounts(true);
  const decide = useDecideAccount();
  const list: PendingAccount[] = pending.data ?? [];
  const toApprove = list.filter((a) => a.kind === 'admin');
  const unverified = list.filter((a) => a.kind === 'email');

  const run = (a: PendingAccount, approve: boolean) => {
    if (decide.isPending) return;
    const go = () =>
      decide.mutate(
        { userId: a.id, approve },
        {
          onSuccess: () =>
            approve
              ? toast.success('Konto zatwierdzone', `${a.name} dostanie e-mail powitalny.`)
              : toast.success('Wniosek odrzucony', `Konto ${a.email} zostało usunięte.`),
          onError: (e) => showError(approve ? 'Nie udało się zatwierdzić konta' : 'Nie udało się odrzucić wniosku', e),
        },
      );
    if (approve) go();
    else
      Alert.alert('Odrzucić konto?', `${a.name} (${a.email}) nie dostanie dostępu, a wniosek zostanie usunięty.`, [
        { text: 'Anuluj', style: 'cancel' },
        { text: 'Odrzuć', style: 'destructive', onPress: go },
      ]);
  };
  const busyId = decide.isPending ? decide.variables?.userId ?? null : null;

  const Row = ({ a, approveLabel }: { a: PendingAccount; approveLabel: string }) => (
    <View style={{ borderRadius: 20, backgroundColor: '#FFFFFF', padding: 14, marginBottom: 10, gap: 10 }}>
      <View>
        <Text style={{ fontSize: 15, color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}>{a.name}</Text>
        <Text style={{ fontSize: 12, color: '#6B6557', marginTop: 2, fontFamily: 'Manrope_500Medium' }}>
          {a.email}
          {a.createdAt ? ` · ${formatDate(a.createdAt, 'd MMM, HH:mm')}` : ''}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {busyId === a.id ? (
          <View style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={B.ink} />
          </View>
        ) : (
          <>
            <Pressable
              onPress={() => run(a, false)}
              disabled={decide.isPending}
              accessibilityRole="button"
              accessibilityLabel={`Odrzuć: ${a.name}`}
              className="active:opacity-70"
              style={{ flex: 1, height: 44, borderRadius: 22, backgroundColor: B.paper, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <X size={16} color={B.danger} strokeWidth={2.6} />
              <Text style={{ fontSize: 14, color: B.danger, fontFamily: 'Manrope_600SemiBold' }}>Odrzuć</Text>
            </Pressable>
            <Pressable
              onPress={() => run(a, true)}
              disabled={decide.isPending}
              accessibilityRole="button"
              accessibilityLabel={`${approveLabel}: ${a.name}`}
              className="active:opacity-70"
              style={{ flex: 1, height: 44, borderRadius: 22, backgroundColor: B.kurkuma, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <Check size={16} color={B.ink} strokeWidth={2.6} />
              <Text style={{ fontSize: 14, color: B.ink, fontFamily: 'Manrope_700Bold' }}>{approveLabel}</Text>
            </Pressable>
          </>
        )}
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
          {pending.isLoading ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <ActivityIndicator color={B.ink} />
            </View>
          ) : null}
          {pending.isError ? (
            <EmptyState
              Icon={UserCheck}
              title="Nie udało się wczytać listy"
              hint={friendlyError(pending.error)}
              actionLabel="Spróbuj ponownie"
              onAction={() => pending.refetch()}
            />
          ) : null}
          {!pending.isLoading && !pending.isError && list.length === 0 ? (
            <EmptyState Icon={UserCheck} title="Nikt nie czeka na zatwierdzenie" hint="Gdy ktoś zarejestruje się w kościele, pojawi się tutaj." />
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
