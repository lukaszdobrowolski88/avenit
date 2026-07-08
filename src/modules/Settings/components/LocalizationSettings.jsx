import React from 'react';
import { Globe, Calendar, Clock, Coins, Languages } from 'lucide-react';
import { SettingsCard, SettingRow, SelectSetting } from './SettingsUI';
import { useI18n } from '../../../i18n';

// Ustawienia regionalne — język, strefa czasowa, formaty, waluta. app_settings (loc_*).
export default function LocalizationSettings({ get, save }) {
  const { lang, setLang, t, languages } = useI18n();
  return (
    <div className="max-w-3xl">
      <SettingsCard title={t('Język aplikacji')} description={t('Wybierz język interfejsu aplikacji')} icon={Languages}>
        <SettingRow label={t('Język aplikacji')} last>
          <SelectSetting
            value={lang}
            onChange={(v) => setLang(v)}
            options={languages.map((l) => ({ value: l.code, label: `${l.flag} ${l.label}` }))}
            className="min-w-[200px]"
          />
        </SettingRow>
      </SettingsCard>

      <SettingsCard title="Region i czas" description="Strefa czasowa i sposób wyświetlania dat." icon={Globe}>
        <SettingRow label="Strefa czasowa">
          <SelectSetting
            value={get('loc_timezone') || 'Europe/Warsaw'}
            onChange={(v) => save('loc_timezone', v)}
            options={[
              { value: 'Europe/Warsaw', label: 'Warszawa (CET)' },
              { value: 'Europe/London', label: 'Londyn (GMT)' },
              { value: 'Europe/Berlin', label: 'Berlin (CET)' },
              { value: 'America/New_York', label: 'Nowy Jork (EST)' },
              { value: 'America/Chicago', label: 'Chicago (CST)' },
            ]}
            className="min-w-[200px]"
          />
        </SettingRow>
        <SettingRow label="Format daty" hint="Sposób wyświetlania dat w aplikacji">
          <SelectSetting
            value={get('loc_date_format') || 'dd.mm.yyyy'}
            onChange={(v) => save('loc_date_format', v)}
            options={[
              { value: 'dd.mm.yyyy', label: '31.12.2026' },
              { value: 'yyyy-mm-dd', label: '2026-12-31' },
              { value: 'dd/mm/yyyy', label: '31/12/2026' },
            ]}
          />
        </SettingRow>
        <SettingRow label="Format godziny">
          <SelectSetting
            value={get('loc_time_format') || '24h'}
            onChange={(v) => save('loc_time_format', v)}
            options={[
              { value: '24h', label: '24-godzinny (14:30)' },
              { value: '12h', label: '12-godzinny (2:30 PM)' },
            ]}
          />
        </SettingRow>
        <SettingRow label="Pierwszy dzień tygodnia" last>
          <SelectSetting
            value={get('loc_week_start') || 'monday'}
            onChange={(v) => save('loc_week_start', v)}
            options={[
              { value: 'monday', label: 'Poniedziałek' },
              { value: 'sunday', label: 'Niedziela' },
            ]}
          />
        </SettingRow>
      </SettingsCard>

      <SettingsCard title="Waluta" description="Waluta używana w module Finanse." icon={Coins}>
        <SettingRow label="Waluta" last>
          <SelectSetting
            value={get('loc_currency') || 'PLN'}
            onChange={(v) => save('loc_currency', v)}
            options={[
              { value: 'PLN', label: 'Złoty (PLN)' },
              { value: 'EUR', label: 'Euro (EUR)' },
              { value: 'USD', label: 'Dolar (USD)' },
              { value: 'GBP', label: 'Funt (GBP)' },
            ]}
          />
        </SettingRow>
      </SettingsCard>
    </div>
  );
}
