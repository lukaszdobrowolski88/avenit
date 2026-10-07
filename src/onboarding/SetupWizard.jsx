import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Palette, Boxes, UserPlus, Check, ChevronRight, ChevronLeft, PartyPopper, Image as ImageIcon, PlayCircle, Upload } from 'lucide-react';
import { useOnboarding } from './OnboardingContext';
import { usePermissions } from '../contexts/PermissionsContext';
import { supabase } from '../lib/supabase';
import { COLOR_PRESETS, applyColorPreset } from '../lib/colorPresets';
import { WIZARD_STEPS, WIZARD_MODULES } from './config';
import { Toggle } from '../modules/Settings/components/SettingsUI';
import { invalidateModuleLabels } from '../hooks/useModuleLabel';
import { useT, tr } from '../i18n';
import { toast } from '../lib/toast';
import Modal from '../components/Modal';
import Button from '../components/Button';

// Kreator konfiguracji nowego tenanta (dla admina). Nic nie zapisuje przy samym klikaniu —
// wybór marki i modułów trafia do bazy dopiero po „Dalej” (UXE-19):
//   • marka: logo (wgrane z dysku, jak w Ustawieniach → Wygląd) + preset kolorów → app_settings,
//   • moduły: app_modules.is_enabled — to samo pole, które czyta menu (UXE-13).
// Krok „Zespół” prowadzi do /settings?tab=users. Na końcu proponuje samouczek.

// Klucze kreatora (config.js) → klucze app_modules, gdy się różnią.
const APP_MODULE_KEY = { groups: 'homegroups' };
const moduleKeyOf = (k) => APP_MODULE_KEY[k] || k;

async function saveSetting(key, value) {
  const { error } = await supabase.from('app_settings').upsert({ key, value: String(value) }, { onConflict: 'key' });
  if (error) throw error;
}

