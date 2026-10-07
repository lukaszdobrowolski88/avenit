import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { Check, ClipboardList, Mail, Trash2, X } from 'lucide-react-native';
import { B } from '../../../components/ui/brand';
import { DateField } from '../../../components/ui/DateField';
import {
  useDeleteTemplate,
  useDuplicateProgram,
  useProgramTemplates,
  useSaveTemplate,
  type ProgramTemplate,
} from '../api';
import { programEmailHtml, sendProgramEmail, useProgramRecipients, type Recipient } from '../email';
import { newItemId, type PlanItem } from '../schedule';
import { friendlyError } from '../../../lib/errors';

// Narzędzia programu (jak pasek narzędzi edytora na webie): duplikowanie, szablony planu,
// wysyłka e-mailem. Eksporty (PDF/PPT/ProPresenter) zostają na webie.

const F = { medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold' } as const;

const Sheet = ({ visible, title, subtitle, onClose, children, footer }: { visible: boolean; title: string; subtitle?: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) => (
  <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: B.paper }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', padding: 16, paddingBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, color: B.ink, fontFamily: F.bold }}>{title}</Text>
          {subtitle ? <Text style={{ marginTop: 2, fontSize: 13, color: B.ink3, fontFamily: F.medium }}>{subtitle}</Text> : null}
        </View>
        <Pressable onPress={onClose} hitSlop={10} className="active:opacity-60">
          <X size={22} color={B.ink2} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 24, gap: 10 }} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {footer ? <View style={{ padding: 16, paddingBottom: 32 }}>{footer}</View> : null}
    </KeyboardAvoidingView>
  </Modal>
);

const PrimaryButton = ({ label, onPress, busy, disabled }: { label: string; onPress: () => void; busy?: boolean; disabled?: boolean }) => (
  <Pressable
    onPress={onPress}
    disabled={busy || disabled}
    className="active:opacity-80"
    style={{ height: 52, borderRadius: 999, backgroundColor: B.kurkuma, alignItems: 'center', justifyContent: 'center', opacity: busy || disabled ? 0.55 : 1 }}
  >
    {busy ? <ActivityIndicator color={B.ink} /> : <Text style={{ fontSize: 15, color: B.ink, fontFamily: F.bold }}>{label}</Text>}
  </Pressable>
);

