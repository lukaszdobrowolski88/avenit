import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, TextInput, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Hash, Megaphone, Search, SquareCheckBig, Users } from 'lucide-react-native';
import { B } from '../../../components/ui/brand';
import { FormInput, FormLabel, PrimaryButton, Sheet } from '../../../components/ui/Sheet';
import { FONT as F } from '../../../lib/fonts';
import { showError } from '../../../lib/errors';
import { toast } from '../../../lib/toast';
import {
  canPostIn,
  conversationTitle,
  memberInitials,
  memberPhotoUrl,
  useConversations,
  useMembersByEmails,
  type ConversationListItem,
  type MemberMap,
} from '../../messenger/api';
import { sendTaskToChat, shareMessageText } from '../share';

// „Wyślij do czatu” z ekranu zadania — jak ShareToChatModal na webie: podgląd zadania,
// opcjonalny komentarz, wybór JEDNEJ rozmowy, w której mogę pisać (bez archiwum; kanał
// „tylko administratorzy” — gdy jestem administratorem), wysyłka zwykłej wiadomości z linkiem.

const ConvIcon = ({ conv, members }: { conv: ConversationListItem; members: MemberMap }) => {
  const box = { width: 36, height: 36, borderRadius: 18, backgroundColor: B.paper2, alignItems: 'center', justifyContent: 'center' } as const;
  if (conv.type === 'direct') {
    const photo = conv.peer_email ? memberPhotoUrl(members, conv.peer_email) : null;
    if (photo) return <Image source={{ uri: photo }} style={{ width: 36, height: 36, borderRadius: 18 }} />;
    const initials = conv.peer_email ? memberInitials(members, conv.peer_email) : (conv.name ?? '?').charAt(0).toUpperCase();
    return (
      <View style={box}>
        <Text style={{ fontSize: 12, color: B.goldDeep, fontFamily: F.bold }}>{initials}</Text>
      </View>
    );
  }
  const Icon = conv.type === 'announcement' ? Megaphone : conv.type === 'ministry' ? Hash : Users;
  return (
    <View style={box}>
      <Icon size={16} color={B.ink2} />
    </View>
  );
};

export const ShareTaskToChatSheet = ({
  visible,
  onClose,
  taskName,
  url,
  myEmail,
}: {
  visible: boolean;
  onClose: () => void;
  taskName: string;
  /** Pełny link do zadania (absoluteTaskUrl). */
  url: string;
  myEmail: string | null;
}) => {
  const qc = useQueryClient();
  const convs = useConversations(visible ? myEmail : null);
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  // Świeże okno przy każdym otwarciu.
  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setNote('');
    setSelected(null);
  }, [visible]);

  const all: ConversationListItem[] = convs.data ?? [];
  const peerEmails = useMemo(
    () => Array.from(new Set(all.map((c: ConversationListItem) => c.peer_email).filter((e): e is string => !!e))),
    [all],
  );
  const membersQ = useMembersByEmails(peerEmails);
  const members: MemberMap = membersQ.data ?? {};

  const targets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all
      .filter((c: ConversationListItem) => !c.archived && canPostIn(c))
      .filter((c: ConversationListItem) => !q || conversationTitle(c, members).toLowerCase().includes(q));
  }, [all, query, members]);

  const send = async () => {
    if (!selected || !myEmail) return;
    try {
      await sendTaskToChat({
        conversationId: selected,
        senderEmail: myEmail,
        content: shareMessageText({ name: taskName, url, note }),
      });
      qc.invalidateQueries({ queryKey: ['messages', selected] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
      onClose();
      toast.success('Wysłano do czatu');
    } catch (e) {
      showError('Nie udało się wysłać wiadomości', e, 'Spróbuj ponownie.');
    }
  };

  return (
    <Sheet
      visible={visible}
      title="Wyślij do czatu"
      onClose={onClose}
      footer={<PrimaryButton label="Wyślij" onPress={send} disabled={!selected || !myEmail} />}
    >
      {/* Podgląd tego, co trafi do rozmowy */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, backgroundColor: B.card, padding: 14, marginTop: 6 }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: B.paper2, alignItems: 'center', justifyContent: 'center' }}>
          <SquareCheckBig size={17} color={B.ink} />
        </View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={2} style={{ fontSize: 15, color: B.ink, fontFamily: F.bold }}>
            {taskName.trim() || 'Bez nazwy'}
          </Text>
          <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 12, color: B.ink4, fontFamily: F.medium }}>
            {url}
          </Text>
        </View>
      </View>

      <FormLabel>Wiadomość (opcjonalnie)</FormLabel>
      <FormInput
        value={note}
        onChangeText={setNote}
        placeholder="Dodaj wiadomość (opcjonalnie)"
        multiline
        style={{ minHeight: 72 }}
        accessibilityLabel="Wiadomość (opcjonalnie)"
      />

      <FormLabel>Rozmowa</FormLabel>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 14,
          height: 44,
          borderRadius: 999,
          backgroundColor: B.card,
          marginBottom: 10,
        }}
      >
        <Search size={16} color={B.ink4} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Szukaj rozmowy…"
          placeholderTextColor={B.ink4}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Szukaj rozmowy"
          style={{ flex: 1, fontSize: 14, color: B.ink, fontFamily: F.medium }}
        />
      </View>

      {convs.isLoading && !targets.length ? (
        <ActivityIndicator color={B.ink} style={{ marginVertical: 24 }} />
      ) : !targets.length ? (
        <Text style={{ textAlign: 'center', paddingVertical: 24, fontSize: 14, color: B.ink3, fontFamily: F.medium }}>
          {query.trim() ? 'Brak pasujących rozmów.' : 'Brak rozmów, w których możesz pisać.'}
        </Text>
      ) : (
        <View accessibilityRole="radiogroup" style={{ borderRadius: 22, backgroundColor: B.card, overflow: 'hidden' }}>
          {targets.map((c: ConversationListItem, i: number) => {
            const title = conversationTitle(c, members);
            const on = selected === c.id;
            return (
              <Pressable
                key={c.id}
                onPress={() => setSelected(c.id)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={title}
                className="active:opacity-70"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingHorizontal: 14,
                  minHeight: 56,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: B.line,
                  backgroundColor: on ? B.kurkumaSoft : 'transparent',
                }}
              >
                <ConvIcon conv={c} members={members} />
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: B.ink, fontFamily: F.semibold }}>
                  {title}
                </Text>
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
          })}
        </View>
      )}
    </Sheet>
  );
};
