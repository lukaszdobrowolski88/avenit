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
import {
  Award,
  BookOpen,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Church,
  Coffee,
  Cross,
  Flame,
  Globe,
  Heart,
  MessageCircle,
  Moon,
  Music,
  Plus,
  Star,
  Sun,
  Users,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';
import { B } from '../../../components/ui/brand';
import { useDeleteProgramType, useProgramTypes, useSaveProgramType, type ProgramTypeRow } from '../api';

// Typy programów (jak okno „Typ programu” na liście programów na webie): nazwa, ikona,
// kolor. Widoczność sekcji zespołów zostaje na webie (zespoły są na wydarzeniach).

const F = { medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold' } as const;

export const TYPE_ICONS: Record<string, LucideIcon> = {
  Calendar,
  Church,
  Heart,
  BookOpen,
  Music,
  Users,
  Star,
  Flame,
  Cross,
  Sun,
  Moon,
  Coffee,
  MessageCircle,
  Globe,
  Zap,
  Award,
};
// Paleta jak na webie — kolor typu to dane kościoła (w apce pokazywany jako kropka).
const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#1e40af', '#7c3aed'];

interface Draft {
  id: number | null;
  name: string;
  icon: string;
  color: string;
}

export const ProgramTypesSheet = ({
  visible,
  onClose,
  canCreate,
  canUpdate,
  canDelete,
}: {
  visible: boolean;
  onClose: () => void;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}) => {
  const types = useProgramTypes();
  const save = useSaveProgramType();
  const del = useDeleteProgramType();
  const [draft, setDraft] = useState<Draft | null>(null);
  const list = (types.data ?? []) as ProgramTypeRow[];

  const close = () => {
    setDraft(null);
    onClose();
  };
  const submit = () => {
    if (!draft || !draft.name.trim()) return Alert.alert('Podaj nazwę typu');
    const sortOrder = list.length ? Math.max(...list.map((t) => t.sort_order ?? 0)) + 1 : 0;
    save.mutate(
      { id: draft.id, name: draft.name.trim(), icon: draft.icon, color: draft.color, sortOrder },
      { onSuccess: () => setDraft(null), onError: (e: any) => Alert.alert('Nie udało się zapisać', e?.message ?? 'Spróbuj ponownie.') },
    );
  };
  const remove = () => {
    if (!draft?.id) return;
    Alert.alert('Usunąć typ?', 'Programy tego typu zachowają dane, ale stracą przypisanie do typu.', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: () =>
          del.mutate(draft.id!, {
            onSuccess: () => setDraft(null),
            onError: (e: any) => Alert.alert('Nie udało się usunąć', e?.message ?? 'Spróbuj ponownie.'),
          }),
      },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: B.paper }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, paddingBottom: 8 }}>
          {draft ? (
            <Pressable onPress={() => setDraft(null)} hitSlop={10} className="active:opacity-60">
              <ChevronLeft size={22} color={B.ink2} />
            </Pressable>
          ) : null}
          <Text style={{ flex: 1, fontSize: 20, color: B.ink, fontFamily: F.bold }}>
            {draft ? (draft.id ? 'Edytuj typ' : 'Nowy typ') : 'Typy programów'}
          </Text>
          <Pressable onPress={close} hitSlop={10} className="active:opacity-60">
            <X size={22} color={B.ink2} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 40, gap: 10 }} keyboardShouldPersistTaps="handled">
          {!draft ? (
            <>
              {types.isLoading ? <ActivityIndicator color={B.ink} /> : null}
              {list.map((t) => {
                const Icon = TYPE_ICONS[t.icon ?? ''] ?? Calendar;
                return (
                  <Pressable
                    key={t.id}
                    disabled={!canUpdate}
                    onPress={() => setDraft({ id: t.id, name: t.name, icon: t.icon ?? 'Calendar', color: t.color ?? COLORS[0] })}
                    className="active:opacity-70"
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 20, backgroundColor: B.card }}
                  >
                    <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: B.paper, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon size={18} color={B.ink} />
                    </View>
                    <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: t.color ?? B.ink4 }} />
                    <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: B.ink, fontFamily: F.semibold }}>
                      {t.name}
                    </Text>
                    {canUpdate ? <ChevronRight size={16} color={B.ink4} /> : null}
                  </Pressable>
                );
              })}
              {!types.isLoading && !list.length ? (
                <Text style={{ paddingVertical: 16, textAlign: 'center', fontSize: 14, color: B.ink3, fontFamily: F.medium }}>Brak typów programów.</Text>
              ) : null}
              {canCreate ? (
                <Pressable
                  onPress={() => setDraft({ id: null, name: '', icon: 'Calendar', color: COLORS[0] })}
                  className="active:opacity-80"
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: 999, backgroundColor: B.kurkuma, marginTop: 6 }}
                >
                  <Plus size={17} color={B.ink} strokeWidth={2.4} />
                  <Text style={{ fontSize: 15, color: B.ink, fontFamily: F.bold }}>Nowy typ</Text>
                </Pressable>
              ) : null}
            </>
          ) : (
            <>
              <Text style={{ fontSize: 12, color: B.gold, fontFamily: F.bold, letterSpacing: 1.2 }}>NAZWA</Text>
              <TextInput
                value={draft.name}
                onChangeText={(name) => setDraft({ ...draft, name })}
                placeholder="np. Nabożeństwo niedzielne"
                placeholderTextColor={B.ink4}
                style={{ height: 46, borderRadius: 14, paddingHorizontal: 14, backgroundColor: B.paper2, fontSize: 15, color: B.ink, fontFamily: F.medium }}
              />
              <Text style={{ marginTop: 8, fontSize: 12, color: B.gold, fontFamily: F.bold, letterSpacing: 1.2 }}>IKONA</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {Object.entries(TYPE_ICONS).map(([name, Icon]) => {
                  const on = draft.icon === name;
                  return (
                    <Pressable
                      key={name}
                      onPress={() => setDraft({ ...draft, icon: name })}
                      accessibilityLabel={name}
                      style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? B.ink : B.card }}
                    >
                      <Icon size={19} color={on ? '#fff' : B.ink} />
                    </Pressable>
                  );
                })}
              </View>
              <Text style={{ marginTop: 8, fontSize: 12, color: B.gold, fontFamily: F.bold, letterSpacing: 1.2 }}>KOLOR</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {COLORS.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => setDraft({ ...draft, color: c })}
                    accessibilityLabel={`Kolor ${c}`}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: c,
                      borderWidth: draft.color === c ? 3 : 0,
                      borderColor: B.card,
                      shadowColor: B.ink,
                      shadowOpacity: draft.color === c ? 0.35 : 0,
                      shadowRadius: 4,
                      shadowOffset: { width: 0, height: 1 },
                    }}
                  />
                ))}
              </View>
              <Text style={{ marginTop: 6, fontSize: 12, lineHeight: 17, color: B.ink4, fontFamily: F.medium }}>
                Które sekcje zespołów pokazuje program danego typu, ustawisz na webie.
              </Text>
              <Pressable
                onPress={submit}
                disabled={save.isPending}
                className="active:opacity-80"
                style={{ marginTop: 14, height: 52, borderRadius: 999, backgroundColor: B.kurkuma, alignItems: 'center', justifyContent: 'center', opacity: save.isPending ? 0.6 : 1 }}
              >
                {save.isPending ? <ActivityIndicator color={B.ink} /> : <Text style={{ fontSize: 15, color: B.ink, fontFamily: F.bold }}>Zapisz</Text>}
              </Pressable>
              {draft.id && canDelete ? (
                <Pressable onPress={remove} disabled={del.isPending} className="active:opacity-70" style={{ height: 48, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 15, color: '#B42318', fontFamily: F.semibold }}>Usuń typ</Text>
                </Pressable>
              ) : null}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};
