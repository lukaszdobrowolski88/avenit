import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StatusBar, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AlertTriangle, Link2, Plus, Share2 } from 'lucide-react-native';
import { format } from 'date-fns';
import { PageHeader } from '../../../components/ui/PageHeader';
import { EmptyState } from '../../../components/ui/EmptyState';
import { PromptModal } from '../../../components/ui/PromptModal';
import { Chip, DangerLink, Sheet } from '../../../components/ui/Sheet';
import { B } from '../../../components/ui/brand';
import { FONT as F } from '../../../lib/fonts';
import { showError } from '../../../lib/errors';
import { toast } from '../../../lib/toast';
import {
  socialApi, useInvalidateSocial, useSocialPosts, useSocialRealtime, useSocialStatus, type SocialPost, type View as ListView,
} from '../api';
import { actionItems, runPostAction, type PostAction } from '../actions';
import { PostCard, fmtDayHeading } from '../components/ui';

// Social Media w apce — jak moduł na webie: kolejka (po dniach), do akceptacji, szkice, opublikowane;
// tworzenie i edycja postów, akceptacja, komentarze. Podłączanie kanałów (logowanie Meta) — na webie.

const VIEWS: { key: ListView; label: string; count?: 'queue' | 'approval' | 'drafts' | 'failed' }[] = [
  { key: 'queue', label: 'Kolejka', count: 'queue' },
  { key: 'approval', label: 'Do akceptacji', count: 'approval' },
  { key: 'drafts', label: 'Szkice', count: 'drafts' },
  { key: 'sent', label: 'Opublikowane', count: 'failed' },
];

const EMPTY: Record<ListView, { title: string; hint: string }> = {
  queue: { title: 'Kolejka jest pusta', hint: 'Zaplanowane posty pojawią się tutaj w kolejności publikacji.' },
  approval: { title: 'Nic nie czeka na akceptację', hint: 'Posty wysłane do zatwierdzenia pojawią się tutaj.' },
  drafts: { title: 'Brak szkiców', hint: 'Zapisz post jako szkic, aby wrócić do niego później.' },
  sent: { title: 'Nic jeszcze nie opublikowano', hint: 'Opublikowane posty i błędy publikacji pojawią się tutaj.' },
};

const MenuRow = ({ label, onPress, last }: { label: string; onPress: () => void; last?: boolean }) => (
  <Pressable onPress={onPress} accessibilityRole="button" className="active:opacity-70"
    style={{ paddingHorizontal: 16, paddingVertical: 15, borderBottomWidth: last ? 0 : 1, borderBottomColor: B.line }}>
    <Text style={{ fontSize: 16, color: B.ink, fontFamily: F.semibold }}>{label}</Text>
  </Pressable>
);

