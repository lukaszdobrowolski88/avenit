import { useState } from 'react';
import { Alert, Pressable, ScrollView, StatusBar, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, LayoutDashboard, RotateCcw } from 'lucide-react-native';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { B } from '../../../src/components/ui/brand';
import { SortableList } from '../../../src/components/ui/SortableList';
import { useAuthSession } from '../../../src/lib/auth';
import { usePermissions } from '../../../src/lib/permissions';
import {
  DEFAULT_LAYOUT,
  SECTIONS,
  useDashboardLayout,
  useSaveDashboardLayout,
  type DashboardLayout,
  type SectionId,
} from '../../../src/features/dashboard/layout';

// Konto → Pulpit: które sekcje są na pulpicie, w jakiej kolejności; „Dla Ciebie”
// i „Twoje moduły” mają własne ustawienia elementów. Każdy ustawia pod siebie,
// „Przywróć domyślny” wraca do układu startowego.

const F = { medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold' } as const;
const ROW = 64;

export default function DashboardSettingsScreen() {
  const router = useRouter();
  const { user } = useAuthSession();
  const email = user?.email ?? null;
  const perms = usePermissions();
  const q = useDashboardLayout(email);
  const save = useSaveDashboardLayout(email);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const layout: DashboardLayout = q.data ?? DEFAULT_LAYOUT;

  // W ustawieniach tylko sekcje, które ta osoba może w ogóle zobaczyć.
  const available = (id: SectionId) => {
    if (!perms.ready) return true;
    switch (id) {
      case 'pendingAccounts':
        return perms.can('action:settings:manage_users');
      case 'nextUp':
      case 'events':
        return perms.moduleVisible('calendar');
      case 'messages':
        return perms.moduleVisible('komunikator');
      case 'prayers':
        return perms.moduleVisible('prayer');
      case 'birthdays':
        return perms.moduleVisible('members');
      case 'overview':
        return perms.moduleVisible('giving') || perms.moduleVisible('attendance') || perms.moduleVisible('rsvp');
      default:
        return true;
    }
  };
  const shown = layout.sections.filter((s) => available(s.id));
  const meta = (id: SectionId) => SECTIONS.find((s) => s.id === id)!;

  const persist = (next: DashboardLayout) =>
    save.mutate(next, { onError: (e: any) => Alert.alert('Nie udało się zapisać', e?.message ?? 'Spróbuj ponownie.') });

  // Kolejność liczona na liście widocznych w ustawieniach — przekładamy na pełną listę.
  const reorder = (from: number, to: number) => {
    const ids = shown.map((s) => s.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    const hiddenFromSettings = layout.sections.filter((s) => !available(s.id));
    const byId = new Map(layout.sections.map((s) => [s.id, s]));
    persist({ ...layout, sections: [...ids.map((id) => byId.get(id)!), ...hiddenFromSettings] });
  };
  const toggle = (id: SectionId, visible: boolean) =>
    persist({ ...layout, sections: layout.sections.map((s) => (s.id === id ? { ...s, visible } : s)) });
  const reset = () =>
    Alert.alert('Przywrócić domyślny pulpit?', 'Kolejność, widoczność sekcji i wybór elementów wrócą do ustawień startowych.', [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Przywróć', style: 'destructive', onPress: () => persist(DEFAULT_LAYOUT) },
    ]);

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: B.paper }}>
        <PageHeader title="Pulpit" subtitle="Dostosuj ekran startowy" Icon={LayoutDashboard} showBack />
        <ScrollView scrollEnabled={scrollEnabled} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 130 }}>
          <Text style={{ marginHorizontal: 4, marginBottom: 14, fontSize: 14, lineHeight: 20, color: B.ink3, fontFamily: F.medium }}>
            Włącz sekcje, które chcesz widzieć, i przeciągnij je za uchwyt, by ustawić kolejność. Zmiany zapisują się od razu.
          </Text>

          <View style={{ backgroundColor: B.card, borderRadius: 22, overflow: 'hidden' }}>
            <SortableList
              items={shown}
              rowHeight={ROW}
              keyOf={(s) => s.id}
              setScrollEnabled={setScrollEnabled}
              onReorder={reorder}
              rowStyle={(_s, i) => ({ borderTopWidth: i ? 1 : 0, borderTopColor: B.line, backgroundColor: B.card })}
              renderRow={(s) => {
                const m = meta(s.id);
                return (
                  <>
                    <View style={{ paddingLeft: 14, paddingRight: 10 }}>
                      <Switch
                        value={s.visible}
                        onValueChange={(v) => toggle(s.id, v)}
                        trackColor={{ true: B.kurkuma, false: '#E3DDD0' }}
                        thumbColor="#ffffff"
                        ios_backgroundColor="#E3DDD0"
                        style={{ transform: [{ scale: 0.85 }] }}
                      />
                    </View>
                    <Pressable
                      disabled={!m.configurable}
                      onPress={() => router.push({ pathname: '/(app)/account/dashboard-items', params: { kind: s.id } })}
                      className="active:opacity-70"
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, height: ROW }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={{ fontSize: 15, color: s.visible ? B.ink : B.ink4, fontFamily: F.semibold }}>
                          {m.label}
                        </Text>
                        <Text numberOfLines={1} style={{ marginTop: 1, fontSize: 12, color: B.ink4, fontFamily: F.medium }}>
                          {m.configurable ? 'Dostosuj elementy' : m.hint}
                        </Text>
                      </View>
                      {m.configurable ? <ChevronRight size={16} color={B.gold} /> : null}
                    </Pressable>
                  </>
                );
              }}
            />
          </View>

          <Pressable
            onPress={reset}
            className="active:opacity-70"
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 18, height: 48, borderRadius: 999, backgroundColor: B.paper2 }}
          >
            <RotateCcw size={16} color={B.ink} />
            <Text style={{ fontSize: 14, color: B.ink, fontFamily: F.bold }}>Przywróć domyślny pulpit</Text>
          </Pressable>
          <Text style={{ marginTop: 10, textAlign: 'center', fontSize: 12, color: B.ink4, fontFamily: F.medium }}>
            Powitanie zawsze jest na górze. Sekcje bez danych (np. brak urodzin) same się chowają.
          </Text>
        </ScrollView>
      </View>
    </>
  );
}
