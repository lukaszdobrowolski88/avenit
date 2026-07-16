import React from 'react';
import { Mail, Bell, MessageSquare, Megaphone } from 'lucide-react';
import { SettingsCard, SettingRow, Toggle, SelectSetting } from './SettingsUI';
import { useT } from '../../../i18n';
import { tr } from '../../../i18n';

// Ustawienia powiadomień — kanały i zdarzenia. Zapisywane w app_settings
// (klucze notif_*). Domyślnie włączone tam, gdzie ma to sens.
export default function NotificationSettings({ get, save }) {
  const t = useT();
  const bool = (k, def = true) => (get(k) ?? String(def)) === 'true';
  const setBool = (k) => (v) => save(k, String(v));

  const channels = [
    { key: 'notif_channel_email', label: 'E-mail', hint: 'Powiadomienia na adres e-mail', icon: Mail },
    { key: 'notif_channel_push', label: 'Push', hint: 'Powiadomienia w aplikacji i na telefon', icon: Bell },
    { key: 'notif_channel_sms', label: 'SMS', hint: 'Powiadomienia SMS (wymaga integracji SMSAPI)', icon: MessageSquare, def: false },
  ];

  const events = [
    { key: 'notif_event_assignments', label: t('Przydziały do służby'), hint: tr('Gdy ktoś zostanie przypisany do grafiku') },
    { key: 'notif_event_programs', label: 'Nowe programy', hint: tr('Publikacja programu nabożeństwa') },
    { key: 'notif_event_messages', label: t('Wiadomości w Komunikatorze'), hint: tr('Nowe wiadomości w czacie') },
    { key: 'notif_event_forms', label: t('Zgłoszenia z formularzy'), hint: 'Nowe odpowiedzi na formularze' },
    { key: 'notif_event_prayer', label: t('Prośby modlitewne'), hint: tr('Nowe wpisy na ścianie modlitwy') },
  ];

  return (
    <div className="max-w-3xl">
      <SettingsCard title={t('Kanały powiadomień')} description={tr('Jakimi kanałami wysyłamy powiadomienia.')} icon={Megaphone}>
        {channels.map((c, i) => (
          <SettingRow key={c.key} label={c.label} hint={c.hint} last={i === channels.length - 1}>
            <Toggle checked={bool(c.key, c.def)} onChange={setBool(c.key)} />
          </SettingRow>
        ))}
      </SettingsCard>

      <SettingsCard title="Zdarzenia" description={tr('Przy jakich zdarzeniach wysyłać powiadomienia.')} icon={Bell}>
        {events.map((e, i) => (
          <SettingRow key={e.key} label={e.label} hint={e.hint} last={i === events.length - 1}>
            <Toggle checked={bool(e.key)} onChange={setBool(e.key)} />
          </SettingRow>
        ))}
      </SettingsCard>

      <SettingsCard title="Podsumowania" description="Zbiorcze powiadomienia zamiast pojedynczych.">
        <SettingRow label={tr('Częstotliwość podsumowań e-mail')} hint={tr('Jak często wysyłać zbiorczy przegląd')} last>
          <SelectSetting
            value={get('notif_digest') || 'off'}
            onChange={(v) => save('notif_digest', v)}
            options={[
              { value: 'off', label: t('Wyłączone') },
              { value: 'daily', label: 'Codziennie' },
              { value: 'weekly', label: t('Co tydzień') },
            ]}
          />
        </SettingRow>
      </SettingsCard>
    </div>
  );
}
