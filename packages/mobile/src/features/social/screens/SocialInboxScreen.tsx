import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, RefreshControl, ScrollView, StatusBar, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { Check, ExternalLink, Eye, EyeOff, Film, MessageCircle, Reply, Trash2 } from 'lucide-react-native';
import { PageHeader } from '../../../components/ui/PageHeader';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Chip, FormInput, PrimaryButton, Sheet } from '../../../components/ui/Sheet';
import { B } from '../../../components/ui/brand';
import { FONT as F } from '../../../lib/fonts';
import { showError } from '../../../lib/errors';
import { toast } from '../../../lib/toast';
import {
  inboxApi, mediaUri, useInbox, useInvalidateSocial, useSocialRealtime, useSocialStatus, type InboxComment, type InboxFilter,
} from '../api';
import { ChannelAvatar, channelName, fmtWhen } from '../components/ui';

// Skrzynka komentarzy w apce — odpowiedź z telefonu, ukrycie, usunięcie, „przeczytane”.

const FILTERS: { key: InboxFilter; label: string }[] = [
  { key: 'new', label: 'Nowe' },
  { key: 'all', label: 'Wszystkie' },
  { key: 'hidden', label: 'Ukryte' },
];

const snippet = (t?: string | null, max = 90) => {
  const s = String(t || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

const Bubble = ({ c, own }: { c: InboxComment; own?: boolean }) => (
  <View style={{ borderRadius: 14, backgroundColor: own ? B.kurkumaSoft : B.paper, padding: 10, opacity: c.hidden ? 0.6 : 1 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 12, color: B.ink2, fontFamily: F.bold }}>{c.author_name || 'Użytkownik'}</Text>
      <Text style={{ fontSize: 11, color: B.ink4, fontFamily: F.medium }}>{fmtWhen(c.created_time)}</Text>
      {c.hidden ? <EyeOff size={12} color={B.ink4} /> : null}
      {c.status === 'new' && !own ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: B.kurkuma }} /> : null}
    </View>
    <Text selectable style={{ marginTop: 3, fontSize: 14, lineHeight: 19, color: B.ink, fontFamily: F.medium }}>{c.message}</Text>
  </View>
);

const Action = ({ Icon, label, onPress }: { Icon: typeof Reply; label: string; onPress: () => void }) => (
  <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} className="active:opacity-60"
    style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999, backgroundColor: B.paper }}>
    <Icon size={14} color={B.ink2} /><Text style={{ fontSize: 13, color: B.ink2, fontFamily: F.semibold }}>{label}</Text>
  </Pressable>
);

