import { ActivityIndicator, Alert, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Headphones, LogOut, Mic, MicOff, Radio, Smartphone, TriangleAlert, Users, Volume2, VolumeX, WifiOff } from 'lucide-react-native';
import type { LocalAudioTrack } from 'livekit-client';
import { ScreenContainer } from '../../components/ui/ScreenContainer';
import { PageHeader } from '../../components/ui/PageHeader';
import { FitLabel } from '../../components/ui/FitLabel';
import { B, SectionLabel } from '../../components/ui/brand';
import { FONT as F } from '../../lib/fonts';
import { openOnWeb } from '../modules/useModules';
import {
  airBadge,
  consoleScreenHint,
  isConnected,
  listenersText,
  meterTone,
  originalStatusText,
  primaryAction,
  sessionStatusLabel,
  showHeadphonesBanner,
  staffLabel,
  stateMessage,
  VOLUME_STEPS,
  type ConsoleChannel,
} from './consoleLogic';
import { consoleWebPath } from './logic';
import { useMicLevel } from './micLevel';
import { useInterpreterConsole } from './useInterpreterConsole';

// Konsola tłumacza w aplikacji: wybór kanału (gdy mam kilka), „Dołącz do kanału”, potem duży
// przycisk „Przejmij mikrofon” / „Oddaj mikrofon” ze stanem NA ŻYWO, wyciszenie na chwilę,
// poziom mikrofonu, liczba słuchaczy, kto tłumaczy, odsłuch oryginału i partnera (głośność
// stopniami). Wejście: karta „Tłumaczenie na żywo” na ekranie wydarzenia, link
// /tlumaczenie/konsola/<id> (avenit://, czat, powiadomienie).

const PAD = 16;
const CARD_PAD = 18;

function Message({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: B.card, borderRadius: 22, padding: CARD_PAD, gap: 8 }}>
      <Text style={{ fontSize: 17, color: B.ink, fontFamily: F.bold }}>{title}</Text>
      <Text style={{ fontSize: 14, lineHeight: 20, color: B.ink2, fontFamily: F.medium }}>{body}</Text>
      {children}
    </View>
  );
}

function ChannelChip({ c, selected, disabled, onPress, width }: { c: ConsoleChannel; selected: boolean; disabled: boolean; onPress: () => void; width: number }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      className="active:opacity-80"
      style={{
        minHeight: 44,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 999,
        backgroundColor: selected ? B.ink : B.card,
        opacity: disabled && !selected ? 0.55 : 1,
        justifyContent: 'center',
      }}
    >
      <FitLabel width={width} fontSize={14} maxLines={1} style={{ color: selected ? B.onDark : B.ink, fontFamily: F.bold }}>
        {staffLabel(c)}
      </FitLabel>
    </Pressable>
  );
}

