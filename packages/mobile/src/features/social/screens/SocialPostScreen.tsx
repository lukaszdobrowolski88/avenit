import { useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StatusBar, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { ExternalLink, Film, MessageCircle, RotateCcw, Send, Share2, Trash2 } from 'lucide-react-native';
import { PageHeader } from '../../../components/ui/PageHeader';
import { EmptyState } from '../../../components/ui/EmptyState';
import { PromptModal } from '../../../components/ui/PromptModal';
import { DangerLink, PrimaryButton } from '../../../components/ui/Sheet';
import { B } from '../../../components/ui/brand';
import { FONT as F } from '../../../lib/fonts';
import { goBack } from '../../../lib/navigation';
import { showError } from '../../../lib/errors';
import { toast } from '../../../lib/toast';
import { effectiveTarget } from '@avenit/shared/src/lib/social.js';
import {
  mediaUri, socialApi, useActivity, useInvalidateSocial, usePostMetrics, useSocialPost, useSocialRealtime, useSocialStatus, type Activity, type SocialPost,
} from '../api';
import { actionItems, permsFor, runPostAction, type PostAction } from '../actions';
import { ChannelAvatar, StatusPill, TARGET_DOT, fmtWhen, targetLabel } from '../components/ui';
import { Card, SecondaryButton, SectionTitle } from '../../campaigns/components/ui';

const ACTIVITY: Record<string, string> = {
  created: 'utworzył(a) post', edited: 'zmienił(a) post', submitted: 'wysłał(a) do akceptacji', approved: 'zatwierdził(a)',
  rejected: 'odesłał(a) do poprawy', scheduled: 'zaplanował(a)', published_now: 'zlecił(a) publikację od razu',
  unscheduled: 'wstrzymał(a) — przeniesiono do szkiców', rescheduled: 'zmienił(a) termin', retried: 'ponowił(a) publikację',
  published: 'Opublikowano', partial: 'Opublikowano częściowo', failed: 'Publikacja nie powiodła się',
};
const WITH_TIME = new Set(['scheduled', 'approved', 'rescheduled']);

export const SocialPostScreen = () => {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const status = useSocialStatus();
  const post = useSocialPost(id);
  const activity = useActivity(id);
  const metrics = usePostMetrics(id);
  const invalidate = useInvalidateSocial();
  useSocialRealtime();
  const [rejecting, setRejecting] = useState(false);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const access = status.data?.access ?? {};
  const email = status.data?.me?.email || '';
  const accounts = useMemo(() => new Map((status.data?.accounts ?? []).map((a) => [a.id, a])), [status.data?.accounts]);
  const p = post.data;

  const act = async (action: PostAction) => {
    if (!p) return;
    if (action === 'edit') return router.push({ pathname: '/(app)/social/compose', params: { id: p.id } } as never);
    if (action === 'reject') return setRejecting(true);
    const out = await runPostAction(action, p);
    await invalidate();
    if (out === 'deleted') return goBack(router);
    if (action === 'duplicate' && out) router.replace({ pathname: '/(app)/social/compose', params: { id: out.id } } as never);
  };

  const sendComment = async () => {
    const body = comment.trim();
    if (!body || !p) return;
    setSending(true);
    try {
      await socialApi.comment(p.id, body);
      setComment('');
      await activity.refetch();
    } catch (e) { showError('Nie udało się dodać komentarza', e); } finally { setSending(false); }
  };

  const removeComment = async (a: Activity) => {
    try { await socialApi.commentDelete(a.id); await activity.refetch(); } catch (e) { showError('Nie udało się', e); }
  };

  if (post.isLoading) {
    return <View style={{ flex: 1, backgroundColor: B.paper }}><PageHeader title="Post" showBack Icon={Share2} /><ActivityIndicator color={B.ink} style={{ marginTop: 40 }} /></View>;
  }
  if (!p) {
    return (
      <View style={{ flex: 1, backgroundColor: B.paper }}>
        <PageHeader title="Post" showBack Icon={Share2} />
        <EmptyState Icon={Share2} title="Nie znaleziono posta" hint="Mógł zostać usunięty albo nie masz do niego dostępu." actionLabel="Wróć" onAction={() => goBack(router)} />
      </View>
    );
  }

  const perm = permsFor(p, access, email);
  const extra = actionItems(p, access, email).filter((i) => !['edit', 'approve', 'reject', 'delete'].includes(i.key));
  const comments = (activity.data ?? []).filter((a) => a.kind === 'comment');
  const events = (activity.data ?? []).filter((a) => a.kind !== 'comment');
  const media = p.media ?? [];

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: B.paper }}>
        <PageHeader title="Post" subtitle={p.published_at ? `Opublikowano ${fmtWhen(p.published_at)}` : p.scheduled_at ? fmtWhen(p.scheduled_at) : 'Bez terminu'} Icon={Share2} showBack />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140 }}
          refreshControl={<RefreshControl refreshing={post.isRefetching} onRefresh={() => { post.refetch(); activity.refetch(); }} tintColor={B.ink} />}>
          {p.review_note && p.status === 'draft' ? (
            <View style={{ borderRadius: 18, backgroundColor: B.kurkumaSoft, padding: 12, marginBottom: 12 }}>
              <Text style={{ fontSize: 13, color: B.goldDeep, fontFamily: F.bold }}>Uwagi do poprawy</Text>
              <Text style={{ marginTop: 2, fontSize: 14, lineHeight: 19, color: B.ink, fontFamily: F.medium }}>{p.review_note}</Text>
            </View>
          ) : null}

          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <StatusPill status={p.status} />
              {p.created_by ? <Text style={{ fontSize: 12, color: B.ink4, fontFamily: F.semibold }}>{p.created_by}</Text> : null}
            </View>
            {p.content ? (
              <Text selectable style={{ marginTop: 10, fontSize: 15, lineHeight: 21, color: B.ink, fontFamily: F.medium }}>{p.content}</Text>
            ) : <Text style={{ marginTop: 10, fontSize: 14, color: B.ink4, fontFamily: F.medium }}>Post bez tekstu</Text>}
            {media.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12, marginHorizontal: -4 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 4 }}>
                {media.map((m) => (
                  <View key={m.path} style={{ width: 120, height: 120, borderRadius: 16, overflow: 'hidden', backgroundColor: B.paper2, alignItems: 'center', justifyContent: 'center' }}>
                    {m.kind === 'video' ? <Film size={26} color={B.ink3} /> : <Image source={{ uri: mediaUri(m, 256) }} style={{ width: '100%', height: '100%' }} contentFit="cover" />}
                  </View>
                ))}
              </ScrollView>
            ) : null}
          </Card>

          <SectionTitle>Kanały</SectionTitle>
          <Card style={{ paddingVertical: 4 }}>
            {p.targets.map((t, i) => {
              const own = effectiveTarget(p, t);
              const custom = t.content != null && t.content !== '';
              return (
                <View key={t.id} style={{ paddingVertical: 12, borderBottomWidth: i === p.targets.length - 1 ? 0 : 1, borderBottomColor: B.line }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <ChannelAvatar account={t.account_id ? accounts.get(t.account_id) : null} provider={t.provider} name={t.account_name} size={34} />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ fontSize: 15, color: B.ink, fontFamily: F.semibold }}>{t.account_name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: TARGET_DOT[t.status] }} />
                        <Text style={{ fontSize: 12, color: B.ink3, fontFamily: F.semibold }}>
                          {['draft', 'pending_approval', 'scheduled'].includes(p.status) ? (t.options?.format ? `Format: ${t.options.format === 'reel' ? 'rolka' : t.options.format === 'story' ? 'relacja' : 'post'}` : 'Czeka na publikację') : targetLabel(t.status)}
                          {t.published_at ? ` · ${fmtWhen(t.published_at)}` : ''}
                        </Text>
                      </View>
                    </View>
                    {t.permalink ? (
                      <Pressable onPress={() => Linking.openURL(t.permalink!)} hitSlop={8} accessibilityRole="link" accessibilityLabel="Zobacz post" className="active:opacity-60"
                        style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: B.paper, alignItems: 'center', justifyContent: 'center' }}>
                        <ExternalLink size={16} color={B.ink2} />
                      </Pressable>
                    ) : null}
                    {perm.retry && t.status === 'failed' ? (
                      <Pressable onPress={async () => { try { await socialApi.retry(p.id, t.id); toast.success('Ponawiamy publikację'); await invalidate(); } catch (e) { showError('Nie udało się', e); } }}
                        hitSlop={8} accessibilityRole="button" accessibilityLabel="Ponów" className="active:opacity-60"
                        style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: B.paper, alignItems: 'center', justifyContent: 'center' }}>
                        <RotateCcw size={16} color={B.ink2} />
                      </Pressable>
                    ) : null}
                  </View>
                  {t.error ? <Text style={{ marginTop: 6, fontSize: 12, lineHeight: 17, color: t.status === 'failed' ? B.danger : B.goldDeep, fontFamily: F.medium }}>{t.error}</Text> : null}
                  {(() => {
                    const m = (metrics.data ?? []).find((x) => x.target_id === t.id);
                    if (!m) return null;
                    const parts = [
                      m.views != null ? `${m.views} wyświetleń` : null,
                      m.reach != null ? `zasięg ${m.reach}` : null,
                      `${m.likes ?? 0} reakcji`, `${m.comments ?? 0} kom.`,
                      m.shares != null ? `${m.shares} udostępnień` : null,
                      m.saves != null ? `${m.saves} zapisów` : null,
                    ].filter(Boolean);
                    return <Text style={{ marginTop: 6, fontSize: 12, color: B.ink2, fontFamily: F.semibold, fontVariant: ['tabular-nums'] }}>{parts.join(' · ')}</Text>;
                  })()}
                  {custom ? <Text numberOfLines={3} style={{ marginTop: 6, fontSize: 12, lineHeight: 17, color: B.ink3, fontFamily: F.medium }}>{`Własna treść: ${own.content}`}</Text> : null}
                  {t.options?.first_comment ? <Text numberOfLines={2} style={{ marginTop: 4, fontSize: 12, color: B.ink4, fontFamily: F.medium }}>{`Pierwszy komentarz: ${t.options.first_comment}`}</Text> : null}
                </View>
              );
            })}
          </Card>

          <View style={{ gap: 10, marginTop: 16 }}>
            {perm.approve ? <PrimaryButton label="Zatwierdź" onPress={() => act('approve')} /> : null}
            {perm.reject ? <SecondaryButton label="Odeślij do poprawy" onPress={() => act('reject')} /> : null}
            {perm.edit ? (perm.approve ? <SecondaryButton label="Edytuj" onPress={() => act('edit')} /> : <PrimaryButton label="Edytuj" onPress={() => act('edit')} tone="ink" />) : null}
            {extra.map((it) => <SecondaryButton key={it.key} label={it.label} onPress={() => act(it.key)} />)}
          </View>

          <SectionTitle right={events.length ? (
            <Pressable onPress={() => setShowHistory((v) => !v)} hitSlop={8} className="active:opacity-60">
              <Text style={{ fontSize: 13, color: B.ink3, fontFamily: F.semibold }}>{showHistory ? 'Ukryj historię' : 'Pokaż historię'}</Text>
            </Pressable>
          ) : undefined}>
            {comments.length ? `Komentarze zespołu · ${comments.length}` : 'Komentarze zespołu'}
          </SectionTitle>
          <Card>
            {(activity.data ?? []).filter((a) => a.kind === 'comment' || showHistory).map((a) => (a.kind === 'comment' ? (
              <View key={a.id} style={{ marginBottom: 10, borderRadius: 14, backgroundColor: B.paper, padding: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 12, color: B.ink2, fontFamily: F.bold }}>{`${a.actor} · ${fmtWhen(a.created_at)}`}</Text>
                  {(access.admin || String(a.actor).toLowerCase() === email.toLowerCase()) ? (
                    <Pressable onPress={() => removeComment(a)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Usuń komentarz" className="active:opacity-60">
                      <Trash2 size={14} color={B.ink4} />
                    </Pressable>
                  ) : null}
                </View>
                <Text selectable style={{ marginTop: 3, fontSize: 14, lineHeight: 19, color: B.ink, fontFamily: F.medium }}>{a.note}</Text>
              </View>
            ) : (
              <Text key={a.id} style={{ marginBottom: 8, fontSize: 12, lineHeight: 17, color: B.ink4, fontFamily: F.medium }}>
                {`${fmtWhen(a.created_at)} · ${a.actor ? `${a.actor} ` : ''}${ACTIVITY[a.kind] || a.kind}${WITH_TIME.has(a.kind) && a.note ? ` · ${fmtWhen(a.note)}` : ''}`}
                {!WITH_TIME.has(a.kind) && a.note ? `\n${a.note}` : ''}
              </Text>
            )))}
            {!comments.length && !showHistory ? (
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                <MessageCircle size={16} color={B.ink4} />
                <Text style={{ flex: 1, fontSize: 13, color: B.ink4, fontFamily: F.medium }}>Brak komentarzy — zapytaj albo podpowiedz coś autorowi.</Text>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
              <TextInput value={comment} onChangeText={setComment} placeholder="Napisz komentarz…" placeholderTextColor={B.ink4} multiline maxLength={2000}
                style={{ flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 14, borderWidth: 1, borderColor: B.fieldBorder, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: B.ink, fontFamily: F.medium }} />
              <Pressable onPress={sendComment} disabled={!comment.trim() || sending} accessibilityRole="button" accessibilityLabel="Wyślij komentarz" className="active:opacity-70"
                style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: comment.trim() ? B.kurkuma : B.paper2, alignItems: 'center', justifyContent: 'center' }}>
                {sending ? <ActivityIndicator color={B.ink} /> : <Send size={18} color={B.ink} />}
              </Pressable>
            </View>
          </Card>

          {perm.delete ? <DangerLink label="Usuń post" onPress={() => act('delete')} /> : null}
        </ScrollView>
      </View>

      <PromptModal
        visible={rejecting}
        title="Co poprawić? (autor dostanie powiadomienie)"
        placeholder="Np. dodaj godzinę i miejsce"
        confirmLabel="Odeślij"
        onCancel={() => setRejecting(false)}
        onConfirm={async (note) => {
          setRejecting(false);
          try {
            await socialApi.reject(p.id, note);
            toast.success('Post odesłany do poprawy');
            await invalidate();
          } catch (e) { showError('Nie udało się', e); }
        }}
      />
    </>
  );
};

