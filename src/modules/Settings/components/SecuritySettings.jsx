import React, { useState } from 'react';
import { ShieldCheck, KeyRound, UserPlus, LogIn, Lock, AlertTriangle, ChevronDown, MessageSquare } from 'lucide-react';
import { SettingsCard, SettingRow, Toggle, SelectSetting } from './SettingsUI';
import { supabase } from '../../../lib/supabase';
import { toast } from '../../../lib/toast';
import { tr } from '../../../i18n';
import { ssoOpenToAnyone } from './settingsLogic';

// „Bezpieczeństwo i logowanie” — JEDNO miejsce na politykę kont, podpięte pod klucze app_settings,
// które serwer naprawdę egzekwuje (UXE-01):
//   require_2fa_all / require_2fa_admins  → packages/api/src/auth/twofa-policy.js (claim n2fa przy logowaniu)
//   password_min_length / password_require_complexity → packages/api/src/lib/password-policy.js
//   account_change_emails → lib/account-notify.js
//   registration_* → /api/auth/register + registration-config
//   sso_* → lib/sso.js (+ sekret przez fn sso-save-config)
//   chat_dm_policy / chat_protect_minors → Komunikator (dataapi/komunikator.js: 403 DM_NOT_ALLOWED, fn chat-policy)
//   chat_private_files → storage messenger-attachments (odczyt tylko przez podpisany link)
// Dawny zestaw sec_* (nieczytany przez nikogo) i „automatyczne wylogowanie” (brak backendu) usunięte.

const on = (v) => v === 'on';
const onOff = (b) => (b ? 'on' : 'off');

const inputCls = 'w-full p-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-800 dark:text-white outline-none focus:border-accent-primary';
const labelCls = 'block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5';

// Pole tekstowe zapisywane po opuszczeniu (tylko gdy wartość się zmieniła).
function BlurInput({ id, settingKey, get, save, placeholder, fallback = '', transform = (v) => v }) {
  const current = get(settingKey) || fallback;
  return (
    <input
      id={id}
      type="text"
      defaultValue={current}
      placeholder={placeholder}
      onBlur={(e) => { const v = transform(e.target.value); if (v !== current) save(settingKey, v); }}
      className={inputCls}
    />
  );
}

