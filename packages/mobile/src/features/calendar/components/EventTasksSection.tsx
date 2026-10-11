import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CheckSquare, ListPlus, Plus, Settings2, Trash2 } from 'lucide-react-native';
import { B, fieldStyle } from '../../../components/ui/brand';
import { FONT as F } from '../../../lib/fonts';
import { Chip, FormLabel, FormInput, PrimaryButton, Sheet } from '../../../components/ui/Sheet';
import { DateField } from '../../../components/ui/DateField';
import { showError } from '../../../lib/errors';
import { toast } from '../../../lib/toast';
import { usePermissions } from '../../../lib/permissions';
import { useCalendarLabel } from '../meta';
import { openTask } from '../../tasks/navigation';
import { dueLabel, isOverdueYmd, softBg } from '../../tasks/board';
import { usePeopleDirectory, type Person } from '../../messenger/start';
import { ensureTasksBoardId } from '../../teams/boardItems';
import {
  createEventTasks,
  eventTasksModule,
  eventTasksSource,
  normalizeTemplates,
  saveEventTaskTemplates,
  templateRows,
  useEventTaskBoard,
  useEventTasks,
  useInvalidateEventTasks,
  type EventTaskRow,
  type TaskTemplate,
} from '../event-tasks';

// Zakładka „Zadania” na ekranie wydarzenia (jak web EventTasksTab): elementy tablic z event_id,
// „Dodaj zadanie” (termin = data wydarzenia) i „Dodaj z szablonu”; szablon edytuje, kto może
// zmieniać tablicę.
export function EventTasksSection({
  eventId,
  eventDate,
  moduleKey,
  me,
}: {
  eventId: number;
  eventDate: string | null;
  moduleKey: string | null;
  me: { email: string | null; name: string | null };
}) {
  const router = useRouter();
  const perms = usePermissions();
  const calendarLabel = useCalendarLabel();
  const moduleLabel = (key: string | null) => (key ? calendarLabel(key) : null);
  const tasks = useEventTasks(eventId, moduleLabel);
  const target = useEventTaskBoard(moduleKey);
  const invalidate = useInvalidateEventTasks();
  const scopeModule = eventTasksModule(moduleKey);
  const canCreate = perms.canModule(scopeModule, 'board_items', 'create');
  const canEditTemplates = perms.canModule(scopeModule, 'boards', 'update');
  const templates = normalizeTemplates(target.data?.board.settings?.event_task_templates);
  const [sheet, setSheet] = useState<'add' | 'templates' | null>(null);
  const [busy, setBusy] = useState(false);
  const label = moduleKey && moduleKey !== 'general' ? moduleLabel(moduleKey) : null;
  const boardTitle = label ? `Zadania — ${label}` : 'Zadania';

  const create = async (rows: Parameters<typeof createEventTasks>[3]) => {
    setBusy(true);
    try {
      const n = await createEventTasks(moduleKey, boardTitle, eventId, rows, me);
      toast.success(n > 1 ? `Dodano zadania: ${n}` : 'Dodano zadanie');
      invalidate(eventId, moduleKey);
      return true;
    } catch (e) {
      showError('Nie udało się dodać zadania', e);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const rows: EventTaskRow[] = tasks.data ?? [];
  const today = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const pill = (dark: boolean) => ({
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: dark ? B.ink : B.card,
  });

  return (
    <View style={{ gap: 10 }}>
      {canCreate || canEditTemplates ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {canCreate ? (
            <Pressable onPress={() => setSheet('add')} accessibilityRole="button" className="active:opacity-70" style={pill(true)}>
              <Plus size={14} color={B.onDark} />
              <Text style={{ fontSize: 13, color: B.onDark, fontFamily: F.bold }}>Dodaj zadanie</Text>
            </Pressable>
          ) : null}
          {canCreate && templates.length > 0 ? (
            <Pressable
              onPress={() => void create(templateRows(templates, eventDate))}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`Dodaj z szablonu: ${templates.length} zadań`}
              className="active:opacity-70"
              style={pill(false)}
            >
              {busy ? <ActivityIndicator size="small" color={B.ink} /> : <ListPlus size={14} color={B.ink} />}
              <Text style={{ fontSize: 13, color: B.ink, fontFamily: F.semibold }}>Dodaj z szablonu</Text>
            </Pressable>
          ) : null}
          {canEditTemplates ? (
            <Pressable onPress={() => setSheet('templates')} accessibilityRole="button" className="active:opacity-70" style={pill(false)}>
              <Settings2 size={14} color={B.ink} />
              <Text style={{ fontSize: 13, color: B.ink, fontFamily: F.semibold }}>Szablon</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={{ backgroundColor: B.card, borderRadius: 22, paddingVertical: 4 }}>
        {tasks.isLoading ? (
          <ActivityIndicator color={B.ink} style={{ marginVertical: 18 }} />
        ) : tasks.isError ? (
          <Pressable onPress={() => tasks.refetch()} style={{ padding: 16 }}>
            <Text style={{ fontSize: 14, color: B.ink2, fontFamily: F.medium }}>Nie udało się wczytać zadań. Stuknij, aby spróbować ponownie.</Text>
          </Pressable>
        ) : rows.length === 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 }}>
            <CheckSquare size={17} color={B.ink3} />
            <Text style={{ flex: 1, fontSize: 14, color: B.ink3, fontFamily: F.medium }}>
              {canCreate ? 'Brak zadań. Dodaj zadanie albo utwórz je z szablonu.' : 'Brak zadań przy tym wydarzeniu.'}
            </Text>
          </View>
        ) : (
          rows.map((r, i) => {
            const overdue = !r.done && isOverdueYmd(r.due, today);
            return (
              <Pressable
                key={r.id}
                onPress={() => openTask(router, { itemId: r.id, boardId: r.boardId })}
                accessibilityRole="button"
                className="active:opacity-70"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderTopColor: B.line }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    numberOfLines={2}
                    style={{ fontSize: 15, color: r.done ? B.ink4 : B.ink, fontFamily: F.semibold, textDecorationLine: r.done ? 'line-through' : 'none' }}
                  >
                    {r.name || 'Bez nazwy'}
                  </Text>
                  <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 12, color: overdue ? B.danger : B.ink3, fontFamily: overdue ? F.bold : F.medium }}>
                    {[r.boardName, r.due ? `${overdue ? 'Zaległe · ' : ''}${dueLabel(r.due)}` : null, r.people.map((p: { name: string }) => p.name).join(', ') || null]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                {r.status ? (
                  <View style={{ maxWidth: '38%', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: softBg(r.status.color) }}>
                    <Text numberOfLines={1} style={{ fontSize: 12, color: B.ink, fontFamily: F.semibold }}>{r.status.title}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })
        )}
      </View>
      {!eventDate && canCreate ? (
        <Text style={{ fontSize: 12, color: B.ink3, fontFamily: F.medium }}>Wydarzenie nie ma daty — zadania z szablonu powstaną bez terminu.</Text>
      ) : null}

      {sheet === 'add' ? (
        <AddTaskSheet defaultDue={eventDate} myEmail={me.email} onClose={() => setSheet(null)} onSave={(row) => create([row])} />
      ) : null}
      {sheet === 'templates' ? (
        <TemplatesSheet
          templates={templates}
          onClose={() => setSheet(null)}
          onSave={async (list) => {
            try {
              const boardId = target.data?.board.id ?? (await ensureTasksBoardId(eventTasksSource(moduleKey), boardTitle));
              await saveEventTaskTemplates(boardId, list);
              toast.success('Zapisano szablon');
              invalidate(eventId, moduleKey);
              return true;
            } catch (e) {
              showError('Nie udało się zapisać szablonu', e);
              return false;
            }
          }}
        />
      ) : null}
    </View>
  );
}

function AddTaskSheet({
  defaultDue,
  myEmail,
  onClose,
  onSave,
}: {
  defaultDue: string | null;
  myEmail: string | null;
  onClose: () => void;
  onSave: (row: { name: string; due: string | null; people: { email: string; name: string }[] }) => Promise<boolean>;
}) {
  const people = usePeopleDirectory(myEmail);
  const [name, setName] = useState('');
  const [due, setDue] = useState(defaultDue ?? '');
  const [person, setPerson] = useState<{ email: string; name: string } | null>(null);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matches = q
    ? ((people.data ?? []) as Person[]).filter((p) => p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)).slice(0, 5)
    : [];
  return (
    <Sheet
      visible
      title="Nowe zadanie"
      onClose={onClose}
      footer={
        <PrimaryButton
          label="Dodaj zadanie"
          disabled={!name.trim()}
          onPress={async () => {
            const ok = await onSave({ name: name.trim(), due: due || null, people: person ? [person] : [] });
            if (ok) onClose();
          }}
        />
      }
    >
      <FormLabel first>Nazwa</FormLabel>
      <FormInput value={name} onChangeText={setName} placeholder="Co jest do zrobienia?" autoFocus />
      <FormLabel>Termin</FormLabel>
      <DateField value={due} onChange={setDue} optional placeholder="Bez terminu" />
      <FormLabel>Osoba</FormLabel>
      {person ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <Chip label={`${person.name}  ×`} on onPress={() => setPerson(null)} />
        </View>
      ) : (
        <>
          <FormInput value={query} onChangeText={setQuery} placeholder="Szukaj osoby (opcjonalnie)" autoCorrect={false} />
          {matches.map((p) => (
            <Pressable
              key={p.email}
              onPress={() => {
                setPerson({ email: p.email, name: p.name });
                setQuery('');
              }}
              accessibilityRole="button"
              className="active:opacity-70"
              style={{ paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: B.line }}
            >
              <Text style={{ fontSize: 15, color: B.ink, fontFamily: F.semibold }}>{p.name}</Text>
              <Text style={{ fontSize: 12, color: B.ink3, fontFamily: F.medium }}>{p.email}</Text>
            </Pressable>
          ))}
        </>
      )}
    </Sheet>
  );
}

