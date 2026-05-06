import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';
import { MessageCircle, Send, Trash2 } from 'lucide-react-native';
import { format, formatDistanceToNow } from 'date-fns';
import { pl } from 'date-fns/locale';
import {
  useAddTaskComment,
  useDeleteTaskComment,
  useTaskComments,
  type TaskComment,
} from '../task-comments';

interface Props {
  taskId: string | null;
  taskOwnerEmail: string;
  myEmail: string | null;
  myName: string | null;
}

const initials = (name: string | null, email: string): string => {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase().slice(0, 2);
  }
  return email.charAt(0).toUpperCase();
};

const relTime = (iso: string): string => {
  const d = new Date(iso);
  const ageMs = Date.now() - d.getTime();
  if (ageMs < 7 * 24 * 3600 * 1000) {
    return formatDistanceToNow(d, { addSuffix: true, locale: pl });
  }
  return format(d, 'd MMM yyyy, HH:mm', { locale: pl });
};

const CommentItem = ({
  comment,
  canDelete,
  onDelete,
}: {
  comment: TaskComment;
  canDelete: boolean;
  onDelete: () => void;
}) => {
  const author = comment.author_name || comment.author_email.split('@')[0];
  return (
    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: '#fef3f2',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: '#be185d', fontFamily: 'Inter_700Bold', fontSize: 12 }}>
          {initials(comment.author_name, comment.author_email)}
        </Text>
      </View>
      <View
        style={{
          flex: 1,
          backgroundColor: '#fafaf9',
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 8,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text
            style={{ flex: 1, fontSize: 12, color: '#0c0a09', fontFamily: 'Inter_700Bold' }}
          >
            {author}
          </Text>
          <Text style={{ fontSize: 10, color: '#a8a29e', fontFamily: 'Inter_500Medium' }}>
            {relTime(comment.created_at)}
          </Text>
          {canDelete ? (
            <Pressable onPress={onDelete} hitSlop={6} style={{ marginLeft: 4 }}>
              <Trash2 size={12} color="#a8a29e" />
            </Pressable>
          ) : null}
        </View>
        <Text
          style={{
            fontSize: 13,
            color: '#1c1917',
            marginTop: 2,
            lineHeight: 18,
            fontFamily: 'Inter_400Regular',
          }}
        >
          {comment.content}
        </Text>
      </View>
    </View>
  );
};

export const TaskCommentsSection = ({ taskId, taskOwnerEmail, myEmail, myName }: Props) => {
  const [text, setText] = useState('');
  const { data, isLoading } = useTaskComments(taskId);
  const addComment = useAddTaskComment(taskId);
  const deleteComment = useDeleteTaskComment(taskId);

  if (!taskId) {
    return (
      <View
        style={{
          paddingVertical: 12,
          paddingHorizontal: 14,
          borderRadius: 12,
          backgroundColor: '#fafaf9',
          borderWidth: 1,
          borderColor: '#eef0f3',
          marginBottom: 14,
        }}
      >
        <Text
          style={{
            fontSize: 12,
            color: '#78716c',
            textAlign: 'center',
            fontFamily: 'Inter_500Medium',
          }}
        >
          Zapisz zadanie, aby dodawać komentarze.
        </Text>
      </View>
    );
  }

  const handleAdd = () => {
    const t = text.trim();
    if (!t || !myEmail) return;
    addComment.mutate(
      { content: t, authorEmail: myEmail, authorName: myName },
      {
        onSuccess: () => setText(''),
        onError: (err: any) =>
          Alert.alert('Błąd', err?.message ?? 'Nie udało się dodać komentarza'),
      },
    );
  };

  const comments = data ?? [];

  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <MessageCircle size={11} color="#78716c" strokeWidth={2.4} />
        <Text
          style={{
            fontSize: 11,
            color: '#78716c',
            letterSpacing: 0.4,
            textTransform: 'uppercase',
            fontFamily: 'Inter_700Bold',
          }}
        >
          Komentarze ({comments.length})
        </Text>
      </View>

      {isLoading ? (
        <View style={{ paddingVertical: 16, alignItems: 'center' }}>
          <ActivityIndicator color="#ec4899" />
        </View>
      ) : comments.length === 0 ? (
        <Text
          style={{
            fontSize: 13,
            color: '#a8a29e',
            textAlign: 'center',
            paddingVertical: 12,
            fontStyle: 'italic',
            fontFamily: 'Inter_400Regular',
          }}
        >
          Brak komentarzy. Bądź pierwszy!
        </Text>
      ) : (
        comments.map((c) => {
          const canDelete =
            !!myEmail && (c.author_email === myEmail || taskOwnerEmail === myEmail);
          return (
            <CommentItem
              key={c.id}
              comment={c}
              canDelete={canDelete}
              onDelete={() => {
                Alert.alert('Usunąć komentarz?', undefined, [
                  { text: 'Anuluj', style: 'cancel' },
                  {
                    text: 'Usuń',
                    style: 'destructive',
                    onPress: () => deleteComment.mutate(c.id),
                  },
                ]);
              }}
            />
          );
        })
      )}

      {myEmail ? (
        <View
          style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 8 }}
        >
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Napisz komentarz…"
            placeholderTextColor="#a8a29e"
            multiline
            style={{
              flex: 1,
              minHeight: 40,
              maxHeight: 100,
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 10,
              backgroundColor: '#fafaf9',
              borderWidth: 1,
              borderColor: '#eef0f3',
              fontSize: 13,
              color: '#0c0a09',
              fontFamily: 'Inter_400Regular',
            }}
          />
          <Pressable
            onPress={handleAdd}
            disabled={!text.trim() || addComment.isPending}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: !text.trim() || addComment.isPending ? '#e7e5e4' : '#ec4899',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {addComment.isPending ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Send size={16} color="#ffffff" />
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
};