export default function SetupWizard() {
  const t = useT();
  const navigate = useNavigate();
  const { wizardOpen, closeWizard, markWizardDone, startTour } = useOnboarding();
  const { logoUrl } = usePermissions();

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [logo, setLogo] = useState(logoUrl || '');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const initialPreset = useRef(localStorage.getItem('color_preset') || 'amber-yellow');
  const [preset, setPreset] = useState(initialPreset.current);

  // Moduły z app_modules (id, etykieta z bazy, stan) — tylko te z listy kreatora, które istnieją.
  const [appModules, setAppModules] = useState([]); // [{ wizardKey, id, label, is_enabled }]
  const [modules, setModules] = useState({}); // wybór lokalny { id: bool }

  useEffect(() => {
    if (!wizardOpen) return;
    let alive = true;
    supabase.from('app_modules').select('id, key, label, is_enabled').then(({ data }) => {
      if (!alive || !data) return;
      const list = WIZARD_MODULES
        .map((m) => {
          const row = data.find((r) => r.key === moduleKeyOf(m.key));
          return row ? { wizardKey: m.key, id: row.id, label: row.label || tr(m.label), is_enabled: !!row.is_enabled } : null;
        })
        .filter(Boolean);
      setAppModules(list);
      setModules(Object.fromEntries(list.map((m) => [m.id, m.is_enabled])));
    });
    return () => { alive = false; };
  }, [wizardOpen]);

  if (!wizardOpen) return null;

  // Podgląd kolorów na żywo, ale zapis dopiero przy „Dalej”.
  const pickPreset = (key) => { setPreset(key); applyColorPreset(key); };

  // Zamknięcie bez zapisu → przywróć ostatnio zapisane kolory (podgląd nie może zostać).
  const close = () => {
    if (preset !== initialPreset.current) applyColorPreset(initialPreset.current);
    closeWizard();
  };

  const handleLogoFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error(tr('Wybierz plik graficzny (PNG, JPG lub SVG).')); return; }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const fileName = `org-logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('public-assets').upload(fileName, file);
      if (error) throw error;
      setLogo(supabase.storage.from('public-assets').getPublicUrl(fileName).data.publicUrl);
    } catch {
      toast.error(tr('Nie udało się przesłać pliku. Spróbuj ponownie.'));
    } finally {
      setUploading(false);
    }
  };

  const saveBrand = async () => {
    const url = logo.trim();
    if (url && url !== (logoUrl || '')) {
      await saveSetting('org_logo_url', url);
      try { localStorage.setItem('app_logo_cache', url); } catch { /* ignore */ }
    }
    if (preset !== initialPreset.current) {
      await saveSetting('color_preset', preset);
      initialPreset.current = preset; // od teraz to zapisany stan
    }
  };

  const saveModules = async () => {
    const changed = appModules.filter((m) => !!modules[m.id] !== m.is_enabled);
    for (const m of changed) {
      const { error } = await supabase.from('app_modules').update({ is_enabled: !!modules[m.id] }).eq('id', m.id);
      if (error) throw error;
    }
    if (changed.length) {
      setAppModules((prev) => prev.map((m) => ({ ...m, is_enabled: !!modules[m.id] })));
      invalidateModuleLabels();
    }
  };

  const finish = (withTour) => {
    markWizardDone();
    closeWizard();
    if (withTour) startTour('welcome');
  };

  const next = async () => {
    setBusy(true);
    try {
      if (step === 0) await saveBrand();
      if (step === 1) await saveModules();
      setStep((s) => Math.min(WIZARD_STEPS.length - 1, s + 1));
    } catch {
      toast.error(tr('Nie udało się zapisać zmian. Spróbuj ponownie.'));
    } finally {
      setBusy(false);
    }
  };
  const prev = () => setStep((s) => Math.max(0, s - 1));

  const isLastConfig = step === WIZARD_STEPS.length - 2; // krok „Zespół”
  const isDone = step === WIZARD_STEPS.length - 1;

  return (
    <Modal
      isOpen
      onClose={close}
      closeOnBackdrop={false}
      zIndex={100055}
      title={tr('Konfiguracja kościoła')}
      subtitle={tr('Krok {n} z {total}: {step}', { n: step + 1, total: WIZARD_STEPS.length, step: t(WIZARD_STEPS[step].title) })}
      footer={<>
        {step > 0 && !isDone && (
          <Button variant="ghost" icon={ChevronLeft} onClick={prev} className="mr-auto" disabled={busy}>{t('Wstecz')}</Button>
        )}
        {isDone ? (
          <>
            <Button variant="secondary" onClick={() => finish(false)}>{t('Zakończ')}</Button>
            <Button icon={PlayCircle} onClick={() => finish(true)}>{t('Pokaż samouczek')}</Button>
          </>
        ) : (
          <Button onClick={next} loading={busy} disabled={uploading}>
            {step < 2 ? t('Zapisz i dalej') : isLastConfig ? t('Prawie gotowe') : t('Dalej')} <ChevronRight size={16} aria-hidden="true" />
          </Button>
        )}
      </>}
    >
      <div className="p-6">
        {/* Pasek postępu kroków */}
        <div className="flex items-center gap-1.5 mb-5" aria-hidden="true">
          {WIZARD_STEPS.map((s, i) => (
            <div key={s.id} className={`h-1.5 flex-1 rounded-full transition-all ${i <= step ? 'bg-accent-primary' : 'bg-gray-200 dark:bg-gray-700'}`} />
          ))}
        </div>
        {/* Krok 0 — Marka */}
        {step === 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-xl bg-accent-primary-lightest dark:bg-accent-primary-darkest/40 flex items-center justify-center text-accent-primary dark:text-accent-primary-light"><Palette size={18} aria-hidden="true" /></div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">{t('Marka kościoła')}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">{t('Logo i kolory pojawią się w całym panelu.')}</p>
              </div>
            </div>

            <div className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('Logo')}</div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-14 h-14 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 flex items-center justify-center overflow-hidden shrink-0">
                {logo ? <img src={logo} alt={tr('Podgląd logo')} className="w-full h-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : <ImageIcon size={20} className="text-gray-400" aria-hidden="true" />}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoFile} />
              <Button variant="outline" icon={Upload} loading={uploading} onClick={() => fileRef.current?.click()}>
                {logo ? tr('Zmień logo') : tr('Wgraj logo')}
              </Button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">{t('Logo możesz też wgrać później w Ustawieniach → Wygląd.')}</p>

            <div className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('Kolorystyka')}</div>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t('Kolorystyka')}>
              {Object.entries(COLOR_PRESETS).map(([key, p]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={preset === key}
                  onClick={() => pickPreset(key)}
                  className={`relative rounded-xl border-2 p-2.5 transition ${preset === key ? 'border-accent-primary' : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'}`}
                >
                  <span className="flex gap-1 justify-center mb-1.5" aria-hidden="true">
                    <span className="w-4 h-4 rounded-full" style={{ background: p.preview[0] }} />
                    <span className="w-4 h-4 rounded-full" style={{ background: p.preview[1] }} />
                  </span>
                  <span className="block text-[11px] text-gray-700 dark:text-gray-200 leading-tight">{tr(p.label)}</span>
                  {preset === key && <span className="absolute top-1 right-1 text-accent-primary" aria-hidden="true"><Check size={12} /></span>}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">{tr('To podgląd — zmiany zapiszą się po kliknięciu „Zapisz i dalej”.')}</p>
          </div>
        )}

        {/* Krok 1 — Moduły */}
        {step === 1 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-xl bg-accent-primary-lightest dark:bg-accent-primary-darkest/40 flex items-center justify-center text-accent-primary dark:text-accent-primary-light"><Boxes size={18} aria-hidden="true" /></div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">{t('Wybierz moduły')}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">{t('Włącz tylko to, czego używacie — zawsze zmienisz to w Ustawieniach.')}</p>
              </div>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700/60">
              {appModules.map((m) => (
                <div key={m.id} className="flex items-center justify-between py-3">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{m.label}</span>
                  <Toggle label={m.label} checked={!!modules[m.id]} onChange={(v) => setModules((p) => ({ ...p, [m.id]: v }))} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Krok 2 — Zespół */}
        {step === 2 && (
          <div className="text-center py-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-accent-primary-lightest dark:bg-accent-primary-darkest/40 flex items-center justify-center text-accent-primary dark:text-accent-primary-light mb-3"><UserPlus size={26} aria-hidden="true" /></div>
            <h3 className="font-bold text-gray-900 dark:text-white">{t('Zaproś swój zespół')}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1.5 max-w-sm mx-auto">{t('Dodaj liderów i koordynatorów oraz nadaj im uprawnienia w sekcji zarządzania użytkownikami.')}</p>
            <Button
              icon={UserPlus}
              onClick={() => { markWizardDone(); closeWizard(); navigate('/settings?tab=users'); }}
              className="mt-4"
            >
              {t('Przejdź do zarządzania użytkownikami')}
            </Button>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">{t('Możesz to zrobić także później.')}</p>
          </div>
        )}

        {/* Krok 3 — Gotowe */}
        {isDone && (
          <div className="text-center py-4">
            <PartyPopper size={40} className="mx-auto text-accent-primary mb-3" aria-hidden="true" />
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">{t('Wszystko gotowe!')}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1.5">{t('Twój kościół jest skonfigurowany. Pokazać Ci teraz najważniejsze funkcje?')}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
