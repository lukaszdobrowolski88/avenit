import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StatusBar,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Check, Info, Megaphone, Search, UserPlus, Users, X } from "lucide-react-native";
import { PageHeader } from "../../../src/components/ui/PageHeader";
import { useAuthSession } from "../../../src/lib/auth";
import { usePermissions } from "../../../src/lib/permissions";
import { friendlyError } from "../../../src/lib/errors";
import {
  createGroupConversation,
  findOrCreateDirect,
  usePeopleDirectory,
  type Person,
} from "../../../src/features/messenger/start";
import { chatErrorTitle, useChatPolicy, useDirectAllowed } from "../../../src/features/messenger/plus";

type Mode = "direct" | "group" | "announcement";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");

const Avatar = ({ person }: { person: Person }) =>
  person.avatarUrl ? (
    <Image
      source={{ uri: person.avatarUrl }}
      style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: "#ECE8DE" }}
      contentFit="cover"
    />
  ) : (
    <View
      style={{
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: "#FFF1C2",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: "#8A6606", fontFamily: "Manrope_700Bold", fontSize: 14 }}>
        {initials(person.name) || "?"}
      </Text>
    </View>
  );

export default function NewConversationScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuthSession();
  const myEmail = user?.email ?? null;
  const people = usePeopleDirectory(myEmail);
  const perms = usePermissions();
  // Jak web: zakładanie rozmów wymaga prawa do rozmów i składu (serwer i tak to sprawdza).
  const canCreate =
    perms.can("res:conversations:create") && perms.can("res:conversation_participants:create");

  const [mode, setMode] = useState<Mode>("direct");
  const [query, setQuery] = useState("");
  const [groupName, setGroupName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // K9: polityka rozmów prywatnych kościoła (wszyscy / tylko z liderami / wyłączone).
  const policy = useChatPolicy(!!myEmail).data;
  const dmOff = policy?.dm === "off" || policy?.canStartDirect === false;
  const scope = policy?.scope ?? "all";
  // Przy ograniczeniu (tylko liderzy / ochrona niepełnoletnich) — z kim konkretnie wolno.
  const allowedQuery = useDirectAllowed(
    (people.data ?? []).map((p: Person) => p.email),
    mode === "direct" && !dmOff && (scope === "leaders" || scope === "minors"),
  );
  const allowed = allowedQuery.data ?? {};
  const directBlockedFor = (email: string) => allowed[email.toLowerCase()] === false;
  useEffect(() => {
    if (dmOff && mode === "direct") setMode("group");
  }, [dmOff, mode]);
  const modes = (
    [
      { key: "direct", label: "Prywatna", Icon: UserPlus },
      { key: "group", label: "Grupa", Icon: Users },
      { key: "announcement", label: "Ogłoszenia", Icon: Megaphone },
    ] as const
  ).filter((m) => !(dmOff && m.key === "direct"));
  const policyNote = dmOff
    ? "Rozmowy prywatne są w Twoim kościele wyłączone. Możesz pisać w grupach i kanałach."
    : mode === "direct" && scope === "leaders"
      ? "W Twoim kościele rozmowę prywatną można zacząć tylko z liderem lub administratorem. Z pozostałymi osobami porozmawiasz w grupie."
      : mode === "direct" && scope === "minors"
        ? "Ze względu na ochronę dzieci i młodzieży prywatnie piszesz tylko z rówieśnikami i rodziną. Z dorosłymi porozmawiasz w grupie."
        : null;
  // Ochronę niepełnoletnich (policy.protectMinors) objaśnia serwer przy odmowie (403 DM_NOT_ALLOWED)
  // — stała notka przy każdej rozmowie byłaby szumem.

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all: Person[] = people.data ?? [];
    if (!q) return all;
    return all.filter(
      (p) => p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q),
    );
  }, [people.data, query]);

  const openThread = (id: string) => {
    qc.invalidateQueries({ queryKey: ["conversations"] });
    router.replace({ pathname: "/(app)/messenger/[conversationId]", params: { conversationId: id } });
  };

  const startDirect = async (person: Person) => {
    if (!myEmail || busy) return;
    setBusy(true);
    try {
      openThread(await findOrCreateDirect(myEmail, person.email));
    } catch (e) {
      Alert.alert(
        chatErrorTitle(e, "Nie udało się otworzyć rozmowy"),
        friendlyError(e, "Nie udało się utworzyć rozmowy. Spróbuj ponownie."),
      );
    } finally {
      setBusy(false);
    }
  };

  const isChannel = mode === "announcement";
  const createGroup = async () => {
    if (!myEmail || busy) return;
    const name = groupName.trim();
    if (!name) {
      Alert.alert(
        isChannel ? "Podaj nazwę kanału" : "Podaj nazwę grupy",
        "Nazwa pomoże wszystkim znaleźć rozmowę.",
      );
      return;
    }
    if (selected.length < 1) {
      Alert.alert("Wybierz osoby", isChannel ? "Dodaj do kanału co najmniej jedną osobę." : "Dodaj do grupy co najmniej jedną osobę.");
      return;
    }
    setBusy(true);
    try {
      openThread(await createGroupConversation(myEmail, name, selected, { announcement: isChannel }));
    } catch (e) {
      Alert.alert(
        isChannel ? "Nie udało się utworzyć kanału" : "Nie udało się utworzyć grupy",
        friendlyError(e, isChannel ? "Nie udało się utworzyć kanału. Spróbuj ponownie." : "Nie udało się utworzyć grupy. Spróbuj ponownie."),
      );
    } finally {
      setBusy(false);
    }
  };

  const toggle = (email: string) =>
    setSelected((cur) => (cur.includes(email) ? cur.filter((e) => e !== email) : [...cur, email]));

  const byEmail = useMemo(() => {
    const all: Person[] = people.data ?? [];
    return new Map<string, Person>(all.map((p) => [p.email, p]));
  }, [people.data]);

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: "#F6F4EE" }}>
        <PageHeader
          title="Nowa rozmowa"
          subtitle={mode === "direct" ? "Wybierz osobę" : mode === "group" ? "Załóż grupę" : "Załóż kanał ogłoszeń"}
          showBack
        />

        <View style={{ paddingHorizontal: 16, gap: 10 }}>
          <View style={{ flexDirection: "row", backgroundColor: "#ECE8DE", padding: 4, borderRadius: 14 }}>
            {modes.map(({ key, label, Icon }) => {
              const active = mode === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setMode(key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    paddingVertical: 9,
                    borderRadius: 10,
                    backgroundColor: active ? "#F6F4EE" : "transparent",
                  }}
                >
                  <Icon size={15} color={active ? "#2A2312" : "#7A7466"} />
                  <Text
                    style={{
                      fontSize: 13,
                      color: active ? "#2A2312" : "#6B6557",
                      fontFamily: "Manrope_600SemiBold",
                    }}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {isChannel ? (
            <Text style={{ fontSize: 12, color: "#6B6557", fontFamily: "Manrope_500Medium", lineHeight: 17 }}>
              W kanale ogłoszeń piszą tylko administratorzy. Pozostali czytają i reagują.
            </Text>
          ) : null}

          {policyNote ? (
            <View
              style={{
                flexDirection: "row",
                gap: 8,
                alignItems: "flex-start",
                padding: 10,
                borderRadius: 12,
                backgroundColor: "#FFF8E1",
              }}
            >
              <Info size={15} color="#8A6606" style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontSize: 12, color: "#6B4F05", fontFamily: "Manrope_500Medium", lineHeight: 17 }}>
                {policyNote}
              </Text>
            </View>
          ) : null}

          {mode !== "direct" ? (
            <TextInput
              value={groupName}
              onChangeText={setGroupName}
              accessibilityLabel={isChannel ? "Nazwa kanału ogłoszeń" : "Nazwa grupy"}
              placeholder={isChannel ? "Nazwa kanału, np. Ogłoszenia parafialne" : "Nazwa grupy, np. Zespół na Wielkanoc"}
              placeholderTextColor="#6E685A"
              style={{
                height: 46,
                borderRadius: 14,
                paddingHorizontal: 14,
                backgroundColor: "#ECE8DE",
                fontSize: 15,
                color: "#2A2312",
                fontFamily: "Manrope_500Medium",
              }}
            />
          ) : null}

          {mode !== "direct" && selected.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {selected.map((email) => (
                <Pressable
                  key={email}
                  onPress={() => toggle(email)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    paddingLeft: 10,
                    paddingRight: 8,
                    paddingVertical: 5,
                    borderRadius: 999,
                    backgroundColor: "#FFF1C2",
                  }}
                >
                  <Text style={{ fontSize: 12, color: "#8A6606", fontFamily: "Manrope_600SemiBold" }}>
                    {byEmail.get(email)?.name ?? email}
                  </Text>
                  <X size={12} color="#8A6606" />
                </Pressable>
              ))}
            </View>
          ) : null}

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              height: 42,
              paddingHorizontal: 12,
              borderRadius: 14,
              backgroundColor: "#ECE8DE",
            }}
          >
            <Search size={16} color="#6E685A" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Szukaj po imieniu lub e-mailu"
              placeholderTextColor="#6E685A"
              autoCorrect={false}
              autoCapitalize="none"
              style={{ flex: 1, fontSize: 14, color: "#2A2312", fontFamily: "Manrope_400Regular" }}
            />
          </View>
        </View>

        {perms.ready && !canCreate ? (
          <Text
            style={{ textAlign: "center", marginTop: 32, marginHorizontal: 24, color: "#6B6557", fontFamily: "Manrope_500Medium", lineHeight: 20 }}
          >
            Nie możesz zakładać nowych rozmów. Poproś administratora o dostęp.
          </Text>
        ) : people.isLoading || !perms.ready ? (
          <View style={{ paddingTop: 40 }}>
            <ActivityIndicator color="#2A2312" />
          </View>
        ) : people.isError ? (
          <Text
            style={{ textAlign: "center", marginTop: 32, marginHorizontal: 24, color: "#6B6557", fontFamily: "Manrope_500Medium", lineHeight: 20 }}
          >
            {friendlyError(people.error, "Nie udało się wczytać listy osób. Spróbuj ponownie.")}
          </Text>
        ) : (
          <FlatList
            data={list}
            keyExtractor={(p) => p.email}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 8, paddingTop: 8, paddingBottom: 160 }}
            ListEmptyComponent={
              <Text
                style={{ textAlign: "center", marginTop: 32, color: "#6E685A", fontFamily: "Manrope_500Medium" }}
              >
                {query ? "Nikogo nie znaleziono" : "Brak innych osób z kontem"}
              </Text>
            }
            renderItem={({ item }) => {
              const checked = selected.includes(item.email);
              // K9: z tą osobą rozmowa prywatna jest niedostępna (polityka kościoła / ochrona małoletnich).
              const unavailable = mode === "direct" && directBlockedFor(item.email);
              return (
                <Pressable
                  onPress={() => {
                    if (mode !== "direct") toggle(item.email);
                    else if (unavailable)
                      Alert.alert(
                        "Rozmowa prywatna niedostępna",
                        scope === "minors"
                          ? "Ze względu na ochronę dzieci i młodzieży rozmowy prywatne między osobą niepełnoletnią a dorosłą są wyłączone. Skorzystaj z rozmowy grupowej."
                          : "Rozmowę prywatną można prowadzić tylko z liderem albo administratorem. Napisz w grupie albo w kanale.",
                      );
                    else startDirect(item);
                  }}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={unavailable ? `${item.name}. Rozmowa prywatna niedostępna` : item.name}
                  className="active:opacity-70"
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingVertical: 10,
                    paddingHorizontal: 10,
                    borderRadius: 14,
                    backgroundColor: "transparent",
                    opacity: unavailable ? 0.5 : 1,
                  }}
                >
                  <Avatar person={item} />
                  <View style={{ flex: 1 }}>
                    <Text
                      numberOfLines={1}
                      style={{ fontSize: 15, color: "#2A2312", fontFamily: "Manrope_600SemiBold" }}
                    >
                      {item.name}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{ fontSize: 12, color: "#6B6557", fontFamily: "Manrope_400Regular", marginTop: 1 }}
                    >
                      {unavailable ? "Rozmowa prywatna niedostępna" : item.email}
                    </Text>
                  </View>
                  {mode !== "direct" ? (
                    <View
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        borderWidth: checked ? 0 : 2,
                        borderColor: "#D3CCBC",
                        backgroundColor: checked ? "#2A2312" : "transparent",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {checked ? <Check size={14} color="#ffffff" strokeWidth={3} /> : null}
                    </View>
                  ) : null}
                </Pressable>
              );
            }}
          />
        )}

        {mode !== "direct" && canCreate ? (
          <View style={{ position: "absolute", left: 16, right: 16, bottom: 108 }}>
            <Pressable
              onPress={createGroup}
              disabled={busy}
              className="active:opacity-70"
              style={{
                height: 52,
                borderRadius: 16,
                backgroundColor: "#2A2312",
                alignItems: "center",
                justifyContent: "center",
                opacity: busy ? 0.5 : 1,
              }}
            >
              {busy ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={{ color: "#ffffff", fontSize: 15, fontFamily: "Manrope_600SemiBold" }}>
                  {isChannel ? "Utwórz kanał" : "Utwórz grupę"}
                  {selected.length ? ` (${selected.length + 1} os.)` : ""}
                </Text>
              )}
            </Pressable>
          </View>
        ) : null}

        {mode === "direct" && busy ? (
          <View
            style={{
              position: "absolute",
              inset: 0,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(255,255,255,0.6)",
            }}
          >
            <ActivityIndicator color="#2A2312" />
          </View>
        ) : null}
      </View>
    </>
  );
}
