import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Check, Minus, Plus, X } from 'lucide-react-native';
import { Chip, FormInput, PrimaryButton, Sheet } from '../../../components/ui/Sheet';
import { B } from '../../../components/ui/brand';
import { FONT as F } from '../../../lib/fonts';
import {
  ROLE_OPTIONS,
  addCustomEmail,
  customEmailsOf,
  customPhonesOf,
  hasValidPhone,
  isSelected,
  parsePhones,
  removeCustomEmail,
  resolveSegments,
  searchUsers,
  setCustomPhones,
  toggleSegment,
  totalActive,
  type RecipientsSource,
  type Segment,
  type SegmentType,
} from '../recipientsLogic';
import type { CampaignKind } from '../api';
import { recipientsWord } from './ui';

// Wybór odbiorców jak RecipientSelector na webie: grupy segmentów (Wszyscy / Kampus / Służba /
// Grupa domowa / Rola / Wybrane osoby / [SMS] Numery), dołączanie i wykluczanie, licznik po
// deduplikacji i rezygnacjach. SMS liczy tylko osoby z poprawnym numerem.

type Group = { id: SegmentType; label: string };

const GROUPS: Group[] = [
  { id: 'all', label: 'Wszyscy' },
  { id: 'campus', label: 'Kampus' },
  { id: 'ministry', label: 'Służba' },
  { id: 'home_group', label: 'Grupa domowa' },
  { id: 'role', label: 'Rola' },
  { id: 'custom_email', label: 'Wybrane osoby' },
];
const SMS_GROUPS: Group[] = [...GROUPS, { id: 'custom_phone', label: 'Numery' }];

const SegmentRow = ({
  label,
  count,
  description,
  checked,
  excluded,
  onToggle,
  onExclude,
  last,
}: {
  label: string;
  count?: number;
  description?: string;
  checked: boolean;
  excluded?: boolean;
  onToggle: () => void;
  onExclude?: () => void;
  last?: boolean;
}) => (
  <View
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderBottomWidth: last ? 0 : 1,
      borderBottomColor: B.line,
    }}
  >
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      className="active:opacity-70"
      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 8,
          borderWidth: checked ? 0 : 1.5,
          borderColor: B.fieldBorder,
          backgroundColor: checked ? B.ink : B.card,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked ? <Check size={15} color="#FFFFFF" strokeWidth={3} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={2} style={{ fontSize: 15, color: excluded ? B.danger : B.ink, fontFamily: F.semibold }}>
          {label}
          {count != null ? <Text style={{ fontSize: 13, color: B.ink4, fontFamily: F.medium }}>{`  ${count}`}</Text> : null}
        </Text>
        {excluded ? (
          <Text style={{ fontSize: 12, color: B.danger, fontFamily: F.medium, marginTop: 1 }}>Wykluczona z wysyłki</Text>
        ) : description ? (
          <Text style={{ fontSize: 12, color: B.ink4, fontFamily: F.medium, marginTop: 1 }}>{description}</Text>
        ) : null}
      </View>
    </Pressable>
    {onExclude ? (
      <Pressable
        onPress={onExclude}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={excluded ? `Cofnij wykluczenie: ${label}` : `Wyklucz: ${label}`}
        className="active:opacity-60"
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: excluded ? B.dangerBg : B.paper,
        }}
      >
        <Minus size={16} color={excluded ? B.danger : B.ink3} strokeWidth={2.4} />
      </Pressable>
    ) : null}
  </View>
);

const RemovableChip = ({ label, onRemove }: { label: string; onRemove: () => void }) => (
  <Pressable
    onPress={onRemove}
    accessibilityRole="button"
    accessibilityLabel={`Usuń ${label}`}
    className="active:opacity-70"
    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 12, paddingRight: 9, paddingVertical: 7, borderRadius: 999, backgroundColor: B.kurkumaSoft }}
  >
    <Text numberOfLines={1} style={{ maxWidth: 220, fontSize: 13, color: B.goldDeep, fontFamily: F.semibold }}>
      {label}
    </Text>
    <X size={14} color={B.goldDeep} />
  </Pressable>
);

const Empty = ({ children }: { children: string }) => (
  <Text style={{ textAlign: 'center', paddingVertical: 22, fontSize: 14, color: B.ink4, fontFamily: F.medium }}>{children}</Text>
);

