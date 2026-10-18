import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StatusBar, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BellRing, MessageSquare, MoreHorizontal, Plus } from 'lucide-react-native';
import { PageHeader } from '../../../components/ui/PageHeader';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Chip, DangerLink, Sheet } from '../../../components/ui/Sheet';
import { B } from '../../../components/ui/brand';
import { FONT as F } from '../../../lib/fonts';
import { useAuthSession } from '../../../lib/auth';
import { useCampusQuery } from '../../../hooks/useCampusQuery';
import { showError } from '../../../lib/errors';
import { toast } from '../../../lib/toast';
import {
  cancelCampaign,
  deleteCampaign,
  duplicateCampaign,
  isEditable,
  listDate,
  pct,
  useCampaigns,
  useInvalidateCampaigns,
  type CampaignKind,
  type CampaignRow,
  type CampaignStatus,
} from '../api';
import { PRICE_PER_PART, formatPLN } from '../smsEncoding';
import { StatsSheet } from '../components/StatsSheet';
import { StatusPill, confirmAsync, fmtDateTime, fmtDay } from '../components/ui';

// Lista kampanii jak CampaignList na webie: filtry (wszystkie/szkice/zaplanowane/wysłane),
// status, data, liczba odbiorców i podstawowe wskaźniki wysłanych. Stuknięcie: szkic/zaplanowana
// → edytor; wysłana → statystyki. „…” → Edytuj / Duplikuj / Statystyki / Anuluj / Usuń.

type Filter = 'all' | 'draft' | 'scheduled' | 'sent';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Wszystkie' },
  { key: 'draft', label: 'Szkice' },
  { key: 'scheduled', label: 'Zaplanowane' },
  { key: 'sent', label: 'Wysłane' },
];

const MenuRow = ({ label, onPress, last }: { label: string; onPress: () => void; last?: boolean }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    className="active:opacity-70"
    style={{ paddingHorizontal: 16, paddingVertical: 15, borderBottomWidth: last ? 0 : 1, borderBottomColor: B.line }}
  >
    <Text style={{ fontSize: 16, color: B.ink, fontFamily: F.semibold }}>{label}</Text>
  </Pressable>
);

const CampaignCard = ({
  kind,
  c,
  onPress,
  onMenu,
}: {
  kind: CampaignKind;
  c: CampaignRow;
  onPress: () => void;
  onMenu: () => void;
}) => {
  const total = c.recipient_count || 0;
  const date = listDate(c);
  const sentStats =
    c.status === 'sent' && total > 0
      ? kind === 'push'
        ? [
            `${pct(c.opened_count || 0, total)}% otwarć`,
            (c.action_clicked_count || 0) > 0 ? `${pct(c.action_clicked_count || 0, total)}% akcji` : null,
          ]
        : [
            `${pct(c.delivered_count || 0, total)}% dostarczonych`,
            (c.replied_count || 0) > 0 ? `${pct(c.replied_count || 0, total)}% odpowiedzi` : null,
            formatPLN(Number(c.total_cost || 0) * PRICE_PER_PART),
          ]
      : [];
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onMenu}
      accessibilityRole="button"
      accessibilityLabel={c.name}
      className="active:opacity-80"
      style={{ borderRadius: 22, backgroundColor: B.card, padding: 16, marginBottom: 10 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontSize: 16, color: B.ink, letterSpacing: -0.3, fontFamily: F.bold }}>
            {c.name || 'Bez nazwy'}
          </Text>
          <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 13, color: B.ink3, fontFamily: F.semibold }}>
            {kind === 'sms' ? `Od: ${c.sender || '—'}` : c.title || '—'}
          </Text>
        </View>
        <Pressable
          onPress={onMenu}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`Więcej: ${c.name}`}
          className="active:opacity-60"
          style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: B.paper, alignItems: 'center', justifyContent: 'center' }}
        >
          <MoreHorizontal size={17} color={B.ink2} />
        </Pressable>
      </View>
      {c.body ? (
        <Text numberOfLines={2} style={{ marginTop: 8, fontSize: 13, lineHeight: 18, color: B.ink2, fontFamily: F.medium }}>
          {c.body}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        <StatusPill status={c.status} />
        <Text style={{ fontSize: 12, color: B.ink4, fontFamily: F.semibold }}>
          {c.status === 'scheduled' ? fmtDateTime(date) : fmtDay(date)}
          {total > 0 ? ` · ${total} odb.` : ''}
        </Text>
      </View>
      {sentStats.length ? (
        <Text style={{ marginTop: 8, fontSize: 12, color: B.okFg, fontFamily: F.semibold }}>{sentStats.filter(Boolean).join(' · ')}</Text>
      ) : null}
    </Pressable>
  );
};

