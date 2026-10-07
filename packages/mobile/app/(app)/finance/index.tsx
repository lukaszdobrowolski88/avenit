import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StatusBar, Text, View } from 'react-native';
import { Check, ExternalLink, Info, Wallet, X } from 'lucide-react-native';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { useAuthSession } from '../../../src/lib/auth';
import { usePermissions } from '../../../src/lib/permissions';
import { useCampusQuery } from '../../../src/hooks/useCampusQuery';
import { openOnWeb } from '../../../src/features/modules/useModules';
import { friendlyError, showError } from '../../../src/lib/errors';
import { toast } from '../../../src/lib/toast';
import {
  useDecideExpense,
  useDecideProposal,
  useFinanceDecisions,
  type BudgetProposal,
  type PendingExpense,
} from '../../../src/features/giving/admin';
import { Empty, Loading, money } from '../../../src/features/teams/tabs/ui';

const DANGER = '#B42318';

// Przyciski decyzji — tylko z uprawnieniem action:finance:approve (jak web). Zatwierdź = słód,
// Odrzuć = papier z czerwonym tekstem; bez zieleni/tęczy.
const DecisionButtons = ({
  onApprove,
  onReject,
  busy,
  disabled,
}: {
  onApprove: () => void;
  onReject: () => void;
  busy?: boolean;
  disabled?: boolean;
}) => (
  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
    <Pressable
      onPress={onApprove}
      disabled={disabled || busy}
      accessibilityRole="button"
      className="active:opacity-70"
      style={{
        flex: 1,
        height: 44,
        borderRadius: 12,
        backgroundColor: '#2A2312',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        opacity: disabled && !busy ? 0.5 : 1,
      }}
    >
      {busy ? (
        <ActivityIndicator color="#F6F4EE" />
      ) : (
        <>
          <Check size={15} color="#FFBE0B" strokeWidth={2.6} />
          <Text style={{ fontSize: 14, color: '#F6F4EE', fontFamily: 'Manrope_600SemiBold' }}>Zatwierdź</Text>
        </>
      )}
    </Pressable>
    <Pressable
      onPress={onReject}
      disabled={disabled || busy}
      accessibilityRole="button"
      className="active:opacity-70"
      style={{
        flex: 1,
        height: 44,
        borderRadius: 12,
        backgroundColor: '#F6F4EE',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        opacity: disabled || busy ? 0.5 : 1,
      }}
    >
      <X size={15} color={DANGER} strokeWidth={2.6} />
      <Text style={{ fontSize: 14, color: DANGER, fontFamily: 'Manrope_600SemiBold' }}>Odrzuć</Text>
    </Pressable>
  </View>
);

const SectionTitle = ({ children, first }: { children: string; first?: boolean }) => (
  <Text
    style={{
      fontSize: 13,
      color: '#8A6606',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      fontFamily: 'Manrope_700Bold',
      marginTop: first ? 0 : 10,
      marginBottom: 8,
    }}
  >
    {children}
  </Text>
);

const ErrorLine = ({ error, fallback }: { error: unknown; fallback: string }) => (
  <Text style={{ fontSize: 13, color: '#4A463E', fontFamily: 'Manrope_500Medium', marginBottom: 10, lineHeight: 19 }}>
    {friendlyError(error, fallback)}
  </Text>
);

