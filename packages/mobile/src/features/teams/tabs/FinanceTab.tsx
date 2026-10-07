import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Camera, ImageIcon, Paperclip, Wallet, X } from 'lucide-react-native';
import type { TeamConfig } from '../config';
import { isCountedExpense, isPendingExpense, useAddTeamExpense, useTeamFinance, type Expense, type TeamFinance } from '../data';
import { B } from '../../../components/ui/brand';
import { friendlyError } from '../../../lib/errors';
import { toast } from '../../../lib/toast';
import { pickImageForTask, takePhotoForTask, type PickedAsset } from '../../dashboard/task-attachments';
import { AddButton, Card, Empty, Loading, Pill, money } from './ui';
import { DateField } from '../../../components/ui/DateField';
import { ProposalsSection } from '../components/ProposalsSection';

const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const Bar = ({ value, max }: { value: number; max: number }) => {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const over = max > 0 && value > max;
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: B.paper2, overflow: 'hidden' }}>
      <View style={{ width: `${Math.round(pct * 100)}%`, height: 6, borderRadius: 3, backgroundColor: over ? '#B42318' : B.kurkuma }} />
    </View>
  );
};

const inputStyle = {
  height: 46,
  borderRadius: 14,
  paddingHorizontal: 14,
  backgroundColor: '#ECE8DE',
  fontSize: 15,
  color: '#2A2312',
  fontFamily: 'Manrope_500Medium',
} as const;

const Label = ({ children }: { children: string }) => (
  <Text
    style={{
      fontSize: 12,
      color: '#8A6606',
      fontFamily: 'Manrope_700Bold',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      marginTop: 14,
      marginBottom: 6,
    }}
  >
    {children}
  </Text>
);

