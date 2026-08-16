import React, { useState, useEffect } from 'react';
import { Save, Loader2, Eye, EyeOff, AlertCircle, CheckCircle, MessageSquare, Copy, ExternalLink, Sparkles } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import CustomSelect from '../../../components/CustomSelect';
import { useT } from '../../../i18n';
import { tr } from '../../../i18n';

// Konfiguracja asystenta AI (provider + model + klucz) — zapis do integration_settings
// (ai_provider/ai_model/ai_api_key/ai_base_url); odczyt serwerowo w fn ai-assist.
const AI_PROVIDERS = [
  { value: 'anthropic', label: 'Anthropic (Claude)', models: ['claude-sonnet-5', 'claude-opus-4-8', 'claude-haiku-4-5-20251001'] },
  { value: 'openai', label: 'OpenAI (GPT)', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'o3-mini'] },
  { value: 'openai-compatible', label: tr('OpenAI-kompatybilny (własny URL)'), models: ['gpt-4o', 'llama-3.3-70b', 'mixtral-8x7b'] },
];

function AiIntegrationSection({ settings, onSaved }) {
  const [provider, setProvider] = useState('anthropic');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [keyDirty, setKeyDirty] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState(null);

  useEffect(() => {
    setProvider(settings.ai_provider?.value || 'anthropic');
    setModel(settings.ai_model?.value || '');
    setBaseUrl(settings.ai_base_url?.value || '');
    setApiKey(''); setKeyDirty(false);
  }, [settings]);

  const keySet = !!settings.ai_api_key?.value;
  const meta = AI_PROVIDERS.find((p) => p.value === provider) || AI_PROVIDERS[0];

  const save = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const stamp = { updated_by: user?.email, updated_at: new Date().toISOString() };
      const rows = [
        { key: 'ai_provider', value: provider },
        { key: 'ai_model', value: model.trim() || null },
        { key: 'ai_base_url', value: (provider === 'openai-compatible' ? baseUrl.trim() : '') || null },
      ];
      if (keyDirty) rows.push({ key: 'ai_api_key', value: apiKey.trim() || null });
      for (const r of rows) {
        const { error } = await supabase.from('integration_settings').upsert({ ...r, ...stamp }, { onConflict: 'key' });
        if (error) throw error;
      }
      setKeyDirty(false); setApiKey('');
      onSaved?.('Zapisano konfigurację asystenta AI.', false);
    } catch (e) { onSaved?.('Błąd zapisu AI: ' + e.message, true); }
    finally { setSaving(false); }
  };

  const runTest = async () => {
    setTesting(true); setTest(null);
    try {
      const { data, error } = await supabase.functions.invoke('ai-assist', { body: { task: 'draft_message', input: 'Odpowiedz krótko: DZIAŁA' } });
      if (error || data?.error) setTest({ ok: false, msg: data?.error || error?.message });
      else setTest({ ok: true, msg: 'Połączenie działa — model odpowiedział.' });
    } catch (e) { setTest({ ok: false, msg: e.message }); }
    finally { setTesting(false); }
  };

  const fieldCls = 'w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg';

  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{tr('Asystent AI')}</h2>
          <p className="text-xs text-gray-500">{tr('Klucz i model używane przez asystenta AI, generator modułów i tablic.')}</p>
        </div>
      </div>

      <div className="space-y-4 bg-white dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 p-5">
        <div>
          <label className="text-sm font-medium text-gray-900 dark:text-white block mb-1">{tr('Dostawca (LLM)')}</label>
          <CustomSelect options={AI_PROVIDERS.map((p) => ({ value: p.value, label: p.label }))} value={provider}
            onChange={(v) => { setProvider(v); setModel(''); }} />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-900 dark:text-white block mb-1">{tr('Model')}</label>
          <input list="ai-models" value={model} onChange={(e) => setModel(e.target.value)} placeholder={meta.models[0]} className={fieldCls + ' font-mono'} />
          <datalist id="ai-models">{meta.models.map((m) => <option key={m} value={m} />)}</datalist>
          <p className="text-xs text-gray-400 mt-1">{tr('Wybierz z listy lub wpisz dokładny identyfikator modelu.')}</p>
        </div>

        {provider === 'openai-compatible' && (
          <div>
            <label className="text-sm font-medium text-gray-900 dark:text-white block mb-1">{tr('Base URL')}</label>
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://openrouter.ai/api/v1" className={fieldCls + ' font-mono'} />
          </div>
        )}

        <div>
          <label className="text-sm font-medium text-gray-900 dark:text-white block mb-1">{tr('Klucz API')}</label>
          <input type="password" value={keyDirty ? apiKey : ''} onFocus={() => setKeyDirty(true)}
            onChange={(e) => { setKeyDirty(true); setApiKey(e.target.value); }}
            placeholder={keySet ? '•••••••• ' + tr('(ustawiony — wpisz nowy, aby zmienić)') : tr('wklej klucz API')}
            className={fieldCls + ' font-mono'} />
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <button onClick={runTest} disabled={testing || !keySet}
            className="flex items-center gap-1.5 px-4 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50">
            {testing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {tr('Testuj połączenie')}
          </button>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-lg disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {tr('Zapisz')}
          </button>
        </div>

        {test && (
          <div className={`p-3 rounded-lg flex items-start gap-2 ${test.ok ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'}`}>
            {test.ok ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            <span className="text-sm">{test.msg}</span>
          </div>
        )}
      </div>
    </section>
  );
}

