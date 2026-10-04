import { useMemo, useState } from 'react';
import { Alert, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  HelpCircle,
  Link2,
  Mail,
  Megaphone,
  Phone,
  Pin,
  Trash2,
  Users,
} from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { formatDate } from '../../lib/domain';
import { openOnWeb } from '../modules/useModules';
import { AddButton, Card, Empty, Loading, SegmentChips } from '../teams/tabs/ui';
import { TasksTab } from '../teams/tabs/TasksTab';
import {
  CUSTOM_TASK_STATUSES,
  useAddCustomTask,
  useCustomTasks,
  useDeleteRecord,
  useModuleBoards,
  useModuleRecords,
  useSaveRecord,
  useSetCustomTaskStatus,
  type CustomTask,
  type CustomTaskStatus,
  type ModuleBoard,
  type ModuleRecord,
} from './api';

// Widżety modułów z kreatora — odpowiedniki src/modules/CustomModule/components/*Tab.jsx.

export interface WidgetCtx {
  moduleKey: string;
  moduleId: string | null;
  tabId: string | null;
  userId: string | null;
  userEmail: string | null;
  campusId: number | null;
  can: (cap: string) => boolean;
}

const openUrl = (url: string) =>
  Linking.openURL(/^https?:\/\//i.test(url) ? url : `https://${url}`).catch(() => Alert.alert('Nie udało się otworzyć linku'));

const inputStyle = {
  height: 44,
  borderRadius: 14,
  paddingHorizontal: 14,
  backgroundColor: '#f5f5f4',
  fontSize: 15,
  color: '#0c0a09',
  fontFamily: 'Inter_500Medium',
} as const;

// ─── Ogłoszenia: { title, body, date, pinned } — przypięte, potem najnowsze ───

interface Announcement {
  title?: string;
  body?: string;
  date?: string;
  pinned?: boolean;
}

export const AnnouncementsWidget = ({ ctx }: { ctx: WidgetCtx }) => {
  const recs = useModuleRecords<Announcement>(ctx.moduleKey, 'announcements', ctx.tabId);
  const save = useSaveRecord(ctx.moduleKey, 'announcements', ctx.tabId, ctx.moduleId, ctx.userId);
  const del = useDeleteRecord(ctx.moduleKey, 'announcements');
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const canAdd = ctx.can(`res:custom_${ctx.moduleKey}_records:create`);
  const canDel = ctx.can(`res:custom_${ctx.moduleKey}_records:delete`);

  const list = useMemo(() => {
    const all: ModuleRecord<Announcement>[] = recs.data ?? [];
    return [...all].sort((a, b) => {
      if (!!a.data.pinned !== !!b.data.pinned) return a.data.pinned ? -1 : 1;
      return String(b.data.date || b.createdAt).localeCompare(String(a.data.date || a.createdAt));
    });
  }, [recs.data]);

  const submit = () => {
    if (!title.trim()) return;
    save.mutate(
      { data: { title: title.trim(), body: body.trim(), date: new Date().toISOString().slice(0, 10), pinned: false } },
      {
        onSuccess: () => {
          setTitle('');
          setBody('');
          setAdding(false);
        },
        onError: (e: any) => Alert.alert('Nie udało się', e?.message ?? ''),
      },
    );
  };

  return (
    <View>
      {canAdd && !adding ? <AddButton label="Nowe ogłoszenie" onPress={() => setAdding(true)} /> : null}
      {adding ? (
        <Card>
          <TextInput value={title} onChangeText={setTitle} placeholder="Tytuł" placeholderTextColor="#a8a29e" style={[inputStyle, { backgroundColor: '#ffffff' }]} />
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Treść"
            placeholderTextColor="#a8a29e"
            multiline
            style={[inputStyle, { backgroundColor: '#ffffff', height: 90, paddingTop: 12, marginTop: 8, textAlignVertical: 'top' as const }]}
          />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <Pressable onPress={() => setAdding(false)} className="active:opacity-70" style={{ flex: 1, height: 42, borderRadius: 12, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, color: '#44403c', fontFamily: 'Inter_600SemiBold' }}>Anuluj</Text>
            </Pressable>
            <Pressable onPress={submit} className="active:opacity-70" style={{ flex: 1, height: 42, borderRadius: 12, backgroundColor: '#0c0a09', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, color: '#ffffff', fontFamily: 'Inter_600SemiBold' }}>Opublikuj</Text>
            </Pressable>
          </View>
        </Card>
      ) : null}
      {recs.isLoading ? <Loading /> : null}
      {!recs.isLoading && !list.length ? <Empty Icon={Megaphone} title="Brak ogłoszeń" /> : null}
      {list.map((r) => (
        <Card key={r.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {r.data.pinned ? <Pin size={13} color="#be185d" /> : null}
            <Text style={{ flex: 1, fontSize: 15, color: '#0c0a09', fontFamily: 'Inter_700Bold' }}>{r.data.title || 'Ogłoszenie'}</Text>
            {canDel ? (
              <Pressable
                onPress={() =>
                  Alert.alert('Usunąć ogłoszenie?', undefined, [
                    { text: 'Anuluj', style: 'cancel' },
                    { text: 'Usuń', style: 'destructive', onPress: () => del.mutate(r.id) },
                  ])
                }
                hitSlop={8}
                className="active:opacity-60"
              >
                <Trash2 size={15} color="#a8a29e" />
              </Pressable>
            ) : null}
          </View>
          {r.data.body ? (
            <Text style={{ fontSize: 14, lineHeight: 20, color: '#44403c', marginTop: 6, fontFamily: 'Inter_400Regular' }}>{r.data.body}</Text>
          ) : null}
          {r.data.date || r.createdAt ? (
            <Text style={{ fontSize: 11, color: '#a8a29e', marginTop: 8, fontFamily: 'Inter_500Medium' }}>
              {formatDate(String(r.data.date || r.createdAt), 'd MMMM yyyy')}
            </Text>
          ) : null}
        </Card>
      ))}
    </View>
  );
};

// ─── Linki: { label, url, description } ───

export const LinksWidget = ({ ctx }: { ctx: WidgetCtx }) => {
  type LinkRec = { label?: string; url?: string; description?: string };
  const recs = useModuleRecords<LinkRec>(ctx.moduleKey, 'links', ctx.tabId);
  if (recs.isLoading) return <Loading />;
  const list: ModuleRecord<LinkRec>[] = recs.data ?? [];
  if (!list.length) return <Empty Icon={Link2} title="Brak linków" />;
  return (
    <View>
      {list.map((r) => (
        <Card key={r.id} onPress={r.data.url ? () => openUrl(String(r.data.url)) : undefined}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Link2 size={18} color="#2563eb" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, color: '#0c0a09', fontFamily: 'Inter_600SemiBold' }}>{r.data.label || r.data.url}</Text>
              {r.data.description ? (
                <Text style={{ fontSize: 12, color: '#78716c', marginTop: 2, fontFamily: 'Inter_400Regular' }}>{r.data.description}</Text>
              ) : null}
            </View>
            <ArrowUpRight size={16} color="#a8a29e" />
          </View>
        </Card>
      ))}
    </View>
  );
};

