import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StatusBar, Switch, Text, View } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { AlertCircle, AlertTriangle, Camera, Film, Hash, ImagePlus, PenSquare, X } from 'lucide-react-native';
import { PageHeader } from '../../../components/ui/PageHeader';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Chip, FormInput, FormLabel, PrimaryButton, Sheet } from '../../../components/ui/Sheet';
import { DateField, TimeField, toYmd } from '../../../components/ui/DateField';
import { B } from '../../../components/ui/brand';
import { FONT as F } from '../../../lib/fonts';
import { goBack } from '../../../lib/navigation';
import { showError } from '../../../lib/errors';
import { toast } from '../../../lib/toast';
import {
  SOCIAL_PROVIDERS, MAX_MEDIA, IG_FORMAT_LABELS, FB_FORMAT_LABELS, charCount, effectiveTarget, instagramFormat, validateTarget,
} from '@avenit/shared/src/lib/social.js';
import {
  FileTooLarge, hashtagGroups, mediaUri, pickMedia, socialApi, uploadAsset, useInvalidateSocial, useSharePrefill, useSocialPost, useSocialStatus,
  type Intent, type SocialAccount, type SocialMedia, type TargetOptions,
} from '../api';
import { ChannelAvatar, channelName, fmtWhen, providerLabel } from '../components/ui';
import { Card, Hint, SecondaryButton, SectionTitle } from '../../campaigns/components/ui';

// Kompozytor posta — jak na webie: kanały, wspólna treść, zdjęcia/wideo z galerii lub aparatu, zestawy
// hashtagów, ustawienia kanału (własna treść, format IG/FB, pierwszy komentarz), termin (kolejka /
// teraz / wybrany) albo wysłanie do akceptacji. Walidacja limitów sieci te same funkcje co serwer.
// Własne zdjęcia kanału ustawione na webie zostają przy zapisie (w apce się ich nie zmienia).

type When = 'queue' | 'now' | 'schedule' | 'none';
interface Custom { on: boolean; content: string; options: TargetOptions; media: SocialMedia[] | null }

const pad = (n: number) => String(n).padStart(2, '0');
const combine = (ymd: string, hm: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const [h, mi] = hm.split(':').map(Number);
  return new Date(y, m - 1, d, h || 0, mi || 0, 0, 0).toISOString();
};
const appendBlock = (text: string, block: string) => (!text.trim() ? block.trim() : `${text.replace(/\s+$/, '')}\n\n${block.trim()}`);

