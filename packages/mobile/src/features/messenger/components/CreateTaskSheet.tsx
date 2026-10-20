import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { messageTaskName } from '@avenit/shared/src/lib/messageTasks.js';
import { B } from '../../../components/ui/brand';
import { FormInput, FormLabel, PrimaryButton, Sheet } from '../../../components/ui/Sheet';
import { DateField } from '../../../components/ui/DateField';
import { FONT as F } from '../../../lib/fonts';
import { usePermissions } from '../../../lib/permissions';
import { showError } from '../../../lib/errors';
import { toast } from '../../../lib/toast';
import { normalizeModuleLabel } from '../../modules/nav';
import { memberDisplayName, memberPhotoUrl, sameEmail, type MemberMap, type MessageRow } from '../api';
import {
  createTaskFromMessage,
  taskDescriptionFor,
  useTaskTargets,
  type MessageTaskRow,
  type TaskTarget,
} from '../messageTasks';

// „Utwórz zadanie” z wiadomości — jak web (CreateTaskFromMessageModal): nazwa z pierwszej linii,
// opis = treść + „Z wiadomości od X w <rozmowa>” + link do wiadomości; tablica: zadania służby kanału
// (domyślnie), Kalendarz albo tablica Projektów, w której mogę tworzyć (reguła jak serwer); osoba:
// nikt / ja / autor; termin — DateField (bez wpisywania z ręki).

type PersonChoice = 'none' | 'me' | 'author';

const RadioRow = ({
  label,
  on,
  onPress,
  first,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  first?: boolean;
}) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="radio"
    accessibilityState={{ checked: on }}
    accessibilityLabel={label}
    className="active:opacity-70"
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      minHeight: 52,
      borderTopWidth: first ? 0 : 1,
      borderTopColor: B.line,
      backgroundColor: on ? B.kurkumaSoft : 'transparent',
    }}
  >
    <Text style={{ flex: 1, fontSize: 15, color: B.ink, fontFamily: F.semibold }}>{label}</Text>
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: on ? B.ink : B.fieldBorder,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: B.ink }} /> : null}
    </View>
  </Pressable>
);

export const CreateTaskSheet = ({
  message,
  conversation,
  conversationName,
  members,
  myEmail,
  myName,
  onClose,
  onCreated,
}: {
  message: MessageRow | null;
  conversation: { id: string; type?: string | null; ministry_key?: string | null; name?: string | null } | null;
  conversationName: string;
  members: MemberMap;
  myEmail: string | null;
  myName: string | null;
  onClose: () => void;
  onCreated: (messageId: string, task: MessageTaskRow) => void;
}) => {
  const perms = usePermissions();
  const visible = !!message;
  const labelOf = useMemo(() => {
    const map = new Map(perms.modules.map((m) => [m.key, normalizeModuleLabel(m.label) || m.label]));
    return (key: string) => map.get(key) ?? null;
  }, [perms.modules]);
  const targetsQ = useTaskTargets(conversation, perms.canModule, labelOf, visible);
  const targets: TaskTarget[] = targetsQ.data ?? [];

  const [name, setName] = useState('');
  const [targetKey, setTargetKey] = useState<string | null>(null);
  const [person, setPerson] = useState<PersonChoice>('none');
  const [due, setDue] = useState('');

  // Świeże pola przy każdym otwarciu.
  useEffect(() => {
    if (!message) return;
    setName(messageTaskName(message.content));
    setPerson('none');
    setDue('');
    setTargetKey(null);
  }, [message]);
  const target = targets.find((t) => t.key === targetKey) ?? targets[0] ?? null;

  const authorEmail = message?.sender_email ?? null;
  const authorName = authorEmail ? memberDisplayName(members, authorEmail) : '';
  const showAuthor = !!authorEmail && !sameEmail(authorEmail, myEmail);

  const submit = async () => {
    if (!message || !target || !name.trim()) return;
    const personOf = (email: string, label: string) => {
      const photo = memberPhotoUrl(members, email);
      return { email, name: label || email, ...(photo ? { avatar_url: photo } : {}) };
    };
    const people =
      person === 'me' && myEmail
        ? [personOf(myEmail, myName || memberDisplayName(members, myEmail))]
        : person === 'author' && authorEmail
          ? [personOf(authorEmail, authorName)]
          : [];
    try {
      const mod = target.key.startsWith('tasks:') ? target.key.slice(6) : null;
      const title = mod && mod !== 'calendar' && labelOf(mod) ? `Zadania — ${labelOf(mod)}` : 'Zadania';
      const task = await createTaskFromMessage({
        target,
        title,
        message: { id: message.id, conversation_id: message.conversation_id },
        name: name.trim(),
        description: taskDescriptionFor(message, authorName || authorEmail || 'Nieznany nadawca', conversationName),
        due: due || null,
        people,
        me: { email: myEmail, name: myName },
      });
      onCreated(message.id, task);
      onClose();
      toast.success('Utworzono zadanie', task.name);
    } catch (e) {
      showError('Nie udało się utworzyć zadania', e, 'Spróbuj ponownie.');
    }
  };

  return (
    <Sheet
      visible={visible}
      title="Utwórz zadanie"
      subtitle={conversationName}
      onClose={onClose}
      footer={<PrimaryButton label="Utwórz zadanie" onPress={submit} disabled={!name.trim() || !target} />}
    >
      <FormLabel first>Nazwa</FormLabel>
      <FormInput
        value={name}
        onChangeText={(t) => setName(t.replace(/[\r\n]+/g, ' '))}
        placeholder="Co jest do zrobienia?"
        maxLength={200}
        accessibilityLabel="Nazwa zadania"
      />

      <FormLabel>Tablica</FormLabel>
      {targetsQ.isLoading ? (
        <ActivityIndicator color={B.ink} style={{ marginVertical: 16 }} />
      ) : !targets.length ? (
        <Text style={{ fontSize: 14, lineHeight: 20, color: B.ink3, fontFamily: F.medium }}>
          Nie masz uprawnień do tworzenia zadań na żadnej tablicy. Poproś lidera lub administratora o dostęp.
        </Text>
      ) : (
        <View accessibilityRole="radiogroup" style={{ borderRadius: 22, backgroundColor: B.card, overflow: 'hidden' }}>
          {targets.map((t, i) => (
            <RadioRow key={t.key} label={t.label} on={target?.key === t.key} onPress={() => setTargetKey(t.key)} first={i === 0} />
          ))}
        </View>
      )}

      <FormLabel>Osoba</FormLabel>
      <View accessibilityRole="radiogroup" style={{ borderRadius: 22, backgroundColor: B.card, overflow: 'hidden' }}>
        <RadioRow label="Bez osoby" on={person === 'none'} onPress={() => setPerson('none')} first />
        {myEmail ? <RadioRow label="Ja" on={person === 'me'} onPress={() => setPerson('me')} /> : null}
        {showAuthor ? (
          <RadioRow label={`Autor wiadomości: ${authorName}`} on={person === 'author'} onPress={() => setPerson('author')} />
        ) : null}
      </View>

      <FormLabel>Termin</FormLabel>
      <DateField value={due} onChange={setDue} optional placeholder="Bez terminu" />

      <Text style={{ marginTop: 14, fontSize: 12, lineHeight: 17, color: B.ink4, fontFamily: F.medium }}>
        W opisie zadania znajdzie się treść wiadomości i link do niej.
      </Text>
    </Sheet>
  );
};
