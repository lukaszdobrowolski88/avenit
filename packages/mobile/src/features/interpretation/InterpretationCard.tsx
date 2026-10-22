import { Pressable, Text, View, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Headphones, Mic } from 'lucide-react-native';
import { B } from '../../components/ui/brand';
import { FONT as F } from '../../lib/fonts';
import { openOnWeb } from '../modules/useModules';
import { CARD_POLL_MS, PERSON_NOTE, cardDataFromSession, cardSummary, cardTeamSections, warningNote, type CardData, type CardTeamSection, type SessionGetFull } from './logic';
import { consoleWebPath } from './logic';
import { nativeListeningAvailable } from './audio';
import { openConsole } from './navigation';
import { fetchSession } from './useListener';

// Karta „Tłumaczenie na żywo” na ekranie wydarzenia (obok „Spotkania online”). Jedno wywołanie
// interp-session-get na wejście w wydarzenie; karta tylko, gdy wydarzenie ma niezakończone
// tłumaczenie z językami (błąd / brak sesji / starszy serwer — bez karty, po cichu).
// Zarządzający, tłumacze i członkowie zespołu Tłumaczeń widzą też, kto tłumaczy (ręcznie / z grafiku,
// niepotwierdzeni, bez konta, ostrzeżenia spoza zespołu) — tylko podgląd; nagłówki kanałów jak
// w module (Służba „Tłumacz EN”), zmiany robi się na webie (karta wydarzenia / moduł Tłumaczenia).
export function InterpretationCard({ eventId, style }: { eventId: number; style?: ViewStyle }) {
  const router = useRouter();
  const q = useQuery({
    queryKey: ['interp-session', eventId],
    queryFn: async () => {
      try {
        // Tylko to, czego potrzebuje karta (cache trafia na dysk — bez linku publicznego i e-maili;
        // imiona tłumaczy tylko, gdy serwer je przysłał: zarządzający albo tłumacz).
        return cardDataFromSession((await fetchSession(eventId)) as SessionGetFull);
      } catch {
        return null;
      }
    },
    staleTime: 15_000,
    retry: false,
    // Odświeżamy tylko, gdy karta jest widoczna (stan „na żywo”).
    refetchInterval: (query) => (cardSummary(query.state.data as CardData | null).show ? CARD_POLL_MS : false),
  });
  const data: CardData | null = q.data ?? null;
  const sum = cardSummary(data);
  if (!sum.show) return null;
  const team = cardTeamSections(data);
  // Konsola: przypisany tłumacz kanału albo zarządzający tłumaczeniem (wejdzie na każdy kanał).
  const interpreter = (data?.my_channels?.length ?? 0) > 0 || !!data?.can_manage;
  const live = sum.live.length > 0;

  return (
    <View style={[{ backgroundColor: B.card, borderRadius: 22, padding: 16, gap: 10 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Headphones size={17} color={B.gold} />
        <Text style={{ flex: 1, fontSize: 15, color: B.ink, fontFamily: F.bold }}>Tłumaczenie na żywo</Text>
        {live ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: B.okBg }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: B.okFg }} />
            <Text style={{ fontSize: 12, color: B.okFg, fontFamily: F.semibold }}>na żywo</Text>
          </View>
        ) : null}
      </View>
      <Text style={{ fontSize: 13, lineHeight: 19, color: B.ink2, fontFamily: F.medium }}>
        {live ? `Teraz nadaje: ${sum.live.join(', ')}.` : `Języki: ${sum.languages.join(', ')}. Tłumacz jeszcze nie zaczął.`}
      </Text>
      {team?.length ? <TeamSections sections={team} /> : null}
      <Pressable
        onPress={() => router.push({ pathname: '/(app)/interpretation/[eventId]', params: { eventId: String(eventId) } } as never)}
        accessibilityRole="button"
        className="active:opacity-70"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: B.ink, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, alignSelf: 'flex-start' }}
      >
        <Headphones size={14} color={B.onDark} />
        <Text style={{ fontSize: 13, color: B.onDark, fontFamily: F.bold }}>Słuchaj tłumaczenia</Text>
      </Pressable>
      {interpreter ? (
        nativeListeningAvailable() ? (
          <Pressable
            onPress={() => openConsole(router, eventId)}
            accessibilityRole="button"
            className="active:opacity-70"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: B.kurkuma, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, alignSelf: 'flex-start' }}
          >
            <Mic size={14} color={B.ink} />
            <Text style={{ fontSize: 13, color: B.ink, fontFamily: F.bold }}>Konsola tłumacza</Text>
          </Pressable>
        ) : (
          // Build bez WebRTC (Expo Go / bardzo stary) — konsola w przeglądarce.
          <Pressable
            onPress={() => void openOnWeb(consoleWebPath(String(eventId)))}
            accessibilityRole="link"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 32 }}
          >
            <Mic size={13} color={B.ink} />
            <Text style={{ fontSize: 12, color: B.ink, fontFamily: F.bold }}>Konsola tłumacza (w przeglądarce)</Text>
          </Pressable>
        )
      ) : null}
    </View>
  );
}

// „Tłumacze” — per język: imiona; z grafiku z plakietką, niepotwierdzeni i bez konta wyszarzeni.
function TeamSections({ sections }: { sections: CardTeamSection[] }) {
  return (
    <View style={{ gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: B.line }}>
      <Text style={{ fontSize: 11, color: B.gold, letterSpacing: 1.2, textTransform: 'uppercase', fontFamily: F.bold }}>Tłumacze</Text>
      {sections.map((sec) => (
        <View key={sec.key} style={{ gap: 3 }}>
          <Text style={{ fontSize: 13, color: B.ink, fontFamily: F.semibold }}>{sec.label}</Text>
          {sec.people.length ? (
            sec.people.map((p) => {
              const muted = p.state !== 'manual' && p.state !== 'schedule';
              const warn = warningNote(p.warning, sec.label);
              return (
                <View key={`${p.state}:${p.name}`} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 6, rowGap: 2 }}>
                  <Text style={{ fontSize: 13, lineHeight: 19, color: muted ? B.ink4 : B.ink2, fontFamily: F.medium }}>{p.name}</Text>
                  {p.state === 'schedule' ? (
                    <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: B.kurkumaSoft }}>
                      <Text style={{ fontSize: 11, color: B.goldDeep, fontFamily: F.semibold }}>z grafiku · potwierdzone</Text>
                    </View>
                  ) : null}
                  {muted ? <Text style={{ fontSize: 12, color: B.ink4, fontFamily: F.medium }}>· {PERSON_NOTE[p.state as keyof typeof PERSON_NOTE]}</Text> : null}
                  {warn ? <Text style={{ fontSize: 12, color: B.goldDeep, fontFamily: F.semibold }}>· {warn}</Text> : null}
                  {p.absent ? <Text style={{ fontSize: 12, color: B.danger, fontFamily: F.semibold }}>· nieobecność</Text> : null}
                </View>
              );
            })
          ) : (
            <Text style={{ fontSize: 13, color: B.ink4, fontFamily: F.medium }}>Brak przypisanego tłumacza</Text>
          )}
        </View>
      ))}
    </View>
  );
}