// Finanse na telefonie: decyzje (propozycje budżetu zespołów, wydatki do akceptacji).
// Księgowość, raporty i budżet zostają na webie. Decyzje tylko z action:finance:approve —
// serwer to egzekwuje; bez uprawnienia lista jest tylko do wglądu.
export default function FinanceScreen() {
  const { user } = useAuthSession();
  const perms = usePermissions();
  const { campusIdForInsert } = useCampusQuery();
  const canApprove = perms.can('action:finance:approve');
  const decisions = useFinanceDecisions(true);
  const decideP = useDecideProposal(user?.email ?? null, campusIdForInsert);
  const decideE = useDecideExpense(user?.email ?? null);
  // Który wiersz jest właśnie zapisywany (blokada podwójnej decyzji, spinner w przycisku).
  const [busyId, setBusyId] = useState<string | null>(null);

  const proposals: BudgetProposal[] = decisions.data?.proposals ?? [];
  const expenses: PendingExpense[] = decisions.data?.expenses ?? [];
  const busy = busyId != null;

  const confirm = (
    title: string,
    message: string,
    actionLabel: string,
    destructive: boolean,
    id: string,
    run: () => Promise<unknown>,
    successText: string,
  ) =>
    Alert.alert(title, message, [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: actionLabel,
        style: destructive ? 'destructive' : 'default',
        onPress: async () => {
          if (busyId) return;
          setBusyId(id);
          try {
            await run();
            toast.success(successText);
          } catch (e) {
            showError('Nie udało się zapisać decyzji', e, 'Spróbuj ponownie.');
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);

  const nothing = !decisions.isLoading && !decisions.isError && !proposals.length && !expenses.length;

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
          {decisions.isError ? (
            <ErrorLine error={decisions.error} fallback="Nie udało się wczytać spraw do decyzji. Pociągnij w dół, aby spróbować ponownie." />
          ) : null}

          {!canApprove && (proposals.length > 0 || expenses.length > 0) ? (
            <View style={{ flexDirection: 'row', gap: 10, padding: 14, borderRadius: 16, backgroundColor: '#FFF1C2', marginBottom: 12 }}>
              <Info size={16} color="#6B4F05" style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontSize: 13, color: '#6B4F05', fontFamily: 'Manrope_500Medium', lineHeight: 19 }}>
                Podgląd. Propozycje i wydatki zatwierdza osoba z uprawnieniem do zatwierdzania w Finansach.
              </Text>
            </View>
          ) : null}

          {nothing ? (
            <Empty Icon={Wallet} title="Nic nie czeka na decyzję" hint="Propozycje budżetu zespołów i wydatki do akceptacji pojawią się tutaj." />
          ) : null}

          {decisions.data?.proposalsError ? (
            <ErrorLine error={decisions.data.proposalsError} fallback="Nie udało się wczytać propozycji budżetu." />
          ) : null}
          {proposals.length ? <SectionTitle first>Propozycje do budżetu</SectionTitle> : null}
          {proposals.map((p) => {
            const name = p.description || 'Propozycja';
            return (
              <View key={p.id} style={{ borderRadius: 18, backgroundColor: '#FFFFFF', padding: 14, marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, color: '#2A2312', fontFamily: 'Manrope_700Bold' }}>{name}</Text>
                    <Text style={{ fontSize: 12, color: '#6B6557', marginTop: 2, fontFamily: 'Manrope_500Medium' }}>
                      {[p.teamType, p.kind === 'income' ? 'przychód' : 'wydatek', String(p.year), p.submittedBy].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 16, color: '#2A2312', fontFamily: 'Manrope_700Bold' }}>{money(p.amount)}</Text>
                </View>
                {p.note ? <Text style={{ fontSize: 13, color: '#4A463E', marginTop: 6, fontFamily: 'Manrope_400Regular' }}>{p.note}</Text> : null}
                {canApprove ? (
                  <DecisionButtons
                    busy={busyId === `p:${p.id}`}
                    disabled={busy}
                    onApprove={() =>
                      confirm(
                        `Dodać „${name}” do budżetu ${p.year}?`,
                        `Powstanie pozycja budżetu na ${money(p.amount)}, a autor dostanie powiadomienie.`,
                        'Dodaj do budżetu',
                        false,
                        `p:${p.id}`,
                        () => decideP.mutateAsync({ p, approve: true }),
                        'Dodano do budżetu',
                      )
                    }
                    onReject={() =>
                      confirm(
                        `Odrzucić propozycję „${name}”?`,
                        'Propozycja nie trafi do budżetu, a autor dostanie powiadomienie.',
                        'Odrzuć',
                        true,
                        `p:${p.id}`,
                        () => decideP.mutateAsync({ p, approve: false }),
                        'Propozycja odrzucona',
                      )
                    }
                  />
                ) : null}
              </View>
            );
          })}

          {decisions.data?.expensesError ? (
            <ErrorLine error={decisions.data.expensesError} fallback="Nie udało się wczytać wydatków do akceptacji." />
          ) : null}
          {expenses.length ? <SectionTitle first={!proposals.length}>Wydatki do akceptacji</SectionTitle> : null}
          {expenses.map((e) => {
            const name = e.contractor || e.description || 'Wydatek';
            return (
              <View key={e.id} style={{ borderRadius: 18, backgroundColor: '#FFFFFF', padding: 14, marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, color: '#2A2312', fontFamily: 'Manrope_700Bold' }}>{name}</Text>
                    <Text style={{ fontSize: 12, color: '#6B6557', marginTop: 2, fontFamily: 'Manrope_500Medium' }}>
                      {[e.teamType, e.date, e.submittedBy].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 16, color: '#2A2312', fontFamily: 'Manrope_700Bold' }}>{money(e.amount)}</Text>
                </View>
                {e.contractor && e.description ? (
                  <Text style={{ fontSize: 13, color: '#4A463E', marginTop: 6, fontFamily: 'Manrope_400Regular' }}>{e.description}</Text>
                ) : null}
                {canApprove ? (
                  <DecisionButtons
                    busy={busyId === `e:${e.id}`}
                    disabled={busy}
                    onApprove={() =>
                      confirm(
                        `Zatwierdzić wydatek „${name}”?`,
                        `${money(e.amount)} wejdzie do sum i realizacji budżetu.`,
                        'Zatwierdź',
                        false,
                        `e:${e.id}`,
                        () => decideE.mutateAsync({ id: e.id, approve: true }),
                        'Wydatek zatwierdzony',
                      )
                    }
                    onReject={() =>
                      confirm(
                        `Odrzucić wydatek „${name}”?`,
                        `${money(e.amount)} nie wejdzie do sum. Osoba zgłaszająca zobaczy status „odrzucony”.`,
                        'Odrzuć',
                        true,
                        `e:${e.id}`,
                        () => decideE.mutateAsync({ id: e.id, approve: false }),
                        'Wydatek odrzucony',
                      )
                    }
                  />
                ) : null}
              </View>
            );
          })}

          <Pressable
            onPress={() => openOnWeb('/finance')}
            className="active:opacity-70"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, padding: 14, borderRadius: 16, backgroundColor: '#FFFFFF' }}
          >
            <ExternalLink size={16} color="#8A6606" />
            <Text style={{ flex: 1, fontSize: 14, color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}>Budżet, raporty i księgowość na webie</Text>
          </Pressable>
        </ScrollView>
      </View>
    </>
  );
}
