import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { ArrowDownToLine, Bookmark, Check, Copy, Trash2, Wand2 } from 'lucide-react-native';
import { B } from '../../../components/ui/brand';
import { FormInput, FormLabel, PrimaryButton, Sheet } from '../../../components/ui/Sheet';
import { FONT as F } from '../../../lib/fonts';
import { showError } from '../../../lib/errors';
import { toast } from '../../../lib/toast';
import { csvNames, unavailableOn, useApplyLineup, type GrafikEvent, type GrafikMember, type GrafikRoleDef, type TeamBlockout } from '../grafik';
import { todayYmd } from '../../schedule/assignments';
import {
  fillEmptyRoles,
  isEmptyLineup,
  lineupOf,
  previousLineup,
  proposeLineups,
  teamHistory,
  type HistoryEntry,
  type Lineup,
} from '../../schedule/lineup';
import { useDeleteTemplate, useSaveTemplate, useScheduleTemplates, type ScheduleTemplate } from '../../schedule/templates';

// Narzędzia obsady grafiku — parytet z webem (ScheduleTab: menu ⋯ wydarzenia i „Zaproponuj obsadę”):
//   • Zaproponuj — propozycja obsady pustych ról (rotacja, nieobecności, kto zwykle pełni rolę),
//   • Kopiuj z poprzedniego — skład z ostatniego wcześniejszego wydarzenia (najpierw o tym samym tytule),
//   • Zapisane składy — szablony (schedule_templates): wstaw / zapisz obecny / usuń.
// Wszystko wstawia TYLKO do pustych ról, pomija nieobecnych i osoby spoza roli/zespołu;
// zapis jednym patchem przez event-assignments-patch (useApplyLineup). Nic nie wysyła powiadomień.

const shortDate = (ymd: string) => (ymd ? `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}` : '');
const eventLabel = (ev: GrafikEvent) => `${shortDate(ev.date)} · ${ev.title || 'Wydarzenie'}`;

interface ProposalView {
  eventId: string;
  label: string;
  picks: { roleKey: string; roleLabel: string; names: string[]; meta: string }[];
  missing: string[];
}

