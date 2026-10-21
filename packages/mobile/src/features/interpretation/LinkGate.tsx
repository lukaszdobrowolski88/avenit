import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '../../components/ui/ScreenContainer';
import { PageHeader } from '../../components/ui/PageHeader';
import { B } from '../../components/ui/brand';
import { FONT as F } from '../../lib/fonts';
import { useAuthSession } from '../../lib/auth';
import { setPendingLink } from '../../lib/pending-link';
import { supabase, tenantWebBase } from '../../lib/supabase';
import { openOnWeb } from '../modules/useModules';
import { InterpretationListenerScreen } from './ListenerScreen';
import { appDomainFromApiUrl, appRouteForLink, browserOnlyUrl, tenantWebUrl } from './logic';

// Bramki linków tłumaczenia otwartych z systemu (Universal Links / App Links, avenit://) — ekrany
// poza (app), więc dostępne bez logowania. Słuchanie publicznym tokenem nie potrzebuje bramki
// (app/listen/[token].tsx); tu: słuchanie z konta i strony, które zostają na webie.

const APP_DOMAIN = appDomainFromApiUrl(process.env.EXPO_PUBLIC_API_URL);

// Zalogowany kościół (po odczycie z pamięci) — null, dopóki nieznany.
function useSessionTenant(): { ready: boolean; signedIn: boolean; tenant: string | null } {
  const { session, loading } = useAuthSession();
  const [tenant, setTenant] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    supabase
      .loadTenant()
      .then((t) => alive && setTenant(t ? String(t).toLowerCase() : null))
      .catch(() => alive && setTenant(null));
    return () => {
      alive = false;
    };
  }, [session]);
  return { ready: !loading && tenant !== undefined, signedIn: !!session, tenant: tenant ?? null };
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ backgroundColor: B.card, borderRadius: 22, padding: 18, gap: 6 }}>
      <Text style={{ fontSize: 17, color: B.ink, fontFamily: F.bold }}>{title}</Text>
      <Text style={{ fontSize: 14, lineHeight: 20, color: B.ink2, fontFamily: F.medium }}>{body}</Text>
    </View>
  );
}

function Button({ label, onPress, primary = false }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="active:opacity-80"
      style={{
        height: 54,
        borderRadius: 27,
        backgroundColor: primary ? B.kurkuma : B.card,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: 16, color: B.ink, fontFamily: F.bold }}>{label}</Text>
    </Pressable>
  );
}

function GateFrame({ children }: { children: ReactNode }) {
  return (
    <ScreenContainer bottomInset={48}>
      <PageHeader title="Tłumaczenie na żywo" showBack />
      <View style={{ paddingHorizontal: 16, gap: 12 }}>{children}</View>
    </ScreenContainer>
  );
}

function Loading() {
  return (
    <GateFrame>
      <View style={{ paddingVertical: 48, alignItems: 'center' }}>
        <ActivityIndicator color={B.ink} />
      </View>
    </GateFrame>
  );
}

const openInBrowser = (url: string) => {
  Linking.openURL(url).catch(() => undefined);
};

// /tlumaczenie/sluchaj/<id>: zalogowany w kościele z linku — słuchacz; bez logowania — logowanie
// i powrót do tego linku; zalogowany w innym kościele — przeglądarka (wydarzenia innego kościoła
// konto stąd nie zobaczy).
export function InterpretationEventLinkGate({ eventId, tenant }: { eventId: string; tenant: string | null }) {
  const router = useRouter();
  const s = useSessionTenant();
  if (!eventId) {
    return (
      <GateFrame>
        <Message title="Nie znaleziono tłumaczenia" body="Ten link nie działa." />
      </GateFrame>
    );
  }
  if (!s.ready) return <Loading />;
  const target = { kind: 'event' as const, eventId };
  const sameChurch = !tenant || (!!s.tenant && s.tenant === tenant);
  if (s.signedIn && sameChurch) return <InterpretationListenerScreen eventId={eventId} />;

  const webUrl = browserOnlyUrl(tenantWebUrl(tenant, APP_DOMAIN, tenantWebBase()), target);
  if (!s.signedIn) {
    return (
      <GateFrame>
        <Message
          title="Zaloguj się, aby słuchać"
          body="Ten link otwiera tłumaczenie z Twojego konta w kościele. Po zalogowaniu wrócisz tutaj."
        />
        <Button
          primary
          label="Zaloguj się"
          onPress={() => {
            setPendingLink(appRouteForLink({ target, tenant }));
            router.replace('/(auth)/login' as never);
          }}
        />
        <Button label="Otwórz w przeglądarce" onPress={() => openInBrowser(webUrl)} />
      </GateFrame>
    );
  }
  return (
    <GateFrame>
      <Message
        title="Link z innego kościoła"
        body="To tłumaczenie należy do innego kościoła niż ten, w którym jesteś zalogowany. Otwórz je w przeglądarce."
      />
      <Button primary label="Otwórz w przeglądarce" onPress={() => openInBrowser(webUrl)} />
    </GateFrame>
  );
}

const WEB_ONLY_PATH = /^\/tlumaczenie\/(?:konsola|oryginal)\/[^/?#]+$/;

// Konsola tłumacza i „Oryginał” zostają na webie: zalogowany w tym kościele — web bez ponownego
// logowania (bilet), inaczej zwykły adres. Te ścieżki są wykluczone z Universal/App Links, więc
// przeglądarka nie odda ich z powrotem aplikacji.
export function InterpretationWebLinkGate({ path, tenant }: { path: string; tenant: string | null }) {
  const s = useSessionTenant();
  const valid = WEB_ONLY_PATH.test(path);
  const opened = useRef(false);
  const sameChurch = !tenant || (!!s.tenant && s.tenant === tenant);
  const open = () => {
    if (s.signedIn && sameChurch) void openOnWeb(path);
    else openInBrowser(`${tenantWebUrl(tenant, APP_DOMAIN, tenantWebBase())}${path}`);
  };
  useEffect(() => {
    if (!valid || !s.ready || opened.current) return;
    opened.current = true;
    open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid, s.ready]);

  if (!valid) {
    return (
      <GateFrame>
        <Message title="Nie znaleziono strony" body="Ten link nie działa." />
      </GateFrame>
    );
  }
  if (!s.ready) return <Loading />;
  return (
    <GateFrame>
      <Message title="Otwieramy w przeglądarce" body="Konsola tłumacza i nadawanie oryginału działają w przeglądarce." />
      <Button label="Otwórz ponownie" onPress={open} />
    </GateFrame>
  );
}