// Głośność odsłuchu: segmenty 0–100% (dotyk = ten poziom).
function VolumeSteps({ value, onChange, disabled, label }: { value: number; onChange: (v: number) => void; disabled?: boolean; label: string }) {
  return (
    <View accessibilityRole="adjustable" accessibilityLabel={`${label}: ${Math.round(value * 100)}%`} style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-end', opacity: disabled ? 0.45 : 1 }}>
      {VOLUME_STEPS.map((s, i) => {
        const on = s > 0 && s <= value + 0.001;
        return (
          <Pressable
            key={s}
            disabled={disabled}
            onPress={() => onChange(s)}
            accessibilityRole="button"
            accessibilityLabel={s === 0 ? `${label}: wycisz` : `${label}: ${Math.round(s * 100)}%`}
            hitSlop={6}
            style={{ flex: 1, height: 36, justifyContent: 'flex-end' }}
          >
            <View
              style={{
                height: i === 0 ? 6 : 10 + i * 5,
                borderRadius: 4,
                backgroundColor: i === 0 ? (value === 0 ? B.danger : B.paper2) : on ? B.kurkuma : B.paper2,
              }}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

function LevelMeter({ track, enabled }: { track: LocalAudioTrack | null; enabled: boolean }) {
  const level = useMicLevel(track, enabled);
  const tone = meterTone(level);
  const pct = Math.round(level * 100);
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 12, color: B.ink3, fontFamily: F.semibold }}>Poziom wejścia</Text>
        {tone === 'clip' ? <Text style={{ fontSize: 12, color: B.danger, fontFamily: F.bold }}>Za głośno — odsuń mikrofon</Text> : null}
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Poziom wejścia"
        accessibilityValue={{ min: 0, max: 100, now: pct }}
        style={{ height: 12, borderRadius: 6, backgroundColor: B.paper2, overflow: 'hidden' }}
      >
        <View style={{ width: `${pct}%`, height: 12, borderRadius: 6, backgroundColor: tone === 'clip' ? B.danger : tone === 'high' ? B.gold : B.okFg }} />
      </View>
    </View>
  );
}

function BigButton({
  label,
  onPress,
  disabled,
  loading,
  tone,
  Icon,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  loading: boolean;
  tone: 'primary' | 'dark' | 'light';
  Icon: typeof Mic;
}) {
  const bg = tone === 'primary' ? B.kurkuma : tone === 'dark' ? B.ink : B.card;
  const fg = tone === 'dark' ? B.onDark : B.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled, busy: loading }}
      className="active:opacity-80"
      style={{
        height: 64,
        borderRadius: 32,
        backgroundColor: bg,
        flexDirection: 'row',
        gap: 10,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled && !loading ? 0.5 : 1,
      }}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Icon size={22} color={fg} />}
      <Text style={{ fontSize: 18, color: fg, fontFamily: F.bold }}>{label}</Text>
    </Pressable>
  );
}

