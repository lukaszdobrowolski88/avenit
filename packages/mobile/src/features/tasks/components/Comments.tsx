import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';
import { AtSign, CornerDownRight, Heart, MessageSquare, Send, Trash2, X } from 'lucide-react-native';
import { B } from '../../../components/ui/brand';
import { sameEmail, whenLabel, type Person, type TaskUpdate } from '../board';
import { F, PersonAvatar } from './bits';
import { PeopleSheet } from './Pickers';

// Wątek komentarzy zadania (board_item_updates) jak panel elementu na webie: autor, czas,
// treść, odpowiedzi (jeden poziom), polubienia. Kompozytor z @wzmiankami — osoby, których
// „@Imię” zostało w treści, dostają powiadomienie (serwer: fn board-comment).

interface Mention {
  email: string;
  name: string;
}

export const TaskComments = ({
  updates,
  loading,
  people,
  peopleLoading,
  myEmail,
  canComment,
  canLike,
  canDelete,
  onSend,
  onLike,
  onDelete,
}: {
  updates: TaskUpdate[];
  loading: boolean;
  people: Person[];
  peopleLoading: boolean;
  myEmail: string | null;
  canComment: boolean;
  canLike: boolean;
  canDelete: boolean;
  onSend: (body: string, mentions: string[], parentId: string | null) => Promise<boolean>;
  onLike: (u: TaskUpdate) => void;
  onDelete: (u: TaskUpdate) => void;
}) => {
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [replyTo, setReplyTo] = useState<TaskUpdate | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  const personOf = useMemo(() => {
    const map = new Map(people.map((p) => [p.email.toLowerCase(), p]));
    return (email: string | null, name: string | null) => {
      const p = email ? map.get(email.toLowerCase()) : undefined;
      return { email, name: p?.name || name || email || 'System', avatar_url: p?.avatar_url ?? null };
    };
  }, [people]);

  const roots = useMemo(() => updates.filter((u) => !u.parent_update_id), [updates]);
  const repliesOf = (id: string) => updates.filter((u) => u.parent_update_id === id);

  const onChange = (v: string) => {
    // Wpisane „@” na końcu otwiera listę osób (jak przycisk @).
    if (v.length === text.length + 1 && v.endsWith('@') && /(^|\s)@$/.test(v)) setPicking(true);
    setText(v);
  };

  const addMention = (p: Person) => {
    setText((t) => {
      const base = /(^|\s)@$/.test(t) ? t.slice(0, -1) : t;
      return `${base}${base && !/\s$/.test(base) ? ' ' : ''}@${p.name} `;
    });
    setMentions((m) => (m.some((x) => sameEmail(x.email, p.email)) ? m : [...m, { email: p.email, name: p.name }]));
  };

  const submit = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    // Powiadamiamy tylko osoby, których @imię zostało w treści (mogło zostać skasowane).
    const emails = mentions.filter((m) => body.includes(`@${m.name}`)).map((m) => m.email);
    const ok = await onSend(body, emails, replyTo?.id ?? null);
    setBusy(false);
    if (ok) {
      setText('');
      setMentions([]);
      setReplyTo(null);
    }
  };

  const confirmDelete = (u: TaskUpdate) => {
    const replies = u.parent_update_id ? 0 : repliesOf(u.id).length;
    Alert.alert(
      'Usunąć komentarz?',
      replies ? `Razem z nim znikną odpowiedzi (${replies}).` : 'Tej operacji nie można cofnąć.',
      [
        { text: 'Anuluj', style: 'cancel' },
        { text: 'Usuń', style: 'destructive', onPress: () => onDelete(u) },
      ],
    );
  };

  const renderRow = (u: TaskUpdate, small = false) => {
    const who = personOf(u.author_email, u.author_name);
    const liked = !!myEmail && u.likes.some((e) => sameEmail(e, myEmail));
    const mine = !!myEmail && sameEmail(u.author_email, myEmail);
    return (
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <PersonAvatar name={who.name} email={who.email} avatarUrl={who.avatar_url} size={small ? 26 : 32} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: small ? 13 : 14, color: B.ink, fontFamily: F.bold }}>{who.name}</Text>
            <Text style={{ fontSize: 12, color: B.ink4, fontFamily: F.medium }}>{whenLabel(u.created_at)}</Text>
          </View>
          <Text selectable style={{ marginTop: 2, fontSize: 15, lineHeight: 21, color: B.ink2, fontFamily: F.medium }}>
            {u.body}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6 }}>
            {canLike ? (
              <Pressable
                onPress={() => onLike(u)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityState={{ selected: liked }}
                accessibilityLabel={liked ? 'Cofnij polubienie' : 'Polub'}
                className="active:opacity-60"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
              >
                <Heart size={15} color={liked ? B.gold : B.ink4} fill={liked ? B.kurkuma : 'transparent'} />
                {u.likes.length ? (
                  <Text style={{ fontSize: 12, color: liked ? B.gold : B.ink3, fontFamily: F.bold }}>{u.likes.length}</Text>
                ) : null}
              </Pressable>
            ) : u.likes.length ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} accessibilityLabel={`Polubienia: ${u.likes.length}`}>
                <Heart size={14} color={B.ink4} />
                <Text style={{ fontSize: 12, color: B.ink3, fontFamily: F.bold }}>{u.likes.length}</Text>
              </View>
            ) : null}
            {canComment && !small ? (
              <Pressable
                onPress={() => setReplyTo(u)}
                hitSlop={8}
                accessibilityRole="button"
                className="active:opacity-60"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
              >
                <CornerDownRight size={14} color={B.ink3} />
                <Text style={{ fontSize: 13, color: B.ink3, fontFamily: F.semibold }}>Odpowiedz</Text>
              </Pressable>
            ) : null}
            {canDelete && mine ? (
              <Pressable
                onPress={() => confirmDelete(u)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Usuń komentarz"
                className="active:opacity-60"
              >
                <Trash2 size={14} color={B.ink4} />
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  return (
    <View>
      {canComment ? (
        <View style={{ borderRadius: 18, backgroundColor: B.card, borderWidth: 1, borderColor: B.fieldBorder, padding: 10, marginBottom: 14 }}>
          {replyTo ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                alignSelf: 'flex-start',
                paddingLeft: 10,
                paddingRight: 6,
                paddingVertical: 4,
                marginBottom: 6,
                borderRadius: 999,
                backgroundColor: B.paper2,
              }}
            >
              <CornerDownRight size={12} color={B.ink3} />
              <Text numberOfLines={1} style={{ maxWidth: 220, fontSize: 12, color: B.ink2, fontFamily: F.semibold }}>
                Odpowiedź dla: {personOf(replyTo.author_email, replyTo.author_name).name}
              </Text>
              <Pressable onPress={() => setReplyTo(null)} hitSlop={8} accessibilityLabel="Anuluj odpowiedź" className="active:opacity-60">
                <X size={14} color={B.ink3} />
              </Pressable>
            </View>
          ) : null}
          <TextInput
            value={text}
            onChangeText={onChange}
            placeholder={replyTo ? 'Napisz odpowiedź…' : 'Napisz komentarz…'}
            placeholderTextColor={B.ink4}
            multiline
            accessibilityLabel="Treść komentarza"
            style={{ minHeight: 44, maxHeight: 160, fontSize: 15, lineHeight: 21, color: B.ink, fontFamily: F.medium, paddingHorizontal: 4, paddingVertical: 4, textAlignVertical: 'top' }}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
            <Pressable
              onPress={() => setPicking(true)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Wspomnij osobę"
              className="active:opacity-60"
              style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: B.paper2 }}
            >
              <AtSign size={17} color={B.ink2} />
            </Pressable>
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={submit}
              disabled={!text.trim() || busy}
              accessibilityRole="button"
              accessibilityLabel="Wyślij komentarz"
              className="active:opacity-70"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                height: 36,
                paddingHorizontal: 14,
                borderRadius: 18,
                backgroundColor: text.trim() ? B.ink : B.paper2,
              }}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Send size={14} color={text.trim() ? '#FFFFFF' : B.ink4} />
                  <Text style={{ fontSize: 14, color: text.trim() ? '#FFFFFF' : B.ink4, fontFamily: F.bold }}>Wyślij</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator color={B.ink} style={{ marginVertical: 20 }} />
      ) : roots.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 22, gap: 6 }}>
          <MessageSquare size={22} color={B.ink4} />
          <Text style={{ fontSize: 14, color: B.ink3, fontFamily: F.medium }}>
            {canComment ? 'Brak komentarzy — zacznij rozmowę.' : 'Brak komentarzy.'}
          </Text>
        </View>
      ) : (
        <View style={{ borderRadius: 22, backgroundColor: B.card, paddingHorizontal: 14 }}>
          {roots.map((u, i) => {
            const replies = repliesOf(u.id);
            return (
              <View key={u.id} style={{ paddingVertical: 14, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: B.line }}>
                {renderRow(u)}
                {replies.length ? (
                  <View style={{ marginTop: 12, marginLeft: 42, gap: 12 }}>
                    {replies.map((r) => (
                      <View key={r.id}>{renderRow(r, true)}</View>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      <PeopleSheet
        visible={picking}
        title="Wspomnij osobę"
        people={people}
        loading={peopleLoading}
        selected={[]}
        myEmail={myEmail}
        multi={false}
        onSave={(picked) => {
          if (picked[0]) addMention(picked[0]);
        }}
        onClose={() => setPicking(false)}
      />
    </View>
  );
};
