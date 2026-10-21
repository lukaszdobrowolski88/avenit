import { useMemo } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { Headphones, Radio, Smartphone, Square, WifiOff } from 'lucide-react-native';
import { ScreenContainer } from '../../components/ui/ScreenContainer';
import { PageHeader } from '../../components/ui/PageHeader';
import { B, SectionLabel } from '../../components/ui/brand';
import { FONT as F } from '../../lib/fonts';
import { goBack } from '../../lib/navigation';
import { tenantWebBase } from '../../lib/supabase';
import { openOnWeb } from '../modules/useModules';
import { fatalMessage, phaseView, type ListenerChannel, type ListenerInfo } from './logic';
import { memberSource, tokenSource, useInterpretationListener, type ListenerSource } from './useListener';

// Ekran słuchacza tłumaczenia na żywo: lista języków (duże przyciski z oznaczeniem „na żywo”),
// „Słuchaj” / „Zatrzymaj”, stan (czeka na tłumacza / na żywo / zakończone). Głośność — przyciski
// telefonu. Wejście: karta na ekranie wydarzenia, link /tlumaczenie/sluchaj/<id> albo publiczny
// link /tlumaczenie/<token> (z czatu, z powiadomienia).

function whenText(ev: ListenerInfo['event']): string {
  if (!ev?.date) return '';
  try {
    const at = ev.starts_at ? new Date(ev.starts_at) : new Date(`${String(ev.date).slice(0, 10)}T12:00:00`);
    const day = format(at, 'EEEE, d MMMM', { locale: pl });
    return ev.time ? `${day}, ${String(ev.time).slice(0, 5)}` : day;
  } catch {
    return '';
  }
}