export const SocialInboxScreen = () => {
  const params = useLocalSearchParams<{ post?: string }>();
  const [postId, setPostId] = useState<string | undefined>(params.post ? String(params.post) : undefined);
  const [filter, setFilter] = useState<InboxFilter>(postId ? 'all' : 'new');
  const status = useSocialStatus();
  const inbox = useInbox(filter, postId);
  const invalidate = useInvalidateSocial();
  useSocialRealtime();
  const [replyTo, setReplyTo] = useState<InboxComment | null>(null);
  const [text, setText] = useState('');
  const canEngage = !!status.data?.access?.engage;
  const accounts = useMemo(() => new Map((status.data?.accounts ?? []).map((a) => [a.id, a])), [status.data?.accounts]);
  const list = inbox.data ?? [];

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try { await fn(); if (ok) toast.success(ok); await invalidate(); } catch (e) { showError('Nie udało się', e); }
  };
  const remove = (c: InboxComment) => Alert.alert('Usunąć komentarz?', `Komentarz zniknie z ${c.provider === 'instagram' ? 'Instagrama' : 'Facebooka'}. Tego nie da się cofnąć.`, [
    { text: 'Anuluj', style: 'cancel' },
    { text: 'Usuń', style: 'destructive', onPress: () => run(() => inboxApi.remove(c.id), 'Komentarz usunięty') },
  ]);

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: B.paper }}>
        <PageHeader title="Komentarze" subtitle="Facebook i Instagram" Icon={MessageCircle} showBack />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140 }}
          refreshControl={<RefreshControl refreshing={inbox.isRefetching} onRefresh={() => inbox.refetch()} tintColor={B.ink} />}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, marginBottom: 12 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
            {FILTERS.map((f) => <Chip key={f.key} label={f.label} on={filter === f.key} onPress={() => setFilter(f.key)} />)}
            {postId ? <Chip label="Jeden post ✕" on onPress={() => setPostId(undefined)} /> : null}
            {filter === 'new' && list.length ? <Chip label="Wszystkie przeczytane" on={false} onPress={() => run(() => inboxApi.mark({ all: true, status: 'read' }), 'Oznaczono jako przeczytane')} /> : null}
          </ScrollView>
          {inbox.isLoading ? <ActivityIndicator color={B.ink} style={{ marginTop: 32 }} /> : null}
          {!inbox.isLoading && !list.length ? (
            <EmptyState Icon={MessageCircle} title={filter === 'new' ? 'Wszystko przeczytane' : 'Brak komentarzy'} hint="Komentarze spod opublikowanych postów (ostatnie 30 dni) pojawiają się tu co kilka minut." />
          ) : null}
          {list.map((c) => {
            const acc = c.account_id ? accounts.get(c.account_id) : null;
            const first = c.post_media?.[0];
            const unread = c.status === 'new' || c.replies.some((r) => r.status === 'new' && !r.is_own);
            return (
              <View key={c.id} style={{ borderRadius: 22, backgroundColor: B.card, padding: 14, marginBottom: 10, gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ChannelAvatar account={acc} provider={c.provider} name={c.account_name} size={24} />
                  {first ? (
                    <View style={{ width: 30, height: 30, borderRadius: 8, overflow: 'hidden', backgroundColor: B.paper2, alignItems: 'center', justifyContent: 'center' }}>
                      {first.kind === 'video' ? <Film size={14} color={B.ink3} /> : <Image source={{ uri: mediaUri(first, 96) }} style={{ width: '100%', height: '100%' }} contentFit="cover" />}
                    </View>
                  ) : null}
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 12, color: B.ink3, fontFamily: F.medium }}>{snippet(c.post_content) || 'Post bez tekstu'}</Text>
                  {c.permalink ? (
                    <Pressable onPress={() => Linking.openURL(c.permalink!)} hitSlop={8} accessibilityRole="link" accessibilityLabel="Zobacz post"><ExternalLink size={15} color={B.ink3} /></Pressable>
                  ) : null}
                </View>
                <Bubble c={c} />
                {c.replies.length ? (
                  <View style={{ marginLeft: 12, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: B.line, gap: 8 }}>
                    {c.replies.map((r) => <Bubble key={r.id} c={r} own={r.is_own} />)}
                  </View>
                ) : null}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {canEngage ? <Action Icon={Reply} label="Odpowiedz" onPress={() => { setReplyTo(c); setText(''); }} /> : null}
                  {unread ? <Action Icon={Check} label="Przeczytane" onPress={() => run(() => inboxApi.mark({ ids: [c.id], status: 'read' }))} /> : null}
                  {canEngage ? <Action Icon={c.hidden ? Eye : EyeOff} label={c.hidden ? 'Pokaż' : 'Ukryj'} onPress={() => run(() => inboxApi.hide(c.id, !c.hidden), c.hidden ? 'Komentarz znów widoczny' : 'Komentarz ukryty')} /> : null}
                  {canEngage ? <Action Icon={Trash2} label="Usuń" onPress={() => remove(c)} /> : null}
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>

      <Sheet visible={!!replyTo} onClose={() => setReplyTo(null)} title="Odpowiedź" eyebrow={replyTo ? `Jako ${channelName(replyTo.account_id ? accounts.get(replyTo.account_id) : null) || replyTo.account_name}` : null}
        footer={<PrimaryButton label="Odpowiedz" disabled={!text.trim()} onPress={async () => {
          const c = replyTo;
          if (!c) return;
          await run(() => inboxApi.reply(c.id, text.trim()), 'Odpowiedź opublikowana');
          setReplyTo(null);
        }} />}>
        {replyTo ? (
          <View style={{ gap: 10 }}>
            <Bubble c={replyTo} />
            <FormInput value={text} onChangeText={setText} multiline autoFocus maxLength={2200} placeholder="Napisz odpowiedź…" />
          </View>
        ) : null}
      </Sheet>
    </>
  );
};
