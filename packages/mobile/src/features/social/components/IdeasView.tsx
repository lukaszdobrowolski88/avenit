import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Camera, CheckCircle2, Film, ImagePlus, Lightbulb, Plus, X } from 'lucide-react-native';
import { EmptyState } from '../../../components/ui/EmptyState';
import { DangerLink, FormInput, FormLabel, PrimaryButton, Sheet } from '../../../components/ui/Sheet';
import { B } from '../../../components/ui/brand';
import { FONT as F } from '../../../lib/fonts';
import { usePermissions } from '../../../lib/permissions';
import { showError } from '../../../lib/errors';
import { toast } from '../../../lib/toast';
import {
  IDEA_COLUMNS, FileTooLarge, ideasApi, mediaUri, pickMedia, uploadAsset, useIdeas, useInvalidateSocial,
  type IdeaColumn, type SocialIdea, type SocialMedia,
} from '../api';

// Pomysły w apce — szybkie zapisanie pomysłu (tekst + zdjęcie z telefonu), przenoszenie między
// kolumnami i „Utwórz post” (kompozytor z treścią i zdjęciami pomysłu).

const MenuRow = ({ label, onPress, last }: { label: string; onPress: () => void; last?: boolean }) => (
  <Pressable onPress={onPress} accessibilityRole="button" className="active:opacity-70"
    style={{ paddingHorizontal: 16, paddingVertical: 15, borderBottomWidth: last ? 0 : 1, borderBottomColor: B.line }}>
    <Text style={{ fontSize: 16, color: B.ink, fontFamily: F.semibold }}>{label}</Text>
  </Pressable>
);

