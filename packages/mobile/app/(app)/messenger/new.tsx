import { useMemo, useState } from "react";
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
import { Check, Search, UserPlus, Users, X } from "lucide-react-native";
import { PageHeader } from "../../../src/components/ui/PageHeader";
import { useAuthSession } from "../../../src/lib/auth";
import {
  createGroupConversation,
  findOrCreateDirect,
  usePeopleDirectory,
  type Person,
} from "../../../src/features/messenger/start";

type Mode = "direct" | "group";

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

  const [mode, setMode] = useState<Mode>("direct");
  const [query, setQuery] = useState("");
  const [groupName, setGroupName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

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
    } catch (e: any) {
      Alert.alert("Nie udało się otworzyć rozmowy", e?.message ?? "Spróbuj ponownie.");
    } finally {
      setBusy(false);
    }
  };

  const createGroup = async () => {
    if (!myEmail || busy) return;
    const name = groupName.trim();
    if (!name) {
      Alert.alert("Podaj nazwę grupy", "Nazwa pomoże wszystkim znaleźć rozmowę.");
      return;
    }
    if (selected.length < 2) {
      Alert.alert("Wybierz osoby", "Grupa potrzebuje co najmniej dwóch osób poza Tobą.");
      return;
    }
    setBusy(true);
    try {
      openThread(await createGroupConversation(myEmail, name, selected));
    } catch (e: any) {
      Alert.alert("Nie udało się utworzyć grupy", e?.message ?? "Spróbuj ponownie.");
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
          subtitle={mode === "direct" ? "Wybierz osobę" : "Załóż grupę"}
          showBack
        />

        <View style={{ paddingHorizontal: 16, gap: 10 }}>
          <View style={{ flexDirection: "row", backgroundColor: "#ECE8DE", padding: 4, borderRadius: 14 }}>
            {(
              [
                { key: "direct", label: "Osoba", Icon: UserPlus },
                { key: "group", label: "Grupa", Icon: Users },
              ] as const
            ).map(({ key, label, Icon }) => {
              const active = mode === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setMode(key)}
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
                      color: active ? "#2A2312" : "#7A7466",
                      fontFamily: "Manrope_600SemiBold",
                    }}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {mode === "group" ? (
            <TextInput
              value={groupName}
              onChangeText={setGroupName}
              placeholder="Nazwa grupy, np. Zespół na Wielkanoc"
              placeholderTextColor="#A8A59E"
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

          {mode === "group" && selected.length > 0 ? (
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
            <Search size={16} color="#A8A59E" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Szukaj po imieniu lub e-mailu"
              placeholderTextColor="#A8A59E"
              autoCorrect={false}
              autoCapitalize="none"
              style={{ flex: 1, fontSize: 14, color: "#2A2312", fontFamily: "Manrope_400Regular" }}
            />
          </View>
        </View>

        {people.isLoading ? (
          <View style={{ paddingTop: 40 }}>
            <ActivityIndicator color="#2A2312" />
          </View>
        ) : (
          <FlatList
            data={list}
            keyExtractor={(p) => p.email}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 8, paddingTop: 8, paddingBottom: 160 }}
            ListEmptyComponent={
              <Text
                style={{ textAlign: "center", marginTop: 32, color: "#A8A59E", fontFamily: "Manrope_500Medium" }}
              >
                {query ? "Nikogo nie znaleziono" : "Brak innych osób z kontem"}
              </Text>
            }
            renderItem={({ item }) => {
              const checked = selected.includes(item.email);
              return (
                <Pressable
                  onPress={() => (mode === "direct" ? startDirect(item) : toggle(item.email))}
                  disabled={busy}
                  className="active:opacity-70"
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingVertical: 10,
                    paddingHorizontal: 10,
                    borderRadius: 14,
                    backgroundColor: "transparent",
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
                      style={{ fontSize: 12, color: "#7A7466", fontFamily: "Manrope_400Regular", marginTop: 1 }}
                    >
                      {item.email}
                    </Text>
                  </View>
                  {mode === "group" ? (
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

        {mode === "group" ? (
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
                  Utwórz grupę{selected.length ? ` (${selected.length + 1} os.)` : ""}
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
