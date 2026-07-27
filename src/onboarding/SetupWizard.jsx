import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Palette, Boxes, UserPlus, Check, X, ChevronRight, ChevronLeft, PartyPopper, Image as ImageIcon, PlayCircle } from 'lucide-react';
import { useOnboarding } from './OnboardingContext';
import { usePermissions } from '../contexts/PermissionsContext';
import { supabase } from '../lib/supabase';
import { COLOR_PRESETS, applyColorPreset } from '../lib/colorPresets';
import { WIZARD_STEPS, WIZARD_MODULES } from './config';
import { Toggle } from '../modules/Settings/components/SettingsUI';
import { useT } from '../i18n';

// Kreator konfiguracji nowego tenanta (dla admina). Wykonuje REALNE zapisy do app_settings:
// marka (logo + preset kolorów), włączone moduły. Krok „zespół" prowadzi do zarządzania
// użytkownikami. Na końcu proponuje interaktywny samouczek.

async function saveSetting(key, value) {
  try {
    await supabase.from('app_settings').upsert({ key, value: String(value) }, { onConflict: 'key' });
  } catch (e) { console.warn('[wizard] zapis ustawienia nieudany:', key, e?.message); }
}

export default function SetupWizard() {
  const t = useT();
  const navigate = useNavigate();
  const { wizardOpen, closeWizard, markWizardDone, startTour } = useOnboarding();
  const { appSettings, logoUrl } = usePermissions();

  const [step, setStep] = useState(0);
  const [logo, setLogo] = useState(logoUrl || '');
  const [preset, setPreset] = useState(localStorage.getItem('color_preset') || 'amber-yellow');
  const [modules, setModules] = useState(() => {
    const init = {};
    WIZARD_MODULES.forEach(m => { init[m.key] = appSettings?.[m.key] ?? false; });
    return init;
  });

  if (!wizardOpen) return null;

  const pickPreset = (key) => { setPreset(key); applyColorPreset(key); saveSetting('color_preset', key); };
  const toggleModule = (key) => {
    setModules(prev => {
      const next = { ...prev, [key]: !prev[key] };
      saveSetting(`module_${key}_enabled`, next[key] ? 'true' : 'false');
      return next;
    });
  };

  const saveBrand = async () => {
    const url = logo.trim();
    if (url) { await saveSetting('org_logo_url', url); try { localStorage.setItem('app_logo_cache', url); } catch { /* ignore */ } }
  };

  const finish = (withTour) => {
    markWizardDone();
    closeWizard();
    if (withTour) startTour('welcome');
  };

  const next = async () => {
    if (step === 0) await saveBrand();
    setStep(s => Math.min(WIZARD_STEPS.length - 1, s + 1));
  };
  const prev = () => setStep(s => Math.max(0, s - 1));

  const isLastConfig = step === WIZARD_STEPS.length - 2; // krok „Zespół"
  const isDone = step === WIZARD_STEPS.length - 1;

  return createPortal(
    <div className="fixed inset-0 z-[100055] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
        <button onClick={closeWizard} className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition z-10" aria-label={t('Zamknij')}>
          <X size={18} />
        </button>

        {/* Pasek postępu kroków */}
        <div className="px-6 pt-6">
          <div className="flex items-center gap-1.5">
            {WIZARD_STEPS.map((s, i) => (
              <div key={s.id} className={`h-1.5 flex-1 rounded-full transition-all ${i <= step ? 'bg-accent-primary' : 'bg-gray-200 dark:bg-gray-700'}`} />
            ))}
          </div>
          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-accent-primary dark:text-accent-primary-light">
            {t('Krok {n} z {total}', { n: step + 1, total: WIZARD_STEPS.length })} · {t(WIZARD_STEPS[step].title)}
          </p>
        </div>

        <div className="px-6 py-5 overflow-y-auto custom-scrollbar">
          {/* Krok 0 — Marka */}
          {step === 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-9 h-9 rounded-xl bg-accent-primary-lightest dark:bg-accent-primary-darkest/40 flex items-center justify-center text-accent-primary dark:text-accent-primary-light"><Palette size={18} /></div>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white">{t('Marka kościoła')}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('Logo i kolory pojawią się w całym panelu.')}</p>
                </div>
              </div>

              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('Adres URL logo')}</label>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-11 h-11 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 flex items-center justify-center overflow-hidden shrink-0">
                  {logo ? <img src={logo} alt="logo" className="w-full h-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : <ImageIcon size={18} className="text-gray-400" />}
                </div>
                <input
                  value={logo}
                  onChange={(e) => setLogo(e.target.value)}
                  placeholder="https://…/logo.png"
                  className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-white outline-none focus:border-accent-primary"
                />
              </div>
              <p className="text-xs text-gray-400 mb-4">{t('Logo możesz też wgrać później w Ustawieniach → Wygląd.')}</p>

              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('Kolorystyka')}</label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(COLOR_PRESETS).map(([key, p]) => (
                  <button
                    key={key}
                    onClick={() => pickPreset(key)}
                    className={`relative rounded-xl border-2 p-2.5 transition ${preset === key ? 'border-accent-primary' : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'}`}
                  >
                    <span className="flex gap-1 justify-center mb-1.5">
                      <span className="w-4 h-4 rounded-full" style={{ background: p.preview[0] }} />
                      <span className="w-4 h-4 rounded-full" style={{ background: p.preview[1] }} />
                    </span>
                    <span className="block text-[10px] text-gray-600 dark:text-gray-300 leading-tight">{p.label}</span>
                    {preset === key && <span className="absolute top-1 right-1 text-accent-primary"><Check size={12} /></span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Krok 1 — Moduły */}
          {step === 1 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-9 h-9 rounded-xl bg-accent-primary-lightest dark:bg-accent-primary-darkest/40 flex items-center justify-center text-accent-primary dark:text-accent-primary-light"><Boxes size={18} /></div>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white">{t('Wybierz moduły')}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('Włącz tylko to, czego używacie — zawsze zmienisz to w Ustawieniach.')}</p>
                </div>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {WIZARD_MODULES.map(m => (
                  <div key={m.key} className="flex items-center justify-between py-3">
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{t(m.label)}</span>
                    <Toggle checked={!!modules[m.key]} onChange={() => toggleModule(m.key)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Krok 2 — Zespół */}
          {step === 2 && (
            <div className="text-center py-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-accent-primary-lightest dark:bg-accent-primary-darkest/40 flex items-center justify-center text-accent-primary dark:text-accent-primary-light mb-3"><UserPlus size={26} /></div>
              <h3 className="font-bold text-gray-900 dark:text-white">{t('Zaproś swój zespół')}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 max-w-sm mx-auto">{t('Dodaj liderów i koordynatorów oraz nadaj im uprawnienia w sekcji zarządzania użytkownikami.')}</p>
              <button
                onClick={() => { markWizardDone(); closeWizard(); navigate('/settings'); }}
                className="mt-4 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-accent-primary-light to-accent-secondary-light hover:opacity-90 transition inline-flex items-center gap-2"
              >
                <UserPlus size={16} /> {t('Przejdź do zarządzania użytkownikami')}
              </button>
              <p className="text-xs text-gray-400 mt-3">{t('Możesz to zrobić także później.')}</p>
            </div>
          )}

          {/* Krok 3 — Gotowe */}
          {isDone && (
            <div className="text-center py-4">
              <PartyPopper size={40} className="mx-auto text-accent-primary mb-3" />
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">{t('Wszystko gotowe!')}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5">{t('Twój kościół jest skonfigurowany. Pokazać Ci teraz najważniejsze funkcje?')}</p>
            </div>
          )}
        </div>

        {/* Nawigacja */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3">
          {step > 0 && !isDone ? (
            <button onClick={prev} className="px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition flex items-center gap-1">
              <ChevronLeft size={16} /> {t('Wstecz')}
            </button>
          ) : <span />}

          {isDone ? (
            <div className="flex items-center gap-2 ml-auto">
              <button onClick={() => finish(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                {t('Zakończ')}
              </button>
              <button onClick={() => finish(true)} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-accent-primary-light to-accent-secondary-light hover:opacity-90 transition flex items-center gap-1.5">
                <PlayCircle size={16} /> {t('Pokaż samouczek')}
              </button>
            </div>
          ) : (
            <button onClick={next} className="ml-auto px-5 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-accent-primary-light to-accent-secondary-light hover:opacity-90 transition flex items-center gap-1.5">
              {isLastConfig ? t('Prawie gotowe') : t('Dalej')} <ChevronRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
