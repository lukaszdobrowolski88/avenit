import { useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { AlertTriangle, Clock, Paperclip } from "lucide-react-native";
import { Sheet, FormInput, FormLabel, PrimaryButton } from "../../../components/ui/Sheet";
import { DateField, TimeField } from "../../../components/ui/DateField";
import { EmptyState } from "../../../components/ui/EmptyState";
import { B } from "../../../components/ui/brand";
import { toast } from "../../../lib/toast";
import { friendlyError } from "../../../lib/errors";
import {
  fromWarsawYmdHm,
  isValidChatTime,
  useCancelScheduled,
  useSendScheduledNow,
  useUpdateScheduled,
  warsawYmdHm,
  whenLabel,
  type ScheduledMessage,
} from "../schedule";

// „Zaplanowane” w rozmowie: moje oczekujące i nieudane wiadomości — zmiana treści i terminu
// (kółka DateField/TimeField), „Wyślij teraz”, anulowanie.

const F = { medium: "Manrope_500Medium", semibold: "Manrope_600SemiBold", bold: "Manrope_700Bold" } as const;

interface Props {
  visible: boolean;
  onClose: () => void;
  conversationId: string;
  items: ScheduledMessage[];
}

const SmallAction = ({ label, onPress, danger, disabled }: { label: string; onPress: () => void; danger?: boolean; disabled?: boolean }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    className="active:opacity-70"
    style={{ paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, backgroundColor: B.paper2, opacity: disabled ? 0.5 : 1 }}
  >
    <Text style={{ fontSize: 13, color: danger ? B.danger : B.ink, fontFamily: F.semibold }}>{label}</Text>
  </Pressable>
);

export const ScheduledListSheet = ({ visible, onClose, conversationId, items }: Props) => {
  const update = useUpdateScheduled();
  const cancel = useCancelScheduled();
  const sendNow = useSendScheduledNow(conversationId);
  const [editing, setEditing] = useState<{ id: string; content: string; ymd: string; hm: string; hasFiles: boolean } | null>(null);
  useEffect(() => {
    if (!visible) setEditing(null);
  }, [visible]);

  const editAt = editing ? fromWarsawYmdHm(editing.ymd, editing.hm) : null;
  const editValid = !!editing && !!editAt && isValidChatTime(editAt) && (!!editing.content.trim() || editing.hasFiles);

  const startEdit = (s: ScheduledMessage) => {
    const base = isValidChatTime(s.send_at) ? s.send_at : Date.now() + 60 * 60_000;
    const { ymd, hm } = warsawYmdHm(base);
    setEditing({ id: s.id, content: s.content ?? "", ymd, hm, hasFiles: (s.attachments ?? []).length > 0 });
  };

  const save = async () => {
    if (!editing || !editAt || !editValid) return;
    try {
      await update.mutateAsync({ id: editing.id, content: editing.content.trim(), sendAt: editAt.toISOString() });
      toast.success("Zapisano", whenLabel(editAt));
      setEditing(null);
    } catch (e) {
      Alert.alert("Nie udało się zapisać", friendlyError(e, "Spróbuj ponownie."));
    }
  };

  const doSendNow = (s: ScheduledMessage) => {
    if (sendNow.isPending) return;
    sendNow.mutate(s.id, {
      onSuccess: () => toast.success("Wiadomość wysłana"),
      onError: (e) => Alert.alert("Nie udało się wysłać", friendlyError(e, "Spróbuj ponownie.")),
    });
  };

  const doCancel = (s: ScheduledMessage) => {
    Alert.alert("Anulować zaplanowaną wiadomość?", "Wiadomość nie zostanie wysłana.", [
      { text: "Wróć", style: "cancel" },
      {
        text: "Anuluj wysyłkę",
        style: "destructive",
        onPress: () =>
          cancel.mutate(s.id, {
            onSuccess: () => {
              if (editing?.id === s.id) setEditing(null);
              toast.success("Wysyłka anulowana");
            },
            onError: (e) => Alert.alert("Nie udało się anulować", friendlyError(e, "Spróbuj ponownie.")),
          }),
      },
    ]);
  };

  return (
    <Sheet
      visible={visible}
      title="Zaplanowane wiadomości"
      subtitle={items.length ? `Zaplanowane: ${items.length}` : null}
      onClose={onClose}
      footer={editing ? <PrimaryButton label="Zapisz" disabled={!editValid} onPress={save} /> : null}
    >
      {items.length === 0 ? (
        <EmptyState compact Icon={Clock} title="Brak zaplanowanych wiadomości" hint="Przytrzymaj przycisk Wyślij, żeby zaplanować wiadomość na później." />
      ) : (
        items.map((s) => {
          const failed = s.status === "failed";
          const files = (s.attachments ?? []).length;
          const isEditing = editing?.id === s.id;
          return (
            <View key={s.id} style={{ backgroundColor: B.card, borderRadius: 16, padding: 14, marginTop: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                {failed ? <AlertTriangle size={14} color={B.danger} /> : <Clock size={14} color={B.ink3} />}
                <Text style={{ fontSize: 12, color: failed ? B.danger : B.ink3, fontFamily: F.bold }}>
                  {failed ? "Nie wysłano" : whenLabel(s.send_at)}
                </Text>
              </View>
              {failed && s.error ? (
                <Text style={{ marginTop: 4, fontSize: 12, lineHeight: 17, color: B.danger, fontFamily: F.medium }}>{s.error}</Text>
              ) : null}
              {isEditing && editing ? (
                <View>
                  <FormLabel>Treść</FormLabel>
                  <FormInput
                    multiline
                    value={editing.content}
                    onChangeText={(t) => setEditing((v) => (v ? { ...v, content: t } : v))}
                    accessibilityLabel="Treść wiadomości"
                  />
                  <FormLabel>Termin (czas polski)</FormLabel>
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <DateField value={editing.ymd} onChange={(ymd) => setEditing((v) => (v ? { ...v, ymd } : v))} />
                    </View>
                    <View style={{ width: 120 }}>
                      <TimeField value={editing.hm} onChange={(hm) => setEditing((v) => (v ? { ...v, hm } : v))} title="Godzina" />
                    </View>
                  </View>
                  {!editValid ? (
                    <Text style={{ marginTop: 8, fontSize: 12, color: B.danger, fontFamily: F.medium }}>
                      Wybierz termin w przyszłości (najwyżej rok naprzód).
                    </Text>
                  ) : null}
                  <View style={{ flexDirection: "row", marginTop: 10 }}>
                    <SmallAction label="Anuluj zmiany" onPress={() => setEditing(null)} />
                  </View>
                </View>
              ) : (
                <View>
                  {s.content ? (
                    <Text numberOfLines={4} style={{ marginTop: 6, fontSize: 15, lineHeight: 21, color: B.ink, fontFamily: F.medium }}>
                      {s.content}
                    </Text>
                  ) : null}
                  {files > 0 ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                      <Paperclip size={12} color={B.ink4} />
                      <Text style={{ fontSize: 12, color: B.ink4, fontFamily: F.medium }}>{`Załączniki: ${files}`}</Text>
                    </View>
                  ) : null}
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                    <SmallAction label="Wyślij teraz" onPress={() => doSendNow(s)} disabled={sendNow.isPending} />
                    <SmallAction label={failed ? "Zaplanuj ponownie" : "Edytuj"} onPress={() => startEdit(s)} />
                    <SmallAction label="Anuluj wysyłkę" onPress={() => doCancel(s)} danger />
                  </View>
                </View>
              )}
            </View>
          );
        })
      )}
    </Sheet>
  );
};