// Klucze SMSAPI w `integration_settings` (admin-only RLS).
const SMSAPI_KEYS = [
  {
    key: 'smsapi_token',
    label: 'Personal Access Token',
    description: 'OAuth token z panelu SMSAPI (Bearer). Generuj w: ssl.smsapi.pl/react/oauth/manage',
    secret: true,
    placeholder: tr('np. eyJ0eXAi... (wklej cały token)'),
  },
  {
    key: 'smsapi_default_sender',
    label: tr('Domyślny nadawca (Sender ID)'),
    description: tr('Zarejestrowany w SMSAPI. Max 11 znaków alfanumerycznych.'),
    secret: false,
    placeholder: 'np. Avenit',
    maxLength: 11,
  },
  {
    key: 'smsapi_api_url',
    label: 'URL bramki SMSAPI',
    description: tr('Zostaw default lub podmień na sandbox/inny region.'),
    secret: false,
    placeholder: 'https://api.smsapi.pl',
  },
  {
    key: 'smsapi_webhook_secret',
    label: 'Webhook MO secret',
    description: 'Sekret w URL webhooka MO (incoming SMS / RSVP).',
    secret: true,
    placeholder: tr('losowy ciąg, np. 32 znaki'),
  },
];

export default function IntegrationsTab() {
  const t = useT();
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [revealed, setRevealed] = useState({});
  const [edits, setEdits] = useState({});
  const [message, setMessage] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [apiUrl, setApiUrl] = useState('');

  useEffect(() => {
    loadSettings();
    setApiUrl(import.meta.env.VITE_API_URL || window.location.origin);
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('integration_settings')
      .select('key, value, description, is_secret, updated_at, updated_by');
    if (error) {
      console.error('integration_settings fetch error:', error);
      setMessage({ type: 'error', text: `Błąd: ${error.message}` });
    } else {
      const map = {};
      (data || []).forEach(r => { map[r.key] = r; });
      setSettings(map);
    }
    setLoading(false);
  };

  const saveValue = async (key, newValue) => {
    setSaving(s => ({ ...s, [key]: true }));
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const cleaned = newValue == null ? null : String(newValue).trim() || null;
      const { error } = await supabase
        .from('integration_settings')
        .upsert(
          { key, value: cleaned, updated_by: user?.email, updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        );
      if (error) throw error;
      setEdits(prev => { const n = { ...prev }; delete n[key]; return n; });
      setRevealed(prev => ({ ...prev, [key]: false }));
      setMessage({ type: 'success', text: `Zapisano: ${key}` });
      await loadSettings();
    } catch (e) {
      setMessage({ type: 'error', text: `Błąd zapisu: ${e.message}` });
    } finally {
      setSaving(s => ({ ...s, [key]: false }));
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // Sprawdza czy token działa, wywołując SMSAPI z dummy POST (bez wysyłki)
      // przez nasz edge function send-sms z niepoprawnym numerem — odpowiedź pokaże
      // czy token jest OK (błąd "invalid_phone" = token OK, inny = problem z tokenem).
      const { data, error } = await supabase.functions.invoke('send-sms', {
        body: { phone: '0', message: 'test', sender: 'TEST' },
      });
      if (error) throw error;
      if (data?.error === 'invalid_phone') {
        setTestResult({ ok: true, msg: 'Token poprawny (edge function odpowiada).' });
      } else if (data?.error?.includes('token') || data?.error?.includes('not configured')) {
        setTestResult({ ok: false, msg: data.error });
      } else {
        setTestResult({ ok: true, msg: `Edge function odpowiada: ${JSON.stringify(data)}` });
      }
    } catch (e) {
      setTestResult({ ok: false, msg: e.message });
    } finally {
      setTesting(false);
    }
  };

  const copyWebhookUrl = async () => {
    const secret = settings.smsapi_webhook_secret?.value;
    const url = `${apiUrl}/api/fn/sms-incoming-webhook${secret ? `?secret=${secret}` : ''}`;
    try {
      await navigator.clipboard.writeText(url);
      setMessage({ type: 'success', text: 'Skopiowano URL webhooka' });
    } catch {
      setMessage({ type: 'error', text: tr('Nie udało się skopiować') });
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">{t('Ładowanie...')}</div>;

  return (
    <div className="space-y-8 max-w-3xl">
      {message && (
        <div className={`p-3 rounded-lg flex items-center gap-2 cursor-pointer ${
          message.type === 'success'
            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
        }`} onClick={() => setMessage(null)}>
          {message.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          {message.text}
        </div>
      )}

      {/* Asystent AI */}
      <AiIntegrationSection
        settings={settings}
        onSaved={(text, isErr) => { setMessage({ type: isErr ? 'error' : 'success', text }); loadSettings(); }}
      />

      {/* SMSAPI Section */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent-primary-light to-accent-secondary-light flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">SMSAPI.pl</h2>
            <p className="text-xs text-gray-500">{t('Konfiguracja bramki SMS dla modułu SMS Kampanie.')}</p>
          </div>
        </div>

        <div className="space-y-4 bg-white dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 p-5">
          {SMSAPI_KEYS.map(meta => {
            const row = settings[meta.key];
            const currentValue = row?.value || '';
            const editValue = edits[meta.key];
            const isEditing = editValue !== undefined;
            const isRevealed = revealed[meta.key];
            const isSet = !!currentValue;
            const isSaving = saving[meta.key];

            const masked = isSet
              ? meta.secret
                ? `••••••••${currentValue.slice(-4)}`
                : currentValue
              : '(nie ustawione)';

            return (
              <div key={meta.key} className="border-b border-gray-100 dark:border-gray-700 pb-4 last:border-0 last:pb-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex-1">
                    <label className="text-sm font-medium text-gray-900 dark:text-white">{meta.label}</label>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{meta.description}</p>
                  </div>
                  {isSet && !isEditing && meta.secret && (
                    <button
                      onClick={() => setRevealed(r => ({ ...r, [meta.key]: !r[meta.key] }))}
                      className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
                      title={isRevealed ? 'Ukryj' : tr('Pokaż')}
                    >
                      {isRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  )}
                </div>

                {isEditing ? (
                  <div className="flex gap-2 mt-2">
                    <input
                      type={meta.secret ? 'password' : 'text'}
                      value={editValue}
                      onChange={e => setEdits(p => ({ ...p, [meta.key]: e.target.value }))}
                      placeholder={meta.placeholder}
                      maxLength={meta.maxLength}
                      autoFocus
                      className="flex-1 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg font-mono"
                    />
                    <button
                      onClick={() => saveValue(meta.key, editValue)}
                      disabled={isSaving}
                      className="flex items-center gap-1.5 px-3 py-2 text-sm bg-accent-primary text-white rounded-lg disabled:opacity-50"
                    >
                      {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      Zapisz
                    </button>
                    <button
                      onClick={() => setEdits(p => { const n = { ...p }; delete n[meta.key]; return n; })}
                      className="px-3 py-2 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600"
                    >
                      Anuluj
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <code className={`text-sm flex-1 px-3 py-2 rounded-lg font-mono break-all ${
                      isSet
                        ? 'bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                        : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                    }`}>
                      {meta.secret && isSet && !isRevealed ? masked : (isRevealed && isSet ? currentValue : masked)}
                    </code>
                    <button
                      onClick={() => setEdits(p => ({ ...p, [meta.key]: '' }))}
                      className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600"
                    >
                      {isSet ? tr('Zmień') : 'Ustaw'}
                    </button>
                  </div>
                )}

                {row?.updated_at && isSet && (
                  <p className="text-xs text-gray-400 mt-1">
                    Zaktualizowano {new Date(row.updated_at).toLocaleString('pl-PL')}
                    {row.updated_by && ` przez ${row.updated_by}`}
                  </p>
                )}
              </div>
            );
          })}

          {/* Webhook URL helper */}
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 mt-4">
            <div className="flex items-start gap-2">
              <ExternalLink size={16} className="text-blue-600 dark:text-blue-400 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-blue-700 dark:text-blue-300">URL webhooka MO (do wklejenia w panelu SMSAPI)</p>
                <code className="text-xs text-blue-700 dark:text-blue-400 break-all block mt-1 font-mono">
                  {apiUrl}/api/fn/sms-incoming-webhook
                  {settings.smsapi_webhook_secret?.value ? `?secret=${'•'.repeat(8)}` : ''}
                </code>
                <button
                  onClick={copyWebhookUrl}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  <Copy size={12} /> Kopiuj URL
                </button>
              </div>
            </div>
          </div>

          {/* Test connection */}
          <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
            <div className="text-sm">
              <p className="font-medium text-gray-900 dark:text-white">{t('Test połączenia')}</p>
              <p className="text-xs text-gray-500">{t('Sprawdź czy edge function odpowiada i token jest skonfigurowany.')}</p>
            </div>
            <button
              onClick={handleTestConnection}
              disabled={testing}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-gradient-to-r from-accent-primary-light to-accent-secondary-light text-white rounded-lg disabled:opacity-50"
            >
              {testing ? <Loader2 size={14} className="animate-spin" /> : null}
              Testuj
            </button>
          </div>

          {testResult && (
            <div className={`p-3 rounded-lg flex items-start gap-2 ${
              testResult.ok ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                            : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
            }`}>
              {testResult.ok ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
              <span className="text-sm">{testResult.msg}</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