export const IdeasView = () => {
  const router = useRouter();
  const perms = usePermissions();
  const ideas = useIdeas();
  const invalidate = useInvalidateSocial();
  const canCreate = perms.can('res:social_ideas:create');
  const canUpdate = perms.can('res:social_ideas:update');
  const canDelete = perms.can('res:social_ideas:delete');
  const [menu, setMenu] = useState<SocialIdea | null>(null);
  const [editor, setEditor] = useState<{ id?: string; title: string; content: string; media: SocialMedia[]; column_key: IdeaColumn } | null>(null);
  const [uploading, setUploading] = useState(0);

  const afterSheet = () => new Promise((r) => setTimeout(r, 380));
  const list = ideas.data ?? [];

  const addPhoto = async (source: 'library' | 'camera') => {
    if (!editor) return;
    try {
      const assets = await pickMedia(source, Math.max(1, 10 - editor.media.length));
      setUploading((n) => n + assets.length);
      for (const a of assets) {
        try {
          const m = await uploadAsset(a);
          setEditor((e) => (e ? { ...e, media: [...e.media, m] } : e));
        } catch (err) {
          if (err instanceof FileTooLarge) toast.error(err.message); else showError('Nie udało się wysłać pliku', err);
        } finally { setUploading((n) => n - 1); }
      }
    } catch (err) { showError('Nie udało się otworzyć galerii', err); }
  };

  const save = async () => {
    if (!editor) return;
    if (!editor.title.trim() && !editor.content.trim()) { toast.error('Wpisz tytuł albo treść pomysłu'); return; }
    try {
      const row = { title: editor.title.trim(), content: editor.content, media: editor.media, column_key: editor.column_key };
      if (editor.id) await ideasApi.update(editor.id, row); else await ideasApi.create(row);
      setEditor(null);
      toast.success('Pomysł zapisany');
      await invalidate();
    } catch (err) { showError('Nie udało się zapisać', err); }
  };

  const run = async (action: string) => {
    const i = menu;
    if (!i) return;
    setMenu(null);
    if (action === 'post') return router.push({ pathname: '/(app)/social/compose', params: { idea: i.id } } as never);
    await afterSheet();
    if (action === 'edit') return setEditor({ id: i.id, title: i.title, content: i.content, media: i.media || [], column_key: i.column_key });
    try {
      if (action.startsWith('mv:')) await ideasApi.update(i.id, { column_key: action.slice(3) as IdeaColumn, position: Date.now() / -1000 });
      if (action === 'delete') { await ideasApi.remove(i.id); toast.success('Pomysł usunięty'); }
      await invalidate();
    } catch (err) { showError('Nie udało się', err); }
  };

  if (ideas.isLoading) return <ActivityIndicator color={B.ink} style={{ marginTop: 32 }} />;

  return (
    <>
      {canCreate ? (
        <Pressable onPress={() => setEditor({ title: '', content: '', media: [], column_key: 'idea' })} accessibilityRole="button" className="active:opacity-80"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 22, backgroundColor: B.card, padding: 14, marginBottom: 12 }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: B.kurkuma, alignItems: 'center', justifyContent: 'center' }}><Plus size={18} color={B.ink} /></View>
          <Text style={{ flex: 1, fontSize: 15, color: B.ink2, fontFamily: F.semibold }}>Zapisz pomysł — choćby jedno zdanie</Text>
        </Pressable>
      ) : null}
      {!list.length ? <EmptyState Icon={Lightbulb} title="Brak pomysłów" hint="Zbierajcie pomysły na posty całym zespołem — z treścią i zdjęciami z telefonu." /> : null}
      {IDEA_COLUMNS.map((c) => {
        const items = list.filter((i) => (i.column_key || 'idea') === c.key);
        if (!items.length) return null;
        return (
          <View key={c.key}>
            <Text style={{ marginTop: 6, marginBottom: 8, marginLeft: 4, fontSize: 13, color: B.ink2, fontFamily: F.bold }}>
              {c.label}<Text style={{ color: B.ink4, fontFamily: F.semibold }}>{`  ${items.length}`}</Text>
            </Text>
            {items.map((i) => {
              const first = i.media?.[0];
              return (
                <Pressable key={i.id} onPress={() => setMenu(i)} accessibilityRole="button" className="active:opacity-80"
                  style={{ borderRadius: 22, backgroundColor: B.card, padding: 14, marginBottom: 10, flexDirection: 'row', gap: 12 }}>
                  {first ? (
                    <View style={{ width: 58, height: 58, borderRadius: 14, overflow: 'hidden', backgroundColor: B.paper2, alignItems: 'center', justifyContent: 'center' }}>
                      {first.kind === 'video' ? <Film size={20} color={B.ink3} /> : <Image source={{ uri: mediaUri(first, 128) }} style={{ width: '100%', height: '100%' }} contentFit="cover" />}
                    </View>
                  ) : null}
                  <View style={{ flex: 1 }}>
                    {i.title ? <Text style={{ fontSize: 15, color: B.ink, fontFamily: F.bold }}>{i.title}</Text> : null}
                    {i.content ? <Text numberOfLines={3} style={{ marginTop: 2, fontSize: 13, lineHeight: 18, color: B.ink2, fontFamily: F.medium }}>{i.content}</Text> : null}
                    {i.post_id ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                        <CheckCircle2 size={13} color={B.okFg} /><Text style={{ fontSize: 12, color: B.okFg, fontFamily: F.semibold }}>Użyty w poście</Text>
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        );
      })}

      <Sheet visible={!!menu} onClose={() => setMenu(null)} title={menu?.title || 'Pomysł'} eyebrow="Pomysł">
        <View style={{ borderRadius: 20, backgroundColor: B.card, overflow: 'hidden', marginTop: 6 }}>
          {[
            { key: 'post', label: 'Utwórz post' },
            ...(canUpdate ? [{ key: 'edit', label: 'Edytuj' }] : []),
            ...(canUpdate ? IDEA_COLUMNS.filter((c) => c.key !== menu?.column_key).map((c) => ({ key: `mv:${c.key}`, label: `Przenieś: ${c.label}` })) : []),
          ].map((it, idx, arr) => <MenuRow key={it.key} label={it.label} onPress={() => run(it.key)} last={idx === arr.length - 1} />)}
        </View>
        {canDelete ? <DangerLink label="Usuń pomysł" onPress={() => run('delete')} /> : null}
      </Sheet>

      <Sheet visible={!!editor} onClose={() => setEditor(null)} title={editor?.id ? 'Edytuj pomysł' : 'Nowy pomysł'} eyebrow="Pomysły"
        footer={<PrimaryButton label="Zapisz" onPress={save} disabled={uploading > 0} />}>
        {editor ? (
          <View>
            <FormLabel first>Tytuł</FormLabel>
            <FormInput value={editor.title} onChangeText={(t) => setEditor({ ...editor, title: t })} placeholder="Np. Świadectwo z obozu" />
            <FormLabel>Treść</FormLabel>
            <FormInput value={editor.content} onChangeText={(t) => setEditor({ ...editor, content: t })} multiline placeholder="Szkic treści, notatki, linki…" />
            <FormLabel>Zdjęcia i wideo</FormLabel>
            {editor.media.length || uploading ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                {editor.media.map((m) => (
                  <View key={m.path} style={{ width: 72, height: 72, borderRadius: 12, overflow: 'hidden', backgroundColor: B.paper2, alignItems: 'center', justifyContent: 'center' }}>
                    {m.kind === 'video' ? <Film size={18} color={B.ink3} /> : <Image source={{ uri: mediaUri(m, 128) }} style={{ width: '100%', height: '100%' }} contentFit="cover" />}
                    <Pressable onPress={() => setEditor({ ...editor, media: editor.media.filter((x) => x.path !== m.path) })} hitSlop={8} accessibilityLabel="Usuń plik"
                      style={{ position: 'absolute', right: 3, top: 3, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
                      <X size={12} color="#fff" />
                    </Pressable>
                  </View>
                ))}
                {Array.from({ length: uploading }).map((_, k) => (
                  <View key={`u${k}`} style={{ width: 72, height: 72, borderRadius: 12, backgroundColor: B.paper2, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={B.ink} /></View>
                ))}
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => addPhoto('library')} accessibilityRole="button" className="active:opacity-70"
                style={{ flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', height: 44, borderRadius: 999, backgroundColor: B.paper }}>
                <ImagePlus size={16} color={B.ink} /><Text style={{ fontSize: 14, color: B.ink, fontFamily: F.bold }}>Galeria</Text>
              </Pressable>
              <Pressable onPress={() => addPhoto('camera')} accessibilityRole="button" className="active:opacity-70"
                style={{ flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', height: 44, borderRadius: 999, backgroundColor: B.paper }}>
                <Camera size={16} color={B.ink} /><Text style={{ fontSize: 14, color: B.ink, fontFamily: F.bold }}>Aparat</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </Sheet>
    </>
  );
};
