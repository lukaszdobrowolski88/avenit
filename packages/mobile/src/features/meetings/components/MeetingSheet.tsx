import { useMemo, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { Mail, Phone, Search, Video, X } from "lucide-react-native";
import { Sheet, FormLabel, FormInput, Chip, PrimaryButton } from "../../../components/ui/Sheet";
import { DateField, TimeField } from "../../../components/ui/DateField";
import { B } from "../../../components/ui/brand";
import { FONT as F } from "../../../lib/fonts";
import { toast } from "../../../lib/toast";
import { friendlyError } from "../../../lib/errors";
import { usePeopleDirectory, type Person } from "../../messenger/start";
import { saveMeeting } from "../api";
import {
  DEFAULT_DURATION, DURATION_OPTIONS, MAX_GUESTS, defaultSlot, formFromMeeting, parseGuestInput, toStartsAt,
  validateMeetingForm, type Meeting,
} from "../logic";

const durationLabel = (min: number) => (min < 60 ? `${min} min` : min % 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min / 60} h`);

// „Zaplanuj spotkanie” (jak web MeetingModal): członkowie po koncie, goście po e-mailu.
export function MeetingSheet({
  visible,
  onClose,
  onSaved,
  myEmail,
  meeting = null,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: (m: Meeting) => void;
  myEmail: string | null;
  meeting?: Meeting | null;
}) {
  const editing = !!meeting;
  const initial = meeting ? formFromMeeting(meeting) : { title: "", description: "", ...defaultSlot(), duration: DEFAULT_DURATION, kind: "video" as const, guestsAutoAdmit: false };
  const [form, setForm] = useState(initial);
  const originalStart = meeting ? toStartsAt(initial.date, initial.time) : null;
  const people = usePeopleDirectory(myEmail);
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState<{ email: string; name: string }[]>(
    () => (meeting?.members ?? []).filter((m) => !m.organizer && m.email.toLowerCase() !== String(myEmail).toLowerCase()).map((m) => ({ email: m.email, name: m.name })),
  );
  const [guests, setGuests] = useState<{ email: string; name?: string }[]>(
    () => (meeting?.guests ?? []).filter((g) => g.email).map((g) => ({ email: g.email as string, name: g.name })),
  );
  const [guestText, setGuestText] = useState("");
  const [error, setError] = useState("");

  const byEmail = useMemo(() => new Map<string, Person>(((people.data ?? []) as Person[]).map((p) => [p.email.toLowerCase(), p] as [string, Person])), [people.data]);
  const chosen = new Set(members.map((m) => m.email.toLowerCase()));
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as Person[];
    return ((people.data ?? []) as Person[]).filter((p) => !chosen.has(p.email.toLowerCase()) && (p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))).slice(0, 6);
  }, [query, people.data, members]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const addMember = (p: { email: string; name: string }) => {
    setMembers((prev) => (prev.some((m) => m.email.toLowerCase() === p.email.toLowerCase()) ? prev : [...prev, p]));
    setGuests((prev) => prev.filter((g) => g.email.toLowerCase() !== p.email.toLowerCase()));
    setQuery("");
  };
  // Adres osoby z kontem → uczestnik po koncie (jak web).
  const addGuests = () => {
    const { emails, invalid } = parseGuestInput(guestText);
    if (invalid.length) { setError(`Nieprawidłowy adres e-mail: ${invalid[0]}`); return; }
    let next = [...guests];
    for (const e of emails) {
      if (e === String(myEmail).toLowerCase()) continue;
      const acc = byEmail.get(e);
      if (acc) { addMember({ email: acc.email, name: acc.name }); continue; }
      if (!next.some((g) => g.email === e)) next = [...next, { email: e }];
    }
    if (next.length > MAX_GUESTS) { setError(`Na spotkanie można zaprosić najwyżej ${MAX_GUESTS} gości`); return; }
    setGuests(next);
    setGuestText("");
    setError("");
  };

  const submit = async () => {
    if (guestText.trim()) { setError("Dotknij „Dodaj”, żeby zaprosić wpisane adresy, albo wyczyść pole."); return; }
    const problem = validateMeetingForm(form, { editing, originalStart });
    if (problem) { setError(problem); return; }
    setError("");
    try {
      const saved = await saveMeeting({
        title: form.title.trim(),
        description: form.description.trim(),
        starts_at: toStartsAt(form.date, form.time) as string,
        duration_min: form.duration,
        kind: form.kind,
        guests_auto_admit: form.guestsAutoAdmit,
        members: members.map((m) => m.email),
        guests: guests.map((g) => ({ email: g.email, ...(g.name ? { name: g.name } : {}) })),
      }, meeting?.id);
      toast.success(editing ? "Zapisano zmiany spotkania" : guests.length ? "Spotkanie zaplanowane. Zaproszenia wysłane." : "Spotkanie zaplanowane");
      onSaved(saved);
    } catch (e) {
      setError(friendlyError(e, "Nie udało się zapisać spotkania. Spróbuj ponownie."));
    }
  };

  const chip = { flexDirection: "row" as const, alignItems: "center" as const, gap: 6, paddingLeft: 10, paddingRight: 6, paddingVertical: 6, borderRadius: 999, backgroundColor: B.card };
  const durations = DURATION_OPTIONS.includes(form.duration) ? DURATION_OPTIONS : [...DURATION_OPTIONS, form.duration].sort((a, b) => a - b);

  return (
    <Sheet
      visible={visible}
      title={editing ? "Edytuj spotkanie" : "Zaplanuj spotkanie"}
      subtitle="Spotkanie online audio/wideo z czatem"
      onClose={onClose}
      footer={<PrimaryButton label={editing ? "Zapisz zmiany" : "Zaplanuj spotkanie"} onPress={submit} />}
    >
      <FormLabel first>Nazwa</FormLabel>
      <FormInput value={form.title} onChangeText={(v) => set("title", v)} placeholder="np. Spotkanie liderów" maxLength={120} />

      <FormLabel>Dzień i godzina</FormLabel>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}><DateField value={form.date} onChange={(v) => set("date", v)} /></View>
        <View style={{ width: 120 }}><TimeField value={form.time} onChange={(v) => set("time", v)} title="Początek" /></View>
      </View>

      <FormLabel>Czas trwania</FormLabel>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {durations.map((d) => <Chip key={d} label={durationLabel(d)} on={form.duration === d} onPress={() => set("duration", d)} />)}
      </View>

      <FormLabel>Rodzaj</FormLabel>
      <View style={{ flexDirection: "row", gap: 6 }}>
        <Chip label="Wideo" on={form.kind === "video"} onPress={() => set("kind", "video")} />
        <Chip label="Tylko głos" on={form.kind === "audio"} onPress={() => set("kind", "audio")} />
      </View>

      <FormLabel>Uczestnicy z kościoła</FormLabel>
      <Text style={{ fontSize: 12, color: B.ink3, fontFamily: F.medium, marginBottom: 8 }}>Dostaną powiadomienie, a spotkanie pojawi się w ich Komunikatorze.</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Search size={16} color={B.ink3} />
        <View style={{ flex: 1 }}><FormInput value={query} onChangeText={setQuery} placeholder="Szukaj osób…" autoCorrect={false} /></View>
      </View>
      {results.map((p: Person) => (
        <Pressable key={p.email} onPress={() => addMember(p)} accessibilityRole="button" className="active:opacity-70" style={{ paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: B.line }}>
          <Text style={{ fontSize: 15, color: B.ink, fontFamily: F.semibold }}>{p.name}</Text>
          <Text style={{ fontSize: 12, color: B.ink3, fontFamily: F.medium }}>{p.email}</Text>
        </Pressable>
      ))}
      {members.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {members.map((m) => (
            <View key={m.email} style={chip}>
              <Text style={{ fontSize: 13, color: B.ink, fontFamily: F.medium }}>{m.name}</Text>
              <Pressable onPress={() => setMembers((prev) => prev.filter((x) => x.email !== m.email))} hitSlop={8} accessibilityLabel={`Usuń z zaproszonych: ${m.name}`}>
                <X size={13} color={B.ink2} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <FormLabel>Goście spoza aplikacji</FormLabel>
      <Text style={{ fontSize: 12, color: B.ink3, fontFamily: F.medium, marginBottom: 8 }}>Każdy dostanie e-mail z osobistym linkiem i plikiem do kalendarza. Konto nie jest potrzebne.</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Mail size={16} color={B.ink3} />
        <View style={{ flex: 1 }}>
          <FormInput value={guestText} onChangeText={setGuestText} placeholder="adres@przyklad.pl" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} onSubmitEditing={addGuests} />
        </View>
        <Pressable onPress={addGuests} disabled={!guestText.trim()} accessibilityRole="button" className="active:opacity-70" style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: guestText.trim() ? B.ink : B.paper2 }}>
          <Text style={{ fontSize: 13, color: guestText.trim() ? B.onDark : B.ink3, fontFamily: F.bold }}>Dodaj</Text>
        </Pressable>
      </View>
      {guests.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {guests.map((g) => (
            <View key={g.email} style={chip}>
              <Text style={{ fontSize: 13, color: B.ink, fontFamily: F.medium }}>{g.name ? `${g.name} · ${g.email}` : g.email}</Text>
              <Pressable onPress={() => setGuests((prev) => prev.filter((x) => x.email !== g.email))} hitSlop={8} accessibilityLabel={`Usuń z zaproszonych: ${g.email}`}>
                <X size={13} color={B.ink2} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      {guests.length ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, color: B.ink, fontFamily: F.semibold }}>Wpuszczaj gości bez pytania</Text>
            <Text style={{ fontSize: 12, color: B.ink3, fontFamily: F.medium }}>Bez tego gość czeka w poczekalni, aż ktoś ze spotkania go wpuści.</Text>
          </View>
          <Switch value={form.guestsAutoAdmit} onValueChange={(v) => set("guestsAutoAdmit", v)} trackColor={{ true: B.kurkuma, false: B.paper2 }} />
        </View>
      ) : null}

      <FormLabel>Opis (opcjonalnie)</FormLabel>
      <FormInput value={form.description} onChangeText={(v) => set("description", v)} placeholder="Plan spotkania, materiały…" multiline maxLength={2000} />

      {error ? <Text accessibilityRole="alert" style={{ marginTop: 12, fontSize: 13, color: B.danger, fontFamily: F.semibold }}>{error}</Text> : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14 }}>
        {form.kind === "video" ? <Video size={14} color={B.ink3} /> : <Phone size={14} color={B.ink3} />}
        <Text style={{ flex: 1, fontSize: 12, color: B.ink3, fontFamily: F.medium }}>Do czasu nowej wersji aplikacji rozmowa otwiera się w przeglądarce telefonu.</Text>
      </View>
    </Sheet>
  );
}