function TemplatesSheet({
  templates,
  onClose,
  onSave,
}: {
  templates: TaskTemplate[];
  onClose: () => void;
  onSave: (list: TaskTemplate[]) => Promise<boolean>;
}) {
  // Osoby z szablonu zostają przy swojej pozycji (edycję osób robi się na webie).
  const [rows, setRows] = useState(() => templates.map((t) => ({ ...t, offset: String(t.offset_days) })));
  const set = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  return (
    <Sheet
      visible
      title="Szablon zadań"
      subtitle="„Dodaj z szablonu” tworzy te zadania z terminem liczonym od daty wydarzenia."
      onClose={onClose}
      footer={
        <PrimaryButton
          label="Zapisz"
          onPress={async () => {
            const ok = await onSave(rows.map((r) => ({ name: r.name, offset_days: Number(r.offset) || 0, people: r.people })));
            if (ok) onClose();
          }}
        />
      }
    >
      {rows.length === 0 ? (
        <Text style={{ marginTop: 8, fontSize: 14, color: B.ink3, fontFamily: F.medium }}>Szablon jest pusty. Dodaj pierwsze zadanie.</Text>
      ) : null}
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <TextInput
            value={r.name}
            onChangeText={(v) => set(i, { name: v })}
            placeholder="np. Przygotować nagłośnienie"
            placeholderTextColor={B.ink4}
            accessibilityLabel={`Zadanie ${i + 1}`}
            style={[fieldStyle as object, { flex: 1 }]}
          />
          <TextInput
            value={r.offset}
            onChangeText={(v) => set(i, { offset: v.replace(/[^0-9-]/g, '') })}
            keyboardType="numbers-and-punctuation"
            accessibilityLabel={`Dni względem wydarzenia, zadanie ${i + 1}`}
            style={[fieldStyle as object, { width: 64, textAlign: 'center' }]}
          />
          <Pressable onPress={() => setRows((rs) => rs.filter((_, k) => k !== i))} hitSlop={8} accessibilityLabel="Usuń pozycję">
            <Trash2 size={17} color={B.ink3} />
          </Pressable>
        </View>
      ))}
      <Text style={{ marginTop: 10, fontSize: 12, color: B.ink3, fontFamily: F.medium }}>
        Dni względem wydarzenia: 0 = w dniu wydarzenia, -3 = trzy dni przed.
      </Text>
      <Pressable
        onPress={() => setRows((rs) => [...rs, { name: '', offset_days: 0, offset: '0', people: [] }])}
        accessibilityRole="button"
        className="active:opacity-70"
        style={{ marginTop: 12, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: B.card }}
      >
        <Plus size={14} color={B.ink} />
        <Text style={{ fontSize: 13, color: B.ink, fontFamily: F.semibold }}>Dodaj pozycję</Text>
      </Pressable>
    </Sheet>
  );
}
