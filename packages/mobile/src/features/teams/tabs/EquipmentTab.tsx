import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Package } from 'lucide-react-native';
import { B } from '../../../components/ui/brand';
import { useTeamEquipment, type EquipmentItem } from '../data';
import { conditionLabel } from '../equipment';
import { EquipmentSheet } from '../components/EquipmentSheet';
import { Empty, Loading, SearchBar, fold, money } from './ui';

// Wyposażenie zespołu (equipment, team_type = klucz modułu) — jak EquipmentTab na webie:
// podsumowanie, wyszukiwanie po nazwie i osobie, dodawanie/edycja ze zdjęciem.

const F = { medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold' } as const;

// Stan sprzętu — kolor tylko tam, gdzie wymaga uwagi.
const COND_TONE: Record<string, { fg: string; bg: string }> = {
  uszkodzony: { fg: '#B42318', bg: '#FDECEA' },
  do_naprawy: { fg: '#B42318', bg: '#FDECEA' },
  nowy: { fg: B.gold, bg: B.kurkumaSoft },
};

export const EquipmentTab = ({
  teamKey,
  people,
  myEmail,
  canCreate,
  canEdit,
  canDelete,
}: {
  teamKey: string;
  people: string[];
  myEmail: string | null;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) => {
  const eq = useTeamEquipment(teamKey);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<EquipmentItem | 'new' | null>(null);
  const items: EquipmentItem[] = eq.data ?? [];
  const list = useMemo(() => {
    const s = fold(q.trim());
    return s ? items.filter((i) => fold(`${i.name} ${i.responsible ?? ''} ${i.description ?? ''}`).includes(s)) : items;
  }, [items, q]);
  const total = items.reduce((s, i) => s + (i.unitValue ?? 0) * i.quantity, 0);
  const count = items.reduce((s, i) => s + i.quantity, 0);
  const attention = items.filter((i) => i.condition === 'uszkodzony' || i.condition === 'do_naprawy').length;

  return (
    <View>
      {items.length ? (
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
          {[
            { label: 'Sztuk', value: String(count) },
            { label: 'Wartość', value: money(total) },
            ...(attention ? [{ label: 'Do naprawy', value: String(attention), warn: true }] : []),
          ].map((s: { label: string; value: string; warn?: boolean }) => (
            <View key={s.label} style={{ flex: 1, borderRadius: 18, backgroundColor: B.card, padding: 14 }}>
              <Text style={{ fontSize: 11, color: s.warn ? '#B42318' : B.gold, letterSpacing: 1.2, textTransform: 'uppercase', fontFamily: F.bold }}>{s.label}</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit style={{ marginTop: 3, fontSize: 21, color: B.ink, letterSpacing: -0.5, fontFamily: F.bold }}>
                {s.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <SearchBar value={q} onChange={setQ} placeholder="Szukaj sprzętu albo osoby" onAdd={canCreate ? () => setEditing('new') : undefined} addLabel="Dodaj sprzęt" />

      {eq.isLoading ? <Loading /> : null}
      {!eq.isLoading && !list.length ? (
        <Empty
          Icon={Package}
          title={q ? 'Nic nie znaleziono' : 'Brak sprzętu na liście'}
          hint={!q && canCreate ? 'Dodaj sprzęt przyciskiem „+” — możesz od razu zrobić zdjęcie.' : undefined}
        />
      ) : null}

      {list.length ? (
        <View style={{ backgroundColor: B.card, borderRadius: 22, overflow: 'hidden' }}>
          {list.map((it, i) => {
            const tone = it.condition ? COND_TONE[it.condition] : null;
            return (
              <Pressable
                key={it.id}
                onPress={canEdit ? () => setEditing(it) : undefined}
                disabled={!canEdit}
                className="active:opacity-70"
                style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: B.line }}
              >
                {it.photoUrl ? (
                  <Image source={{ uri: it.photoUrl }} style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: B.paper2 }} contentFit="cover" transition={150} />
                ) : (
                  <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: B.paper, alignItems: 'center', justifyContent: 'center' }}>
                    <Package size={20} color={B.ink4} />
                  </View>
                )}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text numberOfLines={1} style={{ fontSize: 15, color: B.ink, letterSpacing: -0.2, fontFamily: F.semibold }}>
                    {it.name}
                    {it.quantity > 1 ? <Text style={{ color: B.ink3 }}>{`  ×${it.quantity}`}</Text> : null}
                  </Text>
                  <Text numberOfLines={1} style={{ fontSize: 12, color: B.ink3, fontFamily: F.medium }}>
                    {[it.unitValue != null ? money(it.unitValue * it.quantity) : null, it.responsible].filter(Boolean).join(' · ') || it.description || ' '}
                  </Text>
                </View>
                {it.condition && it.condition !== 'dobry' ? (
                  <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: tone?.bg ?? B.paper2 }}>
                    <Text style={{ fontSize: 11, color: tone?.fg ?? B.ink2, fontFamily: F.bold }}>{conditionLabel(it.condition)}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <EquipmentSheet
        visible={!!editing}
        team={teamKey}
        item={editing && editing !== 'new' ? editing : null}
        people={people}
        myEmail={myEmail}
        canDelete={canDelete}
        onClose={() => setEditing(null)}
      />
    </View>
  );
};
