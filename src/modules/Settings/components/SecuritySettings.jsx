import React from 'react';
import { ShieldCheck, KeyRound, Clock, Lock } from 'lucide-react';
import { SettingsCard, SettingRow, Toggle, SelectSetting } from './SettingsUI';

// Ustawienia bezpieczeństwa organizacji. Zapisywane w app_settings (sec_*).
// Egzekwowanie polityk (np. wymuszenie 2FA) dzieje się przy logowaniu/kontroli
// dostępu — tu ustawiamy preferencje.
export default function SecuritySettings({ get, save }) {
  const bool = (k, def = false) => (get(k) ?? String(def)) === 'true';

  return (
    <div className="max-w-3xl">
      <SettingsCard title="Uwierzytelnianie" description="Zasady logowania dla wszystkich użytkowników." icon={ShieldCheck}>
        <SettingRow label="Wymuś 2FA dla wszystkich" hint="Każdy użytkownik musi skonfigurować weryfikację dwuetapową">
          <Toggle checked={bool('sec_force_2fa')} onChange={(v) => save('sec_force_2fa', String(v))} />
        </SettingRow>
        <SettingRow label="Wymuś 2FA dla administratorów" hint="Konta z rolą administratora muszą mieć 2FA" last>
          <Toggle checked={bool('sec_force_2fa_admins', true)} onChange={(v) => save('sec_force_2fa_admins', String(v))} />
        </SettingRow>
      </SettingsCard>

      <SettingsCard title="Hasła" description="Wymagania dla haseł użytkowników." icon={KeyRound}>
        <SettingRow label="Minimalna długość hasła">
          <SelectSetting
            value={get('sec_password_min') || '8'}
            onChange={(v) => save('sec_password_min', v)}
            options={[
              { value: '6', label: '6 znaków' },
              { value: '8', label: '8 znaków' },
              { value: '10', label: '10 znaków' },
              { value: '12', label: '12 znaków' },
            ]}
          />
        </SettingRow>
        <SettingRow label="Wymagaj cyfry i wielkiej litery" hint="Silniejsze hasła" last>
          <Toggle checked={bool('sec_password_complex')} onChange={(v) => save('sec_password_complex', String(v))} />
        </SettingRow>
      </SettingsCard>

      <SettingsCard title="Sesje" description="Zarządzanie aktywnymi sesjami użytkowników." icon={Clock}>
        <SettingRow label="Automatyczne wylogowanie" hint="Po okresie bezczynności" last>
          <SelectSetting
            value={get('sec_session_timeout') || '0'}
            onChange={(v) => save('sec_session_timeout', v)}
            options={[
              { value: '0', label: 'Nigdy' },
              { value: '30', label: 'Po 30 min' },
              { value: '60', label: 'Po 1 godz.' },
              { value: '480', label: 'Po 8 godz.' },
            ]}
          />
        </SettingRow>
      </SettingsCard>

      <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40">
        <Lock size={18} className="text-blue-500 shrink-0 mt-0.5" />
        <p className="text-sm text-blue-700 dark:text-blue-300">
          Hasła są przechowywane w formie zahashowanej (bcrypt). Avenit nigdy nie przechowuje haseł w postaci jawnej.
        </p>
      </div>
    </div>
  );
}