function ChannelButton({ c, selected, onPress }: { c: ListenerChannel; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${c.label}, ${c.live ? 'na żywo' : 'jeszcze nie nadaje'}`}
      className="active:opacity-80"
      style={{
        minHeight: 64,
        borderRadius: 20,
        paddingHorizontal: 18,
        paddingVertical: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: selected ? B.ink : B.card,
      }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          borderWidth: 2,
          borderColor: selected ? B.kurkuma : B.fieldBorder,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: B.kurkuma }} /> : null}
      </View>
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 18, color: selected ? B.onDark : B.ink, fontFamily: F.bold }}>
        {c.label}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 10,
          paddingVertical: 5,
          borderRadius: 999,
          backgroundColor: c.live ? (selected ? B.kurkuma : B.okBg) : selected ? 'rgba(246,244,238,0.12)' : B.paper2,
        }}
      >
        {c.live ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: selected ? B.ink : B.okFg }} /> : null}
        <Text
          numberOfLines={1}
          style={{
            fontSize: 12,
            fontFamily: F.semibold,
            color: c.live ? (selected ? B.ink : B.okFg) : selected ? B.onDarkMuted : B.ink3,
          }}
        >
          {c.live ? 'na żywo' : 'nie nadaje'}
        </Text>
      </View>
    </Pressable>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ backgroundColor: B.card, borderRadius: 22, padding: 18, gap: 6 }}>
      <Text style={{ fontSize: 17, color: B.ink, fontFamily: F.bold }}>{title}</Text>
      <Text style={{ fontSize: 14, lineHeight: 20, color: B.ink2, fontFamily: F.medium }}>{body}</Text>
    </View>
  );
}

function ListenerBody({ src }: { src: ListenerSource }) {
  const L = useInterpretationListener(src);
  return (
    <>
      <PageHeader
        title={L.info?.event?.title || 'Tłumaczenie na żywo'}
        subtitle={L.info?.church_name ? `Tłumaczenie · ${L.info.church_name}` : 'Tłumaczenie na żywo'}
        showBack
      />
      <ListenerContent src={src} L={L} />
    </>
  );
}

function ListenerContent({ src, L }: { src: ListenerSource; L: ReturnType<typeof useInterpretationListener> }) {
  const { info, fatal, phase, channel } = L;
  const ios = Platform.OS === 'ios';

  if (!L.available) {
    const openWeb = () => {
      if (src.eventId) void openOnWeb(`/tlumaczenie/sluchaj/${encodeURIComponent(src.eventId)}`);
      else Linking.openURL(`${tenantWebBase()}/tlumaczenie/${src.key}`).catch(() => undefined);
    };
    return (
      <View style={{ paddingHorizontal: 16, gap: 12 }}>
        <Message
          title="Słuchanie w aplikacji niedostępne"
          body="Ta wersja aplikacji nie odtwarza jeszcze tłumaczenia. Zaktualizuj aplikację albo słuchaj w przeglądarce telefonu."
        />
        <Pressable
          onPress={openWeb}
          accessibilityRole="button"
          className="active:opacity-80"
          style={{ height: 54, borderRadius: 27, backgroundColor: B.kurkuma, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 16, color: B.ink, fontFamily: F.bold }}>Słuchaj w przeglądarce</Text>
        </Pressable>
      </View>
    );
  }

  if (fatal) {
    const m = fatalMessage(fatal);
    return (
      <View style={{ paddingHorizontal: 16 }}>
        <Message title={m.title} body={m.body} />
      </View>
    );
  }

  if (!info) {
    return (
      <View style={{ paddingVertical: 48, alignItems: 'center', gap: 10 }}>
        <ActivityIndicator color={B.ink} />
        <Text style={{ fontSize: 14, color: B.ink3, fontFamily: F.medium }}>Wczytywanie…</Text>
      </View>
    );
  }

  const when = whenText(info.event);
  const view = phaseView(phase, { channel, online: L.online });
  const active = phase !== 'idle';

  return (
    <View style={{ paddingHorizontal: 16 }}>
      {when ? <Text style={{ fontSize: 14, color: B.ink3, fontFamily: F.medium, paddingHorizontal: 4, marginTop: -6 }}>{when}</Text> : null}

      {info.channels.length === 0 ? (
        <View style={{ marginTop: 16 }}>
          <Message title="Jeszcze bez języków" body="Języki tłumaczenia nie zostały jeszcze dodane. Zajrzyj tu za chwilę." />
        </View>
      ) : (
        <>
          <SectionLabel>Wybierz język</SectionLabel>
          <View accessibilityRole="radiogroup" style={{ gap: 10 }}>
            {info.channels.map((c) => (
              <ChannelButton key={c.id} c={c} selected={L.selected === c.id} onPress={() => L.choose(c.id)} />
            ))}
          </View>
        </>
      )}

      {view ? (
        <View
          accessibilityLiveRegion="polite"
          style={{ marginTop: 16, backgroundColor: B.ink, borderRadius: 22, padding: 18, flexDirection: 'row', gap: 14, alignItems: 'center' }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: view.tone === 'live' ? B.kurkuma : 'rgba(246,244,238,0.12)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {phase === 'connecting' || (phase === 'reconnecting' && L.online) ? (
              <ActivityIndicator color={B.onDark} />
            ) : phase === 'reconnecting' ? (
              <WifiOff size={20} color={B.onDark} />
            ) : view.tone === 'live' ? (
              <Headphones size={20} color={B.ink} />
            ) : (
              <Radio size={20} color={B.onDark} />
            )}
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ fontSize: 16, color: B.onDark, fontFamily: F.bold }}>{view.title}</Text>
            <Text style={{ fontSize: 13, lineHeight: 18, color: B.onDarkMuted, fontFamily: F.medium }}>{view.body}</Text>
          </View>
        </View>
      ) : null}

      {L.hint ? (
        <Text accessibilityRole="alert" style={{ marginTop: 12, fontSize: 14, color: B.danger, fontFamily: F.semibold, paddingHorizontal: 4 }}>
          {L.hint}
        </Text>
      ) : null}

      {info.channels.length ? (
        active ? (
          <Pressable
            onPress={L.stop}
            accessibilityRole="button"
            className="active:opacity-80"
            style={{ marginTop: 16, height: 58, borderRadius: 29, backgroundColor: B.card, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center' }}
          >
            <Square size={18} color={B.ink} fill={B.ink} />
            <Text style={{ fontSize: 17, color: B.ink, fontFamily: F.bold }}>Zatrzymaj</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={L.listen}
            accessibilityRole="button"
            className="active:opacity-80"
            style={{ marginTop: 16, height: 58, borderRadius: 29, backgroundColor: B.kurkuma, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center' }}
          >
            <Headphones size={20} color={B.ink} />
            <Text style={{ fontSize: 17, color: B.ink, fontFamily: F.bold }}>Słuchaj</Text>
          </Pressable>
        )
      ) : null}

      <View style={{ marginTop: 18, gap: 8, paddingHorizontal: 4 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Smartphone size={15} color={B.ink3} style={{ marginTop: 2 }} />
          <Text style={{ flex: 1, fontSize: 13, lineHeight: 19, color: B.ink3, fontFamily: F.medium }}>
            {ios
              ? 'Gdy już słyszysz tłumacza, możesz zablokować ekran — dźwięk będzie grał dalej. Czekając na tłumacza, zostaw aplikację otwartą.'
              : 'Na Androidzie nie wyłączaj ekranu w trakcie słuchania — aplikacja nie pozwoli mu zgasnąć.'}
          </Text>
        </View>
        <Text style={{ fontSize: 13, lineHeight: 19, color: B.ink3, fontFamily: F.medium, paddingLeft: 23 }}>
          Głośność ustawisz przyciskami telefonu. Najlepiej słuchać w słuchawkach.
        </Text>
        {src.isPublic ? (
          <Text style={{ fontSize: 13, lineHeight: 19, color: B.ink3, fontFamily: F.medium, paddingLeft: 23 }}>
            Nikt nie widzi, kto słucha.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function InterpretationListenerScreen({ eventId, token }: { eventId?: string | null; token?: string | null }) {
  const router = useRouter();
  const src = useMemo(() => (token ? tokenSource(token) : eventId ? memberSource(eventId) : null), [eventId, token]);
  return (
    <ScreenContainer bottomInset={48}>
      {src ? (
        // Klucz źródła — nowy słuchacz przy zmianie wydarzenia / linku.
        <ListenerBody key={src.key} src={src} />
      ) : (
        <>
          <PageHeader title="Tłumaczenie na żywo" showBack />
          <View style={{ paddingHorizontal: 16 }}>
            <Message title="Nie znaleziono tłumaczenia" body="Ten link nie działa." />
            <Pressable onPress={() => goBack(router)} accessibilityRole="button" style={{ marginTop: 12, minHeight: 44, justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, color: B.ink, fontFamily: F.bold }}>Wróć</Text>
            </Pressable>
          </View>
        </>
      )}
    </ScreenContainer>
  );
}