export const SocialHomeScreen = () => {
  const router = useRouter();
  const params = useLocalSearchParams<{ view?: string }>();
  const [view, setView] = useState<ListView>(VIEWS.some((v) => v.key === params.view) ? (params.view as ListView) : 'queue');
  const status = useSocialStatus();
  const posts = useSocialPosts(view);
  const invalidate = useInvalidateSocial();
  useSocialRealtime();
  const [menu, setMenu] = useState<SocialPost | null>(null);
  const [rejecting, setRejecting] = useState<SocialPost | null>(null);

  const access = status.data?.access ?? {};
  const email = status.data?.me?.email || '';
  const counts = status.data?.counts;
  const accounts = useMemo(() => new Map((status.data?.accounts ?? []).map((a) => [a.id, a])), [status.data?.accounts]);
  const revoked = (status.data?.accounts ?? []).filter((a) => a.status === 'revoked');
  const canCreate = !!(access.create || access.publish);
  const list = posts.data ?? [];

  const groups = useMemo(() => {
    if (view === 'drafts' || view === 'approval') return [{ key: 'flat', heading: null as string | null, items: list }];
    const map = new Map<string, { key: string; heading: string | null; items: SocialPost[] }>();
    for (const p of list) {
      const when = p.published_at || p.scheduled_at;
      const key = when ? format(new Date(when), 'yyyy-MM-dd') : 'none';
      if (!map.has(key)) map.set(key, { key, heading: when ? fmtDayHeading(when) : 'Bez terminu', items: [] });
      map.get(key)!.items.push(p);
    }
    return [...map.values()];
  }, [list, view]);

  const open = (p: SocialPost) => router.push({ pathname: '/(app)/social/post/[id]', params: { id: p.id } } as never);
  const compose = (id?: string) => router.push({ pathname: '/(app)/social/compose', params: id ? { id } : {} } as never);
  const afterSheet = () => new Promise((r) => setTimeout(r, 380));

  const run = async (action: PostAction) => {
    const p = menu;
    if (!p) return;
    setMenu(null);
    if (action === 'edit') return compose(p.id);
    await afterSheet();
    if (action === 'reject') return setRejecting(p);
    const out = await runPostAction(action, p);
    await invalidate();
    if (action === 'duplicate' && out && out !== 'deleted') compose(out.id);
  };

  const items = menu ? actionItems(menu, access, email) : [];
  const normal = items.filter((i) => !i.danger);
  const danger = items.find((i) => i.danger);

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: B.paper }}>
        <PageHeader
          title="Social Media"
          subtitle="Facebook i Instagram"
          Icon={Share2}
          showBack
          right={canCreate ? (
            <Pressable onPress={() => compose()} accessibilityRole="button" accessibilityLabel="Nowy post" className="active:opacity-80"
              style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: B.kurkuma, alignItems: 'center', justifyContent: 'center' }}>
              <Plus size={20} color={B.ink} strokeWidth={2.6} />
            </Pressable>
          ) : undefined}
        />
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140 }}
          refreshControl={<RefreshControl refreshing={posts.isRefetching} onRefresh={() => { status.refetch(); posts.refetch(); }} tintColor={B.ink} />}
        >
          {revoked.length ? (
            <Pressable onPress={() => router.push('/(app)/social/channels' as never)} accessibilityRole="button" className="active:opacity-80"
              style={{ flexDirection: 'row', gap: 10, alignItems: 'center', borderRadius: 18, backgroundColor: B.dangerBg, padding: 12, marginBottom: 12 }}>
              <AlertTriangle size={18} color={B.danger} />
              <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: B.danger, fontFamily: F.semibold }}>
                {`Kanały wymagają ponownego połączenia: ${revoked.map((a) => a.name).join(', ')}. Zaplanowane posty na nie się nie opublikują.`}
              </Text>
            </Pressable>
          ) : null}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, marginBottom: 12 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
            {VIEWS.map((v) => {
              const n = v.count && counts ? counts[v.count] : 0;
              return <Chip key={v.key} label={n ? `${v.label} ${n}` : v.label} on={view === v.key} onPress={() => setView(v.key)} />;
            })}
            <Chip label="Kanały" on={false} onPress={() => router.push('/(app)/social/channels' as never)} />
          </ScrollView>

          {posts.isLoading || status.isLoading ? <ActivityIndicator color={B.ink} style={{ marginTop: 32 }} /> : null}
          {posts.isError ? (
            <EmptyState Icon={Share2} title="Nie udało się wczytać postów" hint="Sprawdź połączenie i spróbuj ponownie." actionLabel="Odśwież" onAction={() => posts.refetch()} />
          ) : null}
          {!posts.isLoading && !posts.isError && !list.length ? (
            !status.data?.accounts?.length ? (
              <EmptyState Icon={Link2} title="Brak podłączonych kanałów" hint="Kanały (strona na Facebooku, konto na Instagramie) podłącza się w wersji web — w zakładce Kanały." actionLabel="Kanały" onAction={() => router.push('/(app)/social/channels' as never)} />
            ) : (
              <EmptyState Icon={Share2} title={EMPTY[view].title} hint={EMPTY[view].hint} actionLabel={canCreate && view !== 'sent' ? 'Utwórz post' : undefined} onAction={canCreate && view !== 'sent' ? () => compose() : undefined} />
            )
          ) : null}

          {groups.map((g) => (
            <View key={g.key}>
              {g.heading ? (
                <Text style={{ marginTop: 6, marginBottom: 8, marginLeft: 4, fontSize: 13, color: B.ink2, fontFamily: F.bold }}>
                  {g.heading}<Text style={{ color: B.ink4, fontFamily: F.semibold }}>{`  ${g.items.length}`}</Text>
                </Text>
              ) : null}
              {g.items.map((p) => (
                <PostCard key={p.id} post={p} accounts={accounts} showTime={!!g.heading} onPress={() => open(p)} onMenu={() => setMenu(p)} />
              ))}
            </View>
          ))}
        </ScrollView>
      </View>

      <Sheet visible={!!menu} onClose={() => setMenu(null)} title="Post" eyebrow="Social Media">
        {normal.length ? (
          <View style={{ borderRadius: 20, backgroundColor: B.card, overflow: 'hidden', marginTop: 6 }}>
            {normal.map((it, i) => <MenuRow key={it.key} label={it.label} onPress={() => run(it.key)} last={i === normal.length - 1} />)}
          </View>
        ) : null}
        {danger ? <DangerLink label="Usuń post" onPress={() => run('delete')} /> : null}
      </Sheet>

      <PromptModal
        visible={!!rejecting}
        title="Co poprawić? (autor dostanie powiadomienie)"
        placeholder="Np. dodaj godzinę i miejsce"
        confirmLabel="Odeślij"
        onCancel={() => setRejecting(null)}
        onConfirm={async (note) => {
          const p = rejecting;
          setRejecting(null);
          if (!p) return;
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
