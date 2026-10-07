import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { ArrowUpDown, ChevronRight, Plus, Users } from 'lucide-react-native';
import { B } from '../../../components/ui/brand';
import { PrimaryButton, Sheet } from '../../../components/ui/Sheet';
import { SortableList } from '../../../components/ui/SortableList';
import { useReorderRoles, useRoster, type RosterPerson, type RosterRole } from '../roster';
import { RoleSheet } from '../components/RoleSheet';
import { Empty, Loading } from './ui';
import { friendlyError } from '../../../lib/errors';

// Służby zespołu (team_roles) — kto co robi. Kolejność służb = kolumny grafiku.

const F = { medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold' } as const;
const ROW = 56;

const ReorderSheet = ({ visible, team, table, roles, onClose }: { visible: boolean; team: string; table: string; roles: RosterRole[]; onClose: () => void }) => {
  const reorder = useReorderRoles(team, table);
  const [items, setItems] = useState<RosterRole[]>([]);
  const [scroll, setScroll] = useState(true);
  useEffect(() => {
    if (visible) setItems(roles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const changed = items.some((r, i) => r.id !== roles[i]?.id);
  return (
    <Sheet
      visible={visible}
      eyebrow="Służby"
      title="Kolejność"
      subtitle="W tej kolejności służby są kolumnami grafiku."
      onClose={onClose}
      scroll={false}
      footer={
        <PrimaryButton
          label={changed ? 'Zapisz kolejność' : 'Gotowe'}
          busy={reorder.isPending}
          onPress={() =>
            changed
              ? reorder.mutate(
                  items.map((r) => r.id),
                  { onSuccess: onClose, onError: (e: unknown) => Alert.alert('Nie udało się zapisać', friendlyError(e, 'Spróbuj ponownie.')) },
                )
              : onClose()
          }
        />
      }
    >
      <ScrollView scrollEnabled={scroll} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
        <View style={{ backgroundColor: B.card, borderRadius: 22, overflow: 'hidden' }}>
          <SortableList
            items={items}
            rowHeight={ROW}
            keyOf={(r) => r.id}
            setScrollEnabled={setScroll}
            onReorder={(from, to) =>
              setItems((list) => {
                const next = [...list];
                const [m] = next.splice(from, 1);
                next.splice(to, 0, m);
                return next;
              })
            }
            rowStyle={(_r, i) => ({ borderTopWidth: i ? 1 : 0, borderTopColor: B.line, backgroundColor: B.card })}
            renderRow={(r) => (
              <Text numberOfLines={1} style={{ flex: 1, paddingLeft: 16, fontSize: 15, color: B.ink, fontFamily: F.semibold }}>
                {r.name}
              </Text>
            )}
          />
        </View>
      </ScrollView>
    </Sheet>
  );
};

export const RolesTab = ({ team, table, canEdit, canDelete }: { team: string; table: string; canEdit: boolean; canDelete: boolean }) => {
  const roster = useRoster(team, table);
  const [editing, setEditing] = useState<RosterRole | 'new' | null>(null);
  const [ordering, setOrdering] = useState(false);
  if (roster.isLoading) return <Loading />;
  const roles: RosterRole[] = roster.data?.roles ?? [];
  const people = roster.data?.people ?? [];
  const nameOf = new Map((people as RosterPerson[]).map((p) => [p.id, p.name]));

  return (
    <View>
      {canEdit ? (
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          <Pressable
            onPress={() => setEditing('new')}
            className="active:opacity-80"
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 999, backgroundColor: B.kurkuma }}
          >
            <Plus size={17} color={B.ink} strokeWidth={2.6} />
            <Text style={{ fontSize: 14, color: B.ink, fontFamily: F.bold }}>Nowa służba</Text>
          </Pressable>
          {roles.length > 1 ? (
            <Pressable
              onPress={() => setOrdering(true)}
              className="active:opacity-80"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, paddingHorizontal: 16, borderRadius: 999, backgroundColor: B.card }}
            >
              <ArrowUpDown size={16} color={B.ink} />
              <Text style={{ fontSize: 14, color: B.ink, fontFamily: F.bold }}>Kolejność</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {!roles.length ? (
        <Empty
          Icon={Users}
          title="Brak zdefiniowanych służb"
          hint={canEdit ? 'Dodaj służby, np. wokal, nagłośnienie, kamera — staną się kolumnami grafiku.' : 'Służby (np. wokal, nagłośnienie) dodaje lider zespołu.'}
        />
      ) : (
        <View style={{ backgroundColor: B.card, borderRadius: 22, overflow: 'hidden' }}>
          {roles.map((r, i) => {
            const names = r.memberIds.map((id) => nameOf.get(id)).filter(Boolean) as string[];
            const body = (
              <>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                    <Text style={{ fontSize: 16, color: B.ink, letterSpacing: -0.3, fontFamily: F.bold }}>{r.name}</Text>
                    <Text style={{ fontSize: 12, color: B.ink4, fontFamily: F.semibold }}>{names.length}</Text>
                  </View>
                  {r.description ? (
                    <Text style={{ marginTop: 2, fontSize: 12, lineHeight: 17, color: B.ink3, fontFamily: F.medium }}>{r.description}</Text>
                  ) : null}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {names.length ? (
                      names.map((n) => (
                        <View key={n} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: B.paper }}>
                          <Text style={{ fontSize: 13, color: B.ink, fontFamily: F.semibold }}>{n}</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={{ fontSize: 13, color: B.ink4, fontFamily: F.medium }}>Nikt nie jest przypisany</Text>
                    )}
                  </View>
                </View>
                {canEdit ? <ChevronRight size={18} color={B.ink4} style={{ marginTop: 2 }} /> : null}
              </>
            );
            const style = { flexDirection: 'row' as const, gap: 10, padding: 16, borderTopWidth: i ? 1 : 0, borderTopColor: B.line };
            return canEdit ? (
              <Pressable key={r.id} onPress={() => setEditing(r)} className="active:opacity-70" style={style}>
                {body}
              </Pressable>
            ) : (
              <View key={r.id} style={style}>
                {body}
              </View>
            );
          })}
        </View>
      )}

      <RoleSheet
        visible={!!editing}
        team={team}
        table={table}
        role={editing && editing !== 'new' ? editing : null}
        roles={roles}
        people={people}
        canDelete={canDelete}
        onClose={() => setEditing(null)}
      />
      <ReorderSheet visible={ordering} team={team} table={table} roles={roles} onClose={() => setOrdering(false)} />
    </View>
  );
};