// Finanse zespołu (budget_items + expense_transactions po nazwie zespołu, jak web)
// + dodanie wydatku z paragonem zrobionym telefonem.
export const FinanceTab = ({
  cfg,
  scope,
  myEmail,
  myName,
}: {
  cfg: TeamConfig;
  scope: { selectedCampusId: number | null; withCampusFilter: <T>(q: T) => T };
  myEmail: string | null;
  myName: string | null;
}) => {
  const fin = useTeamFinance(cfg, scope);
  const add = useAddTeamExpense(cfg);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayYmd());
  const [contractor, setContractor] = useState('');
  const [line, setLine] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [receipt, setReceipt] = useState<PickedAsset | null>(null);

  const reset = () => {
    setAmount('');
    setDate(todayYmd());
    setContractor('');
    setLine(null);
    setDetails('');
    setReceipt(null);
  };

  const save = async () => {
    if (add.isPending) return;
    const value = Number(amount.replace(',', '.').replace(/\s/g, ''));
    const lines = fin.data?.lines ?? [];
    const missing = [
      !(value > 0) && 'kwota',
      lines.length > 0 && !line && 'pozycja budżetu',
      !contractor.trim() && 'kontrahent',
    ].filter(Boolean);
    if (missing.length) {
      Alert.alert('Uzupełnij formularz', `Brakuje: ${missing.join(', ')}.`);
      return;
    }
    try {
      const { status } = await add.mutateAsync({
        amount: value,
        date,
        contractor: contractor.trim(),
        budgetLine: line,
        detailed: details.trim(),
        responsible: myName || myEmail,
        receipt: receipt ? { uri: receipt.uri, mimeType: receipt.mimeType, name: receipt.fileName } : null,
      });
      setOpen(false);
      reset();
      if (isPendingExpense({ status })) {
        toast.success('Wysłano do akceptacji', 'Wydatek wliczy się do budżetu po zatwierdzeniu w Finansach.');
      } else {
        toast.success('Zapisano wydatek');
      }
    } catch (e: unknown) {
      // Okno zostaje otwarte z wpisanymi danymi.
      Alert.alert('Nie udało się zapisać wydatku', friendlyError(e, 'Spróbuj ponownie.'));
    }
  };

  const data: TeamFinance | undefined = fin.data;

  return (
    <View>
      <AddButton label="Dodaj wydatek" onPress={() => setOpen(true)} />
      {fin.isLoading ? <Loading /> : null}
      {fin.isError ? (
        <Empty Icon={Wallet} title="Nie udało się wczytać finansów" hint="Możesz nie mieć dostępu do finansów tego zespołu." />
      ) : null}

      {data ? (
        <>
          <Card>
            <Text style={{ fontSize: 12, color: '#8A6606', fontFamily: 'Manrope_600SemiBold', textTransform: 'uppercase', letterSpacing: 1.2 }}>
              Budżet {data.year}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4, marginBottom: 8 }}>
              <Text style={{ fontSize: 24, color: '#2A2312', fontFamily: 'Manrope_700Bold', letterSpacing: -0.6 }}>
                {money(data.spent)}
              </Text>
              <Text style={{ fontSize: 13, color: '#6B6557', fontFamily: 'Manrope_500Medium' }}>
                wykorzystano z {money(data.planned)}
              </Text>
            </View>
            <Bar value={data.spent} max={data.planned} />
            {data.pendingCount ? (
              <Text style={{ marginTop: 8, fontSize: 13, color: B.gold, fontFamily: 'Manrope_600SemiBold' }}>
                Czeka na akceptację: {money(data.pendingSum)} ({data.pendingCount})
              </Text>
            ) : null}
            <Text style={{ marginTop: 6, fontSize: 12, lineHeight: 17, color: B.ink4, fontFamily: 'Manrope_500Medium' }}>
              Do wykorzystania wliczają się tylko wydatki zatwierdzone i opłacone.
            </Text>
          </Card>

          {data.lines.length ? (
            <Card>
              {data.lines.map((l, i) => (
                <View key={l.id} style={{ paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: '#E6E1D5', gap: 6 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}>
                      {l.description}
                    </Text>
                    <Text style={{ fontSize: 13, color: l.spent > l.planned && l.planned > 0 ? '#dc2626' : '#4A463E', fontFamily: 'Manrope_600SemiBold' }}>
                      {money(l.spent)} / {money(l.planned)}
                    </Text>
                  </View>
                  <Bar value={l.spent} max={l.planned} />
                </View>
              ))}
            </Card>
          ) : null}

          <Text
            style={{
              fontSize: 13,
              color: '#8A6606',
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              fontFamily: 'Manrope_700Bold',
              marginTop: 8,
              marginBottom: 8,
            }}
          >
            Wydatki
          </Text>
          {data.expenses.length === 0 ? (
            <Text style={{ fontSize: 13, color: '#6E685A', fontFamily: 'Manrope_500Medium', marginBottom: 12 }}>
              Brak wydatków w tym roku.
            </Text>
          ) : null}
          {data.expenses.slice(0, 30).map((e: Expense) => (
            <Card key={e.id}>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text numberOfLines={1} style={{ fontSize: 14, color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}>
                    {e.contractor || e.description || 'Wydatek'}
                  </Text>
                  <Text numberOfLines={1} style={{ fontSize: 12, color: '#6B6557', fontFamily: 'Manrope_500Medium' }}>
                    {[e.date, e.description && e.contractor ? e.description : null].filter(Boolean).join(' · ')}
                  </Text>
                  {!isCountedExpense(e) ? (
                    <View style={{ flexDirection: 'row', marginTop: 4 }}>
                      {e.status === 'rejected' ? (
                        <Pill text="Odrzucony" tint="#B42318" bg="#FDE7E4" />
                      ) : (
                        <Pill text="Czeka na akceptację" tint={B.goldDeep} bg={B.kurkumaSoft} />
                      )}
                    </View>
                  ) : null}
                </View>
                {e.hasDocuments ? <Paperclip size={14} color="#6E685A" /> : null}
                <Text
                  style={{
                    fontSize: 15,
                    color: isCountedExpense(e) ? '#2A2312' : B.ink4,
                    fontFamily: 'Manrope_700Bold',
                    textDecorationLine: e.status === 'rejected' ? 'line-through' : 'none',
                  }}
                >
                  {money(e.amount)}
                </Text>
              </View>
            </Card>
          ))}
        </>
      ) : null}

      <ProposalsSection financeName={cfg.financeName} myEmail={myEmail} />

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: '#F6F4EE' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 8 }}>
            <Text style={{ flex: 1, fontSize: 20, color: '#2A2312', fontFamily: 'Manrope_700Bold' }}>Nowy wydatek</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={10} className="active:opacity-60">
              <X size={22} color="#4A463E" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <Text style={{ fontSize: 13, lineHeight: 18, color: B.ink3, fontFamily: 'Manrope_500Medium' }}>
              Wydatek trafia do Finansów. Jeśli nie zatwierdzasz wydatków, zostanie zapisany jako wniosek i wliczy się do budżetu po akceptacji.
            </Text>
            <Label>Kwota (zł)</Label>
            <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor="#6E685A" style={inputStyle} />

            <Label>Data płatności</Label>
            <DateField value={date} onChange={setDate} />

            <Label>Kontrahent</Label>
            <TextInput value={contractor} onChangeText={setContractor} placeholder="np. Thomann, Media Expert" placeholderTextColor="#6E685A" style={inputStyle} />

            {(data?.lines.length ?? 0) > 0 ? (
              <>
                <Label>Pozycja budżetu</Label>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {data!.lines.map((l) => {
                    const on = line === l.description;
                    return (
                      <Pressable
                        key={l.id}
                        onPress={() => setLine(on ? null : l.description)}
                        className="active:opacity-70"
                        style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: on ? '#2A2312' : '#ECE8DE' }}
                      >
                        <Text style={{ fontSize: 13, color: on ? '#ffffff' : '#3A3427', fontFamily: 'Manrope_600SemiBold' }}>{l.description}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            <Label>Opis</Label>
            <TextInput
              value={details}
              onChangeText={setDetails}
              placeholder="Na co był wydatek?"
              placeholderTextColor="#6E685A"
              multiline
              style={[inputStyle, { height: 90, paddingTop: 12, textAlignVertical: 'top' as const }]}
            />

            <Label>Paragon / faktura</Label>
            {receipt ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Image source={{ uri: receipt.uri }} style={{ width: 72, height: 72, borderRadius: 12, backgroundColor: '#ECE8DE' }} contentFit="cover" />
                <Pressable onPress={() => setReceipt(null)} className="active:opacity-60">
                  <Text style={{ fontSize: 14, color: '#b91c1c', fontFamily: 'Manrope_600SemiBold' }}>Usuń zdjęcie</Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[
                  { label: 'Zrób zdjęcie', Icon: Camera, fn: takePhotoForTask },
                  { label: 'Z galerii', Icon: ImageIcon, fn: pickImageForTask },
                ].map(({ label, Icon, fn }) => (
                  <Pressable
                    key={label}
                    onPress={async () => {
                      const a = await fn();
                      if (a) setReceipt(a);
                    }}
                    className="active:opacity-70"
                    style={{
                      flex: 1,
                      height: 46,
                      borderRadius: 14,
                      backgroundColor: '#ECE8DE',
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                    }}
                  >
                    <Icon size={16} color="#2A2312" />
                    <Text style={{ fontSize: 14, color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            <Pressable
              onPress={save}
              disabled={add.isPending}
              className="active:opacity-80"
              style={{
                marginTop: 24,
                height: 52,
                borderRadius: 16,
                backgroundColor: '#2A2312',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: add.isPending ? 0.6 : 1,
              }}
            >
              {add.isPending ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={{ fontSize: 15, color: '#ffffff', fontFamily: 'Manrope_600SemiBold' }}>Zapisz wydatek</Text>
              )}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};
