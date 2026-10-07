import { useState } from 'react';
import { ScrollView, StatusBar, Switch, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { LayoutGrid, Sparkles, type LucideIcon } from 'lucide-react-native';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { B } from '../../../src/components/ui/brand';
import { SortableList } from '../../../src/components/ui/SortableList';
import { useAuthSession } from '../../../src/lib/auth';
import { isShortcutVisible, useShortcutCatalog, visibleShortcuts, type Shortcut } from '../../../src/features/dashboard/shortcuts';
import { useDashboardModules } from '../../../src/features/dashboard/components/QuickAccess';
import {
  DEFAULT_LAYOUT,
  useDashboardLayout,
  useSaveDashboardLayout,
  type DashboardLayout,
} from '../../../src/features/dashboard/layout';
import { showError } from '../../../src/lib/errors';

// Konto → Pulpit → elementy sekcji: „Dla Ciebie” (skróty — widoczność i kolejność)
// albo „Twoje moduły” (dobór automatyczny albo własny wybór i kolejność).

const F = { medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold' } as const;
const ROW = 60;

interface Row {
  key: string;
  label: string;
  Icon: LucideIcon;
}

const toggleStyle = { trackColor: { true: B.kurkuma, false: B.fieldBorder }, thumbColor: '#ffffff', ios_backgroundColor: B.fieldBorder } as const;

const ItemRow = ({ row, on, onToggle }: { row: Row; on: boolean; onToggle?: (v: boolean) => void }) => (
  <>
    {onToggle ? (
      <View style={{ paddingLeft: 14, paddingRight: 8 }}>
        <Switch value={on} onValueChange={onToggle} {...toggleStyle} style={{ transform: [{ scale: 0.85 }] }} />
      </View>
    ) : (
      <View style={{ width: 16 }} />
    )}
    <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: B.paper, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
      <row.Icon size={16} color={on ? B.ink : B.ink4} />
    </View>
    <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: on ? B.ink : B.ink4, fontFamily: F.semibold }}>
      {row.label}
    </Text>
  </>
);