export const useGrafikTools = ({
  teamKey,
  events,
  roles,
  members,
  blockouts,
  me,
  enabled,
}: {
  teamKey: string;
  events: GrafikEvent[];
  roles: GrafikRoleDef[];
  members: GrafikMember[];
  blockouts: TeamBlockout[];
  me: { email: string | null; name: string | null };
  enabled: boolean;
}) => {
  const apply = useApplyLineup(teamKey);
  const templatesQ = useScheduleTemplates(teamKey, enabled);
  const templates: ScheduleTemplate[] | null = templatesQ.data ?? null;
  const [templatesFor, setTemplatesFor] = useState<string | null>(null);
  const [proposal, setProposal] = useState<ProposalView[] | null>(null);

  const roleKeys = useMemo(() => roles.map((r) => r.key), [roles]);
  const history: HistoryEntry[] = useMemo(() => teamHistory(events, roleKeys), [events, roleKeys]);
  const labelOf = (key: string) => roles.find((r) => r.key === key)?.label ?? key;
  const teamNames = useMemo(() => new Set(members.map((m) => m.name)), [members]);

  // Nieobecni w dniu wydarzenia: zaznaczeni w grafiku + zgłoszone nieobecności (jak rowContext na webie).
  const blockedOf = (ev: GrafikEvent) => {
    const blocked = new Map<string, string>();
    for (const n of csvNames(ev.team.absencja)) blocked.set(n, 'nieobecność');
    for (const n of unavailableOn(blockouts, ev.date)) if (!blocked.has(n)) blocked.set(n, 'zgłoszona nieobecność');
    return blocked;
  };
  // Osoby przypisane do roli w zespole (Set) albo null — rola bez przypisań = każdy z zespołu.
  const roleMembers = (roleKey: string): Set<string> | null => {
    const role = roles.find((r) => r.key === roleKey);
    if (!role?.id) return null;
    const names = members.filter((m) => m.roleIds.includes(role.id!)).map((m) => m.name);
    return names.length ? new Set(names) : null;
  };

  const prevFor = (ev: GrafikEvent) => previousLineup(history, ev);

  // Wstawienie składu (poprzedni termin / szablon) do PUSTYCH ról, z pominięciem nieobecnych.
  const fillFrom = async (ev: GrafikEvent, source: Lineup): Promise<boolean> => {
    const { changes, skipped } = fillEmptyRoles(lineupOf(ev.team, roleKeys), source, {
      blocked: blockedOf(ev),
      allowedFor: roleMembers,
      teamNames,
    });
    let added = 0;
    if (Object.keys(changes).length) {
      try {
        added = (await apply.mutateAsync({ event: ev, changes, roles, members, me })).added;
      } catch (e) {
        showError('Nie udało się wstawić składu', e);
        return false;
      }
    }
    const absent = [...new Set(skipped.filter((x) => x.reason === 'absent').map((x) => x.name))];
    const other = [...new Set(skipped.filter((x) => x.reason !== 'absent').map((x) => x.name))];
    const parts: string[] = [];
    if (absent.length) parts.push(`Pominięto nieobecnych: ${absent.join(', ')}.`);
    if (other.length) parts.push(`Pominięto (spoza zespołu albo roli): ${other.join(', ')}.`);
    if (added) toast.success(`Wstawiono osób: ${added}.`, parts.join(' ') || 'Sprawdź grafik i kliknij „Powiadom”.');
    else toast.info(parts.length ? 'Nic nie wstawiono.' : 'Nic do wstawienia — te role są już obsadzone.', parts.join(' ') || undefined);
    return true;
  };

  const copyPrevious = (ev: GrafikEvent) => {
    const prev = prevFor(ev);
    if (!prev) return;
    const summary = Object.entries(prev.lineup)
      .map(([k, names]) => `${labelOf(k)}: ${names.join(', ')}`)
      .join('\n');
    Alert.alert(
      `Kopiować skład z ${shortDate(prev.date)}?`,
      `${prev.title ? `${prev.title}\n\n` : ''}${summary}\n\nSkład trafi tylko do pustych ról; nieobecni zostaną pominięci.`,
      [
        { text: 'Anuluj', style: 'cancel' },
        { text: 'Kopiuj', onPress: () => void fillFrom(ev, prev.lineup) },
      ],
    );
  };

  // Propozycja obsady (jedno wydarzenie albo kilka — tylko nadchodzące, tylko puste role).
  const openProposal = (evs: GrafikEvent[]) => {
    const today = todayYmd();
    const upcoming = evs.filter((ev) => ev.date >= today);
    if (!upcoming.length) {
      toast.info('Propozycje dotyczą tylko nadchodzących wydarzeń.');
      return;
    }
    const targets = upcoming.map((ev) => ({ id: ev.id, date: ev.date, lineup: lineupOf(ev.team, roleKeys), blocked: blockedOf(ev) }));
    // Nieaktywnych nie proponujemy (jak lista wyboru osób w apce).
    const inactive = new Set(members.filter((m) => m.active === false).map((m) => m.name));
    const rolesSpec = roles.map((r) => {
      const set = roleMembers(r.key);
      return { key: r.key, candidates: set ? [...set].filter((n) => !inactive.has(n)) : null };
    });
    const byId = new Map(upcoming.map((ev) => [ev.id, ev]));
    const result = proposeLineups({ targets, roles: rolesSpec, history })
      .filter((p) => p.picks.length || p.missing.length)
      .map((p) => ({
        eventId: p.eventId,
        label: eventLabel(byId.get(p.eventId)!),
        picks: p.picks.map((x) => {
          const first = x.info[0];
          const meta = first
            ? [first.lastServed ? `ostatnio ${shortDate(first.lastServed)}` : 'dawno nie służył(a)', `${first.monthCount}× w tym mies.`].join(' · ')
            : '';
          return { roleKey: x.roleKey, roleLabel: labelOf(x.roleKey), names: x.names, meta };
        }),
        missing: p.missing.map(labelOf),
      }));
    setProposal(result);
  };

  const applyProposal = async (selected: { eventId: string; changes: Lineup }[]) => {
    let added = 0;
    const failed: string[] = [];
    let lastError: unknown = null;
    for (const { eventId, changes } of selected) {
      const ev = events.find((e) => e.id === eventId);
      if (!ev) continue;
      try {
        added += (await apply.mutateAsync({ event: ev, changes, roles, members, me })).added;
      } catch (e) {
        failed.push(eventLabel(ev));
        lastError = e;
      }
    }
    if (failed.length) {
      showError(`Nie udało się wstawić: ${failed.join(', ')}`, lastError);
      return;
    }
    setProposal(null);
    if (added) toast.success(`Wstawiono osób: ${added}.`, 'Sprawdź grafik i kliknij „Powiadom”.');
  };

  const templatesEvent = templatesFor ? events.find((e) => e.id === templatesFor) ?? null : null;

  const sheets: ReactNode = (
    <>
      <ProposalSheet proposals={proposal} onClose={() => setProposal(null)} onApply={applyProposal} />
      <TemplatesSheet
        teamKey={teamKey}
        event={templatesEvent}
        templates={templates ?? []}
        currentLineup={templatesEvent ? lineupOf(templatesEvent.team, roleKeys) : {}}
        labelOf={labelOf}
        onClose={() => setTemplatesFor(null)}
        onInsert={async (tpl) => {
          if (!templatesEvent) return;
          // Alert/toast pod arkuszem iOS — zamykamy przed wstawieniem (błąd i tak pokaże Alert).
          setTemplatesFor(null);
          await fillFrom(templatesEvent, tpl.lineup);
        }}
      />
    </>
  );

  return {
    available: enabled,
    templates,
    prevFor,
    copyPrevious,
    openProposal,
    openTemplates: (ev: GrafikEvent) => setTemplatesFor(ev.id),
    busy: apply.isPending,
    sheets,
  };
};

