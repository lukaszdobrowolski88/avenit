import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { Check, Search } from 'lucide-react-native';
import { B, fieldStyle } from '../../../components/ui/brand';
import { PrimaryButton, Sheet } from '../../../components/ui/Sheet';
import { foldText } from '../../modules/nav';
import { boardColor, sameEmail, type Person } from '../board';
import { F, PersonAvatar } from './bits';

// Arkusze wyboru na ekranie zadania: jedna opcja (status, grupa) i osoby (kolumna „Osoby”,
// @wzmianka). Wiersze jak listy w apce: biała karta, kropka koloru, ptaszek przy wybranym.

export interface Option {
  id: string | null;
  title: string;
  color?: string | null;
  hint?: string | null;
}

export const OptionSheet = ({
  visible,
  title,
  eyebrow,
  options,
  selectedId,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  eyebrow?: string;
  options: Option[];
  selectedId: string | null;
  onPick: (id: string | null) => void;
  onClose: () => void;
}) => (
  <Sheet visible={visible} title={title} eyebrow={eyebrow} onClose={onClose}>
    <View style={{ borderRadius: 22, backgroundColor: B.card, overflow: 'hidden', marginTop: 6 }}>
      {options.map((o, i) => {
        const on = (o.id ?? null) === (selectedId ?? null);
        return (
          <Pressable
            key={o.id ?? '__none'}
            onPress={() => {
              onPick(o.id);
              onClose();
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            className="active:opacity-70"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingHorizontal: 16,
              minHeight: 54,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: B.line,
            }}
          >
            <View
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: o.color ? boardColor(o.color) : 'transparent',
                borderWidth: o.color ? 0 : 1.5,
                borderColor: B.ink4,
              }}
            />
            <View style={{ flex: 1, paddingVertical: 12 }}>
              <Text style={{ fontSize: 16, color: B.ink, fontFamily: on ? F.bold : F.semibold }}>{o.title}</Text>
              {o.hint ? <Text style={{ marginTop: 2, fontSize: 12, color: B.ink3, fontFamily: F.medium }}>{o.hint}</Text> : null}
            </View>
            {on ? <Check size={18} color={B.ink} strokeWidth={2.4} /> : null}
          </Pressable>
        );
      })}
    </View>
  </Sheet>
);

// Wybór osób: wiele (kolumna „Osoby” → Zapisz) albo jedna (@wzmianka → od razu).
export const PeopleSheet = ({
  visible,
  title,
  people,
  loading,
  selected,
  myEmail,
  multi = true,
  onSave,
  onClose,
}: {
  visible: boolean;
  title: string;
  people: Person[];
  loading?: boolean;
  selected: Person[];
  myEmail: string | null;
  multi?: boolean;
  onSave: (picked: Person[]) => unknown;
  onClose: () => void;
}) => {
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Person[]>(selected);
  useEffect(() => {
    if (visible) {
      setPicked(selected);
      setQ('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Osoby spoza katalogu (np. nieaktywne konto, wciąż przypisane) też na liście — da się je odpiąć.
  const all = useMemo(() => {
    const extra = selected.filter((s) => !people.some((p) => sameEmail(p.email, s.email)));
    const list = [...extra, ...people];
    // Ja na górze — najczęstszy wybór na telefonie.
    return list.sort((a, b) => Number(sameEmail(b.email, myEmail)) - Number(sameEmail(a.email, myEmail)));
  }, [people, selected, myEmail]);

  const filtered = useMemo(() => {
    const s = foldText(q.trim());
    if (!s) return all;
    return all.filter((p) => foldText(p.name).includes(s) || foldText(p.email).includes(s));
  }, [all, q]);

  const isOn = (p: Person) => picked.some((x) => sameEmail(x.email, p.email));
  const toggle = (p: Person) => {
    if (!multi) {
      onSave([p]);
      onClose();
      return;
    }
    setPicked((cur) => (isOn(p) ? cur.filter((x) => !sameEmail(x.email, p.email)) : [...cur, p]));
  };

  return (
    <Sheet
      visible={visible}
      title={title}
      eyebrow={multi && picked.length ? `Wybrano: ${picked.length}` : undefined}
      onClose={onClose}
      footer={
        multi ? (
          <PrimaryButton
            label="Zapisz"
            onPress={async () => {
              await onSave(picked);
              onClose();
            }}
          />
        ) : undefined
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, ...fieldStyle, marginTop: 6, marginBottom: 12 }}>
        <Search size={16} color={B.ink4} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Szukaj osoby…"
          placeholderTextColor={B.ink4}
          autoCorrect={false}
          autoCapitalize="none"
          style={{ flex: 1, fontSize: 15, color: B.ink, fontFamily: F.medium, padding: 0 }}
        />
      </View>
      {loading ? (
        <ActivityIndicator color={B.ink} style={{ marginTop: 24 }} />
      ) : filtered.length === 0 ? (
        <Text style={{ textAlign: 'center', marginTop: 24, fontSize: 14, color: B.ink3, fontFamily: F.medium }}>
          Brak wyników
        </Text>
      ) : (
        <View style={{ borderRadius: 22, backgroundColor: B.card, overflow: 'hidden' }}>
          {filtered.slice(0, 200).map((p, i) => {
            const on = isOn(p);
            const me = sameEmail(p.email, myEmail);
            return (
              <Pressable
                key={p.email}
                onPress={() => toggle(p)}
                accessibilityRole={multi ? 'checkbox' : 'button'}
                accessibilityState={multi ? { checked: on } : undefined}
                className="active:opacity-70"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: B.line,
                }}
              >
                <PersonAvatar name={p.name} email={p.email} avatarUrl={p.avatar_url} size={34} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontSize: 15, color: B.ink, fontFamily: F.semibold }}>
                    {p.name}
                    {me ? ' (Ty)' : ''}
                  </Text>
                  <Text numberOfLines={1} style={{ fontSize: 12, color: B.ink3, fontFamily: F.medium }}>
                    {p.email}
                  </Text>
                </View>
                {multi ? (
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      backgroundColor: on ? B.ink : 'transparent',
                      borderWidth: on ? 0 : 1.5,
                      borderColor: B.fieldBorder,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {on ? <Check size={14} color="#FFFFFF" strokeWidth={3} /> : null}
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}
    </Sheet>
  );
};