// ─── Kontakty: { name, role, phone, email, notes } ───

export const ContactsWidget = ({ ctx }: { ctx: WidgetCtx }) => {
  type ContactRec = { name?: string; role?: string; phone?: string; email?: string; notes?: string };
  const recs = useModuleRecords<ContactRec>(ctx.moduleKey, 'contacts', ctx.tabId);
  if (recs.isLoading) return <Loading />;
  const list: ModuleRecord<ContactRec>[] = recs.data ?? [];
  if (!list.length) return <Empty Icon={Users} title="Brak kontaktów" />;
  return (
    <View>
      {list.map((r) => (
        <Card key={r.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, color: '#0c0a09', fontFamily: 'Inter_600SemiBold' }}>{r.data.name || '—'}</Text>
              {r.data.role ? <Text style={{ fontSize: 12, color: '#78716c', marginTop: 2, fontFamily: 'Inter_500Medium' }}>{r.data.role}</Text> : null}
            </View>
            {r.data.phone ? (
              <Pressable onPress={() => openUrl(`tel:${r.data.phone}`)} hitSlop={6} className="active:opacity-60" style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' }}>
                <Phone size={15} color="#1c1917" />
              </Pressable>
            ) : null}
            {r.data.email ? (
              <Pressable onPress={() => openUrl(`mailto:${r.data.email}`)} hitSlop={6} className="active:opacity-60" style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' }}>
                <Mail size={15} color="#1c1917" />
              </Pressable>
            ) : null}
          </View>
        </Card>
      ))}
    </View>
  );
};