function SmallButton({ label, onPress, Icon, width, disabled }: { label: string; onPress: () => void; Icon: typeof Mic; width: number; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="active:opacity-70"
      style={{
        flex: 1,
        minHeight: 48,
        borderRadius: 24,
        paddingHorizontal: 12,
        backgroundColor: 'rgba(246,244,238,0.12)',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Icon size={16} color={B.onDark} />
      <FitLabel width={width} fontSize={14} maxLines={1} style={{ color: B.onDark, fontFamily: F.bold }}>
        {label}
      </FitLabel>
    </Pressable>
  );
}

export function InterpreterConsoleScreen({ eventId }: { eventId: string | null }) {
  return (
    <ScreenContainer bottomInset={48}>
      {eventId ? (
        <ConsoleBody key={eventId} eventId={eventId} />
      ) : (
        <>
          <PageHeader title="Konsola tłumacza" showBack />
          <View style={{ paddingHorizontal: PAD }}>
            <Message title="Nie znaleziono wydarzenia" body="Ten link nie działa." />
          </View>
        </>
      )}
    </ScreenContainer>
  );
}

function ConsoleBody({ eventId }: { eventId: string }) {
  const C = useInterpreterConsole(eventId);
  const { width: W } = useWindowDimensions();
  const inner = W - PAD * 2 - CARD_PAD * 2;

  const header = <PageHeader title="Konsola tłumacza" subtitle={C.view?.event?.title || 'Tłumaczenie na żywo'} showBack />;

  if (!C.available) {
    return (
      <>
        {header}
        <View style={{ paddingHorizontal: PAD }}>
          <Message title="Konsola w aplikacji niedostępna" body="Ta wersja aplikacji nie obsługuje dźwięku na żywo. Zaktualizuj aplikację albo otwórz konsolę w przeglądarce.">
            <Pressable
              onPress={() => void openOnWeb(consoleWebPath(eventId))}
              accessibilityRole="button"
              className="active:opacity-80"
              style={{ marginTop: 6, height: 52, borderRadius: 26, backgroundColor: B.kurkuma, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 16, color: B.ink, fontFamily: F.bold }}>Otwórz w przeglądarce</Text>
            </Pressable>
          </Message>
        </View>
      </>
    );
  }

  if (C.loadError) {
    const nf = C.loadError === 'not_found' || C.loadError === 'forbidden';
    return (
      <>
        {header}
        <View style={{ paddingHorizontal: PAD }}>
          <Message
            title={nf ? 'Nie znaleziono wydarzenia' : 'Nie udało się wczytać tłumaczenia'}
            body={nf ? 'Wydarzenie nie istnieje albo nie masz do niego dostępu.' : 'Sprawdź internet i spróbuj ponownie.'}
          >
            {!nf ? (
              <Pressable onPress={() => void C.reload()} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
                <Text style={{ fontSize: 14, color: B.ink, fontFamily: F.bold }}>Spróbuj ponownie</Text>
              </Pressable>
            ) : null}
          </Message>
        </View>
      </>
    );
  }

  if (!C.view) {
    return (
      <>
        {header}
        <View style={{ paddingVertical: 48, alignItems: 'center', gap: 10 }}>
          <ActivityIndicator color={B.ink} />
          <Text style={{ fontSize: 14, color: B.ink3, fontFamily: F.medium }}>Wczytywanie…</Text>
        </View>
      </>
    );
  }

  const session = C.view.session;
  if (!session || session.status === 'ended' || !C.channels.length) {
    const ended = session?.status === 'ended';
    return (
      <>
        {header}
        <View style={{ paddingHorizontal: PAD }}>
          <Message
            title={ended ? 'Tłumaczenie zakończone' : session ? 'Nie jesteś tłumaczem tego wydarzenia' : 'Brak tłumaczenia na żywo'}
            body={
              ended
                ? 'Organizator może je wznowić na stronie wydarzenia.'
                : session
                  ? 'Poproś lidera służby Tłumaczenia o przypisanie w Grafiku albo w karcie wydarzenia.'
                  : 'To wydarzenie nie ma jeszcze tłumaczenia na żywo.'
            }
          />
          {C.error ? <ErrorText text={C.error} /> : null}
        </View>
      </>
    );
  }

  const connected = isConnected(C.phase);
  const ended = C.sessionStatus === 'ended';
  const primary = primaryAction({ phase: C.phase, state: C.state, ended, busy: C.busy, hasChannel: !!C.channel });
  const badge = airBadge(C.phase, C.state);
  const onAir = connected && C.state === 'on_air';
  const mine = C.state === 'on_air' || C.state === 'muted';
  const chipWidth = Math.min(inner, 220);
  const halfWidth = Math.max(60, (inner - 10) / 2 - 16 - 7 - 24);

  const confirmLeave = () => {
    if (!mine) {
      C.leave();
      return;
    }
    Alert.alert('Zakończyć zmianę?', 'Masz teraz mikrofon — słuchacze przestaną Cię słyszeć.', [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Zakończ', style: 'destructive', onPress: () => C.leave() },
    ]);
  };
  const onPrimary = primary.kind === 'join' ? C.join : primary.kind === 'take_over' ? C.takeOver : C.giveBack;
  const partners = C.present.filter((p) => p.id !== C.me);
  const origMuted = C.origVol === 0;

  return (
    <>
      {header}
      <View style={{ paddingHorizontal: PAD }}>
        {C.channels.length > 1 ? (
          <>
            <SectionLabel>Kanał</SectionLabel>
            <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {C.channels.map((c) => (
                <ChannelChip
                  key={c.id}
                  c={c}
                  selected={c.id === C.channelId}
                  disabled={connected || C.phase === 'joining'}
                  onPress={() => C.choose(c.id)}
                  width={chipWidth}
                />
              ))}
            </View>
          </>
        ) : null}

        {/* Stan kanału i główny przycisk — ciemna karta, kurkuma, gdy nadaję. */}
        <View
          accessibilityLiveRegion="polite"
          style={{ marginTop: 14, backgroundColor: B.ink, borderRadius: 24, padding: CARD_PAD, gap: 14, borderWidth: onAir ? 2 : 0, borderColor: B.kurkuma }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: B.onDarkMuted, fontFamily: F.bold }}>Kanał</Text>
              <Text style={{ fontSize: 24, color: B.onDark, fontFamily: F.bold }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {C.channel ? staffLabel(C.channel) : ''}
              </Text>
              {C.channel?.label ? (
                <Text style={{ fontSize: 12, color: B.onDarkMuted, fontFamily: F.medium }}>Słuchacze widzą: {C.channel.label}</Text>
              ) : null}
            </View>
            {badge ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 11,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: badge.tone === 'live' ? B.danger : 'rgba(246,244,238,0.14)',
                }}
              >
                {badge.tone === 'live' ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: B.onDark }} /> : null}
                <Text style={{ fontSize: 12, letterSpacing: badge.tone === 'live' ? 1 : 0, color: B.onDark, fontFamily: F.bold }}>{badge.label}</Text>
              </View>
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Radio size={14} color={B.onDarkMuted} />
              <Text style={{ fontSize: 13, color: B.onDarkMuted, fontFamily: F.semibold }}>{sessionStatusLabel(C.sessionStatus)}</Text>
            </View>
            {connected ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} accessibilityLabel={`Słuchacze tego kanału: ${listenersText(C.listeners)}`}>
                <Users size={14} color={B.onDarkMuted} />
                <Text style={{ fontSize: 13, color: B.onDarkMuted, fontFamily: F.semibold }}>{listenersText(C.listeners)}</Text>
              </View>
            ) : null}
          </View>

          {C.phase === 'reconnecting' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {C.online ? <ActivityIndicator color={B.kurkuma} size="small" /> : <WifiOff size={16} color={B.kurkuma} />}
              <Text style={{ flex: 1, fontSize: 14, color: B.kurkuma, fontFamily: F.semibold }}>
                {C.online ? 'Łączenie ponownie…' : 'Brak internetu — połączymy, gdy wróci.'}
              </Text>
            </View>
          ) : connected ? (
            <Text style={{ fontSize: 14, lineHeight: 20, color: B.onDark, fontFamily: F.medium }}>{stateMessage(C.state, C.holder)}</Text>
          ) : (
            <Text style={{ fontSize: 14, lineHeight: 20, color: B.onDarkMuted, fontFamily: F.medium }}>
              {ended
                ? 'Tłumaczenie zostało zakończone. Organizator może je wznowić na stronie wydarzenia.'
                : 'Dołącz do kanału, żeby słyszeć oryginał i partnera. Słuchacze usłyszą Cię dopiero po „Przejmij mikrofon”.'}
            </Text>
          )}

          <BigButton
            label={primary.label}
            onPress={onPrimary}
            disabled={primary.disabled}
            loading={primary.loading}
            tone={primary.kind === 'give_back' ? 'light' : 'primary'}
            Icon={primary.kind === 'join' ? Headphones : primary.kind === 'take_over' ? Mic : MicOff}
          />

          {connected ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {mine ? (
                <SmallButton
                  label={C.selfMuted ? 'Włącz mikrofon' : 'Wycisz na chwilę'}
                  onPress={C.toggleMute}
                  Icon={C.selfMuted ? Mic : MicOff}
                  width={halfWidth}
                  disabled={C.phase !== 'on'}
                />
              ) : null}
              <SmallButton label="Zakończ zmianę" onPress={confirmLeave} Icon={LogOut} width={halfWidth} />
            </View>
          ) : null}
        </View>

        {C.error ? <ErrorText text={C.error} /> : null}

        {showHeadphonesBanner(C.headphones) ? (
          <View style={{ marginTop: 14, flexDirection: 'row', gap: 10, backgroundColor: B.kurkumaSoft, borderRadius: 18, padding: 14 }}>
            <TriangleAlert size={18} color={B.goldDeep} style={{ marginTop: 1 }} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 14, color: B.goldDeep, fontFamily: F.bold }}>Używaj słuchawek</Text>
              <Text style={{ fontSize: 13, lineHeight: 18, color: B.goldDeep, fontFamily: F.medium }}>
                Inaczej oryginał z głośnika trafi do mikrofonu i słuchacze usłyszą echo.
                {C.headphones === null ? ' Najlepiej słuchawki z mikrofonem (przewodowe albo Bluetooth).' : ''}
              </Text>
            </View>
          </View>
        ) : null}

        <SectionLabel>Mikrofon</SectionLabel>
        <View style={{ backgroundColor: B.card, borderRadius: 22, padding: CARD_PAD, gap: 10 }}>
          <LevelMeter track={C.micTrack} enabled={connected} />
          <Text style={{ fontSize: 12, lineHeight: 17, color: B.ink4, fontFamily: F.medium }}>
            {!connected
              ? 'Pasek ożyje po dołączeniu do kanału.'
              : mine
                ? C.selfMuted
                  ? 'Mikrofon chwilowo wyciszony.'
                  : 'Mów normalnie — pasek powinien skakać w zielonym polu.'
                : 'Mikrofon jest zamknięty, dopóki nie przejmiesz kanału.'}
          </Text>
        </View>

        <SectionLabel>Odsłuch</SectionLabel>
        <View style={{ backgroundColor: B.card, borderRadius: 22, padding: CARD_PAD, gap: 16 }}>
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 15, color: B.ink, fontFamily: F.bold }}>Oryginał (nagłośnienie)</Text>
                <Text style={{ fontSize: 12, lineHeight: 17, color: B.ink3, fontFamily: F.medium }}>
                  {originalStatusText({ enabled: C.originalEnabled, connected, on: C.origOn, muted: origMuted })}
                </Text>
              </View>
              {connected && C.origOn !== null ? (
                <Pressable
                  onPress={() => C.setOrigVol(origMuted ? 0.8 : 0)}
                  accessibilityRole="button"
                  accessibilityLabel={origMuted ? 'Włącz oryginał' : 'Wycisz oryginał'}
                  hitSlop={8}
                  style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: origMuted ? B.dangerBg : B.paper, alignItems: 'center', justifyContent: 'center' }}
                >
                  {origMuted ? <VolumeX size={20} color={B.danger} /> : <Volume2 size={20} color={B.ink} />}
                </Pressable>
              ) : null}
            </View>
            <VolumeSteps label="Oryginał" value={C.origVol} onChange={C.setOrigVol} disabled={!connected || C.origOn === null} />
          </View>

          <View style={{ height: 1, backgroundColor: B.line }} />

          <View style={{ gap: 10 }}>
            <View style={{ gap: 2 }}>
              <Text style={{ fontSize: 15, color: B.ink, fontFamily: F.bold }}>Partner na kanale</Text>
              <Text style={{ fontSize: 12, lineHeight: 17, color: B.ink3, fontFamily: F.medium }}>
                {!connected
                  ? 'Usłyszysz go po dołączeniu.'
                  : partners.length
                    ? partners.map((p) => `${p.name}${p.speaking ? ' (mówi)' : ''}`).join(', ')
                    : 'Nikogo więcej na kanale.'}
              </Text>
            </View>
            <VolumeSteps label="Partner" value={C.partnerVol} onChange={C.setPartnerVol} disabled={!connected} />
          </View>
        </View>

        <View style={{ marginTop: 18, gap: 8, paddingHorizontal: 4 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Smartphone size={15} color={B.ink3} style={{ marginTop: 2 }} />
            <Text style={{ flex: 1, fontSize: 13, lineHeight: 19, color: B.ink3, fontFamily: F.medium }}>
              {consoleScreenHint(Platform.OS, C.backgroundService)}
            </Text>
          </View>
          <Text style={{ fontSize: 13, lineHeight: 19, color: B.ink3, fontFamily: F.medium, paddingLeft: 23 }}>
            Rozmowa telefoniczna albo w aplikacji przerywa zmianę — po rozmowie dołącz ponownie.
          </Text>
        </View>
      </View>
    </>
  );
}

function ErrorText({ text }: { text: string }) {
  return (
    <Text accessibilityRole="alert" style={{ marginTop: 12, fontSize: 14, lineHeight: 20, color: B.danger, fontFamily: F.semibold, paddingHorizontal: 4 }}>
      {text}
    </Text>
  );
}
