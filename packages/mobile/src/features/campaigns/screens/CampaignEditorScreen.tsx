import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StatusBar, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronRight, FileText, Users } from 'lucide-react-native';
import { PageHeader } from '../../../components/ui/PageHeader';
import { EmptyState } from '../../../components/ui/EmptyState';
import { PromptModal } from '../../../components/ui/PromptModal';
import { FormInput, FormLabel, PrimaryButton } from '../../../components/ui/Sheet';
import { B } from '../../../components/ui/brand';
import { FONT as F } from '../../../lib/fonts';
import { useAuthSession } from '../../../lib/auth';
import { usePermissions } from '../../../lib/permissions';
import { useCampusQuery } from '../../../hooks/useCampusQuery';
import { goBack } from '../../../lib/navigation';
import { showError } from '../../../lib/errors';
import { toast } from '../../../lib/toast';
import { supabase } from '../../../lib/supabase';
import {
  PUSH_BODY_MAX,
  SEND_CAP,
  TITLE_MAX,
  createCampaign,
  dispatchCampaign,
  invokeSendPush,
  invokeSendSms,
  isEditable,
  updateCampaign,
  useCampaign,
  useInvalidateCampaigns,
  type CampaignKind,
  type CampaignRow,
  type CampaignStatus,
  type PushAction,
  type SendMode,
  type TemplateRow,
} from '../api';
import { useRecipientsSource } from '../recipients';
import { hasValidPhone, normalizePhone, resolveSegments, segmentLabel, segmentsFromRows, type Segment } from '../recipientsLogic';
import { PRICE_PER_PART, SENDER_MAX, SMS_BODY_MAX, estimateCost, formatPLN, partsLabel, smsAnalysis } from '../smsEncoding';
import { PushPreview, SmsPreview } from '../components/Previews';
import { RecipientSheet } from '../components/RecipientSheet';
import { ScheduleSection, type ScheduleValue } from '../components/ScheduleSection';
import { TemplateSheet } from '../components/TemplateSheet';
import { Card, Hint, SecondaryButton, SectionTitle, confirmAsync, fmtDateTime, recipientsWord } from '../components/ui';

// Edytor kampanii push / SMS — port CampaignEditor z weba (bez testów A/B i kreatora przycisków;
// istniejące przyciski i warianty zostają nietknięte). Kolejność zapisu jak na webie:
//   szkic:        insert/update kampanii (status draft) → segmenty (delete+insert) → [push] przyciski
//   zaplanuj:     to samo ze statusem 'scheduled' (wysyła worker co minutę)
//   wyślij teraz: zapis jako 'draft' → update status 'sending' → fn <kind>-campaign-dispatch {force}

interface Form extends ScheduleValue {
  name: string;
  // push
  title: string;
  body: string;
  icon: string;
  big_image: string;
  link: string;
  tag: string;
  category_id: string;
  data: Record<string, unknown>;
  // sms
  sender: string;
  smart_window_hours: number | null;
}

const DEFAULT_SENDER = 'INFO';

const EMPTY: Form = {
  name: '',
  title: '',
  body: '',
  icon: '',
  big_image: '',
  link: '',
  tag: '',
  category_id: 'cm_dismiss_only',
  data: {},
  sender: DEFAULT_SENDER,
  send_mode: 'now',
  scheduled_at: null,
  smart_window_hours: null,
  quiet_hours_start: null,
  quiet_hours_end: null,
  frequency_cap_per_day: null,
};

const fromCampaign = (c: CampaignRow): Form => ({
  ...EMPTY,
  name: c.name || '',
  title: c.title || '',
  body: c.body || '',
  icon: c.icon || '',
  big_image: c.big_image || '',
  link: c.link || '',
  tag: c.tag || '',
  category_id: c.category_id || 'cm_dismiss_only',
  data: (c.data as Record<string, unknown>) || {},
  sender: c.sender || DEFAULT_SENDER,
  send_mode: (c.send_mode as SendMode) || 'now',
  scheduled_at: c.scheduled_at,
  smart_window_hours: c.smart_window_hours ?? null,
  quiet_hours_start: c.quiet_hours_start ?? null,
  quiet_hours_end: c.quiet_hours_end ?? null,
  frequency_cap_per_day: c.frequency_cap_per_day ?? null,
});