// ─── FAQ: { question, answer } — rozwijane ───

export const FaqWidget = ({ ctx }: { ctx: WidgetCtx }) => {
  type FaqRec = { question?: string; answer?: string };
  const recs = useModuleRecords<FaqRec>(ctx.moduleKey, 'faq', ctx.tabId);
  const [open, setOpen] = useState<string | null>(null);
  if (recs.isLoading) return <Loading />;
  const list: ModuleRecord<FaqRec>[] = recs.data ?? [];
  if (!list.length) return <Empty Icon={HelpCircle} title="Brak pytań" />;
  return (
    <View>
      {list.map((r) => {
        const on = open === r.id;
        return (
          <Card key={r.id} onPress={() => setOpen(on ? null : r.id)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ flex: 1, fontSize: 15, color: '#0c0a09', fontFamily: 'Inter_600SemiBold' }}>{r.data.question}</Text>
              {on ? <ChevronDown size={16} color="#a8a29e" /> : <ChevronRight size={16} color="#a8a29e" />}
            </View>
            {on && r.data.answer ? (
              <Text style={{ fontSize: 14, lineHeight: 20, color: '#44403c', marginTop: 8, fontFamily: 'Inter_400Regular' }}>{r.data.answer}</Text>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
};

// ─── Ankiety: { question, options:[{id,text}], voters:{email:optionId}, closed } ───

interface Poll {
  question?: string;
  options?: { id: string; text: string }[];
  voters?: Record<string, string>;
  closed?: boolean;
}

export const PollWidget = ({ ctx }: { ctx: WidgetCtx }) => {
  const recs = useModuleRecords<Poll>(ctx.moduleKey, 'polls', ctx.tabId);
  const save = useSaveRecord(ctx.moduleKey, 'polls', ctx.tabId, ctx.moduleId, ctx.userId);
  if (recs.isLoading) return <Loading />;
  const list: ModuleRecord<Poll>[] = recs.data ?? [];
  if (!list.length) return <Empty Icon={HelpCircle} title="Brak ankiet" />;
  return (
    <View>
      {list.map((r) => {
        const voters = r.data.voters ?? {};
        const mine = ctx.userEmail ? voters[ctx.userEmail] : undefined;
        const total = Object.keys(voters).length;
        const showResults = !!mine || !!r.data.closed;
        return (
          <Card key={r.id}>
            <Text style={{ fontSize: 15, color: '#0c0a09', fontFamily: 'Inter_700Bold', marginBottom: 10 }}>{r.data.question}</Text>
            {(r.data.options ?? []).map((o: { id: string; text: string }) => {
              const count = Object.values(voters).filter((v) => v === o.id).length;
              const pct = total ? Math.round((count / total) * 100) : 0;
              const chosen = mine === o.id;
              return (
                <Pressable
                  key={o.id}
                  disabled={!!r.data.closed || !ctx.userEmail}
                  onPress={() =>
                    save.mutate(
                      { id: r.id, data: { ...r.data, voters: { ...voters, [ctx.userEmail!]: o.id } } },
                      { onError: (e: any) => Alert.alert('Nie udało się zagłosować', e?.message ?? '') },
                    )
                  }
                  className="active:opacity-70"
                  style={{ marginBottom: 8, borderRadius: 12, backgroundColor: '#ffffff', overflow: 'hidden' }}
                >
                  {showResults ? (
                    <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, backgroundColor: chosen ? '#fce7f3' : '#f5f5f4' }} />
                  ) : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }}>
                    <Text style={{ flex: 1, fontSize: 14, color: '#0c0a09', fontFamily: chosen ? 'Inter_700Bold' : 'Inter_500Medium' }}>{o.text}</Text>
                    {showResults ? <Text style={{ fontSize: 12, color: '#57534e', fontFamily: 'Inter_700Bold' }}>{pct}%</Text> : null}
                  </View>
                </Pressable>
              );
            })}
            <Text style={{ fontSize: 11, color: '#a8a29e', fontFamily: 'Inter_500Medium' }}>
              {total} {total === 1 ? 'głos' : 'głosów'}
              {r.data.closed ? ' · zamknięta' : mine ? ' · możesz zmienić głos' : ''}
            </Text>
          </Card>
        );
      })}
    </View>
  );
};

// ─── Zadania modułu (custom_<key>_tasks) ───

export const CustomTasksWidget = ({ ctx }: { ctx: WidgetCtx }) => {
  const tasks = useCustomTasks(ctx.moduleKey);
  const add = useAddCustomTask(ctx.moduleKey, ctx.campusId);
  const setStatus = useSetCustomTaskStatus(ctx.moduleKey);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [draft, setDraft] = useState('');
  const list = ((tasks.data ?? []) as CustomTask[]).filter((t) => (filter === 'open' ? t.status !== 'Gotowe' : true));
  const next = (s: CustomTaskStatus): CustomTaskStatus =>
    CUSTOM_TASK_STATUSES[(CUSTOM_TASK_STATUSES.indexOf(s) + 1) % CUSTOM_TASK_STATUSES.length];
  const tint: Record<CustomTaskStatus, string> = { 'Do zrobienia': '#57534e', 'W trakcie': '#a16207', Gotowe: '#15803d' };

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Nowe zadanie…"
          placeholderTextColor="#a8a29e"
          onSubmitEditing={() => draft.trim() && add.mutate(draft.trim(), { onSuccess: () => setDraft('') })}
          style={[inputStyle, { flex: 1 }]}
        />
      </View>
      <SegmentChips
        options={[
          { key: 'open', label: 'Otwarte' },
          { key: 'all', label: 'Wszystkie' },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {tasks.isLoading ? <Loading /> : null}
      {!tasks.isLoading && !list.length ? <Empty Icon={Users} title="Brak zadań" /> : null}
      {list.map((t) => (
        <Card key={t.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, color: '#0c0a09', fontFamily: 'Inter_600SemiBold' }}>{t.title}</Text>
              {[t.assignee, t.dueDate].filter(Boolean).length ? (
                <Text style={{ fontSize: 12, color: '#78716c', marginTop: 2, fontFamily: 'Inter_500Medium' }}>
                  {[t.assignee, t.dueDate].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={() => setStatus.mutate({ id: t.id, status: next(t.status) })}
              className="active:opacity-70"
              style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: '#ffffff' }}
            >
              <Text style={{ fontSize: 12, color: tint[t.status], fontFamily: 'Inter_700Bold' }}>{t.status}</Text>
            </Pressable>
          </View>
        </Card>
      ))}
    </View>
  );
};

// ─── Tablice modułu (boards.module_key) ───

export const ModuleBoardsWidget = ({ ctx }: { ctx: WidgetCtx }) => {
  const boards = useModuleBoards(ctx.moduleKey);
  const [boardId, setBoardId] = useState<string | null>(null);
  if (boards.isLoading) return <Loading />;
  const list: ModuleBoard[] = boards.data ?? [];
  if (!list.length) return <Empty Icon={Users} title="Brak tablic" hint="Tablice tworzy się na webie w module." />;
  const current = boardId ?? (list.length === 1 ? list[0].id : null);
  if (current) {
    return (
      <View>
        {list.length > 1 ? (
          <Pressable onPress={() => setBoardId(null)} className="active:opacity-60" style={{ marginBottom: 10 }}>
            <Text style={{ fontSize: 13, color: '#be185d', fontFamily: 'Inter_600SemiBold' }}>‹ Wszystkie tablice</Text>
          </Pressable>
        ) : null}
        <TasksTab sourceKind={undefined} boardId={current} myEmail={ctx.userEmail} />
      </View>
    );
  }
  return (
    <View>
      {list.map((b) => (
        <Card key={b.id} onPress={() => setBoardId(b.id)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: b.color ?? '#a8a29e' }} />
            <Text style={{ flex: 1, fontSize: 15, color: '#0c0a09', fontFamily: 'Inter_600SemiBold' }}>{b.name}</Text>
            <ChevronRight size={16} color="#a8a29e" />
          </View>
        </Card>
      ))}
    </View>
  );
};

// ─── Układ z kreatora (component_type 'custom') — podzbiór LayoutRenderer ───

const stripHtml = (html: unknown) =>
  String(html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();

export const LayoutWidget = ({
  ctx,
  role,
  isAdmin,
  renderWidget,
}: {
  ctx: WidgetCtx;
  role: string | null;
  isAdmin: boolean;
  renderWidget: (type: string) => React.ReactNode;
}) => {
  const layout = useQuery({
    queryKey: ['custom', ctx.moduleKey, 'layout', ctx.tabId],
    enabled: !!ctx.tabId,
    queryFn: async () => {
      const { data } = await supabase.from('app_module_tabs').select('layout').eq('id', ctx.tabId!).maybeSingle();
      const raw = (data as any)?.layout;
      return (typeof raw === 'string' ? JSON.parse(raw) : raw) ?? { root: [] };
    },
  });
  if (layout.isLoading) return <Loading />;
  const root: any[] = layout.data?.root ?? [];
  let skipped = 0;

  const render = (el: any, i: number): React.ReactNode => {
    if (!el) return null;
    const roles: string[] | undefined = el.visibleForRoles;
    if (Array.isArray(roles) && roles.length && !isAdmin && !(role && roles.includes(role))) return null;
    const p = el.props ?? {};
    const key = el.id ?? i;
    switch (el.type) {
      case 'section':
      case 'grid':
      case 'card':
        return (
          <View key={key} style={{ gap: 8, marginBottom: 8 }}>
            {(el.children ?? []).map(render)}
          </View>
        );
      case 'heading':
        return (
          <Text key={key} style={{ fontSize: p.level === 1 ? 24 : p.level === 3 ? 16 : 20, color: '#0c0a09', fontFamily: 'Inter_700Bold', marginVertical: 6 }}>
            {p.text}
          </Text>
        );
      case 'text':
        return (
          <Text key={key} style={{ fontSize: 15, lineHeight: 22, color: '#292524', fontFamily: 'Inter_400Regular', marginBottom: 6 }}>
            {stripHtml(p.html ?? p.text)}
          </Text>
        );
      case 'quote':
      case 'alert':
      case 'verse':
        return (
          <View key={key} style={{ borderRadius: 14, backgroundColor: el.type === 'alert' ? '#fef3c7' : '#f7f6f5', padding: 12, marginBottom: 8 }}>
            <Text style={{ fontSize: 14, lineHeight: 20, color: '#292524', fontFamily: 'Inter_400Regular' }}>{stripHtml(p.text ?? p.html ?? p.content)}</Text>
            {p.reference || p.author ? (
              <Text style={{ fontSize: 12, color: '#78716c', marginTop: 4, fontFamily: 'Inter_600SemiBold' }}>{p.reference || p.author}</Text>
            ) : null}
          </View>
        );
      case 'list':
        return (
          <View key={key} style={{ marginBottom: 8, gap: 4 }}>
            {(p.items ?? []).map((it: any, j: number) => (
              <Text key={j} style={{ fontSize: 15, color: '#292524', fontFamily: 'Inter_400Regular' }}>
                • {typeof it === 'string' ? it : it?.text ?? ''}
              </Text>
            ))}
          </View>
        );
      case 'button':
        return p.url ? (
          <Pressable key={key} onPress={() => openUrl(String(p.url))} className="active:opacity-70" style={{ alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: '#0c0a09', marginBottom: 8 }}>
            <Text style={{ fontSize: 14, color: '#ffffff', fontFamily: 'Inter_600SemiBold' }}>{p.label || 'Otwórz'}</Text>
          </Pressable>
        ) : null;
      case 'image':
        return p.url || p.src ? (
          <Image key={key} source={{ uri: String(p.url || p.src) }} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 14, marginBottom: 8, backgroundColor: '#f5f5f4' }} contentFit="cover" />
        ) : null;
      case 'widget':
        return (
          <View key={key} style={{ marginBottom: 8 }}>
            {renderWidget(String(p.widgetType))}
          </View>
        );
      default:
        skipped += 1;
        return null;
    }
  };

  const content = root.map(render);
  return (
    <View>
      {!root.length ? <Empty Icon={HelpCircle} title="Zakładka jest pusta" /> : null}
      {content}
      {skipped > 0 ? (
        <Pressable onPress={() => openOnWeb(`/module/${ctx.moduleKey}`)} className="active:opacity-70" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <ExternalLink size={14} color="#be185d" />
          <Text style={{ fontSize: 13, color: '#be185d', fontFamily: 'Inter_600SemiBold' }}>Część elementów zobaczysz na webie</Text>
        </Pressable>
      ) : null}
    </View>
  );
};
