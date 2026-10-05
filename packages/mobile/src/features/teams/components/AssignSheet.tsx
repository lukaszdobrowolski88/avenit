import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Check, Search } from 'lucide-react-native';
import { B, Monogram } from '../../../components/ui/brand';
import { PrimaryButton, Sheet } from '../../../components/ui/Sheet';
import { csvNames, type AsgStatus, type GrafikEvent, type GrafikMember, type GrafikRoleDef } from '../grafik';
import { dayLabel } from '../tabs/ui';

// Wybór osób do roli na wydarzeniu (albo listy nieobecnych). Najpierw osoby, które mają
// tę służbę (team_member_roles), potem reszta zespołu. Nieobecnych nie da się przypisać.

const F = { medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold' } as const;

const STATUS: Record<AsgStatus, { text: string; color: string }> = {
  accepted: { text: 'potwierdzone', color: '#15803d' },
  pending: { text: 'czeka na odpowiedź', color: B.gold },
  rejected: { text: 'odmowa', color: '#B42318' },
};

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');

export const AssignSheet = ({
  visible,
  event,
  role,
  members,
  roles,
  saving,
  onClose,
  onSave,
}: {
  visible: boolean;
  event: GrafikEvent | null;
  role: GrafikRoleDef | 'absent' | null;
  members: GrafikMember[];
  roles: GrafikRoleDef[];
  saving: boolean;
  onClose: () => void;
  onSave: (names: string[]) => void;
}) => {
  const absentMode = role === 'absent';
  const field = absentMode ? 'absencja' : role?.key ?? '';
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!visible || !event) return;
    setPicked(csvNames(event.team[field]));
    setQ('');
    setShowAll(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const absent = useMemo(() => new Set(event ? csvNames(event.team.absencja) : []), [event]);
  // Gdzie jeszcze ta osoba służy na tym wydarzeniu.
  const elsewhere = useMemo(() => {
    const out = new Map<string, string[]>();
    if (!event) return out;
    for (const r of roles) {
      if (!absentMode && r.key === field) continue;
      for (const n of csvNames(event.team[r.key])) out.set(n, [...(out.get(n) ?? []), r.label]);
    }
    return out;
  }, [event, roles, field, absentMode]);
  const statusOf = useMemo(() => {
    const m = new Map<string, AsgStatus>();
    if (event && !absentMode) for (const a of event.sa) if (a.roleKey === field) m.set(a.name, a.status);
    return m;
  }, [event, field, absentMode]);

  if (!event || !role) return null;
  const roleId = absentMode ? null : (role as GrafikRoleDef).id;
  // Nieaktywnych nie proponujemy — chyba że już są w tym polu (żeby dało się ich odznaczyć).
  members = members.filter((m) => m.active !== false || picked.includes(m.name));
  const withRole = roleId ? members.filter((m) => m.roleIds.includes(roleId)) : [];
  const primary = absentMode || !withRole.length ? members : withRole;
  const others = absentMode || !withRole.length ? [] : members.filter((m) => !m.roleIds.includes(roleId!));
  // Osoby wpisane w grafiku, których nie ma już w zespole — zostają na liście, żeby dało się je odznaczyć.
  const known = new Set(members.map((m) => m.name));
  const orphans = picked.filter((n) => !known.has(n)).map((n) => ({ id: `x-${n}`, name: n, email: null, roleIds: [] }) as GrafikMember);

  const s = fold(q.trim());
  const match = (m: GrafikMember) => !s || fold(m.name).includes(s);
  const toggle = (name: string) => setPicked((p) => (p.includes(name) ? p.filter((x) => x !== name) : [...p, name]));

  const row = (m: GrafikMember, i: number) => {
    const on = picked.includes(m.name);
    const isAbsent = !absentMode && absent.has(m.name);
    const st = statusOf.get(m.name);
    const extra = elsewhere.get(m.name);
    const sub = isAbsent
      ? 'nieobecność w tym terminie'
      : on && st
        ? STATUS[st].text
        : extra?.length
          ? absentMode
            ? `w grafiku: ${extra.join(', ')}`
            : `już: ${extra.join(', ')}`
          : null;
    return (
      <Pressable
        key={m.id}
        onPress={() => toggle(m.name)}
        disabled={isAbsent && !on}
        className="active:opacity-70"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 14,
          paddingVertical: 11,
          borderTopWidth: i ? 1 : 0,
          borderTopColor: B.line,
          opacity: isAbsent && !on ? 0.45 : 1,
        }}
      >
        <Monogram name={m.name} size={38} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontSize: 15, color: B.ink, fontFamily: F.semibold, textDecorationLine: isAbsent ? 'line-through' : 'none' }}>
            {m.name}
          </Text>
          {sub ? (
            <Text
              numberOfLines={1}
              style={{ fontSize: 12, marginTop: 1, fontFamily: F.medium, color: on && st ? STATUS[st].color : isAbsent ? '#B42318' : B.ink4 }}
            >
              {sub}
            </Text>
          ) : null}
        </View>
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: on ? (absentMode ? '#B42318' : B.ink) : 'transparent',
            borderWidth: on ? 0 : 1.5,
            borderColor: '#D3CCBC',
          }}
        >
          {on ? <Check size={15} color={absentMode ? '#FFFFFF' : B.kurkuma} strokeWidth={3} /> : null}
        </View>
      </Pressable>
    );
  };

  const list = (items: GrafikMember[]) => {
    const visibleItems = items.filter(match);
    return visibleItems.length ? (
      <View style={{ backgroundColor: B.card, borderRadius: 20, overflow: 'hidden' }}>{visibleItems.map(row)}</View>
    ) : null;
  };

  const dateText = `${dayLabel(event.date)}${event.time ? ` · ${event.time}` : ''}`;
  const orig = csvNames(event.team[field]);
  const changed = orig.length !== picked.length || orig.some((n) => !picked.includes(n));

  return (
    <Sheet
      visible={visible}
      eyebrow={event.title}
      title={absentMode ? 'Nieobecni' : (role as GrafikRoleDef).label}
      subtitle={dateText}
      onClose={onClose}
      footer={
        <PrimaryButton
          label={changed ? (picked.length ? `Zapisz · ${picked.length}` : 'Zapisz — nikt') : 'Gotowe'}
          busy={saving}
          onPress={() => (changed ? onSave(picked) : onClose())}
        />
      }
    >
      {members.length > 8 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 14, borderRadius: 22, backgroundColor: B.card, marginBottom: 12 }}>
          <Search size={16} color={B.ink4} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Szukaj osoby"
            placeholderTextColor={B.ink4}
            style={{ flex: 1, fontSize: 15, color: B.ink, fontFamily: F.medium }}
          />
        </View>
      ) : null}

      {!members.length ? (
        <Text style={{ paddingVertical: 24, textAlign: 'center', fontSize: 14, color: B.ink3, fontFamily: F.medium }}>
          W zespole nie ma jeszcze osób. Dodaj je w zakładce Członkowie.
        </Text>
      ) : null}

      {absentMode ? (
        <Text style={{ marginBottom: 10, marginLeft: 2, fontSize: 13, lineHeight: 18, color: B.ink3, fontFamily: F.medium }}>
          Zaznaczonych nie da się przypisać do żadnej roli na tym wydarzeniu.
        </Text>
      ) : withRole.length ? (
        <Text style={{ marginBottom: 8, marginLeft: 2, fontSize: 11, color: B.gold, letterSpacing: 1.3, textTransform: 'uppercase', fontFamily: F.bold }}>
          Mają tę służbę
        </Text>
      ) : null}
      {list(primary)}
      {orphans.length ? <View style={{ marginTop: 12 }}>{list(orphans)}</View> : null}

      {others.length ? (
        showAll || s ? (
          <>
            <Text style={{ marginTop: 18, marginBottom: 8, marginLeft: 2, fontSize: 11, color: B.gold, letterSpacing: 1.3, textTransform: 'uppercase', fontFamily: F.bold }}>
              Pozostali w zespole
            </Text>
            {list(others)}
          </>
        ) : (
          <Pressable onPress={() => setShowAll(true)} className="active:opacity-70" style={{ marginTop: 12, paddingVertical: 12, alignItems: 'center' }}>
            <Text style={{ fontSize: 14, color: B.gold, fontFamily: F.bold }}>Pokaż pozostałych ({others.length})</Text>
          </Pressable>
        )
      ) : null}
    </Sheet>
  );
};