export default function DashboardItemsScreen() {
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const isModules = kind === 'modules';
  const { user } = useAuthSession();
  const email = user?.email ?? null;
  const layout: DashboardLayout = useDashboardLayout(email).data ?? DEFAULT_LAYOUT;
  const save = useSaveDashboardLayout(email);
  const { catalog } = useShortcutCatalog();
  const { candidates, auto } = useDashboardModules();
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const persist = (next: DashboardLayout) =>
    save.mutate(next, { onError: (e) => showError('Nie udało się zapisać układu pulpitu', e) });

  // ── Dla Ciebie: widoczne skróty (kolejność) + reszta katalogu do dodania ──
  const fy = layout.forYou;
  const onDesk: Shortcut[] = visibleShortcuts(catalog, fy);
  const offDesk: Shortcut[] = catalog.filter((x) => !isShortcutVisible(x, fy));
  // Zapis z listy widocznych: kolejność, ukryte osobiste, dodane moduły.
  const saveForYou = (visible: Shortcut[]) => {
    const keys = new Set(visible.map((x) => x.key));
    persist({
      ...layout,
      forYou: {
        order: visible.map((x) => x.key),
        hidden: catalog.filter((x) => x.kind === 'personal' && !keys.has(x.key)).map((x) => x.key),
        added: visible.filter((x) => x.kind === 'module').map((x) => x.key),
      },
    });
  };

  // ── Twoje moduły: automatycznie albo własny wybór ──
  const md = layout.modules;
  const isAuto = !md.order;
  const moduleRows: Row[] = candidates.map((m) => ({ key: m.key, label: m.label, Icon: m.Icon }));
  const selected = isAuto ? auto.map((m) => m.key) : (md.order ?? []).filter((k) => moduleRows.some((r) => r.key === k));
  const customRows: Row[] = [
    ...(selected.map((k) => moduleRows.find((r) => r.key === k)).filter(Boolean) as Row[]),
    ...moduleRows.filter((r) => !selected.includes(r.key)),
  ];
  const saveModules = (keys: string[] | null) => persist({ ...layout, modules: { order: keys, hidden: [] } });

  const move = <T,>(list: T[], from: number, to: number) => {
    const next = list.slice();
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    return next;
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: B.paper }}>
        <PageHeader
          title={isModules ? 'Twoje moduły' : 'Dla Ciebie'}
          subtitle="Pulpit"
          Icon={isModules ? LayoutGrid : Sparkles}
          showBack
        />
        <ScrollView scrollEnabled={scrollEnabled} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 130 }}>
          {!isModules ? (
            <>
              <Text style={{ marginHorizontal: 4, marginBottom: 14, fontSize: 14, lineHeight: 20, color: B.ink3, fontFamily: F.medium }}>
                Przeciągnij skróty, by ustawić kolejność. Niżej dodasz kolejne — także dowolny moduł.
              </Text>
              <Text style={{ marginBottom: 10, marginLeft: 4, fontSize: 12, letterSpacing: 1.3, textTransform: 'uppercase', color: B.gold, fontFamily: F.bold }}>
                {`Na pulpicie · ${onDesk.length}`}
              </Text>
              <View style={{ backgroundColor: B.card, borderRadius: 22, overflow: 'hidden' }}>
                {onDesk.length ? (
                  <SortableList
                    items={onDesk}
                    rowHeight={ROW}
                    keyOf={(r) => r.key}
                    setScrollEnabled={setScrollEnabled}
                    rowStyle={(_r, i) => ({ borderTopWidth: i ? 1 : 0, borderTopColor: B.line, backgroundColor: B.card })}
                    onReorder={(from, to) => saveForYou(move(onDesk, from, to))}
                    renderRow={(r) => <ItemRow row={r} on onToggle={() => saveForYou(onDesk.filter((x) => x.key !== r.key))} />}
                  />
                ) : (
                  <Text style={{ padding: 16, fontSize: 14, color: B.ink3, fontFamily: F.medium }}>
                    Brak skrótów — sekcja „Dla Ciebie” się nie pokaże.
                  </Text>
                )}
              </View>

              {offDesk.length ? (
                <>
                  <Text style={{ marginTop: 22, marginBottom: 10, marginLeft: 4, fontSize: 12, letterSpacing: 1.3, textTransform: 'uppercase', color: B.gold, fontFamily: F.bold }}>
                    Dodaj skrót
                  </Text>
                  <View style={{ backgroundColor: B.card, borderRadius: 22, overflow: 'hidden' }}>
                    {offDesk.map((r, i) => (
                      <View key={r.key} style={{ height: ROW, flexDirection: 'row', alignItems: 'center', borderTopWidth: i ? 1 : 0, borderTopColor: B.line }}>
                        <ItemRow row={r} on={false} onToggle={() => saveForYou([...onDesk, r])} />
                        {r.kind === 'module' ? (
                          <Text style={{ marginRight: 16, fontSize: 11, color: B.ink4, fontFamily: F.semibold }}>moduł</Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                </>
              ) : null}
            </>
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 22, backgroundColor: B.card }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, color: B.ink, fontFamily: F.bold }}>Dobieraj automatycznie</Text>
                  <Text style={{ marginTop: 2, fontSize: 12, lineHeight: 17, color: B.ink3, fontFamily: F.medium }}>
                    Najpierw służby, do których należysz, potem najczęściej używane — do 6 kafelków.
                  </Text>
                </View>
                <Switch value={isAuto} onValueChange={(v) => saveModules(v ? null : auto.map((m) => m.key))} {...toggleStyle} />
              </View>

              <Text style={{ marginTop: 22, marginBottom: 10, marginLeft: 4, fontSize: 12, letterSpacing: 1.3, textTransform: 'uppercase', color: B.gold, fontFamily: F.bold }}>
                {isAuto ? 'Teraz na pulpicie' : `Na pulpicie · ${selected.length}`}
              </Text>
              <View style={{ backgroundColor: B.card, borderRadius: 22, overflow: 'hidden' }}>
                {isAuto ? (
                  auto.map((m, i) => (
                    <View key={m.key} style={{ height: ROW, flexDirection: 'row', alignItems: 'center', borderTopWidth: i ? 1 : 0, borderTopColor: B.line }}>
                      <ItemRow row={{ key: m.key, label: m.label, Icon: m.Icon }} on />
                    </View>
                  ))
                ) : (
                  <SortableList
                    items={customRows}
                    rowHeight={ROW}
                    keyOf={(r) => r.key}
                    setScrollEnabled={setScrollEnabled}
                    rowStyle={(_r, i) => ({ borderTopWidth: i ? 1 : 0, borderTopColor: B.line, backgroundColor: B.card })}
                    onReorder={(from, to) => {
                      const next = move(customRows, from, to);
                      saveModules(next.filter((r) => selected.includes(r.key)).map((r) => r.key));
                    }}
                    renderRow={(r) => (
                      <ItemRow
                        row={r}
                        on={selected.includes(r.key)}
                        onToggle={(v) =>
                          saveModules(
                            v
                              ? customRows.filter((x) => selected.includes(x.key) || x.key === r.key).map((x) => x.key)
                              : selected.filter((k) => k !== r.key),
                          )
                        }
                      />
                    )}
                  />
                )}
              </View>
              {!isAuto ? (
                <Text style={{ marginTop: 10, marginHorizontal: 4, fontSize: 12, lineHeight: 17, color: B.ink4, fontFamily: F.medium }}>
                  Włączone moduły pokazują się na pulpicie w tej kolejności. Pozostałe znajdziesz w zakładce Moduły.
                </Text>
              ) : null}
            </>
          )}
        </ScrollView>
      </View>
    </>
  );
}
