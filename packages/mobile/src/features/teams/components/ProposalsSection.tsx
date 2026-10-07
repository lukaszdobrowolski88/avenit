import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Plus } from 'lucide-react-native';
import { B } from '../../../components/ui/brand';
import { Chip, FormInput, FormLabel, PrimaryButton, Sheet } from '../../../components/ui/Sheet';
import { useProposals, useSubmitProposal, type Proposal } from '../proposals';
import { money } from '../tabs/ui';
import { friendlyError } from '../../../lib/errors';

// Propozycje budżetu zespołu: lista ze statusem + zgłoszenie nowej pozycji do skarbnika.

const F = { medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold' } as const;

const STATUS: Record<Proposal['status'], { text: string; fg: string; bg: string }> = {
  pending: { text: 'Czeka', fg: B.gold, bg: B.kurkumaSoft },
  approved: { text: 'Przyjęta', fg: '#15803d', bg: '#E7F6EC' },
  rejected: { text: 'Odrzucona', fg: '#B42318', bg: '#FDECEA' },
};

const ProposalSheet = ({ visible, financeName, myEmail, onClose }: { visible: boolean; financeName: string; myEmail: string | null; onClose: () => void }) => {
  const submit = useSubmitProposal(financeName, myEmail);
  const now = new Date().getFullYear();
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [year, setYear] = useState(now);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!visible) return;
    setKind('expense');
    setYear(now);
    setDescription('');
    setAmount('');
    setNote('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const send = () => {
    const d = description.trim();
    const a = Number(amount.replace(/\s/g, '').replace(',', '.'));
    if (!d || !(a > 0)) return Alert.alert('Podaj opis i kwotę', 'Kwota musi być większa od zera.');
    submit.mutate(
      { kind, year, description: d, amount: Math.round(a * 100) / 100, note: note.trim() || null },
      {
        onSuccess: () => {
          onClose();
          Alert.alert('Wysłano', 'Propozycja trafiła do zatwierdzenia przez osoby od finansów.');
        },
        onError: (e: unknown) => Alert.alert('Nie udało się wysłać', friendlyError(e, 'Spróbuj ponownie.')),
      },
    );
  };

  return (
    <Sheet
      visible={visible}
      eyebrow={financeName}
      title="Propozycja do budżetu"
      subtitle="Skarbnik zatwierdzi albo odrzuci pozycję — status zobaczysz tutaj."
      onClose={onClose}
      footer={<PrimaryButton label="Wyślij do zatwierdzenia" busy={submit.isPending} onPress={send} />}
    >
      <FormLabel first>Rodzaj</FormLabel>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Chip label="Wydatek" on={kind === 'expense'} onPress={() => setKind('expense')} />
        <Chip label="Przychód" on={kind === 'income'} onPress={() => setKind('income')} />
      </View>
      <FormLabel>Rok budżetu</FormLabel>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {[now, now + 1, now + 2].map((y) => (
          <Chip key={y} label={String(y)} on={year === y} onPress={() => setYear(y)} />
        ))}
      </View>
      <FormLabel>Na co</FormLabel>
      <FormInput value={description} onChangeText={setDescription} placeholder="np. Nowe statywy mikrofonowe" />
      <FormLabel>Kwota (zł)</FormLabel>
      <FormInput value={amount} onChangeText={setAmount} placeholder="np. 1200" keyboardType="decimal-pad" />
      <FormLabel>Uzasadnienie</FormLabel>
      <FormInput value={note} onChangeText={setNote} placeholder="Dlaczego to potrzebne (opcjonalnie)" multiline />
    </Sheet>
  );
};

export const ProposalsSection = ({ financeName, myEmail }: { financeName: string; myEmail: string | null }) => {
  const proposals = useProposals(financeName);
  const [open, setOpen] = useState(false);
  const list: Proposal[] = proposals.data ?? [];
  return (
    <View style={{ marginTop: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 8 }}>
        <Text style={{ flex: 1, fontSize: 13, color: B.gold, letterSpacing: 1.2, textTransform: 'uppercase', fontFamily: F.bold }}>Propozycje budżetu</Text>
        <Pressable onPress={() => setOpen(true)} hitSlop={8} className="active:opacity-70" style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Plus size={15} color={B.gold} strokeWidth={2.6} />
          <Text style={{ fontSize: 13, color: B.gold, fontFamily: F.bold }}>Zaproponuj</Text>
        </Pressable>
      </View>
      {list.length ? (
        <View style={{ backgroundColor: B.card, borderRadius: 18, overflow: 'hidden' }}>
          {list.map((p, i) => {
            const st = STATUS[p.status] ?? STATUS.pending;
            return (
              <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderTopColor: B.line }}>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontSize: 14, color: B.ink, fontFamily: F.semibold }}>{p.description}</Text>
                  <Text numberOfLines={1} style={{ marginTop: 1, fontSize: 12, color: B.ink3, fontFamily: F.medium }}>
                    {p.kind === 'income' ? 'Przychód' : 'Wydatek'} · {p.year} · {money(p.amount)}
                  </Text>
                </View>
                <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: st.bg }}>
                  <Text style={{ fontSize: 11, color: st.fg, fontFamily: F.bold }}>{st.text}</Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={{ fontSize: 13, color: B.ink4, fontFamily: F.medium }}>
          {proposals.isLoading ? 'Wczytywanie…' : 'Brakuje czegoś w budżecie? Zaproponuj pozycję skarbnikowi.'}
        </Text>
      )}
      <ProposalSheet visible={open} financeName={financeName} myEmail={myEmail} onClose={() => setOpen(false)} />
    </View>
  );
};
