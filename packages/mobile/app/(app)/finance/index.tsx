import { Alert, Pressable, RefreshControl, ScrollView, StatusBar, Text, View } from 'react-native';
import { Check, ExternalLink, Wallet, X } from 'lucide-react-native';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { useAuthSession } from '../../../src/lib/auth';
import { usePermissions } from '../../../src/lib/permissions';
import { useCampusQuery } from '../../../src/hooks/useCampusQuery';
import { openOnWeb } from '../../../src/features/modules/useModules';
import {
  useDecideExpense,
  useDecideProposal,
  useFinanceDecisions,
  type BudgetProposal,
  type PendingExpense,
} from '../../../src/features/giving/admin';
import { Empty, Loading, money } from '../../../src/features/teams/tabs/ui';

const DecisionButtons = ({ onApprove, onReject, disabled }: { onApprove: () => void; onReject: () => void; disabled?: boolean }) => (
  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
    <Pressable
      onPress={onApprove}
      disabled={disabled}
      className="active:opacity-70"
      style={{ flex: 1, height: 40, borderRadius: 12, backgroundColor: '#15803d', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
    >
      <Check size={15} color="#ffffff" strokeWidth={2.6} />
      <Text style={{ fontSize: 14, color: '#ffffff', fontFamily: 'Manrope_600SemiBold' }}>Zatwierdź</Text>
    </Pressable>
    <Pressable
      onPress={onReject}
      disabled={disabled}
      className="active:opacity-70"
      style={{ flex: 1, height: 40, borderRadius: 12, backgroundColor: '#F6F4EE', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
    >
      <X size={15} color="#b91c1c" strokeWidth={2.6} />
      <Text style={{ fontSize: 14, color: '#b91c1c', fontFamily: 'Manrope_600SemiBold' }}>Odrzuć</Text>
    </Pressable>
  </View>
);

// Finanse na telefonie: decyzje (propozycje budżetu zespołów, wydatki do akceptacji).
// Księgowość, raporty i budżet zostają na webie.
export default function FinanceScreen() {
  const { user } = useAuthSession();
  const perms = usePermissions();
  const { campusIdForInsert } = useCampusQuery();
  const canApproveBudget = perms.can('action:finance:approve');
  const canApproveExpenses = perms.can('res:expense_transactions:update');
  const decisions = useFinanceDecisions(true);
  const decideP = useDecideProposal(user?.email ?? null, campusIdForInsert);
  const decideE = useDecideExpense(user?.email ?? null);

  const proposals: BudgetProposal[] = canApproveBudget ? decisions.data?.proposals ?? [] : [];
  const expenses: PendingExpense[] = canApproveExpenses ? decisions.data?.expenses ?? [] : [];

  const decide = (label: string, run: () => Promise<unknown>) =>
    Alert.alert(label, undefined, [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Tak', onPress: () => run().catch((e: any) => Alert.alert('Nie udało się', e?.message ?? '')) },
    ]);

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: '#F6F4EE' }}>
        <PageHeader title="Finanse" subtitle="Do decyzji" Icon={Wallet} showBack />
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 130 }}
          refreshControl={<RefreshControl refreshing={decisions.isRefetching} onRefresh={() => decisions.refetch()} tintColor="#2A2312" />}
        >
          {decisions.isLoading ? <Loading /> : null}

          {!decisions.isLoading && !proposals.length && !expenses.length ? (
            <Empty Icon={Wallet} title="Nic nie czeka na decyzję" hint="Propozycje budżetu zespołów i wydatki do akceptacji pojawią się tutaj." />
          ) : null}

          {proposals.length ? (
            <Text style={{ fontSize: 13, color: '#7A7466', letterSpacing: 0.5, textTransform: 'uppercase', fontFamily: 'Manrope_700Bold', marginBottom: 8 }}>
              Propozycje do budżetu
            </Text>
          ) : null}
          {proposals.map((p) => (
            <View key={p.id} style={{ borderRadius: 18, backgroundColor: '#EFEBE2', padding: 14, marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, color: '#2A2312', fontFamily: 'Manrope_700Bold' }}>{p.description || 'Propozycja'}</Text>
                  <Text style={{ fontSize: 12, color: '#7A7466', marginTop: 2, fontFamily: 'Manrope_500Medium' }}>
                    {[p.teamType, p.kind === 'income' ? 'przychód' : 'wydatek', String(p.year), p.submittedBy].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Text style={{ fontSize: 16, color: '#2A2312', fontFamily: 'Manrope_700Bold' }}>{money(p.amount)}</Text>
              </View>
              {p.note ? <Text style={{ fontSize: 13, color: '#3A3427', marginTop: 6, fontFamily: 'Manrope_400Regular' }}>{p.note}</Text> : null}
              <DecisionButtons
                disabled={decideP.isPending}
                onApprove={() => decide('Dodać do budżetu?', () => decideP.mutateAsync({ p, approve: true }))}
                onReject={() => decide('Odrzucić propozycję?', () => decideP.mutateAsync({ p, approve: false }))}
              />
            </View>
          ))}

          {expenses.length ? (
            <Text style={{ fontSize: 13, color: '#7A7466', letterSpacing: 0.5, textTransform: 'uppercase', fontFamily: 'Manrope_700Bold', marginTop: 10, marginBottom: 8 }}>
              Wydatki do akceptacji
            </Text>
          ) : null}
          {expenses.map((e) => (
            <View key={e.id} style={{ borderRadius: 18, backgroundColor: '#EFEBE2', padding: 14, marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, color: '#2A2312', fontFamily: 'Manrope_700Bold' }}>{e.contractor || e.description || 'Wydatek'}</Text>
                  <Text style={{ fontSize: 12, color: '#7A7466', marginTop: 2, fontFamily: 'Manrope_500Medium' }}>
                    {[e.teamType, e.date, e.submittedBy].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Text style={{ fontSize: 16, color: '#2A2312', fontFamily: 'Manrope_700Bold' }}>{money(e.amount)}</Text>
              </View>
              <DecisionButtons
                disabled={decideE.isPending}
                onApprove={() => decide('Zaakceptować wydatek?', () => decideE.mutateAsync({ id: e.id, approve: true }))}
                onReject={() => decide('Odrzucić wydatek?', () => decideE.mutateAsync({ id: e.id, approve: false }))}
              />
            </View>
          ))}

          <Pressable
            onPress={() => openOnWeb('/finance')}
            className="active:opacity-70"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, padding: 14, borderRadius: 16, backgroundColor: '#EFEBE2' }}
          >
            <ExternalLink size={16} color="#8A6606" />
            <Text style={{ flex: 1, fontSize: 14, color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}>Budżet, raporty i księgowość na webie</Text>
          </Pressable>
        </ScrollView>
      </View>
    </>
  );
}
