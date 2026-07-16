import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft, Save, Send, TestTube, FlaskConical, Eye, Loader2, Image as ImageIcon
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useCampus } from '../../../contexts/CampusContext';
import { usePushCampaigns, dispatchCampaign, invokeSendPush } from '../hooks/usePushCampaigns';
import { useRecipientsSource } from '../../shared/recipients';
import { TITLE_MAX, BODY_MAX } from '../constants';
import RecipientSelector from './RecipientSelector';
import ActionButtonsBuilder from './ActionButtonsBuilder';
import ScheduleControl from './ScheduleControl';
import PushPreview from './PushPreview';
import { tr } from '../../../i18n';

const SECTIONS = [
  { id: 'compose', label: tr('Treść') },
  { id: 'recipients', label: 'Odbiorcy' },
  { id: 'actions', label: tr('Akcje') },
  { id: 'schedule', label: 'Harmonogram' },
];

const EMPTY_FORM = {
  name: '',
  title: '',
  body: '',
  icon: '',
  big_image: '',
  link: '',
  tag: '',
  category_id: 'cm_dismiss_only',
  data: {},
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
  const [testEmail, setTestEmail] = useState('');
  const [showTestSend, setShowTestSend] = useState(false);

  const [form, setForm] = useState(() => mergeFromCampaign(campaign, template));
  const [segments, setSegments] = useState(campaign?.segments?.map(s => ({
    type: s.segment_type,
    id: s.segment_id,
    name: s.segment_name,
    exclude: s.exclude,
    emails: s.emails,
  })) || []);
  const [actions, setActions] = useState(campaign?.actions?.sort((a, b) => a.position - b.position).map(a => ({
    label: a.label,
    action_type: a.action_type,
    action_value: a.action_value,
    destructive: a.destructive,
  })) || []);

  const { getCampusIdForInsert } = useCampus();
  const { createCampaign, updateCampaign } = usePushCampaigns();
  const { resolveSegments } = useRecipientsSource({ optOutSource: 'push_user_preferences' });

  const recipientCount = useMemo(() => resolveSegments(segments).length, [segments, resolveSegments]);

  useEffect(() => {
    setForm(mergeFromCampaign(campaign, template));
  }, [campaign?.id, template?.id]);

  const updateForm = (patch) => setForm(prev => ({ ...prev, ...patch }));

  const validate = () => {
    if (!form.name.trim()) return 'Podaj nazwę kampanii';
    if (!form.title.trim()) return 'Podaj tytuł powiadomienia';
    if (!form.body.trim()) return 'Podaj treść powiadomienia';
    if (form.send_mode === 'scheduled' && !form.scheduled_at) return 'Wybierz datę wysyłki';
    return null;
  };

  const buildPayload = (status) => ({
    ...form,
    campus_id: getCampusIdForInsert(),
    status,
    segments,
    actions,
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
      if (!confirm('Brak odbiorców pasujących do segmentów. Zapisać mimo to?')) return;
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
    if (recipientCount === 0) { alert('Brak odbiorców'); return; }
    if (!confirm(`Wysłać kampanię do ${recipientCount} odbiorców?`)) return;

    setSending(true);
    try {
      let id = campaign?.id;
      if (!id) {
        const created = await createCampaign(buildPayload('draft'));
        id = created.id;
      } else {
        await updateCampaign(id, buildPayload('draft'));
      }
      await dispatchCampaign(id);
      onClose?.();
    } catch (e) {
      alert(`Błąd wysyłki: ${e.message}`);
    } finally {
      setSending(false);
    }
  };

  const handleTestSend = async () => {
    if (!testEmail) {
      const { data: { user } } = await supabase.auth.getUser();
      setTestEmail(user?.email || '');
      return;
    }
    setSending(true);
    try {
      await invokeSendPush({
        user_email: testEmail,
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
      alert(`Test wysłany do ${testEmail}`);
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {campaign?.id ? 'Edytuj kampanię' : 'Nowa kampania push'}
            </h2>
            <p className="text-xs text-gray-500">
              {recipientCount > 0 ? `Wyśle do ${recipientCount} osób` : 'Brak odbiorców'}
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

      {/* Test send modal */}
      {showTestSend && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{tr('Wyślij test')}</h3>
            <p className="text-sm text-gray-500 mb-4">{tr('Push trafi tylko do podanego adresu. Sprawdź jak wygląda na urządzeniu.')}</p>
            <input
              type="email"
              value={testEmail}
              onChange={e => setTestEmail(e.target.value)}
              placeholder="ty@example.com"
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-sm mb-4"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowTestSend(false)} className="px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">{tr('Anuluj')}</button>
              <button
                onClick={handleTestSend}
                disabled={sending || !testEmail}
                className="px-4 py-1.5 text-sm bg-accent-primary text-white rounded-lg disabled:opacity-50"
              >
                {sending ? 'Wysyłanie...' : 'Wyślij'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Layout: lewo = formularz, prawo = preview */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-4">
        {/* Lewa kolumna */}
        <div className="space-y-4">
          {/* Section tabs */}
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

                <Field label="Tytuł" hint={`${form.title.length}/${TITLE_MAX}`}>
                  <input
                    maxLength={TITLE_MAX}
                    value={form.title}
                    onChange={e => updateForm({ title: e.target.value })}
                    placeholder={tr('Tytuł powiadomienia')}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium"
                  />
                </Field>

                <Field label="Treść" hint={`${form.body.length}/${BODY_MAX}`}>
                  <textarea
                    maxLength={BODY_MAX}
                    rows={3}
                    value={form.body}
                    onChange={e => updateForm({ body: e.target.value })}
                    placeholder={tr('Treść powiadomienia...')}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-sm resize-none"
                  />
                </Field>

                <Field label="Domyślny deep link (przy tapnięciu w body)">
                  <input
                    value={form.link}
                    onChange={e => updateForm({ link: e.target.value })}
                    placeholder="/ albo /events/123"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Icon URL (opcjonalnie)">
                    <input
                      value={form.icon}
                      onChange={e => updateForm({ icon: e.target.value })}
                      placeholder="https://..."
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"
                    />
                  </Field>
                  <Field label="Tag (collapse key)">
                    <input
                      value={form.tag}
                      onChange={e => updateForm({ tag: e.target.value })}
                      placeholder="news / event-12"
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"
                    />
                  </Field>
                </div>

                <Field label={<span className="flex items-center gap-1"><ImageIcon size={12} /> Big image (Android big picture / iOS attachment)</span>}>
                  <input
                    value={form.big_image}
                    onChange={e => updateForm({ big_image: e.target.value })}
                    placeholder="https://... (opcjonalnie)"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"
                  />
                </Field>
              </>
            )}

            {section === 'recipients' && (
              <RecipientSelector segments={segments} onChange={setSegments} />
            )}

            {section === 'actions' && (
              <ActionButtonsBuilder
                categoryId={form.category_id}
                actions={actions}
                onChange={(newActions, newCategoryId) => {
                  setActions(newActions);
                  if (newCategoryId) updateForm({ category_id: newCategoryId });
                }}
              />
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
          <PushPreview
            title={form.title}
            body={form.body}
            icon={form.icon}
            bigImage={form.big_image}
            categoryId={form.category_id}
            actions={actions}
          />
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
      title: campaign.title || '',
      body: campaign.body || '',
      icon: campaign.icon || '',
      big_image: campaign.big_image || '',
      tag: campaign.tag || '',
      link: campaign.link || '',
      category_id: campaign.category_id || 'cm_dismiss_only',
      data: campaign.data || {},
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
      title: template.title,
      body: template.body,
      icon: template.icon || '',
      category_id: template.category_id || 'cm_dismiss_only',
    };
  }
  return EMPTY_FORM;
}
