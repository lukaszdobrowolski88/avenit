import { useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { Heart, MessageCircle, MoreVertical, Pin, Send, Trash2 } from 'lucide-react-native';
import { format, formatDistanceToNow } from 'date-fns';
import { pl } from 'date-fns/locale';
import {
  useAddPostComment,
  useDeleteWallPost,
  useTogglePostLike,
  useTogglePostPin,
  type MinistryKey,
  type WallPost,
} from '../api';

interface Props {
  post: WallPost;
  ministry: MinistryKey;
  myEmail: string | null;
  myName: string | null;
}

const initials = (name: string | null, email: string): string => {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    return (parts[0]?.[0] ?? '' + (parts[1]?.[0] ?? '')).toUpperCase().slice(0, 2);
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

export const WallPostCard = ({ post, ministry, myEmail, myName }: Props) => {
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const toggleLike = useTogglePostLike(ministry);
  const togglePin = useTogglePostPin(ministry);
  const addComment = useAddPostComment(ministry);
  const deletePost = useDeleteWallPost(ministry);

  const liked = !!myEmail && post.likes.includes(myEmail);
  const isMine = myEmail === post.author_email;
  const author = post.author_name || post.author_email.split('@')[0];

  const handleLike = () => {
    if (!myEmail) return;
    toggleLike.mutate({ postId: post.id, userEmail: myEmail, currentLikes: post.likes });
  };

  const handleAddComment = () => {
    const text = commentText.trim();
    if (!text || !myEmail) return;
    addComment.mutate(
      {
        postId: post.id,
        content: text,
        authorEmail: myEmail,
        authorName: myName,
        currentComments: post.comments,
      },
      {
        onSuccess: () => setCommentText(''),
        onError: (err: any) =>
          Alert.alert('Błąd', err?.message ?? 'Nie udało się dodać komentarza'),
      },
    );
  };

  const handleMore = () => {
    const options: { text: string; onPress?: () => void; style?: 'destructive' | 'cancel' }[] =
      [];
    options.push({
      text: post.pinned ? 'Odepnij' : 'Przypnij',
      onPress: () => togglePin.mutate({ postId: post.id, pinned: !post.pinned }),
    });
    if (isMine) {
      options.push({
        text: 'Usuń',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Usunąć post?', 'Tej operacji nie można cofnąć.', [
            { text: 'Anuluj', style: 'cancel' },
            {
              text: 'Usuń',
              style: 'destructive',
              onPress: () => deletePost.mutate(post.id),
            },
          ]);
        },
      });
    }
    options.push({ text: 'Anuluj', style: 'cancel' });
    Alert.alert('Akcje', undefined, options);
  };

  return (
    <View
      style={{
        marginBottom: 12,
        borderRadius: 18,
        backgroundColor: '#ffffff',
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.04,
        shadowRadius: 10,
        elevation: 1,
      }}
    >
      <View
        style={{
          borderRadius: 18,
          borderWidth: 1,
          borderColor: post.pinned ? '#fde68a' : '#eef0f3',
          backgroundColor: post.pinned ? '#fffbeb' : '#ffffff',
          padding: 14,
        }}
      >
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: '#fef3f2',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#be185d', fontSize: 13, fontFamily: 'Inter_700Bold' }}>
              {initials(post.author_name, post.author_email)}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text
                style={{ fontSize: 13, color: '#0c0a09', fontFamily: 'Inter_700Bold' }}
              >
                {author}
              </Text>
              {post.pinned ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 3,
                    paddingHorizontal: 6,
                    paddingVertical: 1,
                    borderRadius: 6,
                    backgroundColor: '#fef3c7',
                  }}
                >
                  <Pin size={9} color="#b45309" strokeWidth={2.4} />
                  <Text
                    style={{
                      fontSize: 9,
                      color: '#b45309',
                      letterSpacing: 0.4,
                      textTransform: 'uppercase',
                      fontFamily: 'Inter_700Bold',
                    }}
                  >
                    Przypięty
                  </Text>
                </View>
              ) : null}
            </View>
            <Text
              style={{
                fontSize: 11,
                color: '#78716c',
                marginTop: 1,
                fontFamily: 'Inter_500Medium',
              }}
            >
              {relTime(post.created_at)}
            </Text>
          </View>
          <Pressable onPress={handleMore} hitSlop={8} style={{ padding: 4 }}>
            <MoreVertical size={18} color="#a8a29e" />
          </Pressable>
        </View>

        {post.title ? (
          <Text
            style={{
              fontSize: 16,
              color: '#0c0a09',
              marginBottom: 6,
              letterSpacing: -0.3,
              fontFamily: 'Inter_700Bold',
            }}
          >
            {post.title}
          </Text>
        ) : null}
        {post.content ? (
          <Text
            style={{
              fontSize: 14,
              color: '#1c1917',
              lineHeight: 20,
              fontFamily: 'Inter_400Regular',
            }}
          >
            {post.content}
          </Text>
        ) : null}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 16,
            marginTop: 12,
            paddingTop: 10,
            borderTopWidth: 1,
            borderTopColor: '#f5f5f4',
          }}
        >
          <Pressable
            onPress={handleLike}
            disabled={!myEmail || toggleLike.isPending}
            hitSlop={6}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
          >
            <Heart
              size={16}
              color={liked ? '#ec4899' : '#78716c'}
              fill={liked ? '#ec4899' : 'none'}
            />
            <Text
              style={{
                fontSize: 12,
                color: liked ? '#be185d' : '#78716c',
                fontFamily: liked ? 'Inter_700Bold' : 'Inter_500Medium',
              }}
            >
              {post.likes.length}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setShowComments((s) => !s)}
            hitSlop={6}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
          >
            <MessageCircle size={16} color="#78716c" />
            <Text style={{ fontSize: 12, color: '#78716c', fontFamily: 'Inter_500Medium' }}>
              {post.comments.length}{' '}
              {post.comments.length === 1 ? 'komentarz' : 'komentarzy'}
            </Text>
          </Pressable>
        </View>

        {showComments ? (
          <View style={{ marginTop: 10, gap: 8 }}>
            {post.comments.map((c) => {
              const cAuthor = c.author_name || c.author_email.split('@')[0];
              return (
                <View key={c.id} style={{ flexDirection: 'row', gap: 8, paddingTop: 8 }}>
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      backgroundColor: '#f5f5f4',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        color: '#57534e',
                        fontFamily: 'Inter_700Bold',
                      }}
                    >
                      {initials(c.author_name ?? null, c.author_email)}
                    </Text>
                  </View>
                  <View
                    style={{
                      flex: 1,
                      backgroundColor: '#fafaf9',
                      borderRadius: 12,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text
                        style={{
                          fontSize: 12,
                          color: '#0c0a09',
                          fontFamily: 'Inter_700Bold',
                        }}
                      >
                        {cAuthor}
                      </Text>
                      <Text
                        style={{
                          fontSize: 10,
                          color: '#a8a29e',
                          fontFamily: 'Inter_500Medium',
                        }}
                      >
                        {relTime(c.created_at)}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontSize: 13,
                        color: '#1c1917',
                        marginTop: 2,
                        fontFamily: 'Inter_400Regular',
                        lineHeight: 18,
                      }}
                    >
                      {c.content}
                    </Text>
                  </View>
                </View>
              );
            })}

            {myEmail ? (
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}
              >
                <TextInput
                  value={commentText}
                  onChangeText={setCommentText}
                  placeholder="Napisz komentarz…"
                  placeholderTextColor="#a8a29e"
                  multiline
                  style={{
                    flex: 1,
                    minHeight: 38,
                    maxHeight: 100,
                    borderRadius: 14,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    backgroundColor: '#fafaf9',
                    borderWidth: 1,
                    borderColor: '#eef0f3',
                    fontSize: 13,
                    color: '#0c0a09',
                    fontFamily: 'Inter_400Regular',
                  }}
                />
                <Pressable
                  onPress={handleAddComment}
                  disabled={!commentText.trim() || addComment.isPending}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    backgroundColor: commentText.trim() ? '#ec4899' : '#e7e5e4',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Send size={16} color="#ffffff" />
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
};
