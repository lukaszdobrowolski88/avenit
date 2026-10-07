import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyRound, ShieldCheck, ShieldOff, Smartphone } from 'lucide-react-native';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { GradientButton } from '../../../src/components/ui/GradientButton';
import { B } from '../../../src/components/ui/brand';
import { supabase } from '../../../src/lib/supabase';
import { showError } from '../../../src/lib/errors';
import { toast } from '../../../src/lib/toast';
import { use2FAStatus, useBackupCodes } from '../../../src/features/account/api';
import { useQueryClient } from '@tanstack/react-query';

type Step = 'view' | 'setup' | 'codes';

const CodesGrid = ({ codes }: { codes: string[] }) => (
  <View
    style={{
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      padding: 14,
      borderRadius: 14,
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: B.fieldBorder,
    }}
  >
    {codes.map((c, i) => (
      <Text
        key={`${c}-${i}`}
        selectable
        style={{
          width: '47%',
          fontSize: 15,
          letterSpacing: 1,
          color: '#2A2312',
          fontFamily: 'Manrope_600SemiBold',
          textAlign: 'center',
        }}
      >
        {c}
      </Text>
    ))}
  </View>
);

export default function TwoFactorScreen() {
  const qc = useQueryClient();
  const status = use2FAStatus();
  const enabled = !!status.data?.enabled;
  const backup = useBackupCodes(enabled);

  const [step, setStep] = useState<Step>('view');
  const [setupData, setSetupData] = useState<{
    secret: string;
    otpauthUrl: string;
    backupCodes: string[];
  } | null>(null);
  const [code, setCode] = useState('');
  const [newCodes, setNewCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // Modal wpisania bieżącego kodu TOTP (wyłączanie / regeneracja kodów).
  const [promptFor, setPromptFor] = useState<null | 'disable' | 'regen'>(null);
  const [promptCode, setPromptCode] = useState('');

  const unusedBackup = (backup.data ?? []).filter((c: { code: string; used: boolean }) => !c.used).length;

  const beginSetup = async () => {
    setBusy(true);
    const { data, error } = await supabase.auth.twoFactorSetup();
    setBusy(false);
    if (error || !data) {
      showError('Nie udało się rozpocząć konfiguracji', error, 'Spróbuj ponownie za chwilę.');
      return;
    }
    setSetupData({ secret: data.secret, otpauthUrl: data.otpauthUrl, backupCodes: data.backupCodes });
    setCode('');
    setStep('setup');
  };

  const confirmEnable = async () => {
    if (!setupData) return;
    if (code.trim().length < 6) {
      Alert.alert('Wpisz kod', 'Wprowadź 6-cyfrowy kod weryfikacyjny z aplikacji uwierzytelniającej.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.twoFactorEnable({
      secret: setupData.secret,
      code: code.trim(),
      backupCodes: setupData.backupCodes,
    });
    setBusy(false);
    if (error) {
      showError('Nie udało się włączyć', error, 'Kod jest nieprawidłowy albo wygasł. Wpisz aktualny kod z aplikacji.');
      return;
    }
    toast.success('Uwierzytelnianie dwuskładnikowe zostało włączone!');
    setNewCodes(setupData.backupCodes);
    setStep('codes');
    qc.invalidateQueries({ queryKey: ['2fa-status'] });
    qc.invalidateQueries({ queryKey: ['2fa-backup-codes'] });
  };

  const runPrompt = async () => {
    const c = promptCode.trim();
    if (c.length < 6) {
      Alert.alert('Wpisz kod', 'Wprowadź 6-cyfrowy kod weryfikacyjny z aplikacji uwierzytelniającej.');
      return;
    }
    setBusy(true);
    if (promptFor === 'disable') {
      const { error } = await supabase.auth.twoFactorDisable({ code: c });
      setBusy(false);
      if (error) {
        showError('Nie udało się wyłączyć', error, 'Kod jest nieprawidłowy albo wygasł. Wpisz aktualny kod z aplikacji.');
        return;
      }
      setPromptFor(null);
      setPromptCode('');
      qc.invalidateQueries({ queryKey: ['2fa-status'] });
      toast.success('Uwierzytelnianie dwuskładnikowe zostało wyłączone.');
    } else if (promptFor === 'regen') {
      const { data, error } = await supabase.auth.regenerateBackupCodes({ code: c });
      setBusy(false);
      if (error || !data) {
        showError('Nie udało się wygenerować kodów', error, 'Kod jest nieprawidłowy albo wygasł. Wpisz aktualny kod z aplikacji.');
        return;
      }
      setPromptFor(null);
      setPromptCode('');
      setNewCodes(data);
      setStep('codes');
      qc.invalidateQueries({ queryKey: ['2fa-backup-codes'] });
    }
  };

  const openAuthenticator = () => {
    if (!setupData) return;
    Linking.openURL(setupData.otpauthUrl).catch(() =>
      Alert.alert(
        'Brak aplikacji',
        'Zainstaluj aplikację uwierzytelniającą (np. Google Authenticator) lub wpisz klucz ręcznie.',
      ),
    );
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: '#F6F4EE' }}>
        <PageHeader title="Uwierzytelnianie dwuskładnikowe" subtitle="Bezpieczeństwo i logowanie" showBack />

        {status.isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#2A2312" />
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
            {step === 'codes' ? (
              <View>
                <View style={{ alignItems: 'center', marginBottom: 16 }}>
                  <View
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 16,
                      backgroundColor: B.kurkumaSoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 10,
                    }}
                  >
                    <KeyRound size={26} color={B.goldDeep} />
                  </View>
                  <Text style={{ fontSize: 18, color: '#2A2312', fontFamily: 'Manrope_700Bold' }}>
                    Kody zapasowe
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      color: '#6B6557',
                      textAlign: 'center',
                      marginTop: 4,
                      fontFamily: 'Manrope_400Regular',
                    }}
                  >
                    Zapisz je w bezpiecznym miejscu. Pozwolą zalogować się, gdy nie masz dostępu do
                    aplikacji uwierzytelniającej. Nie zobaczysz ich ponownie — przytrzymaj kod, aby go
                    skopiować.
                  </Text>
                </View>
                <CodesGrid codes={newCodes} />
                <View style={{ marginTop: 20 }}>
                  <GradientButton
                    onPress={() => {
                      setStep('view');
                      setNewCodes([]);
                    }}
                  >
                    Mam zapisane kody
                  </GradientButton>
                </View>
              </View>
            ) : step === 'setup' && setupData ? (
              <View>
                <Text style={styles.sectionTitle}>1. Dodaj konto w aplikacji uwierzytelniającej</Text>
                <Text style={styles.help}>
                  Użyj Google Authenticator, Microsoft Authenticator lub Authy.
                </Text>
                <Pressable onPress={openAuthenticator} style={styles.secondaryBtn}>
                  <Smartphone size={16} color="#8A6606" />
                  <Text style={styles.secondaryBtnText}>Otwórz w aplikacji Authenticator</Text>
                </Pressable>

                <Text style={[styles.sectionTitle, { marginTop: 18 }]}>
                  2. Lub wpisz klucz ręcznie
                </Text>
                <View style={styles.secretBox}>
                  <Text selectable style={styles.secretText}>
                    {setupData.secret}
                  </Text>
                </View>
                <Text style={[styles.help, { marginTop: 6, fontSize: 12 }]}>Przytrzymaj klucz, aby go skopiować.</Text>

                <Text style={[styles.sectionTitle, { marginTop: 18 }]}>3. Wpisz kod z aplikacji</Text>
                <TextInput
                  style={styles.codeInput}
                  placeholder="000000"
                  placeholderTextColor={B.ink4}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                  accessibilityLabel="Kod z aplikacji"
                  maxLength={6}
                  value={code}
                  onChangeText={setCode}
                  editable={!busy}
                />
                <View style={{ marginTop: 16 }}>
                  <GradientButton onPress={confirmEnable} loading={busy}>
                    Potwierdź i włącz
                  </GradientButton>
                </View>
                <Pressable
                  onPress={() => {
                    setStep('view');
                    setSetupData(null);
                  }}
                  style={{ marginTop: 12, alignItems: 'center' }}
                >
                  <Text style={{ fontSize: 13, color: '#6B6557', fontFamily: 'Manrope_600SemiBold' }}>
                    Anuluj
                  </Text>
                </Pressable>
              </View>
            ) : enabled ? (
              <View>
                <View style={[styles.statusCard, { backgroundColor: B.okBg, borderColor: B.okBg }]}>
                  <ShieldCheck size={22} color={B.okFg} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, color: B.okFg, fontFamily: 'Manrope_700Bold' }}>
                      Aktywowane
                    </Text>
                    <Text style={{ fontSize: 13, color: B.okFg, marginTop: 2, fontFamily: 'Manrope_500Medium' }}>
                      Logowanie wymaga kodu z aplikacji uwierzytelniającej.
                    </Text>
                  </View>
                </View>

                <View style={styles.infoRow}>
                  <KeyRound size={16} color="#6B6557" />
                  <Text style={styles.infoText}>
                    Kody zapasowe: pozostało {unusedBackup} z 10
                  </Text>
                </View>

                <Pressable
                  onPress={() => {
                    setPromptCode('');
                    setPromptFor('regen');
                  }}
                  style={[styles.secondaryBtn, { marginTop: 16 }]}
                >
                  <KeyRound size={16} color="#8A6606" />
                  <Text style={styles.secondaryBtnText}>Wygeneruj nowe kody zapasowe</Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    setPromptCode('');
                    setPromptFor('disable');
                  }}
                  style={styles.dangerBtn}
                >
                  <ShieldOff size={16} color={B.danger} />
                  <Text style={styles.dangerBtnText}>Wyłącz uwierzytelnianie dwuskładnikowe</Text>
                </Pressable>
              </View>
            ) : (
              <View>
                <View style={[styles.statusCard, { backgroundColor: B.kurkumaSoft, borderColor: B.kurkumaSoft }]}>
                  <ShieldOff size={22} color={B.goldDeep} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, color: B.goldDeep, fontFamily: 'Manrope_700Bold' }}>
                      Wyłączone
                    </Text>
                    <Text style={{ fontSize: 13, color: B.goldDeep, marginTop: 2, fontFamily: 'Manrope_500Medium' }}>
                      Włącz, aby zwiększyć bezpieczeństwo konta.
                    </Text>
                  </View>
                </View>
                {status.data?.required ? (
                  <Text style={[styles.help, { marginTop: 10 }]}>
                    Administrator wymaga uwierzytelniania dwuskładnikowego dla Twojego konta.
                  </Text>
                ) : null}
                <View style={{ marginTop: 18 }}>
                  <GradientButton onPress={beginSetup} loading={busy}>
                    Włącz uwierzytelnianie dwuskładnikowe
                  </GradientButton>
                </View>
              </View>
            )}
          </ScrollView>
        )}
      </View>

      {/* Modal wpisania kodu TOTP (wyłączenie / regeneracja) */}
      <Modal
        visible={promptFor != null}
        transparent
        animationType="fade"
        onRequestClose={() => setPromptFor(null)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(12,10,9,0.35)', justifyContent: 'center', padding: 24 }}
          onPress={() => setPromptFor(null)}
        >
          <Pressable
            style={{ backgroundColor: '#F6F4EE', borderRadius: 20, padding: 20 }}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={{ fontSize: 16, color: '#2A2312', fontFamily: 'Manrope_700Bold', marginBottom: 4 }}>
              {promptFor === 'disable' ? 'Wyłączyć uwierzytelnianie dwuskładnikowe?' : 'Nowe kody zapasowe'}
            </Text>
            <Text style={{ fontSize: 13, color: '#6B6557', marginBottom: 14, fontFamily: 'Manrope_400Regular' }}>
              {promptFor === 'disable'
                ? 'Logowanie nie będzie już wymagało kodu. Potwierdź 6-cyfrowym kodem z aplikacji uwierzytelniającej.'
                : 'Dotychczasowe kody zapasowe przestaną działać. Potwierdź 6-cyfrowym kodem z aplikacji.'}
            </Text>
            <TextInput
              style={styles.codeInput}
              placeholder="000000"
              placeholderTextColor={B.ink4}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              accessibilityLabel="Kod z aplikacji"
              maxLength={6}
              value={promptCode}
              onChangeText={setPromptCode}
              editable={!busy}
              autoFocus
            />
            <View style={{ marginTop: 16 }}>
              <GradientButton onPress={runPrompt} loading={busy}>
                {promptFor === 'disable' ? 'Wyłącz' : 'Wygeneruj kody'}
              </GradientButton>
            </View>
            <Pressable onPress={() => setPromptFor(null)} style={{ marginTop: 12, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: '#6B6557', fontFamily: 'Manrope_600SemiBold' }}>Anuluj</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = {
  sectionTitle: {
    fontSize: 13,
    color: '#2A2312',
    fontFamily: 'Manrope_700Bold',
    marginBottom: 4,
  } as const,
  help: { fontSize: 13, color: '#6B6557', fontFamily: 'Manrope_400Regular', lineHeight: 19 } as const,
  secondaryBtn: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#F3E3B0',
    backgroundColor: '#F6F4EE',
  } as const,
  secondaryBtnText: { fontSize: 14, color: '#8A6606', fontFamily: 'Manrope_700Bold' } as const,
  secretBox: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: B.fieldBorder,
  } as const,
  secretText: { flex: 1, fontSize: 15, letterSpacing: 2, color: '#2A2312', fontFamily: 'Manrope_600SemiBold' } as const,
  codeInput: {
    borderWidth: 1,
    borderColor: B.fieldBorder,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 22,
    letterSpacing: 8,
    textAlign: 'center',
    color: '#2A2312',
    backgroundColor: '#FFFFFF',
    fontFamily: 'Manrope_700Bold',
  } as const,
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  } as const,
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 } as const,
  infoText: { fontSize: 14, color: '#2A2312', fontFamily: 'Manrope_500Medium' } as const,
  dangerBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: B.dangerBg,
    backgroundColor: B.dangerBg,
  } as const,
  dangerBtnText: { fontSize: 14, color: B.danger, fontFamily: 'Manrope_700Bold' } as const,
};