export const SocialComposeScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ id?: string; date?: string; source?: string; sourceId?: string }>();
  const editingId = params.id ? String(params.id) : undefined;
  const status = useSocialStatus();
  const existing = useSocialPost(editingId);
  // „Udostępnij w social media” z wydarzenia / kazania → treść z linkiem (i miniatura kazania).
  const shareKind = !editingId && (params.source === 'event' || params.source === 'sermon') ? String(params.source) : undefined;
  const prefill = useSharePrefill(shareKind, shareKind && params.sourceId ? String(params.sourceId) : undefined);
  const invalidate = useInvalidateSocial();

  const access = status.data?.access ?? {};
  const canPublish = !!access.publish;
  const allAccounts = status.data?.accounts ?? [];
  const post = existing.data;

  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [content, setContent] = useState('');
  const [media, setMedia] = useState<SocialMedia[]>([]);
  const [custom, setCustom] = useState<Record<string, Custom>>({});
  const [when, setWhen] = useState<When>('queue');
  const [ymd, setYmd] = useState('');
  const [hm, setHm] = useState('');
  const [nextSlot, setNextSlot] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [groups, setGroups] = useState<{ id: string; name: string; hashtags: string }[] | null>(null);
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const baseline = useRef<string | null>(null);
  const saved = useRef(false);

  const usable = useMemo(
    () => allAccounts.filter((a) => a.status !== 'revoked' || post?.targets?.some((t) => t.account_id === a.id)),
    [allAccounts, post],
  );
  const byId = useMemo(() => new Map(allAccounts.map((a) => [a.id, a])), [allAccounts]);

  // Wczytanie posta / wartości początkowych (raz, gdy dane są gotowe).
  useEffect(() => {
    if (ready || status.isLoading || (editingId && existing.isLoading) || (shareKind && prefill.isLoading)) return;
    const targets = post?.targets ?? [];
    const ids = targets.length ? targets.map((t) => t.account_id).filter(Boolean) as string[] : usable.length === 1 ? [usable[0].id] : [];
    const c: Record<string, Custom> = {};
    for (const t of targets) {
      if (!t.account_id) continue;
      c[t.account_id] = { on: t.content != null && t.content !== '', content: t.content || '', options: t.options || {}, media: t.media?.length ? t.media : null };
    }
    const at = post?.scheduled_at || (params.date ? String(params.date) : null);
    const w: When = at && new Date(at) > new Date() ? 'schedule' : canPublish ? 'queue' : 'none';
    const base = at ? new Date(at) : new Date(Date.now() + 2 * 3600_000);
    const f = { ymd: toYmd(base), hm: at ? `${pad(base.getHours())}:${pad(base.getMinutes())}` : `${pad(base.getHours())}:00` };
    const initContent = post?.content ?? prefill.data?.content ?? '';
    const initMedia = post?.media ?? prefill.data?.media ?? [];
    setSelected(ids);
    setContent(initContent);
    setMedia(initMedia);
    setCustom(c);
    setWhen(w);
    setYmd(f.ymd);
    setHm(f.hm);
    // Szkic z udostępnienia od razu liczy się jako zmiana (wyjście pyta o zapis).
    baseline.current = JSON.stringify({ ids, content: post?.content ?? '', media: post?.media ?? [], c, w, ...f });
    setReady(true);
    if (prefill.isError) showError('Nie udało się przygotować treści', prefill.error);
  }, [ready, status.isLoading, existing.isLoading, editingId, post, usable, canPublish, params.date, shareKind, prefill.isLoading, prefill.data, prefill.isError, prefill.error]);

  const snap = JSON.stringify({ ids: selected, content, media, c: custom, w: when, ymd, hm });
  const dirty = ready && baseline.current !== null && snap !== baseline.current;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  // Wyjście z niezapisanymi zmianami — pytamy (strzałka, gest, przycisk systemowy).
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e: any) => {
      if (!dirtyRef.current || saved.current) return;
      e.preventDefault();
      Alert.alert('Zamknąć bez zapisywania?', 'Zmiany w poście nie zostaną zapisane.', [
        { text: 'Zostań', style: 'cancel' },
        { text: 'Zamknij', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
      ]);
    });
    return unsub;
  }, [navigation]);

  useEffect(() => {
    if (!ready || !canPublish || !selected.length) { setNextSlot(null); return undefined; }
    let alive = true;
    socialApi.queuePreview(selected, editingId).then((a) => { if (alive) setNextSlot(a); }).catch(() => { if (alive) setNextSlot(null); });
    return () => { alive = false; };
  }, [ready, canPublish, selected, editingId]);

  const selectedAccounts = selected.map((id) => byId.get(id)).filter(Boolean) as SocialAccount[];
  const customFor = (id: string): Custom => custom[id] || { on: false, content: '', options: {}, media: null };
  const setCustomFor = (id: string, patch: Partial<Custom>) => setCustom((prev) => ({ ...prev, [id]: { ...customFor(id), ...prev[id], ...patch } }));
  const setOption = (id: string, key: keyof TargetOptions, value: unknown) =>
    setCustom((prev) => {
      const cur = { ...customFor(id), ...prev[id] };
      const options = { ...cur.options, [key]: value } as TargetOptions;
      if (value === undefined || value === '') delete (options as any)[key];
      return { ...prev, [id]: { ...cur, options } };
    });
  const targetFor = (a: SocialAccount) => {
    const c = customFor(a.id);
    return { account_id: a.id, content: c.on ? c.content : null, media: c.media, options: c.options };
  };

  const checks = selectedAccounts.map((a) => {
    const v = validateTarget(a.provider, effectiveTarget({ content, media }, targetFor(a))) as { errors: string[]; warnings: string[] };
    if (a.status === 'revoked') v.errors.unshift('Kanał wymaga ponownego połączenia.');
    return { a, ...v };
  });
  const hasErrors = checks.some((c) => c.errors.length);

  const toggle = (id: string) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const addMedia = async (source: 'library' | 'camera') => {
    const room = MAX_MEDIA - media.length;
    if (room <= 0) { toast.error(`Najwyżej ${MAX_MEDIA} plików w poście`); return; }
    try {
      const assets = await pickMedia(source, room);
      if (!assets.length) return;
      setUploading((n) => n + assets.length);
      for (const a of assets) {
        try {
          const m = await uploadAsset(a);
          setMedia((prev) => [...prev, m]);
        } catch (e) {
          if (e instanceof FileTooLarge) toast.error(e.message); else showError('Nie udało się wysłać pliku', e);
        } finally {
          setUploading((n) => n - 1);
        }
      }
    } catch (e) { showError('Nie udało się otworzyć galerii', e); }
  };

  const openTags = async () => {
    setTagsOpen(true);
    if (groups === null) hashtagGroups().then(setGroups).catch(() => setGroups([]));
  };

  const submit = async (intent: Intent) => {
    setServerErrors([]);
    if (intent !== 'draft' && !selected.length) { toast.error('Wybierz co najmniej jeden kanał'); return; }
    const scheduled = when === 'schedule' && ymd && hm ? combine(ymd, hm) : null;
    if (intent === 'schedule' && (!scheduled || new Date(scheduled) <= new Date())) { toast.error('Wybierz termin w przyszłości'); return; }
    try {
      const out = await socialApi.save({
        id: editingId, content, media, intent, tags: post?.tags ?? [],
        ...(!editingId && prefill.data ? { source_type: prefill.data.source_type, source_id: prefill.data.source_id } : {}),
        targets: selectedAccounts.map(targetFor),
        ...(scheduled ? { scheduled_at: scheduled } : {}),
      });
      const msg: Record<Intent, string> = {
        draft: 'Szkic zapisany',
        submit: 'Wysłano do akceptacji',
        queue: `Dodano do kolejki — ${fmtWhen(out.scheduled_at)}`,
        now: 'Publikowanie rozpoczęte',
        schedule: `Zaplanowano na ${fmtWhen(out.scheduled_at)}`,
      };
      toast.success(msg[intent]);
      saved.current = true;
      await invalidate();
      goBack(router);
    } catch (e: any) {
      setServerErrors(e?.details?.length ? e.details : [e?.message || 'Nie udało się zapisać']);
      showError('Nie udało się zapisać', e);
    }
  };

  if (status.isLoading || (editingId && existing.isLoading) || (shareKind && prefill.isLoading) || !ready) {
    return <View style={{ flex: 1, backgroundColor: B.paper }}><PageHeader title={editingId ? 'Edytuj post' : 'Nowy post'} Icon={PenSquare} showBack /><ActivityIndicator color={B.ink} style={{ marginTop: 40 }} /></View>;
  }
  if (!usable.length) {
    return (
      <View style={{ flex: 1, backgroundColor: B.paper }}>
        <PageHeader title="Nowy post" Icon={PenSquare} showBack />
        <EmptyState Icon={PenSquare} title="Brak podłączonych kanałów" hint="Stronę na Facebooku i konto na Instagramie podłącza się w wersji web — w zakładce Kanały modułu Social Media." />
      </View>
    );
  }

  const pendingOther = post?.status === 'pending_approval' && canPublish;
  const publishLabel = when === 'now' ? 'Opublikuj teraz' : when === 'schedule' ? 'Zaplanuj' : 'Dodaj do kolejki';
  const publishIntent: Intent = when === 'now' ? 'now' : when === 'schedule' ? 'schedule' : 'queue';
  const lens = [...new Set(selectedAccounts.map((a) => a.provider))].map((p) => (SOCIAL_PROVIDERS as any)[p]).sort((x: any, y: any) => x.maxChars - y.maxChars);

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: B.paper }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <PageHeader title={editingId ? 'Edytuj post' : 'Nowy post'} subtitle={post?.status === 'pending_approval' ? 'Czeka na akceptację' : undefined} Icon={PenSquare} showBack />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 160 }} keyboardShouldPersistTaps="handled">
          {post?.review_note && post.status === 'draft' ? (
            <View style={{ borderRadius: 18, backgroundColor: B.kurkumaSoft, padding: 12, marginBottom: 12 }}>
              <Text style={{ fontSize: 13, color: B.goldDeep, fontFamily: F.bold }}>Uwagi do poprawy</Text>
              <Text style={{ marginTop: 2, fontSize: 14, lineHeight: 19, color: B.ink, fontFamily: F.medium }}>{post.review_note}</Text>
            </View>
          ) : null}

          <SectionTitle>Kanały</SectionTitle>
          <Card style={{ paddingVertical: 6 }}>
            {usable.map((a, i) => {
              const on = selected.includes(a.id);
              return (
                <Pressable key={a.id} onPress={() => toggle(a.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} className="active:opacity-70"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: i === usable.length - 1 ? 0 : 1, borderBottomColor: B.line }}>
                  <ChannelAvatar account={a} size={36} selected={on} dim={!on} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ fontSize: 15, color: B.ink, fontFamily: on ? F.bold : F.medium }}>{channelName(a)}</Text>
                    <Text style={{ fontSize: 12, color: B.ink4, fontFamily: F.medium }}>{providerLabel(a.provider)}</Text>
                  </View>
                  <Switch value={on} onValueChange={() => toggle(a.id)} trackColor={{ true: B.kurkuma, false: B.paper2 }} thumbColor="#fff" />
                </Pressable>
              );
            })}
          </Card>

          <SectionTitle right={(
            <Pressable onPress={openTags} hitSlop={8} accessibilityRole="button" accessibilityLabel="Zestawy hashtagów" className="active:opacity-60"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Hash size={14} color={B.ink3} /><Text style={{ fontSize: 13, color: B.ink3, fontFamily: F.semibold }}>Hashtagi</Text>
            </Pressable>
          )}>Treść</SectionTitle>
          <Card>
            <FormInput value={content} onChangeText={setContent} multiline placeholder="Co chcesz opublikować? Zaproszenie, ogłoszenie, myśl z kazania…" style={{ minHeight: 140 }} accessibilityLabel="Treść posta" />
            {lens.length ? (
              <Text style={{ marginTop: 6, fontSize: 12, color: B.ink4, fontFamily: F.semibold, fontVariant: ['tabular-nums'] }}>
                {lens.map((P: any) => `${P.label} ${charCount(content)}/${P.maxChars}`).join('   ')}
              </Text>
            ) : null}
          </Card>

          <SectionTitle>Zdjęcia i wideo</SectionTitle>
          <Card>
            {media.length || uploading ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                {media.map((m, i) => (
                  <View key={m.path} style={{ width: 86, height: 86, borderRadius: 14, overflow: 'hidden', backgroundColor: B.paper2, alignItems: 'center', justifyContent: 'center' }}>
                    {m.kind === 'video' ? <Film size={22} color={B.ink3} /> : <Image source={{ uri: mediaUri(m, 192) }} style={{ width: '100%', height: '100%' }} contentFit="cover" />}
                    <View style={{ position: 'absolute', left: 4, top: 4, paddingHorizontal: 5, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.55)' }}>
                      <Text style={{ fontSize: 10, color: '#fff', fontFamily: F.bold }}>{i + 1}</Text>
                    </View>
                    <Pressable onPress={() => setMedia((prev) => prev.filter((x) => x.path !== m.path))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Usuń plik" className="active:opacity-60"
                      style={{ position: 'absolute', right: 4, top: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
                      <X size={13} color="#fff" />
                    </Pressable>
                  </View>
                ))}
                {Array.from({ length: uploading }).map((_, i) => (
                  <View key={`u${i}`} style={{ width: 86, height: 86, borderRadius: 14, backgroundColor: B.paper2, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={B.ink} /></View>
                ))}
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => addMedia('library')} accessibilityRole="button" className="active:opacity-70"
                style={{ flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', height: 46, borderRadius: 999, backgroundColor: B.paper }}>
                <ImagePlus size={17} color={B.ink} /><Text style={{ fontSize: 14, color: B.ink, fontFamily: F.bold }}>Galeria</Text>
              </Pressable>
              <Pressable onPress={() => addMedia('camera')} accessibilityRole="button" className="active:opacity-70"
                style={{ flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', height: 46, borderRadius: 999, backgroundColor: B.paper }}>
                <Camera size={17} color={B.ink} /><Text style={{ fontSize: 14, color: B.ink, fontFamily: F.bold }}>Aparat</Text>
              </Pressable>
            </View>
            <Hint>{`Do ${MAX_MEDIA} plików, każdy najwyżej 50 MB. Instagram wymaga zdjęcia albo wideo.`}</Hint>
          </Card>

          {selectedAccounts.length ? <SectionTitle>Ustawienia kanałów</SectionTitle> : null}
          {selectedAccounts.map((a) => {
            const c = customFor(a.id);
            const igFormat = a.provider === 'instagram' ? (c.options.format || instagramFormat(media, {})) : null;
            return (
              <Card key={a.id} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <ChannelAvatar account={a} size={28} />
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: B.ink, fontFamily: F.bold }}>{channelName(a)}</Text>
                </View>
                <FormLabel>Format</FormLabel>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {a.provider === 'instagram'
                    ? (SOCIAL_PROVIDERS.instagram.formats as string[]).map((f) => (
                      <Chip key={f} label={(IG_FORMAT_LABELS as Record<string, string>)[f]} on={igFormat === f} onPress={() => setOption(a.id, 'format', f)} />
                    ))
                    : (SOCIAL_PROVIDERS.facebook.formats as string[]).map((f) => (
                      <Chip key={f} label={(FB_FORMAT_LABELS as Record<string, string>)[f]} on={(c.options.format === 'reel' ? 'reel' : 'post') === f} onPress={() => setOption(a.id, 'format', f === 'reel' ? 'reel' : undefined)} />
                    ))}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16 }}>
                  <Text style={{ flex: 1, fontSize: 14, color: B.ink, fontFamily: F.semibold }}>Własna treść dla tego kanału</Text>
                  <Switch value={c.on} onValueChange={(v) => setCustomFor(a.id, { on: v, content: c.content || content })} trackColor={{ true: B.kurkuma, false: B.paper2 }} thumbColor="#fff" />
                </View>
                {c.on ? (
                  <FormInput value={c.content} onChangeText={(t) => setCustomFor(a.id, { content: t })} multiline style={{ marginTop: 8 }} accessibilityLabel={`Treść dla kanału ${channelName(a)}`} />
                ) : null}
                <FormLabel>Pierwszy komentarz (opcjonalnie)</FormLabel>
                <FormInput value={c.options.first_comment || ''} onChangeText={(t) => setOption(a.id, 'first_comment', t)} multiline style={{ minHeight: 64 }}
                  placeholder={a.provider === 'instagram' ? 'Np. hashtagi albo link' : 'Np. link do zapisów'} />
                {c.media?.length ? <Hint>{`Ten kanał ma własne zdjęcia (${c.media.length}) ustawione na webie — zostaną.`}</Hint> : null}
              </Card>
            );
          })}

          <SectionTitle>{canPublish ? 'Kiedy opublikować' : 'Termin'}</SectionTitle>
          <Card>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {canPublish ? (
                <>
                  <Chip label={nextSlot ? `Kolejka · ${fmtWhen(nextSlot)}` : 'Kolejka'} on={when === 'queue'} onPress={() => setWhen('queue')} />
                  <Chip label="Teraz" on={when === 'now'} onPress={() => setWhen('now')} />
                  <Chip label="Wybrany termin" on={when === 'schedule'} onPress={() => setWhen('schedule')} />
                </>
              ) : (
                <>
                  <Chip label="Bez terminu" on={when !== 'schedule'} onPress={() => setWhen('none')} />
                  <Chip label="Proponowany termin" on={when === 'schedule'} onPress={() => setWhen('schedule')} />
                </>
              )}
            </View>
            {when === 'schedule' ? (
              <View>
                <FormLabel>Data</FormLabel>
                <DateField value={ymd} onChange={(v) => v && setYmd(v)} />
                <FormLabel>Godzina</FormLabel>
                <TimeField value={hm} title="Godzina publikacji" onChange={(v) => v && setHm(v)} />
              </View>
            ) : null}
            {when === 'queue' && canPublish && !nextSlot && selected.length ? (
              <Hint tone="warn">Kolejka nie ma ustawionych godzin — ustaw je na webie (Kanały → Harmonogram kolejki) albo wybierz termin.</Hint>
            ) : null}
            {!canPublish ? <Hint>Post trafi do osoby zatwierdzającej, która ustali ostateczny termin.</Hint> : null}
          </Card>

          {serverErrors.length || checks.some((c) => c.errors.length || c.warnings.length) ? (
            <View style={{ marginTop: 14, gap: 6 }}>
              {serverErrors.map((m) => (
                <View key={m} style={{ flexDirection: 'row', gap: 6 }}><AlertCircle size={15} color={B.danger} /><Text style={{ flex: 1, fontSize: 13, color: B.danger, fontFamily: F.medium }}>{m}</Text></View>
              ))}
              {checks.flatMap((c) => [
                ...c.errors.map((m) => (
                  <View key={`${c.a.id}e${m}`} style={{ flexDirection: 'row', gap: 6 }}><AlertCircle size={15} color={B.danger} /><Text style={{ flex: 1, fontSize: 13, color: B.danger, fontFamily: F.medium }}>{`${channelName(c.a)}: ${m}`}</Text></View>
                )),
                ...c.warnings.map((m) => (
                  <View key={`${c.a.id}w${m}`} style={{ flexDirection: 'row', gap: 6 }}><AlertTriangle size={15} color={B.goldDeep} /><Text style={{ flex: 1, fontSize: 13, color: B.goldDeep, fontFamily: F.medium }}>{`${channelName(c.a)}: ${m}`}</Text></View>
                )),
              ])}
            </View>
          ) : null}

          <View style={{ gap: 10, marginTop: 20 }}>
            {canPublish ? (
              <PrimaryButton label={pendingOther ? `Zatwierdź: ${publishLabel.toLowerCase()}` : publishLabel} onPress={() => submit(publishIntent)} disabled={hasErrors || !selected.length || uploading > 0} />
            ) : (
              <PrimaryButton label="Wyślij do akceptacji" onPress={() => submit('submit')} disabled={hasErrors || !selected.length || uploading > 0} />
            )}
            <SecondaryButton label="Zapisz szkic" onPress={() => submit('draft')} disabled={uploading > 0} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Sheet visible={tagsOpen} onClose={() => setTagsOpen(false)} title="Zestawy hashtagów" eyebrow="Wstaw do treści">
        {groups === null ? <ActivityIndicator color={B.ink} style={{ marginTop: 20 }} /> : null}
        {groups?.length === 0 ? <Hint>Brak zestawów — dodasz je na webie w zakładce Kanały.</Hint> : null}
        <View style={{ borderRadius: 20, backgroundColor: B.card, overflow: 'hidden', marginTop: 6 }}>
          {(groups ?? []).map((g, i, arr) => (
            <Pressable key={g.id} onPress={() => { setContent((t) => appendBlock(t, g.hashtags)); setTagsOpen(false); }} accessibilityRole="button" className="active:opacity-70"
              style={{ paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: i === arr.length - 1 ? 0 : 1, borderBottomColor: B.line }}>
              <Text style={{ fontSize: 15, color: B.ink, fontFamily: F.semibold }}>{g.name}</Text>
              <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 12, color: B.ink4, fontFamily: F.medium }}>{g.hashtags}</Text>
            </Pressable>
          ))}
        </View>
      </Sheet>
    </>
  );
};