// Wiersz miękkich pigułek z narzędziami obsady pod kartą wydarzenia.
export const GrafikToolsRow = ({
  ev,
  tools,
}: {
  ev: GrafikEvent;
  tools: ReturnType<typeof useGrafikTools>;
}) => {
  const prev = tools.prevFor(ev);
  const items: { key: string; label: string; Icon: typeof Wand2; onPress: () => void; disabled?: boolean }[] = [
    { key: 'propose', label: 'Zaproponuj', Icon: Wand2, onPress: () => tools.openProposal([ev]) },
    {
      key: 'copy',
      label: prev ? `Kopiuj z ${shortDate(prev.date)}` : 'Kopiuj z poprzedniego',
      Icon: Copy,
      onPress: () => tools.copyPrevious(ev),
      disabled: !prev,
    },
    ...(tools.templates
      ? [{ key: 'tpl', label: tools.templates.length ? `Składy (${tools.templates.length})` : 'Składy', Icon: Bookmark, onPress: () => tools.openTemplates(ev) }]
      : []),
  ];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: B.line }}>
      {items.map(({ key, label, Icon, onPress, disabled }) => (
        <Pressable
          key={key}
          onPress={onPress}
          disabled={disabled || tools.busy}
          accessibilityRole="button"
          accessibilityLabel={key === 'tpl' ? 'Zapisane składy' : label}
          accessibilityState={{ disabled: !!disabled || tools.busy }}
          className="active:opacity-70"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingHorizontal: 11,
            paddingVertical: 7,
            borderRadius: 999,
            backgroundColor: B.paper,
            opacity: disabled ? 0.45 : 1,
          }}
        >
          <Icon size={13} color={B.ink2} />
          <Text style={{ fontSize: 12, color: B.ink, fontFamily: F.semibold }}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
};