const actionsFrom = (c: CampaignRow): PushAction[] =>
  [...(c.actions ?? [])]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((a) => ({ label: a.label, action_type: a.action_type, action_value: a.action_value ?? null, destructive: !!a.destructive }));

// Pola kampanii w zapisie — dokładnie te, które web rozsyła z formularza (EMPTY_FORM + dodatki).
const campaignFields = (kind: CampaignKind, f: Form) => {
  const schedule = {
    send_mode: f.send_mode,
    scheduled_at: f.scheduled_at,
    smart_window_hours: f.smart_window_hours,
    quiet_hours_start: f.quiet_hours_start,
    quiet_hours_end: f.quiet_hours_end,
    frequency_cap_per_day: f.frequency_cap_per_day,
  };
  if (kind === 'push') {
    return {
      name: f.name,
      title: f.title,
      body: f.body,
      icon: f.icon,
      big_image: f.big_image,
      link: f.link,
      tag: f.tag,
      category_id: f.category_id,
      data: f.data,
      ...schedule,
    };
  }
  const a = smsAnalysis(f.body);
  return { name: f.name, sender: f.sender, body: f.body, ...schedule, encoding: a.encoding, parts_per_message: a.parts };
};

const Counter = ({ value, max }: { value: number; max: number }) => (
  <Text style={{ fontSize: 12, color: value > max * 0.9 ? B.goldDeep : B.ink4, fontFamily: F.semibold }}>
    {value}/{max}
  </Text>
);

const LabelRow = ({ label, right, first }: { label: string; right?: ReactNode; first?: boolean }) => (
  <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
    <FormLabel first={first}>{label}</FormLabel>
    {right ? <View style={{ marginBottom: 8 }}>{right}</View> : null}
  </View>
);