export const CampaignListScreen = ({ kind }: { kind: CampaignKind }) => {
  const router = useRouter();
  const { user } = useAuthSession();
  const { selectedCampusId, withCampusFilter } = useCampusQuery();
  const campaigns = useCampaigns(kind, { selectedCampusId, withCampusFilter });
  const invalidate = useInvalidateCampaigns(kind);
  const [filter, setFilter] = useState<Filter>('all');
  const [menu, setMenu] = useState<CampaignRow | null>(null);
  const [stats, setStats] = useState<CampaignRow | null>(null);

  const all: CampaignRow[] = campaigns.data ?? [];
  const counts = useMemo(() => {
    const m: Record<Filter, number> = { all: all.length, draft: 0, scheduled: 0, sent: 0 };
    all.forEach((c) => {
      if (c.status === 'draft' || c.status === 'scheduled' || c.status === 'sent') m[c.status as Exclude<Filter, 'all'>]++;
    });
    return m;
  }, [all]);
  const list = filter === 'all' ? all : all.filter((c) => c.status === (filter as CampaignStatus));

  const editorPath = kind === 'push' ? '/(app)/campaigns/push/new' : '/(app)/campaigns/sms/new';
  const openNew = () => router.push(editorPath as never);
  const openEdit = (c: CampaignRow) => router.push({ pathname: editorPath, params: { id: c.id } } as never);
  const open = (c: CampaignRow) => (isEditable(c.status) ? openEdit(c) : setStats(c));

  // iOS: kolejne okno (Alert, statystyki) dopiero po zamknięciu arkusza menu — inaczej znika.
  const afterSheet = () => new Promise((r) => setTimeout(r, 380));

  const runMenu = async (action: 'edit' | 'duplicate' | 'stats' | 'cancel' | 'delete') => {
    const c = menu;
    if (!c) return;
    setMenu(null);
    try {
      if (action === 'edit') return openEdit(c);
      await afterSheet();
      if (action === 'stats') setStats(c);
      if (action === 'duplicate') {
        if (!user?.email) throw new Error('Nie jesteś zalogowany');
        await duplicateCampaign(kind, user.email, c.id);
        await invalidate();
        toast.success('Utworzono kopię kampanii');
      }
      if (action === 'cancel') {
        if (!(await confirmAsync('Anulować kampanię?', `Zaplanowana kampania „${c.name}” nie zostanie wysłana.`, 'Anuluj wysyłkę', true))) return;
        await cancelCampaign(kind, c.id);
        await invalidate();
        toast.success('Anulowano kampanię');
      }
      if (action === 'delete') {
        if (!(await confirmAsync('Usunąć kampanię?', `„${c.name}” zostanie usunięta razem ze statystykami.`, 'Usuń', true))) return;
        await deleteCampaign(kind, c.id);
        await invalidate();
        toast.success('Usunięto kampanię');
      }
    } catch (e) {
      showError('Nie udało się', e);
    }
  };

  const menuItems: { key: 'edit' | 'duplicate' | 'stats' | 'cancel'; label: string }[] = menu
    ? [
        ...(isEditable(menu.status) ? [{ key: 'edit' as const, label: 'Edytuj' }] : []),
        { key: 'duplicate' as const, label: 'Duplikuj' },
        ...(menu.status !== 'draft' ? [{ key: 'stats' as const, label: 'Statystyki' }] : []),
        ...(menu.status === 'scheduled' ? [{ key: 'cancel' as const, label: 'Anuluj wysyłkę' }] : []),
      ]
    : [];

  const Icon = kind === 'push' ? BellRing : MessageSquare;

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: B.paper }}>
        <PageHeader
          title={kind === 'push' ? 'Kampanie push' : 'Kampanie SMS'}
          subtitle={kind === 'push' ? 'Powiadomienia' : 'Wiadomości SMS'}
          Icon={Icon}
          showBack
          right={
            <Pressable
              onPress={openNew}
              accessibilityRole="button"
              accessibilityLabel="Nowa kampania"
              className="active:opacity-80"
              style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: B.kurkuma, alignItems: 'center', justifyContent: 'center' }}
            >
              <Plus size={20} color={B.ink} strokeWidth={2.6} />
            </Pressable>
          }
        />
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140 }}
          refreshControl={<RefreshControl refreshing={campaigns.isRefetching} onRefresh={() => campaigns.refetch()} tintColor={B.ink} />}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, marginBottom: 12 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
            {FILTERS.map((f) => (
              <Chip key={f.key} label={counts[f.key] ? `${f.label} ${counts[f.key]}` : f.label} on={filter === f.key} onPress={() => setFilter(f.key)} />
            ))}
          </ScrollView>

          {campaigns.isLoading ? <ActivityIndicator color={B.ink} style={{ marginTop: 32 }} /> : null}
          {campaigns.isError ? (
            <EmptyState Icon={Icon} title="Nie udało się wczytać kampanii" hint="Sprawdź połączenie i spróbuj ponownie." actionLabel="Odśwież" onAction={() => campaigns.refetch()} />
          ) : null}
          {!campaigns.isLoading && !campaigns.isError && list.length === 0 ? (
            filter === 'all' ? (
              <EmptyState
                Icon={Icon}
                title={kind === 'push' ? 'Brak kampanii push' : 'Brak kampanii SMS'}
                hint={
                  kind === 'push'
                    ? 'Dotrzyj do wspólnoty powiadomieniami w aplikacji i przeglądarce.'
                    : 'Wyślij SMS do wybranych grup — z licznikiem części i kosztu.'
                }
                actionLabel="Utwórz pierwszą kampanię"
                onAction={openNew}
              />
            ) : (
              <EmptyState compact Icon={Icon} title="Nic tu nie ma" hint="Brak kampanii o tym statusie." />
            )
          ) : null}

          {list.map((c) => (
            <CampaignCard key={c.id} kind={kind} c={c} onPress={() => open(c)} onMenu={() => setMenu(c)} />
          ))}
        </ScrollView>
      </View>

      <Sheet visible={!!menu} onClose={() => setMenu(null)} title={menu?.name || 'Kampania'} eyebrow="Kampania">
        <View style={{ borderRadius: 20, backgroundColor: B.card, overflow: 'hidden', marginTop: 6 }}>
          {menuItems.map((it, i) => (
            <MenuRow key={it.key} label={it.label} onPress={() => runMenu(it.key)} last={i === menuItems.length - 1} />
          ))}
        </View>
        <DangerLink label="Usuń kampanię" onPress={() => runMenu('delete')} />
      </Sheet>

      <StatsSheet kind={kind} campaign={stats} onClose={() => setStats(null)} />
    </>
  );
};