export const RecipientSheet = ({
  visible,
  onClose,
  kind,
  segments,
  onChange,
  source,
  loading,
}: {
  visible: boolean;
  onClose: () => void;
  kind: CampaignKind;
  segments: Segment[];
  onChange: (next: Segment[]) => void;
  source: RecipientsSource;
  loading: boolean;
}) => {
  const [group, setGroup] = useState<SegmentType>('all');
  const [search, setSearch] = useState('');
  const [phonesInput, setPhonesInput] = useState('');

  const recipients = useMemo(() => resolveSegments(source, segments), [source, segments]);
  const withPhone = useMemo(() => recipients.filter(hasValidPhone), [recipients]);
  const count = kind === 'sms' ? withPhone.length : recipients.length;
  const withoutPhone = recipients.length - withPhone.length;
  const results = useMemo(() => searchUsers(source, search), [source, search]);
  const customEmails = customEmailsOf(segments);
  const customPhones = customPhonesOf(segments);
  const nameByEmail = useMemo(() => {
    const m = new Map<string, string>();
    source.allUsers.forEach((u) => {
      if (u.email) m.set(u.email, u.full_name || u.email);
    });
    return m;
  }, [source]);

  const toggle = (type: SegmentType, id: string | null, name: string, exclude = false) =>
    onChange(toggleSegment(segments, type, id, name, exclude));

  const addPhones = () => {
    const { valid, invalid } = parsePhones(phonesInput);
    if (!valid.length) {
      Alert.alert('Brak poprawnych numerów', `Niepoprawne: ${invalid.join(', ')}`);
      return;
    }
    const set = new Set(customPhones);
    valid.forEach((p) => set.add(p));
    onChange(setCustomPhones(segments, Array.from(set)));
    setPhonesInput('');
    if (invalid.length) Alert.alert('Pominięto niepoprawne numery', invalid.join(', '));
  };

  const groups = kind === 'sms' ? SMS_GROUPS : GROUPS;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Odbiorcy"
      eyebrow={kind === 'sms' ? 'Kampania SMS' : 'Kampania push'}
      footer={<PrimaryButton label={`Gotowe · ${count} ${recipientsWord(count)}`} onPress={onClose} />}
    >
      {/* Podsumowanie */}
      <View style={{ borderRadius: 20, backgroundColor: B.ink, padding: 16, marginTop: 4 }}>
        <Text style={{ fontSize: 30, color: B.onDark, fontFamily: F.bold, letterSpacing: -0.8 }}>{loading ? '…' : count}</Text>
        <Text style={{ fontSize: 13, color: B.onDarkMuted, fontFamily: F.medium }}>
          {kind === 'sms' ? 'odbiorców z numerem (po rezygnacjach)' : 'odbiorców (bez duplikatów i rezygnacji)'}
        </Text>
        {kind === 'sms' && withoutPhone > 0 ? (
          <Text style={{ marginTop: 8, fontSize: 12, color: B.kurkuma, fontFamily: F.semibold }}>
            {withoutPhone} bez numeru — zostaną pominięci
          </Text>
        ) : null}
        {source.unsubscribed.length > 0 ? (
          <Text style={{ marginTop: 4, fontSize: 12, color: B.onDarkMuted, fontFamily: F.medium }}>
            {kind === 'sms'
              ? `${source.unsubscribed.length} z rezygnacją z SMS`
              : `${source.unsubscribed.length} z wyłączonymi powiadomieniami push`}
          </Text>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginTop: 14, marginHorizontal: -20 }}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
      >
        {groups.map((g) => (
          <Chip key={g.id} label={g.label} on={group === g.id} onPress={() => setGroup(g.id)} />
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={B.ink} style={{ marginTop: 28 }} />
      ) : (
        <View style={{ marginTop: 14, borderRadius: 20, backgroundColor: B.card, overflow: 'hidden' }}>
          {group === 'all' ? (
            <SegmentRow
              label={`Wszyscy aktywni (${totalActive(source)})`}
              description={
                kind === 'sms'
                  ? 'Każdy użytkownik z włączonym SMS i zgodą marketingową.'
                  : 'Każdy użytkownik z włączonymi powiadomieniami push.'
              }
              checked={isSelected(segments, 'all', null)}
              onToggle={() => toggle('all', null, 'Wszyscy aktywni')}
              last
            />
          ) : null}

          {group === 'campus' ? (
            source.campuses.length === 0 ? (
              <Empty>Brak skonfigurowanych kampusów.</Empty>
            ) : (
              source.campuses.map((c, i) => {
                const id = String(c.id);
                return (
                  <SegmentRow
                    key={id}
                    label={c.name}
                    count={source.allUsers.filter((u) => String(u.campus_id) === id).length}
                    checked={isSelected(segments, 'campus', id)}
                    excluded={isSelected(segments, 'campus', id, true)}
                    onToggle={() => toggle('campus', id, c.name)}
                    onExclude={() => toggle('campus', id, c.name, true)}
                    last={i === source.campuses.length - 1}
                  />
                );
              })
            )
          ) : null}

          {group === 'ministry' ? (
            source.ministries.length === 0 ? (
              <Empty>Brak danych o służbach.</Empty>
            ) : (
              source.ministries.map((m, i) => (
                <SegmentRow
                  key={m.id}
                  label={m.name}
                  count={m.members.length}
                  checked={isSelected(segments, 'ministry', m.id)}
                  excluded={isSelected(segments, 'ministry', m.id, true)}
                  onToggle={() => toggle('ministry', m.id, m.name)}
                  onExclude={() => toggle('ministry', m.id, m.name, true)}
                  last={i === source.ministries.length - 1}
                />
              ))
            )
          ) : null}

          {group === 'home_group' ? (
            source.homeGroups.length === 0 ? (
              <Empty>Brak grup domowych.</Empty>
            ) : (
              source.homeGroups.map((g, i) => (
                <SegmentRow
                  key={g.id}
                  label={g.name}
                  count={g.members.length}
                  checked={isSelected(segments, 'home_group', g.id)}
                  excluded={isSelected(segments, 'home_group', g.id, true)}
                  onToggle={() => toggle('home_group', g.id, g.name)}
                  onExclude={() => toggle('home_group', g.id, g.name, true)}
                  last={i === source.homeGroups.length - 1}
                />
              ))
            )
          ) : null}

          {group === 'role'
            ? ROLE_OPTIONS.map((r, i) => (
                <SegmentRow
                  key={r.id}
                  label={r.name}
                  count={source.allUsers.filter((u) => u.role === r.id).length}
                  checked={isSelected(segments, 'role', r.id)}
                  excluded={isSelected(segments, 'role', r.id, true)}
                  onToggle={() => toggle('role', r.id, r.name)}
                  onExclude={() => toggle('role', r.id, r.name, true)}
                  last={i === ROLE_OPTIONS.length - 1}
                />
              ))
            : null}

          {group === 'custom_email' ? (
            <View style={{ padding: 14 }}>
              <FormInput
                value={search}
                onChangeText={setSearch}
                placeholder="Szukaj po imieniu lub e-mailu…"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {search.length > 0 && search.length < 2 ? <Text style={{ marginTop: 8, fontSize: 12, color: B.ink4, fontFamily: F.medium }}>Wpisz co najmniej 2 znaki.</Text> : null}
              {search.length >= 2 && results.length === 0 ? <Empty>Nikogo nie znaleziono.</Empty> : null}
              {results.map((u, idx) => {
                const added = !!u.email && customEmails.includes(u.email);
                return (
                  <Pressable
                    key={u.email ?? `r${idx}`}
                    onPress={() => {
                      if (!u.email || added) return;
                      onChange(addCustomEmail(segments, u.email));
                      setSearch('');
                    }}
                    disabled={added}
                    className="active:opacity-70"
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: B.line }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ fontSize: 15, color: B.ink, fontFamily: F.semibold }}>
                        {u.full_name || u.email}
                      </Text>
                      <Text numberOfLines={1} style={{ fontSize: 12, color: B.ink4, fontFamily: F.medium }}>
                        {u.email}
                        {kind === 'sms' ? (u.phone ? ` · ${u.phone}` : ' · brak numeru') : ''}
                      </Text>
                    </View>
                    {added ? <Check size={18} color={B.okFg} /> : <Plus size={18} color={B.ink} />}
                  </Pressable>
                );
              })}
              {customEmails.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
                  {customEmails.map((email) => (
                    <RemovableChip
                      key={email}
                      label={nameByEmail.get(email) ?? email}
                      onRemove={() => onChange(removeCustomEmail(segments, email))}
                    />
                  ))}
                </View>
              ) : search.length === 0 ? (
                <Text style={{ marginTop: 10, fontSize: 12, color: B.ink4, fontFamily: F.medium }}>
                  Dodane osoby trafią do wysyłki niezależnie od innych grup.
                </Text>
              ) : null}
            </View>
          ) : null}

          {group === 'custom_phone' ? (
            <View style={{ padding: 14 }}>
              <FormInput
                value={phonesInput}
                onChangeText={setPhonesInput}
                multiline
                placeholder={'500123456\n+48 600 700 800'}
                keyboardType="phone-pad"
              />
              <Text style={{ marginTop: 8, fontSize: 12, lineHeight: 17, color: B.ink4, fontFamily: F.medium }}>
                Wklej numery po przecinku, średniku lub w nowych liniach. Zapiszemy je w formacie 48xxxxxxxxx (Polska).
              </Text>
              <View style={{ marginTop: 10 }}>
                <PrimaryButton label="Dodaj numery" tone="ink" onPress={addPhones} disabled={!phonesInput.trim()} />
              </View>
              {customPhones.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
                  {customPhones.map((p) => (
                    <RemovableChip
                      key={p}
                      label={`+${p}`}
                      onRemove={() => onChange(setCustomPhones(segments, customPhones.filter((x) => x !== p)))}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      )}
    </Sheet>
  );
};