export const CampaignEditorScreen = ({ kind }: { kind: CampaignKind }) => {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const editId = params.id ? String(params.id) : null;
  const { user } = useAuthSession();
  const perms = usePermissions();
  const canSend = perms.can(SEND_CAP[kind]);
  const { campusIdForInsert } = useCampusQuery();
  const invalidate = useInvalidateCampaigns(kind);

  const existing = useCampaign(kind, editId);
  const campaign: CampaignRow | null = existing.data ?? null;
  const { source, loading: sourceLoading, error: sourceError } = useRecipientsSource(
    kind === 'push' ? 'push_user_preferences' : 'sms_user_preferences',
  );

  const [form, setForm] = useState<Form>(EMPTY);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [actions, setActions] = useState<PushAction[]>([]);
  const [advanced, setAdvanced] = useState(false);
  const [recipientsOpen, setRecipientsOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testInitial, setTestInitial] = useState('');
  const [busy, setBusy] = useState<null | 'draft' | 'send'>(null);

  // Wczytanie edytowanej kampanii — raz (późniejsze odświeżenia zapytania nie nadpisują edycji).
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!campaign || loadedFor.current === campaign.id) return;
    loadedFor.current = campaign.id;
    setForm(fromCampaign(campaign));
    setSegments(segmentsFromRows(campaign.segments));
    setActions(actionsFrom(campaign));
    if (campaign.icon || campaign.big_image || campaign.tag) setAdvanced(true);
  }, [campaign]);

  const update = (patch: Partial<Form>) => setForm((prev) => ({ ...prev, ...patch }));

  const recipients = useMemo(() => resolveSegments(source, segments), [source, segments]);
  const recipientCount = kind === 'sms' ? recipients.filter(hasValidPhone).length : recipients.length;
  const analysis = useMemo(() => smsAnalysis(form.body), [form.body]);
  const cost = useMemo(() => estimateCost(form.body, recipientCount), [form.body, recipientCount]);

  const applyTemplate = (t: TemplateRow) => {
    if (kind === 'push') {
      update({ name: t.name || '', title: t.title || '', body: t.body || '', icon: t.icon || '', category_id: t.category_id || 'cm_dismiss_only' });
      if (t.icon) setAdvanced(true);
    } else {
      update({ name: t.name || '', sender: t.default_sender || DEFAULT_SENDER, body: t.body || '' });
    }
  };

  const validate = (): string | null => {
    if (!form.name.trim()) return 'Podaj nazwę kampanii';
    if (kind === 'push') {
      if (!form.title.trim()) return 'Podaj tytuł powiadomienia';
      if (!form.body.trim()) return 'Podaj treść powiadomienia';
    } else {
      if (!form.sender.trim()) return 'Podaj nadawcę';
      if (form.sender.length > SENDER_MAX) return `Nadawca: max ${SENDER_MAX} znaków`;
      if (!form.body.trim()) return 'Podaj treść SMS-a';
    }
    if (form.send_mode === 'scheduled' && !form.scheduled_at) return 'Wybierz datę wysyłki';
    return null;
  };

  const payload = (status: CampaignStatus) => ({
    campaign: { ...campaignFields(kind, form), campus_id: campusIdForInsert, status },
    segments,
    ...(kind === 'push' ? { actions } : {}),
  });

  // Zapis kampanii (nowa → insert, istniejąca → update) — zwraca id.
  const persist = async (status: CampaignStatus): Promise<string> => {
    if (campaign?.id) {
      await updateCampaign(kind, campaign.id, payload(status));
      return campaign.id;
    }
    if (!user?.email) throw new Error('Nie jesteś zalogowany');
    const created = await createCampaign(kind, user.email, payload(status));
    return created.id;
  };

  const finish = async (message: string) => {
    await invalidate();
    goBack(router);
    toast.success(message);
  };

  const invalid = () => {
    const err = validate();
    if (err) Alert.alert('Uzupełnij kampanię', err);
    return !!err;
  };

  const saveDraft = async () => {
    if (busy || invalid()) return;
    setBusy('draft');
    try {
      await persist(campaign?.status === 'sent' ? 'sent' : 'draft');
      await finish('Zapisano szkic');
    } catch (e) {
      showError('Nie udało się zapisać', e);
    } finally {
      setBusy(null);
    }
  };

  const schedule = async () => {
    if (busy || invalid()) return;
    if (form.send_mode === 'scheduled' && form.scheduled_at && new Date(form.scheduled_at).getTime() < Date.now() - 60_000) {
      Alert.alert('Termin minął', 'Wybierz datę i godzinę w przyszłości albo „Wyślij teraz”.');
      return;
    }
    if (recipientCount === 0) {
      const msg = kind === 'sms' ? 'Brak odbiorców z numerem. Zapisać mimo to?' : 'Brak odbiorców pasujących do segmentów. Zapisać mimo to?';
      if (!(await confirmAsync('Brak odbiorców', msg, 'Zapisz'))) return;
    }
    setBusy('send');
    try {
      await persist('scheduled');
      await finish(form.scheduled_at ? `Zaplanowano na ${fmtDateTime(form.scheduled_at)}` : 'Zaplanowano kampanię');
    } catch (e) {
      showError('Nie udało się zaplanować', e);
    } finally {
      setBusy(null);
    }
  };

  const sendNow = async () => {
    if (busy || invalid()) return;
    if (recipientCount === 0) {
      Alert.alert('Brak odbiorców', kind === 'sms' ? 'Nikt z wybranych nie ma poprawnego numeru telefonu.' : 'Wybierz odbiorców kampanii.');
      return;
    }
    const msg =
      kind === 'sms'
        ? `Wysłać SMS do ${recipientCount} ${recipientsWord(recipientCount)}?\n\n${partsLabel(analysis.parts || 1)} × ${recipientCount} ≈ ${formatPLN(cost)} (szacunkowo).`
        : `Wysłać kampanię do ${recipientCount} ${recipientsWord(recipientCount)}?`;
    if (!(await confirmAsync('Wysłać teraz?', msg, 'Wyślij'))) return;
    setBusy('send');
    try {
      const id = await persist('draft');
      await dispatchCampaign(kind, id);
      await finish('Kampania wysłana');
    } catch (e) {
      // Zapis mógł się udać, a wysyłka nie — odśwież listę, żeby było widać stan.
      invalidate();
      showError('Nie udało się wysłać', e);
    } finally {
      setBusy(null);
    }
  };

  const openTest = async () => {
    if (kind === 'push') {
      setTestInitial(user?.email ?? '');
      setTestOpen(true);
      return;
    }
    let phone = '';
    try {
      const { data } = await supabase.from('app_users').select('phone').eq('email', user?.email ?? '').maybeSingle();
      phone = (data as any)?.phone ?? '';
    } catch {
      // brak numeru w profilu — pole puste
    }
    setTestInitial(phone);
    setTestOpen(true);
  };

  const sendTest = async (value: string) => {
    try {
      if (kind === 'push') {
        if (!form.title.trim() || !form.body.trim()) {
          Alert.alert('Uzupełnij treść', 'Test wymaga tytułu i treści powiadomienia.');
          return;
        }
        const res = await invokeSendPush({
          user_email: value,
          title: form.title,
          body: form.body,
          link: form.link || undefined,
          tag: form.tag || undefined,
          icon: form.icon || undefined,
          big_image: form.big_image || undefined,
          category_id: form.category_id,
          actions,
          data: { ...form.data, test: true },
        });
        setTestOpen(false);
        if (res && res.sent === 0) toast.info('Wysłano, ale ten adres nie ma zarejestrowanych urządzeń');
        else toast.success(`Test wysłany do ${value}`);
      } else {
        const phone = normalizePhone(value);
        if (!phone) {
          Alert.alert('Niepoprawny numer', 'Podaj polski numer, np. 500 123 456.');
          return;
        }
        if (!form.body.trim()) {
          Alert.alert('Uzupełnij treść', 'Test wymaga treści SMS-a.');
          return;
        }
        const res = await invokeSendSms({ phone, message: form.body, sender: form.sender });
        setTestOpen(false);
        if (res?.sent === 1) toast.success(`Test wysłany na +${phone}`, res.points != null ? `Koszt: ${res.points} pkt` : undefined);
        else showError('Nie udało się wysłać testu', res?.error || 'nieznany błąd');
      }
    } catch (e) {
      showError('Nie udało się wysłać testu', e);
    }
  };

  const title = kind === 'push' ? (editId ? 'Edytuj kampanię' : 'Nowa kampania push') : editId ? 'Edytuj kampanię SMS' : 'Nowa kampania SMS';

  if (editId && existing.isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: B.paper }}>
        <PageHeader title={title} subtitle={kind === 'push' ? 'Kampanie push' : 'Kampanie SMS'} showBack />
        <ActivityIndicator color={B.ink} style={{ marginTop: 40 }} />
      </View>
    );
  }
  if (editId && (existing.isError || !campaign)) {
    return (
      <View style={{ flex: 1, backgroundColor: B.paper }}>
        <PageHeader title={title} subtitle={kind === 'push' ? 'Kampanie push' : 'Kampanie SMS'} showBack />
        <EmptyState Icon={FileText} title="Nie udało się wczytać kampanii" hint="Mogła zostać usunięta. Wróć do listy i odśwież." actionLabel="Spróbuj ponownie" onAction={() => existing.refetch()} />
      </View>
    );
  }
  const locked = !!campaign && !isEditable(campaign.status);

  const recipientsSummary = segments.length ? segments.map(segmentLabel).join(', ') : 'Nie wybrano odbiorców';
  const primaryLabel = form.send_mode === 'now' ? 'Wyślij teraz' : 'Zaplanuj wysyłkę';

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: B.paper }}>
        <PageHeader title={title} subtitle={kind === 'push' ? 'Kampanie push' : 'Kampanie SMS'} showBack />
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 150 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
        >
          {locked ? (
            <View style={{ borderRadius: 16, backgroundColor: B.kurkumaSoft, padding: 12, marginBottom: 6 }}>
              <Text style={{ fontSize: 13, color: B.goldDeep, fontFamily: F.semibold }}>Ta kampania jest już wysłana — zmiany nie trafią do odbiorców.</Text>
            </View>
          ) : null}

          <Pressable
            onPress={() => setTemplatesOpen(true)}
            accessibilityRole="button"
            className="active:opacity-80"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 999, backgroundColor: B.card, paddingHorizontal: 16, height: 46 }}
          >
            <FileText size={17} color={B.ink2} />
            <Text style={{ flex: 1, fontSize: 14, color: B.ink, fontFamily: F.semibold }}>Użyj szablonu</Text>
            <ChevronRight size={17} color={B.ink4} />
          </Pressable>

          <SectionTitle>Treść</SectionTitle>
          <Card>
            <FormLabel first>Nazwa kampanii (wewnętrzna)</FormLabel>
            <FormInput value={form.name} onChangeText={(name) => update({ name })} placeholder="Np. Niedziela 12.05 — przypomnienie" />

            {kind === 'push' ? (
              <>
                <LabelRow label="Tytuł" right={<Counter value={form.title.length} max={TITLE_MAX} />} />
                <FormInput value={form.title} onChangeText={(t) => update({ title: t })} maxLength={TITLE_MAX} placeholder="Tytuł powiadomienia" />
                <LabelRow label="Treść" right={<Counter value={form.body.length} max={PUSH_BODY_MAX} />} />
                <FormInput value={form.body} onChangeText={(t) => update({ body: t })} maxLength={PUSH_BODY_MAX} multiline placeholder="Treść powiadomienia…" />
                <FormLabel>Link po stuknięciu (opcjonalnie)</FormLabel>
                <FormInput
                  value={form.link}
                  onChangeText={(link) => update({ link })}
                  placeholder="/ albo /events/123"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Pressable onPress={() => setAdvanced((v) => !v)} accessibilityRole="button" className="active:opacity-70" style={{ marginTop: 14, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 14, color: B.ink2, fontFamily: F.semibold }}>{advanced ? 'Ukryj opcje zaawansowane' : 'Opcje zaawansowane (ikona, obraz, tag)'}</Text>
                </Pressable>
                {advanced ? (
                  <>
                    <FormLabel>Adres ikony (opcjonalnie)</FormLabel>
                    <FormInput value={form.icon} onChangeText={(icon) => update({ icon })} placeholder="https://…" autoCapitalize="none" autoCorrect={false} keyboardType="url" />
                    <FormLabel>Duży obraz (opcjonalnie)</FormLabel>
                    <FormInput value={form.big_image} onChangeText={(v) => update({ big_image: v })} placeholder="https://…" autoCapitalize="none" autoCorrect={false} keyboardType="url" />
                    <FormLabel>Tag (zastępuje wcześniejsze z tym tagiem)</FormLabel>
                    <FormInput value={form.tag} onChangeText={(tag) => update({ tag })} placeholder="news / event-12" autoCapitalize="none" autoCorrect={false} />
                  </>
                ) : null}
              </>
            ) : (
              <>
                <LabelRow label="Nadawca" right={<Counter value={form.sender.length} max={SENDER_MAX} />} />
                <FormInput value={form.sender} onChangeText={(sender) => update({ sender })} maxLength={SENDER_MAX} placeholder="np. Avenit" autoCorrect={false} />
                <Hint>Musi być zarejestrowany w SMSAPI. Max 11 znaków alfanumerycznych.</Hint>
                <LabelRow
                  label="Treść SMS"
                  right={
                    <Text style={{ fontSize: 12, color: analysis.encoding === 'unicode' ? B.goldDeep : B.okFg, fontFamily: F.semibold }}>
                      {analysis.encoding === 'unicode' ? 'Unicode' : 'GSM-7'} · {analysis.charCount} zn. · {partsLabel(analysis.parts || 1)}
                    </Text>
                  }
                />
                <FormInput value={form.body} onChangeText={(t) => update({ body: t })} maxLength={SMS_BODY_MAX} multiline placeholder="Treść SMS-a…" />
                {form.body ? <Hint>Zostało {Math.max(0, analysis.remainingInPart)} zn. w tej części ({analysis.charsPerPart} na część).</Hint> : null}
                {analysis.parts > 3 ? <Hint tone="warn">Wiadomość pójdzie jako {analysis.parts} oddzielnych SMS-ów (każdy płatny).</Hint> : null}
                {analysis.encoding === 'unicode' ? (
                  <Hint tone="warn">Polskie znaki i emoji wymuszają Unicode — 70 znaków na część zamiast 160.</Hint>
                ) : null}
              </>
            )}
          </Card>

          <SectionTitle>Podgląd</SectionTitle>
          {kind === 'push' ? (
            <PushPreview title={form.title} body={form.body} icon={form.icon} categoryId={form.category_id} actions={actions} />
          ) : (
            <SmsPreview sender={form.sender} body={form.body} />
          )}

          <SectionTitle>Odbiorcy</SectionTitle>
          <Pressable
            onPress={() => setRecipientsOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Odbiorcy: ${recipientCount}`}
            className="active:opacity-80"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 22, backgroundColor: B.card, padding: 16 }}
          >
            <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: B.paper2, alignItems: 'center', justifyContent: 'center' }}>
              <Users size={20} color={B.ink} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, color: B.ink, letterSpacing: -0.3, fontFamily: F.bold }}>
                {sourceLoading ? 'Liczę odbiorców…' : `${recipientCount} ${recipientsWord(recipientCount)}`}
              </Text>
              <Text numberOfLines={2} style={{ marginTop: 2, fontSize: 13, color: B.ink3, fontFamily: F.medium }}>
                {recipientsSummary}
              </Text>
            </View>
            <ChevronRight size={18} color={B.ink4} />
          </Pressable>
          {sourceError ? <Hint tone="danger">Nie udało się wczytać listy osób — licznik może być niepełny.</Hint> : null}
          {kind === 'sms' && recipientCount > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, borderRadius: 18, backgroundColor: B.card, paddingHorizontal: 16, paddingVertical: 12 }}>
              <Text style={{ flex: 1, fontSize: 14, color: B.ink, fontFamily: F.semibold }}>Szacunkowy koszt: {formatPLN(cost)}</Text>
              <Text style={{ fontSize: 12, color: B.ink4, fontFamily: F.medium }}>
                {recipientCount} × {analysis.parts || 1} cz. × ~{formatPLN(PRICE_PER_PART)}
              </Text>
            </View>
          ) : null}

          <SectionTitle>Wysyłka</SectionTitle>
          <ScheduleSection kind={kind} value={form} onChange={update} />

          <View style={{ marginTop: 24, gap: 10 }}>
            {canSend ? (
              <PrimaryButton
                label={busy === 'send' ? 'Wysyłam…' : primaryLabel}
                busy={busy === 'send'}
                disabled={!!busy || locked}
                onPress={form.send_mode === 'now' ? sendNow : schedule}
              />
            ) : null}
            <SecondaryButton label={busy === 'draft' ? 'Zapisuję…' : 'Zapisz szkic'} onPress={saveDraft} disabled={!!busy} />
            {canSend ? (
              <Pressable onPress={openTest} accessibilityRole="button" className="active:opacity-60" style={{ alignItems: 'center', paddingVertical: 10 }}>
                <Text style={{ fontSize: 14, color: B.ink2, fontFamily: F.semibold }}>
                  {kind === 'push' ? 'Wyślij test na wybrany adres' : 'Wyślij test na wybrany numer'}
                </Text>
              </Pressable>
            ) : (
              <Hint>Nie masz uprawnień do wysyłki — zapisz szkic, a wyśle go osoba z uprawnieniem.</Hint>
            )}
          </View>
        </ScrollView>
      </View>

      <RecipientSheet
        visible={recipientsOpen}
        onClose={() => setRecipientsOpen(false)}
        kind={kind}
        segments={segments}
        onChange={setSegments}
        source={source}
        loading={sourceLoading}
      />
      <TemplateSheet visible={templatesOpen} onClose={() => setTemplatesOpen(false)} kind={kind} onPick={applyTemplate} />
      <PromptModal
        visible={testOpen}
        title={kind === 'push' ? 'Test na adres e-mail' : 'Test na numer telefonu'}
        initialValue={testInitial}
        placeholder={kind === 'push' ? 'ty@example.com' : '+48 500 123 456'}
        confirmLabel="Wyślij test"
        onCancel={() => setTestOpen(false)}
        onConfirm={sendTest}
      />
    </>
  );
};