// Podgląd propozycji — nic nie zapisuje, dopóki lider nie stuknie „Wstaw”. Każdą rolę można odznaczyć.
const ProposalSheet = ({
  proposals,
  onClose,
  onApply,
}: {
  proposals: ProposalView[] | null;
  onClose: () => void;
  onApply: (selected: { eventId: string; changes: Lineup }[]) => Promise<void>;
}) => {
  const allKeys = useMemo(() => (proposals ?? []).flatMap((p) => p.picks.map((x) => `${p.eventId}|${x.roleKey}`)), [proposals]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  useEffect(() => setChecked(new Set(allKeys)), [allKeys]);

  const toggle = (k: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const apply = () =>
    onApply(
      (proposals ?? [])
        .map((p) => ({
          eventId: p.eventId,
          changes: Object.fromEntries(p.picks.filter((x) => checked.has(`${p.eventId}|${x.roleKey}`)).map((x) => [x.roleKey, x.names])),
        }))
        .filter((s) => Object.keys(s.changes).length),
    );

  const hasPicks = allKeys.length > 0;
  return (
    <Sheet
      visible={!!proposals}
      title="Propozycja obsady"
      subtitle="Uwzględnia nieobecności, rotację (kto dawno nie służył) i to, kto zwykle pełni daną rolę."
      onClose={onClose}
      footer={hasPicks ? <PrimaryButton label={`Wstaw zaznaczone (${checked.size})`} disabled={!checked.size} onPress={apply} /> : null}
    >
      {!hasPicks ? (
        <View style={{ marginTop: 12, padding: 18, borderRadius: 20, backgroundColor: B.card, gap: 6 }}>
          <Text style={{ fontSize: 15, color: B.ink, fontFamily: F.bold }}>Brak propozycji</Text>
          <Text style={{ fontSize: 13, lineHeight: 18, color: B.ink3, fontFamily: F.medium }}>
            Wszystkie role są już obsadzone albo nie ma kogo zaproponować (nikt jeszcze nie pełnił tych ról).
          </Text>
        </View>
      ) : null}
      {hasPicks
        ? (proposals ?? []).map((p, idx) => (
            <View key={p.eventId}>
              <FormLabel first={idx === 0}>{p.label}</FormLabel>
              {p.picks.length ? (
                <View style={{ borderRadius: 20, backgroundColor: B.card, overflow: 'hidden' }}>
                  {p.picks.map((x, i) => {
                    const k = `${p.eventId}|${x.roleKey}`;
                    const on = checked.has(k);
                    return (
                      <Pressable
                        key={k}
                        onPress={() => toggle(k)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        accessibilityLabel={`${x.roleLabel}: ${x.names.join(', ')}`}
                        className="active:opacity-70"
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderTopColor: B.line }}
                      >
                        <View
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 7,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: on ? B.ink : B.paper2,
                          }}
                        >
                          {on ? <Check size={14} color="#FFFFFF" strokeWidth={3} /> : null}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 12, color: B.ink3, fontFamily: F.semibold }}>{x.roleLabel}</Text>
                          <Text style={{ marginTop: 1, fontSize: 15, color: B.ink, fontFamily: F.semibold }}>{x.names.join(', ')}</Text>
                          {x.meta ? <Text style={{ marginTop: 1, fontSize: 12, color: B.ink4, fontFamily: F.medium }}>{x.meta}</Text> : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
              {p.missing.length ? (
                <Text style={{ marginTop: 6, marginLeft: 2, fontSize: 12, lineHeight: 17, color: B.ink4, fontFamily: F.medium }}>
                  Bez propozycji: {p.missing.join(', ')}
                </Text>
              ) : null}
            </View>
          ))
        : null}
      {hasPicks ? (
        <Text style={{ marginTop: 16, fontSize: 12, lineHeight: 17, color: B.ink4, fontFamily: F.medium }}>
          Nic nie zostanie wysłane — po wstawieniu sprawdź grafik i stuknij „Powiadom”.
        </Text>
      ) : null}
    </Sheet>
  );
};

// Zapisane składy służby: wstaw do wydarzenia (tylko do pustych ról), zapisz obecny skład, usuń.
const TemplatesSheet = ({
  teamKey,
  event,
  templates,
  currentLineup,
  labelOf,
  onClose,
  onInsert,
}: {
  teamKey: string;
  event: GrafikEvent | null;
  templates: ScheduleTemplate[];
  currentLineup: Lineup;
  labelOf: (key: string) => string;
  onClose: () => void;
  onInsert: (tpl: ScheduleTemplate) => Promise<void>;
}) => {
  const save = useSaveTemplate(teamKey);
  const del = useDeleteTemplate(teamKey);
  const [name, setName] = useState('');
  const canSave = !isEmptyLineup(currentLineup);

  useEffect(() => {
    if (event) setName(`Skład z ${shortDate(event.date)}`);
  }, [event?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveCurrent = async () => {
    const n = name.trim().slice(0, 80);
    if (!n) return;
    try {
      await save.mutateAsync({ name: n, lineup: currentLineup });
      toast.success(`Zapisano skład „${n}”.`);
      setName('');
    } catch (e) {
      showError('Nie udało się zapisać składu', e);
    }
  };

  const remove = (tpl: ScheduleTemplate) =>
    Alert.alert(`Usunąć zapisany skład „${tpl.name}”?`, 'Tej operacji nie można cofnąć.', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: () => del.mutate(tpl.id, { onError: (e: unknown) => showError('Nie udało się usunąć składu', e) }),
      },
    ]);

  return (
    <Sheet
      visible={!!event}
      title="Zapisane składy"
      eyebrow={event ? eventLabel(event) : null}
      subtitle="Skład trafi tylko do pustych ról; nieobecni zostaną pominięci."
      onClose={onClose}
    >
      {templates.length === 0 ? (
        <View style={{ marginTop: 12, padding: 18, borderRadius: 20, backgroundColor: B.card, gap: 6 }}>
          <Text style={{ fontSize: 15, color: B.ink, fontFamily: F.bold }}>Brak zapisanych składów</Text>
          <Text style={{ fontSize: 13, lineHeight: 18, color: B.ink3, fontFamily: F.medium }}>
            Ułóż skład na jedną niedzielę i zapisz go — potem wstawisz go jednym stuknięciem.
          </Text>
        </View>
      ) : (
        <>
          <FormLabel first>Wstaw skład</FormLabel>
          <View style={{ borderRadius: 20, backgroundColor: B.card, overflow: 'hidden' }}>
            {templates.map((tpl, i) => {
              const entries = Object.entries(tpl.lineup).filter(([, n]) => n?.length);
              return (
                <View
                  key={tpl.id}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, paddingRight: 8, paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderTopColor: B.line }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, color: B.ink, fontFamily: F.semibold }}>{tpl.name}</Text>
                    <Text numberOfLines={3} style={{ marginTop: 2, fontSize: 12, lineHeight: 16, color: B.ink3, fontFamily: F.medium }}>
                      {entries.map(([k, n]) => `${labelOf(k)}: ${n.join(', ')}`).join(' · ') || 'Pusty skład'}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => void onInsert(tpl)}
                    accessibilityRole="button"
                    accessibilityLabel={`Wstaw skład ${tpl.name}`}
                    className="active:opacity-70"
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: B.kurkuma }}
                  >
                    <ArrowDownToLine size={14} color={B.ink} />
                    <Text style={{ fontSize: 13, color: B.ink, fontFamily: F.bold }}>Wstaw</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => remove(tpl)}
                    disabled={del.isPending}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={`Usuń skład ${tpl.name}`}
                    className="active:opacity-60"
                    style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Trash2 size={16} color={B.ink4} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        </>
      )}

      <FormLabel>Zapisz obecny skład</FormLabel>
      {canSave ? (
        <>
          <Text style={{ marginBottom: 8, marginLeft: 2, fontSize: 12, lineHeight: 17, color: B.ink3, fontFamily: F.medium }}>
            {Object.entries(currentLineup)
              .map(([k, n]) => `${labelOf(k)}: ${n.join(', ')}`)
              .join(' · ')}
          </Text>
          <FormInput value={name} onChangeText={setName} placeholder="Nazwa, np. „Skład A”, „Niedziela z perkusją”" maxLength={80} returnKeyType="done" />
          <View style={{ marginTop: 12 }}>
            <PrimaryButton label="Zapisz jako skład" tone="ink" disabled={!name.trim()} onPress={saveCurrent} />
          </View>
        </>
      ) : (
        <Text style={{ marginLeft: 2, fontSize: 13, lineHeight: 18, color: B.ink4, fontFamily: F.medium }}>
          W tym wydarzeniu nie ma jeszcze składu do zapisania.
        </Text>
      )}
    </Sheet>
  );
};
