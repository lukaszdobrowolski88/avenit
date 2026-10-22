import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { X } from 'lucide-react-native';
import { B, Monogram } from '../../../components/ui/brand';
import { Chip, FormInput } from '../../../components/ui/Sheet';
import {
  ACCESS_NOTE,
  filterPeople,
  type MinistryPeopleMeta,
  type MinistryPerson,
} from '@avenit/shared/src/lib/ministryPeople.js';

// „Dodaj do zespołu” z listy osób (jak web — MemberPickerField): konta w aplikacji i osoby
// z Członków bez konta; „już w zespole” wyszarzone. Wybór wypełnia imię, e-mail i telefon
// (telefon tylko, gdy serwer go pokazał). „Ręcznie” — dla osób spoza listy.

const F = { medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold' } as const;
const LIMIT = 8;

export const PersonPicker = ({
  meta,
  loading,
  picked,
  manual,
  onManual,
  onPick,
}: {
  meta: MinistryPeopleMeta | null | undefined;
  loading: boolean;
  picked: MinistryPerson | null;
  manual: boolean;
  onManual: (manual: boolean) => void;
  onPick: (person: MinistryPerson | null) => void;
}) => {
  const [q, setQ] = useState('');
  const list = useMemo(() => filterPeople(meta?.people ?? [], q, { limit: LIMIT }), [meta, q]);

  let note: { text: string; color: string } | null = null;
  if (picked) {
    if (!picked.user_id) note = { text: 'Ta osoba nie ma konta w aplikacji — trafi tylko na listę zespołu.', color: B.ink4 };
    else if (picked.has_access) note = { text: 'Ma już dostęp do modułu tej służby.', color: B.ink4 };
    else if (meta?.grants_access && meta.can_grant_access)
      note = { text: 'Po zapisaniu dostanie też dostęp do modułu tej służby (jako członek).', color: B.okFg };
    else if (meta?.grants_access) note = { text: ACCESS_NOTE, color: B.goldDeep };
  }

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
        <Chip label="Z listy osób" on={!manual} onPress={() => onManual(false)} />
        <Chip
          label="Ręcznie"
          on={manual}
          onPress={() => {
            onManual(true);
            onPick(null);
          }}
        />
      </View>

      {manual ? (
        <Text style={{ marginTop: 8, marginLeft: 2, fontSize: 12, lineHeight: 17, color: B.ink4, fontFamily: F.medium }}>
          Wpisz dane poniżej — np. osoby, która nie ma konta w aplikacji.
        </Text>
      ) : picked ? (
        <View style={{ marginTop: 10 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              padding: 10,
              borderRadius: 16,
              backgroundColor: B.paper,
            }}
          >
            <Monogram name={picked.name} size={36} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ fontSize: 15, color: B.ink, fontFamily: F.semibold }}>
                {picked.name}
              </Text>
              <Text numberOfLines={1} style={{ fontSize: 12, color: B.ink4, fontFamily: F.medium }}>
                {picked.email || 'bez e-maila'}
                {picked.source === 'member' ? ' · Członek kościoła' : ''}
              </Text>
            </View>
            <Pressable
              onPress={() => onPick(null)}
              accessibilityLabel="Zmień osobę"
              hitSlop={8}
              className="active:opacity-60"
              style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={16} color={B.ink3} strokeWidth={2.2} />
            </Pressable>
          </View>
          {note ? (
            <Text style={{ marginTop: 6, marginLeft: 2, fontSize: 12, lineHeight: 17, color: note.color, fontFamily: F.medium }}>{note.text}</Text>
          ) : null}
        </View>
      ) : (
        <View style={{ marginTop: 10 }}>
          <FormInput
            value={q}
            onChangeText={setQ}
            placeholder="Szukaj po imieniu lub e-mailu"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Szukaj osoby"
          />
          <View style={{ marginTop: 6 }}>
            {loading ? <ActivityIndicator color={B.ink3} style={{ marginVertical: 10 }} /> : null}
            {!loading && !meta ? (
              <Text style={{ marginTop: 6, fontSize: 12, color: B.ink4, fontFamily: F.medium }}>Nie udało się wczytać listy osób — dodaj ręcznie.</Text>
            ) : null}
            {!loading && meta && !list.length ? (
              <Text style={{ marginTop: 6, fontSize: 12, color: B.ink4, fontFamily: F.medium }}>
                {q ? 'Nikogo nie znaleziono — dodaj ręcznie.' : 'Brak osób do wyboru.'}
              </Text>
            ) : null}
            {!loading
              ? list.map((p, i) => (
                  <Pressable
                    key={p.key}
                    onPress={() => {
                      if (p.in_team) return;
                      setQ('');
                      onPick(p);
                    }}
                    disabled={p.in_team}
                    accessibilityLabel={p.in_team ? `${p.name} — już w zespole` : `Wybierz: ${p.name}`}
                    className="active:opacity-60"
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingVertical: 9,
                      borderTopWidth: i ? 1 : 0,
                      borderTopColor: B.line,
                      opacity: p.in_team ? 0.45 : 1,
                    }}
                  >
                    <Monogram name={p.name} size={32} />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ fontSize: 14, color: B.ink, fontFamily: F.semibold }}>
                        {p.name}
                      </Text>
                      <Text numberOfLines={1} style={{ fontSize: 12, color: B.ink4, fontFamily: F.medium }}>
                        {p.email || 'bez e-maila'}
                      </Text>
                    </View>
                    {p.in_team || p.source === 'member' ? (
                      <Text numberOfLines={1} style={{ fontSize: 11, color: B.ink4, fontFamily: F.semibold }}>{p.in_team ? 'już w zespole' : 'bez konta'}</Text>
                    ) : null}
                  </Pressable>
                ))
              : null}
          </View>
        </View>
      )}
    </View>
  );
};