export default function SecuritySettings({ get, save, roles = [], campuses = [] }) {
  const [ssoSecret, setSsoSecret] = useState({ google: '', microsoft: '' });
  const [secretBusy, setSecretBusy] = useState(null);

  const regMode = get('registration_mode') || 'closed';
  const dmPolicy = ['all', 'leaders', 'off'].includes(get('chat_dm_policy')) ? get('chat_dm_policy') : 'all';
  const minLen = String(get('password_min_length') || '8');
  const minLenOptions = [...new Set(['6', '8', '10', '12', '14', '16', minLen])]
    .sort((a, b) => Number(a) - Number(b))
    .map((v) => ({ value: v, label: tr('{n} znaków', { n: v }) }));

  const saveSsoSecret = async (provider) => {
    if (!ssoSecret[provider]) return;
    setSecretBusy(provider);
    const { error } = await supabase.functions.invoke('sso-save-config', { body: { provider, client_secret: ssoSecret[provider] } });
    setSecretBusy(null);
    if (error) { toast.error(tr('Nie udało się zapisać klucza. Sprawdź go i spróbuj ponownie.')); return; }
    toast.success(tr('Zapisano klucz logowania'));
    setSsoSecret((s) => ({ ...s, [provider]: '' }));
  };

  const redirectBase = `https://app.${window.location.hostname.split('.').slice(1).join('.')}`;
  const openSso = ssoOpenToAnyone(get);
  const all2fa = on(get('require_2fa_all'));

  return (
    <div className="max-w-3xl">
      {/* ── Logowanie i weryfikacja dwuetapowa ── */}
      <SettingsCard title={tr('Logowanie')} description={tr('Zasady logowania obowiązujące wszystkie konta.')} icon={ShieldCheck}>
        <SettingRow
          label={tr('Wymagaj weryfikacji dwuetapowej od wszystkich')}
          hint={tr('Osoba bez weryfikacji dwuetapowej po zalogowaniu zostanie poproszona o jej włączenie i do tego czasu nie zobaczy danych.')}
        >
          <Toggle label={tr('Wymagaj weryfikacji dwuetapowej od wszystkich')} checked={all2fa} onChange={(v) => save('require_2fa_all', onOff(v))} />
        </SettingRow>
        <SettingRow
          label={tr('Wymagaj weryfikacji dwuetapowej od administratorów')}
          hint={all2fa
            ? tr('Obejmuje to już ustawienie „od wszystkich”.')
            : tr('Dotyczy ról z pełnym dostępem. Najpierw włącz weryfikację na własnym koncie w „Mój profil”.')}
        >
          <Toggle label={tr('Wymagaj weryfikacji dwuetapowej od administratorów')} checked={all2fa || on(get('require_2fa_admins'))} disabled={all2fa} onChange={(v) => save('require_2fa_admins', onOff(v))} />
        </SettingRow>
        <SettingRow
          label={tr('Powiadamiaj e-mailem o zmianach konta')}
          hint={tr('Osoba dostaje wiadomość, gdy administrator zablokuje jej konto, zmieni rolę albo zresetuje weryfikację dwuetapową.')}
          last
        >
          <Toggle label={tr('Powiadamiaj e-mailem o zmianach konta')} checked={(get('account_change_emails') || 'on') !== 'off'} onChange={(v) => save('account_change_emails', onOff(v))} />
        </SettingRow>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">{tr('Zbyt wiele nieudanych prób logowania czasowo blokuje konto. Odblokujesz je w zakładce Użytkownicy.')}</p>
      </SettingsCard>

      {/* ── Hasła ── */}
      <SettingsCard title={tr('Hasła')} description={tr('Wymagania przy ustawianiu nowego hasła.')} icon={KeyRound}>
        <SettingRow label={tr('Minimalna długość hasła')}>
          <SelectSetting value={minLen} onChange={(v) => save('password_min_length', v)} options={minLenOptions} />
        </SettingRow>
        <SettingRow label={tr('Wymagaj małej i wielkiej litery oraz cyfry')} hint={tr('Silniejsze hasła, trudniejsze do odgadnięcia.')} last>
          <Toggle label={tr('Wymagaj małej i wielkiej litery oraz cyfry')} checked={on(get('password_require_complexity'))} onChange={(v) => save('password_require_complexity', onOff(v))} />
        </SettingRow>
        <div className="flex items-start gap-2 mt-3 text-xs text-gray-500 dark:text-gray-400">
          <Lock size={14} className="shrink-0 mt-0.5" />
          <span>{tr('Hasła są przechowywane w zaszyfrowanej postaci. Nikt, także administrator, nie może ich odczytać.')}</span>
        </div>
      </SettingsCard>

      {/* ── Zakładanie kont (rejestracja) ── */}
      <SettingsCard title={tr('Zakładanie kont')} description={tr('Kto i jak może uzyskać konto w aplikacji.')} icon={UserPlus}>
        <div className="grid sm:grid-cols-3 gap-3" role="radiogroup" aria-label={tr('Zakładanie kont')}>
          {[
            { v: 'closed', label: tr('Zamknięta'), desc: tr('Tylko administrator tworzy konta') },
            { v: 'approval', label: tr('Za zgodą administratora'), desc: tr('Można się rejestrować, konto wymaga zatwierdzenia') },
            { v: 'open', label: tr('Otwarta'), desc: tr('Rejestracja z potwierdzeniem e-mail') },
          ].map((opt) => {
            const active = regMode === opt.v;
            return (
              <button
                key={opt.v}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => !active && save('registration_mode', opt.v)}
                className={`text-left rounded-xl border-2 p-3 transition ${active ? 'border-accent-primary ring-2 ring-accent-primary/30 bg-accent-primary-lightest/40 dark:bg-gray-700' : 'border-gray-200 dark:border-gray-600 hover:border-accent-primary-light/60'}`}
              >
                <div className="font-semibold text-sm text-gray-800 dark:text-gray-100">{opt.label}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{opt.desc}</div>
              </button>
            );
          })}
        </div>
        {regMode !== 'closed' && (
          <div className="mt-5 space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="reg-default-role" className={labelCls}>{tr('Domyślna rola nowych kont')}</label>
                <select id="reg-default-role" value={get('registration_default_role') || ''} onChange={(e) => save('registration_default_role', e.target.value)} className={inputCls}>
                  <option value="">{tr('(najniższa — członek)')}</option>
                  {roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                </select>
              </div>
              {campuses.length > 0 && (
                <div>
                  <label htmlFor="reg-default-campus" className={labelCls}>{tr('Domyślny kampus nowych kont')}</label>
                  <select id="reg-default-campus" value={get('registration_default_campus') || ''} onChange={(e) => save('registration_default_campus', e.target.value)} className={inputCls}>
                    <option value="">{tr('(brak — bez kampusu)')}</option>
                    {campuses.map((c) => <option key={c.id} value={String(c.id)}>{c.name}{c.city ? ` (${c.city})` : ''}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div>
              <label htmlFor="reg-domains" className={labelCls}>{tr('Dozwolone domeny e-mail (opcjonalnie)')}</label>
              <BlurInput id="reg-domains" settingKey="registration_allowed_domains" get={get} save={save} placeholder={tr('np. schwro.pl, parafia.pl')} />
            </div>
            {regMode === 'approval' && (
              <div>
                <label htmlFor="reg-autoapprove" className={labelCls}>{tr('Domeny zatwierdzane automatycznie')}</label>
                <BlurInput id="reg-autoapprove" settingKey="registration_autoapprove_domains" get={get} save={save} placeholder={tr('np. schwro.pl')} />
                <p className="text-xs text-gray-400 mt-1">{tr('Konta z tych domen aktywują się od razu, bez czekania na administratora.')}</p>
              </div>
            )}
            <SettingRow label={tr('Zabezpieczenie przed botami przy rejestracji')} hint={tr('Krótkie sprawdzenie, czy rejestruje się człowiek.')}>
              <Toggle label={tr('Zabezpieczenie przed botami przy rejestracji')} checked={(get('registration_captcha') || 'on') !== 'off'} onChange={(v) => save('registration_captcha', onOff(v))} />
            </SettingRow>
            <SettingRow label={tr('Wymagaj akceptacji regulaminu i polityki prywatności (RODO)')} last={!on(get('registration_require_consent'))}>
              <Toggle label={tr('Wymagaj akceptacji regulaminu i polityki prywatności (RODO)')} checked={on(get('registration_require_consent'))} onChange={(v) => save('registration_require_consent', onOff(v))} />
            </SettingRow>
            {on(get('registration_require_consent')) && (
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="reg-consent-text" className={labelCls}>{tr('Treść zgody')}</label>
                  <BlurInput id="reg-consent-text" settingKey="registration_consent_text" get={get} save={save} placeholder={tr('Akceptuję regulamin i politykę prywatności')} />
                </div>
                <div>
                  <label htmlFor="reg-consent-url" className={labelCls}>{tr('Link do dokumentu')}</label>
                  <BlurInput id="reg-consent-url" settingKey="registration_consent_url" get={get} save={save} placeholder="https://…/polityka-prywatnosci" />
                </div>
              </div>
            )}
          </div>
        )}
      </SettingsCard>

      {/* ── Komunikator: rozmowy prywatne, ochrona niepełnoletnich, prywatne pliki (K9, K1) ── */}
      <SettingsCard title={tr('Komunikator')} description={tr('Kto może zaczynać rozmowy prywatne i jak chronimy osoby niepełnoletnie.')} icon={MessageSquare}>
        <SettingRow
          label={tr('Rozmowy prywatne (1:1)')}
          hint={dmPolicy === 'off'
            ? tr('Nikt nie zacznie nowej rozmowy prywatnej. Grupy i kanały działają jak dotąd.')
            : dmPolicy === 'leaders'
              ? tr('Rozmowa prywatna jest możliwa, gdy jedną ze stron jest lider (służby lub grupy) albo administrator.')
              : tr('Każdy może napisać do każdego.')}
        >
          <SelectSetting
            value={dmPolicy}
            onChange={(v) => save('chat_dm_policy', v)}
            options={[
              { value: 'all', label: tr('Wszyscy ze wszystkimi') },
              { value: 'leaders', label: tr('Tylko z liderem lub administratorem') },
              { value: 'off', label: tr('Wyłączone') },
            ]}
          />
        </SettingRow>
        <SettingRow
          label={tr('Chroń osoby niepełnoletnie')}
          hint={tr('Blokuje rozmowy prywatne między osobą poniżej 18 lat a dorosłym (na podstawie daty urodzenia w kartotece). Rozmowy w grupach i kanałach są dozwolone.')}
        >
          <Toggle label={tr('Chroń osoby niepełnoletnie')} checked={(get('chat_protect_minors') || 'on') !== 'off'} onChange={(v) => save('chat_protect_minors', onOff(v))} />
        </SettingRow>
        <SettingRow
          label={tr('Prywatne zdjęcia i pliki z czatu')}
          hint={tr('Pliki z rozmów otworzy tylko uczestnik rozmowy. Włącz, gdy wszyscy mają aktualną aplikację mobilną — starsze wersje nie pokażą wtedy zdjęć.')}
          last
        >
          <Toggle label={tr('Prywatne zdjęcia i pliki z czatu')} checked={on(get('chat_private_files'))} onChange={(v) => save('chat_private_files', onOff(v))} />
        </SettingRow>
      </SettingsCard>

      {/* ── Logowanie kontem Google / Microsoft ── */}
      <SettingsCard title={tr('Logowanie kontem Google lub Microsoft')} description={tr('Pozwól logować się tym samym kontem, którego ktoś używa do poczty.')} icon={LogIn}>
        {openSso && (
          <div role="alert" className="mb-4 flex items-start gap-3 rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-900/20 p-4">
            <AlertTriangle size={20} className="shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div className="text-sm text-amber-900 dark:text-amber-200">
              <p className="font-semibold">{tr('Każda osoba z kontem Google lub Microsoft może teraz sama założyć konto w Twoim kościele.')}</p>
              <p className="mt-1">{tr('Zalecamy włączyć zatwierdzanie nowych kont albo wpisać dozwolone domeny e-mail.')}</p>
              <button type="button" onClick={() => save('sso_provision_approval', 'on')} className="mt-2 px-3 py-1.5 rounded-lg text-sm font-semibold bg-white dark:bg-gray-800 border border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-gray-700">
                {tr('Wymagaj zatwierdzenia')}
              </button>
            </div>
          </div>
        )}
        {[{ p: 'google', label: 'Google' }, { p: 'microsoft', label: 'Microsoft' }].map(({ p, label }) => (
          <SettingRow key={p} label={tr('Logowanie kontem {provider}', { provider: label })}>
            <Toggle label={tr('Logowanie kontem {provider}', { provider: label })} checked={on(get(`sso_${p}_enabled`))} onChange={(v) => save(`sso_${p}_enabled`, onOff(v))} />
          </SettingRow>
        ))}
        <SettingRow label={tr('Twórz konto przy pierwszym logowaniu')} hint={tr('Osoba bez konta w aplikacji dostanie je automatycznie.')} last={!on(get('sso_auto_provision'))}>
          <Toggle label={tr('Twórz konto przy pierwszym logowaniu')} checked={on(get('sso_auto_provision'))} onChange={(v) => save('sso_auto_provision', onOff(v))} />
        </SettingRow>
        {on(get('sso_auto_provision')) && (
          <div className="pt-3 space-y-4">
            <SettingRow label={tr('Wymagaj zatwierdzenia nowych kont')} hint={tr('Nowe konta czekają na akceptację administratora w zakładce Użytkownicy.')}>
              <Toggle label={tr('Wymagaj zatwierdzenia nowych kont')} checked={on(get('sso_provision_approval'))} onChange={(v) => save('sso_provision_approval', onOff(v))} />
            </SettingRow>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="sso-domains" className={labelCls}>{tr('Dozwolone domeny e-mail')}</label>
                <BlurInput id="sso-domains" settingKey="sso_allowed_domains" get={get} save={save} placeholder={tr('np. parafia.pl, diecezja.pl')} transform={(v) => v.trim()} />
                <p className="text-xs text-gray-400 mt-1">{tr('Oddziel przecinkiem. Puste pole oznacza dowolną domenę.')}</p>
              </div>
              <div>
                <label htmlFor="sso-default-role" className={labelCls}>{tr('Rola nowych kont')}</label>
                <select id="sso-default-role" value={get('sso_default_role') || ''} onChange={(e) => save('sso_default_role', e.target.value)} className={inputCls}>
                  <option value="">{tr('(najniższa — członek)')}</option>
                  {roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Konfiguracja techniczna — schowana; zwykle zostaje pusta (wspólne dane platformy). */}
        <details className="mt-4 group rounded-xl border border-gray-200 dark:border-gray-600">
          <summary className="cursor-pointer select-none list-none px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center justify-between">
            {tr('Ustawienia zaawansowane (dla informatyka)')}
            <ChevronDown size={16} className="transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="px-4 pb-4 space-y-5">
            <p className="text-xs text-gray-500 dark:text-gray-400">{tr('Zwykle nic tu nie trzeba wpisywać — aplikacja używa wtedy wspólnej konfiguracji Avenit. Własne dane podaj tylko wtedy, gdy Twój kościół ma osobną aplikację logowania u Google lub Microsoft.')}</p>
            {[{ p: 'google', label: 'Google' }, { p: 'microsoft', label: 'Microsoft' }].map(({ p, label }) => (
              <div key={p} className="space-y-2">
                <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">{label}</div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor={`sso-${p}-id`} className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{tr('Identyfikator aplikacji (Client ID)')}</label>
                    <BlurInput id={`sso-${p}-id`} settingKey={`sso_${p}_client_id`} get={get} save={save} />
                  </div>
                  <div>
                    <label htmlFor={`sso-${p}-secret`} className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{tr('Tajny klucz (wpisz, aby zmienić)')}</label>
                    <div className="flex gap-2">
                      <input id={`sso-${p}-secret`} type="password" autoComplete="off" value={ssoSecret[p]} onChange={(e) => setSsoSecret((s) => ({ ...s, [p]: e.target.value }))} className={`${inputCls} flex-1`} />
                      <button type="button" onClick={() => saveSsoSecret(p)} disabled={!ssoSecret[p] || secretBusy === p} className="px-3 py-2 bg-accent-primary text-white rounded-lg text-sm font-medium disabled:opacity-50 shrink-0">{secretBusy === p ? tr('Zapisywanie…') : tr('Zapisz')}</button>
                    </div>
                  </div>
                  {p === 'microsoft' && (
                    <div className="sm:col-span-2">
                      <label htmlFor="sso-ms-tenant" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{tr('Katalog Microsoft (zwykle „common”)')}</label>
                      <BlurInput id="sso-ms-tenant" settingKey="sso_microsoft_tenant" get={get} save={save} fallback="common" transform={(v) => v.trim() || 'common'} />
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-400">{tr('Adres powrotu do wklejenia u dostawcy')}: <span className="font-mono text-gray-500 dark:text-gray-400 break-all">{redirectBase}/api/auth/oauth/{p}/callback</span></p>
              </div>
            ))}
          </div>
        </details>
      </SettingsCard>
    </div>
  );
}
