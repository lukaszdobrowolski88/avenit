import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft, Save, Send, TestTube, Eye, Loader2, AlertTriangle,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useCampus } from '../../../contexts/CampusContext';
import { useSmsCampaigns, dispatchSmsCampaign, invokeSendSms } from '../hooks/useSmsCampaigns';
import { useRecipientsSource, normalizePhone } from '../../shared/recipients';
import { SENDER_MAX, BODY_MAX } from '../constants';
import { smsAnalysis, estimateCost, formatPLN } from '../utils/smsEncoding';
import RecipientSelector from './RecipientSelector';
import ScheduleControl from './ScheduleControl';
import SmsPreview from './SmsPreview';
import { tr } from '../../../i18n';

const SECTIONS = [
  { id: 'compose', label: tr('Treść') },
  { id: 'recipients', label: 'Odbiorcy' },
  { id: 'schedule', label: 'Harmonogram' },
];

const DEFAULT_SENDER = 'INFO';

const EMPTY_FORM = {
  name: '',
  sender: DEFAULT_SENDER,
  body: '',
  send_mode: 'now',
  scheduled_at: null,
  smart_window_hours: null,
  quiet_hours_start: null,
  quiet_hours_end: null,
  frequency_cap_per_day: null,
};

export default function CampaignEditor({ campaign, template, onClose }) {
  const [section, setSection] = useState('compose');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [showTestSend, setShowTestSend] = useState(false);

  const [form, setForm] = useState(() => mergeFromCampaign(campaign, template));
  const [segments, setSegments] = useState(campaign?.segments?.map(s => ({
    type: s.segment_type,
    id: s.segment_id,
    name: s.segment_name,
    exclude: s.exclude,
    emails: s.emails,
    phones: s.phones,
  })) || []);

  const { getCampusIdForInsert } = useCampus();
  const { createCampaign, updateCampaign } = useSmsCampaigns();
  const { resolveSegments } = useRecipientsSource({ optOutSource: 'sms_user_preferences' });

  const recipients = useMemo(() => resolveSegments(segments), [segments, resolveSegments]);
  const recipientsWithPhone = recipients.filter(r => r.phone && normalizePhone(r.phone));
  const recipientCount = recipientsWithPhone.length;

  const analysis = useMemo(() => smsAnalysis(form.body), [form.body]);
  const estimatedCost = useMemo(
    () => estimateCost(form.body, recipientCount),
    [form.body, recipientCount]
  );

  useEffect(() => {
    setForm(mergeFromCampaign(campaign, template));
  }, [campaign?.id, template?.id]);

  const updateForm = (patch) => setForm(prev => ({ ...prev, ...patch }));

  const validate = () => {
    if (!form.name.trim()) return 'Podaj nazwę kampanii';
    if (!form.sender.trim()) return 'Podaj nadawcę';
    if (form.sender.length > SENDER_MAX) return `Nadawca: max ${SENDER_MAX} znaków`;
    if (!form.body.trim()) return 'Podaj treść SMS-a';
    if (form.send_mode === 'scheduled' && !form.scheduled_at) return 'Wybierz datę wysyłki';
    return null;
  };

  const buildPayload = (status) => ({
    ...form,
    encoding: analysis.encoding,
    parts_per_message: analysis.parts,
    campus_id: getCampusIdForInsert(),
    status,
    segments,
  });

  const handleSaveDraft = async () => {
    const err = validate();
    if (err) { alert(err); return; }
    setSaving(true);
    try {
      if (campaign?.id) {
        await updateCampaign(campaign.id, buildPayload(campaign.status === 'sent' ? 'sent' : 'draft'));
      } else {
        await createCampaign(buildPayload('draft'));
      }
      onClose?.();
    } catch (e) {
      alert(`Błąd zapisu: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSchedule = async () => {
    const err = validate();
    if (err) { alert(err); return; }
    if (recipientCount === 0) {
      if (!confirm(tr('Brak odbiorców z numerem. Zapisać mimo to?'))) return;
    }
    setSaving(true);
    try {
      const payload = buildPayload('scheduled');
      if (campaign?.id) {
        await updateCampaign(campaign.id, payload);
      } else {
        await createCampaign(payload);
      }
      onClose?.();
    } catch (e) {
      alert(`Błąd: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSendNow = async () => {
    const err = validate();
    if (err) { alert(err); return; }
    if (recipientCount === 0) { alert(tr('Brak odbiorców z numerem')); return; }
    if (!confirm(`Wysłać SMS do ${recipientCount} odbiorców? Szacunkowy koszt: ${formatPLN(estimatedCost)}.`)) return;

    setSending(true);
    try {
      let id = campaign?.id;
      if (!id) {
        const created = await createCampaign(buildPayload('draft'));
        id = created.id;
      } else {
        await updateCampaign(id, buildPayload('draft'));
      }
      await dispatchSmsCampaign(id);
      onClose?.();
    } catch (e) {
      alert(`Błąd wysyłki: ${e.message}`);
    } finally {
      setSending(false);
    }
  };

  const handleTestSend = async () => {
    if (!testPhone) {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: appUser } = await supabase
        .from('app_users')
        .select('phone')
        .eq('email', user?.email)
        .maybeSingle();
      setTestPhone(appUser?.phone || '');
      return;
    }
    const phone = normalizePhone(testPhone);
    if (!phone) { alert('Niepoprawny numer telefonu'); return; }

    setSending(true);
    try {
      const result = await invokeSendSms({
        phone,
        message: form.body,
        sender: form.sender,
      });
      if (result?.sent === 1) {
        alert(`Test wysłany na +${phone}\nID: ${result.smsapi_id}\nKoszt: ${result.points} pkt`);
      } else {
        alert(`Błąd: ${result?.error || 'nieznany'}`);
      }
      setShowTestSend(false);
    } catch (e) {
      alert(`Błąd: ${e.message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {campaign?.id ? 'Edytuj kampanię SMS' : 'Nowa kampania SMS'}
            </h2>
            <p className="text-xs text-gray-500">
              {recipientCount > 0 ? (
                <>Wyśle do {recipientCount} osób · ~{formatPLN(estimatedCost)}</>
              ) : 'Brak odbiorców z numerem'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTestSend(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <TestTube size={14} /> Test
          </button>
          <button
            onClick={handleSaveDraft}
            disabled={saving || sending}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Zapisz szkic
          </button>
          {form.send_mode === 'now' ? (
            <button
              onClick={handleSendNow}
              disabled={saving || sending || recipientCount === 0}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-gradient-to-r from-accent-primary-light to-accent-secondary-light text-white rounded-lg shadow hover:shadow-lg disabled:opacity-50"
            >
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Wyślij teraz
            </button>
          ) : (
            <button
              onClick={handleSchedule}
              disabled={saving || sending}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-gradient-to-r from-accent-primary-light to-accent-secondary-light text-white rounded-lg shadow hover:shadow-lg disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Zaplanuj
            </button>
          )}
        </div>
      </div>

      {showTestSend && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{tr('Wyślij test')}</h3>
            <p className="text-sm text-gray-500 mb-4">{tr('SMS pójdzie tylko na podany numer. Naliczy się 1 SMS w SMSAPI.')}</p>
            <input
              type="tel"
              value={testPhone}
              onChange={e => setTestPhone(e.target.value)}
              placeholder="+48 500 123 456"
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-sm mb-4 font-mono"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowTestSend(false)} className="px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">{tr('Anuluj')}</button>
              <button
                onClick={handleTestSend}
                disabled={sending || !testPhone}
                className="px-4 py-1.5 text-sm bg-accent-primary text-white rounded-lg disabled:opacity-50"
              >
                {sending ? 'Wysyłanie...' : 'Wyślij'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-4">
        {/* Lewa kolumna */}
        <div className="space-y-4">
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit">
            {SECTIONS.map(s => (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  section === s.id
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow'
                    : 'text-gray-600 dark:text-gray-400'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
            {section === 'compose' && (
              <>
                <Field label="Nazwa kampanii (wewnętrznie)">
                  <input
                    value={form.name}
                    onChange={e => updateForm({ name: e.target.value })}
                    placeholder="Np. Niedziela 12.05 — przypomnienie"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"
                  />
                </Field>

                <Field
                  label="Nadawca (Sender ID)"
                  hint={`${form.sender.length}/${SENDER_MAX}`}
                >
                  <input
                    maxLength={SENDER_MAX}
                    value={form.sender}
                    onChange={e => updateForm({ sender: e.target.value })}
                    placeholder="np. Avenit"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-mono"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {tr('Musi być zarejestrowany w SMSAPI. Max 11 znaków alfanumerycznych.')}
                  </p>
                </Field>

                <Field
                  label="Treść SMS"
                  hint={
                    <span className="flex items-center gap-2">
                      <span className={analysis.encoding === 'unicode' ? 'text-amber-600' : 'text-emerald-600'}>
                        {analysis.encoding === 'unicode' ? 'Unicode' : 'GSM-7'}
                      </span>
                      <span>· {analysis.charCount} zn.</span>
                      <span>· {analysis.parts || 1} {(analysis.parts || 1) === 1 ? 'część' : 'części'}</span>
                    </span>
                  }
                >
                  <textarea
                    maxLength={BODY_MAX}
                    rows={5}
                    value={form.body}
                    onChange={e => updateForm({ body: e.target.value })}
                    placeholder={tr('Treść SMS-a...')}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-sm resize-none"
                  />
                  {analysis.parts > 3 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                      <AlertTriangle size={12} />
                      Wiadomość zostanie wysłana jako {analysis.parts} oddzielnych SMS-ów (każdy płatny).
                    </p>
                  )}
                  {analysis.encoding === 'unicode' && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      Polskie znaki diakrytyczne wymuszają kodowanie Unicode (70 znaków na część zamiast 160).
                    </p>
                  )}
                </Field>

                {recipientCount > 0 && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-sm flex items-center justify-between">
                    <span className="text-blue-700 dark:text-blue-400">
                      Szacunkowy koszt: <strong>{formatPLN(estimatedCost)}</strong>
                    </span>
                    <span className="text-xs text-blue-600 dark:text-blue-400">
                      {recipientCount} × {analysis.parts || 1} cz. × ~0,16 PLN
                    </span>
                  </div>
                )}
              </>
            )}

            {section === 'recipients' && (
              <RecipientSelector segments={segments} onChange={setSegments} />
            )}

            {section === 'schedule' && (
              <ScheduleControl
                sendMode={form.send_mode}
                scheduledAt={form.scheduled_at}
                smartWindowHours={form.smart_window_hours}
                quietHoursStart={form.quiet_hours_start}
                quietHoursEnd={form.quiet_hours_end}
                frequencyCapPerDay={form.frequency_cap_per_day}
                onChange={({ sendMode, scheduledAt, smartWindowHours, quietHoursStart, quietHoursEnd, frequencyCapPerDay }) => {
                  updateForm({
                    ...(sendMode !== undefined ? { send_mode: sendMode } : {}),
                    ...(scheduledAt !== undefined ? { scheduled_at: scheduledAt } : {}),
                    ...(smartWindowHours !== undefined ? { smart_window_hours: smartWindowHours } : {}),
                    ...(quietHoursStart !== undefined ? { quiet_hours_start: quietHoursStart } : {}),
                    ...(quietHoursEnd !== undefined ? { quiet_hours_end: quietHoursEnd } : {}),
                    ...(frequencyCapPerDay !== undefined ? { frequency_cap_per_day: frequencyCapPerDay } : {}),
                  });
                }}
              />
            )}
          </div>
        </div>

        {/* Prawa kolumna: preview */}
        <div className="lg:sticky lg:top-4 self-start">
          <div className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1.5">
            <Eye size={12} /> Live preview
          </div>
          <SmsPreview sender={form.sender} body={form.body} />
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">{label}</label>
        {hint && <span className="text-xs text-gray-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function mergeFromCampaign(campaign, template) {
  if (campaign) {
    return {
      ...EMPTY_FORM,
      name: campaign.name || '',
      sender: campaign.sender || DEFAULT_SENDER,
      body: campaign.body || '',
      send_mode: campaign.send_mode || 'now',
      scheduled_at: campaign.scheduled_at,
      smart_window_hours: campaign.smart_window_hours,
      quiet_hours_start: campaign.quiet_hours_start,
      quiet_hours_end: campaign.quiet_hours_end,
      frequency_cap_per_day: campaign.frequency_cap_per_day,
    };
  }
  if (template) {
    return {
      ...EMPTY_FORM,
      name: template.name,
      sender: template.default_sender || DEFAULT_SENDER,
      body: template.body,
    };
  }
  return EMPTY_FORM;
}