const addDays = (ymd: string, n: number) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const x = new Date(y, m - 1, d + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

// ── Duplikowanie ──
export const DuplicateProgramModal = ({
  visible,
  programId,
  programDate,
  campusIdForInsert,
  onClose,
  onDone,
}: {
  visible: boolean;
  programId: number;
  programDate: string;
  campusIdForInsert: number | null;
  onClose: () => void;
  onDone: (newId: number) => void;
}) => {
  const dup = useDuplicateProgram(campusIdForInsert);
  const [date, setDate] = useState(addDays(programDate, 7));
  useEffect(() => {
    if (visible) setDate(addDays(programDate, 7));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const go = () =>
    dup.mutate(
      { programId, date },
      {
        onSuccess: (id) => {
          onClose();
          onDone(id);
        },
        onError: (e: unknown) => Alert.alert('Nie udało się zduplikować', friendlyError(e, 'Spróbuj ponownie.')),
      },
    );
  return (
    <Sheet
      visible={visible}
      title="Duplikuj program"
      subtitle="Kopia planu na inny dzień (bez podpiętych wydarzeń)."
      onClose={onClose}
      footer={<PrimaryButton label="Duplikuj" onPress={go} busy={dup.isPending} />}
    >
      <Text style={{ fontSize: 12, color: B.gold, fontFamily: F.bold, letterSpacing: 1.2 }}>DATA KOPII</Text>
      <DateField value={date} onChange={setDate} />
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {[7, 14].map((n) => (
          <Pressable
            key={n}
            onPress={() => setDate(addDays(programDate, n))}
            className="active:opacity-70"
            style={{ paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, backgroundColor: date === addDays(programDate, n) ? B.ink : B.paper2 }}
          >
            <Text style={{ fontSize: 13, color: date === addDays(programDate, n) ? '#fff' : B.ink, fontFamily: F.semibold }}>
              {n === 7 ? 'Za tydzień' : 'Za 2 tygodnie'}
            </Text>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
};

// ── Zapis szablonu ──
export const SaveTemplateModal = ({
  visible,
  defaultName,
  schedule,
  onClose,
}: {
  visible: boolean;
  defaultName: string;
  schedule: PlanItem[];
  onClose: () => void;
}) => {
  const save = useSaveTemplate();
  const [name, setName] = useState(defaultName);
  useEffect(() => {
    if (visible) setName(defaultName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const go = () => {
    if (!name.trim()) return Alert.alert('Podaj nazwę szablonu');
    save.mutate(
      { name: name.trim(), schedule },
      {
        onSuccess: () => {
          onClose();
          Alert.alert('Zapisano szablon', `„${name.trim()}” jest dostępny przy każdym programie.`);
        },
        onError: (e: unknown) => Alert.alert('Nie udało się zapisać', friendlyError(e, 'Spróbuj ponownie.')),
      },
    );
  };
  return (
    <Sheet
      visible={visible}
      title="Zapisz jako szablon"
      subtitle={`${schedule.length} elementów planu — do wczytania w innym programie.`}
      onClose={onClose}
      footer={<PrimaryButton label="Zapisz szablon" onPress={go} busy={save.isPending} disabled={!schedule.length} />}
    >
      <Text style={{ fontSize: 12, color: B.gold, fontFamily: F.bold, letterSpacing: 1.2 }}>NAZWA</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="np. Nabożeństwo niedzielne — standard"
        placeholderTextColor={B.ink4}
        autoFocus
        style={{ height: 46, borderRadius: 14, paddingHorizontal: 14, backgroundColor: B.paper2, fontSize: 15, color: B.ink, fontFamily: F.medium }}
      />
    </Sheet>
  );
};

// ── Wczytanie szablonu ──
export const TemplatesSheet = ({
  visible,
  currentCount,
  canDelete,
  onClose,
  onApply,
}: {
  visible: boolean;
  currentCount: number;
  canDelete: boolean;
  onClose: () => void;
  onApply: (items: PlanItem[], mode: 'replace' | 'append') => void;
}) => {
  const q = useProgramTemplates(visible);
  const del = useDeleteTemplate();
  // Nowe id elementów (jak web) — plan z szablonu może trafić do wielu programów.
  const fresh = (t: ProgramTemplate) => t.schedule.map((it) => ({ ...it, id: newItemId() as unknown as string })) as PlanItem[];
  const pick = (t: ProgramTemplate) => {
    if (!currentCount) return onApply(fresh(t), 'replace');
    Alert.alert(`Wczytać „${t.name}”?`, `Obecny plan ma ${currentCount} elementów.`, [
      { text: 'Zastąp plan', style: 'destructive', onPress: () => onApply(fresh(t), 'replace') },
      { text: 'Dodaj na końcu', onPress: () => onApply(fresh(t), 'append') },
      { text: 'Anuluj', style: 'cancel' },
    ]);
  };
  const remove = (t: ProgramTemplate) =>
    Alert.alert('Usunąć szablon?', `„${t.name}” zniknie dla wszystkich.`, [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: () => del.mutate(t.id, { onError: (e: unknown) => Alert.alert('Nie udało się usunąć', friendlyError(e, 'Spróbuj ponownie.')) }),
      },
    ]);
  const list = (q.data ?? []) as ProgramTemplate[];
  return (
    <Sheet visible={visible} title="Szablony planu" subtitle="Wczytaj gotowy plan do tego programu." onClose={onClose}>
      {q.isLoading ? <ActivityIndicator color={B.ink} /> : null}
      {!q.isLoading && !list.length ? (
        <Text style={{ paddingVertical: 24, textAlign: 'center', fontSize: 14, color: B.ink3, fontFamily: F.medium }}>
          Brak szablonów. Zapisz plan jako szablon z menu programu.
        </Text>
      ) : null}
      {list.map((t) => (
        <Pressable
          key={String(t.id)}
          onPress={() => pick(t)}
          className="active:opacity-70"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 20, backgroundColor: B.card }}
        >
          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: B.paper, alignItems: 'center', justifyContent: 'center' }}>
            <ClipboardList size={18} color={B.ink} />
          </View>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontSize: 15, color: B.ink, fontFamily: F.semibold }}>
              {t.name}
            </Text>
            <Text style={{ marginTop: 1, fontSize: 12, color: B.ink3, fontFamily: F.medium }}>
              {t.schedule.length} elem.{t.created_at ? ` · ${String(t.created_at).slice(0, 10).split('-').reverse().join('.')}` : ''}
            </Text>
          </View>
          {canDelete ? (
            <Pressable onPress={() => remove(t)} hitSlop={10} accessibilityLabel="Usuń szablon">
              <Trash2 size={17} color={B.ink4} />
            </Pressable>
          ) : null}
        </Pressable>
      ))}
    </Sheet>
  );
};

// ── Wysyłka e-mailem ──
export const SendEmailSheet = ({
  visible,
  programId,
  title,
  dateLabel,
  schedule,
  songs,
  notes,
  eventIds,
  programZespol,
  onClose,
}: {
  visible: boolean;
  programId: number;
  title: string;
  dateLabel: string;
  schedule: PlanItem[];
  songs?: Record<string, { title: string; key: string | null }>;
  notes: string | null;
  eventIds: number[];
  programZespol: Record<string, unknown> | null;
  onClose: () => void;
}) => {
  const q = useProgramRecipients(programId, eventIds, programZespol, visible);
  const all = (q.data ?? []) as Recipient[];
  const [off, setOff] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (visible) setOff(new Set());
  }, [visible]);
  const chosen = useMemo(() => all.filter((r) => !off.has(r.email)), [all, off]);
  const toggle = (email: string) =>
    setOff((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  const send = async () => {
    setBusy(true);
    try {
      await sendProgramEmail({
        to: chosen.map((r) => r.email),
        subject: `Program: ${title} – ${dateLabel}`,
        html: programEmailHtml({ title, dateLabel, schedule, songs, notes }),
      });
      onClose();
      Alert.alert('Wysłano program', `Do ${chosen.length} ${chosen.length === 1 ? 'osoby' : 'osób'}.`);
    } catch (e: any) {
      Alert.alert('Nie udało się wysłać', friendlyError(e, 'Spróbuj ponownie.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      visible={visible}
      title="Wyślij program e-mailem"
      subtitle="Do osób ze służb na podpiętych wydarzeniach. Plan w treści wiadomości (bez PDF)."
      onClose={onClose}
      footer={<PrimaryButton label={chosen.length ? `Wyślij do ${chosen.length}` : 'Brak odbiorców'} onPress={send} busy={busy} disabled={!chosen.length || !schedule.length} />}
    >
      {q.isLoading ? <ActivityIndicator color={B.ink} /> : null}
      {!q.isLoading && !all.length ? (
        <Text style={{ paddingVertical: 16, fontSize: 14, lineHeight: 20, color: B.ink3, fontFamily: F.medium }}>
          {eventIds.length
            ? 'Osoby przypisane do służb na podpiętym wydarzeniu nie mają adresów e-mail w tabelach służb.'
            : 'Program nie jest podpięty do wydarzenia — przypisz służby na wydarzeniu, a odbiorcy pojawią się tutaj.'}
        </Text>
      ) : null}
      {all.length ? (
        <View style={{ backgroundColor: B.card, borderRadius: 20, overflow: 'hidden' }}>
          {all.map((r, i) => {
            const on = !off.has(r.email);
            return (
              <Pressable
                key={r.email}
                onPress={() => toggle(r.email)}
                className="active:opacity-70"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: B.line }}
              >
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: on ? B.kurkuma : B.paper2,
                  }}
                >
                  {on ? <Check size={15} color={B.ink} strokeWidth={2.8} /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontSize: 15, color: B.ink, fontFamily: F.semibold }}>
                    {r.name ?? r.email}
                  </Text>
                  {r.name ? (
                    <Text numberOfLines={1} style={{ fontSize: 12, color: B.ink3, fontFamily: F.medium }}>
                      {r.email}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {!schedule.length ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Mail size={15} color={B.gold} />
          <Text style={{ flex: 1, fontSize: 13, color: B.gold, fontFamily: F.semibold }}>Plan jest pusty — dodaj punkty przed wysyłką.</Text>
        </View>
      ) : null}
    </Sheet>
  );
};
