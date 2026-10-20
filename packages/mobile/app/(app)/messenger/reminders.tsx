import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StatusBar, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { AlarmClock, MessageSquare, X } from "lucide-react-native";
import { PageHeader } from "../../../src/components/ui/PageHeader";
import { EmptyState } from "../../../src/components/ui/EmptyState";
import { B } from "../../../src/components/ui/brand";
import { friendlyError } from "../../../src/lib/errors";
import { toast } from "../../../src/lib/toast";
import { useCancelReminder, useMyReminders, whenLabel, type ReminderItem } from "../../../src/features/messenger/schedule";

// „Moje przypomnienia” (z nagłówka listy rozmów): aktywne przypomnienia o wiadomościach.
// Stuknięcie otwiera rozmowę przy wiadomości, X usuwa przypomnienie.

const F = { medium: "Manrope_500Medium", semibold: "Manrope_600SemiBold", bold: "Manrope_700Bold" } as const;

export default function RemindersScreen() {
  const router = useRouter();
  const query = useMyReminders();
  const cancel = useCancelReminder();
  const items: ReminderItem[] = query.data ?? [];

  const open = (r: ReminderItem) => {
    if (!r.available) return;
    router.push({
      pathname: "/(app)/messenger/[conversationId]",
      params: { conversationId: r.conversation_id, messageId: r.message_id },
    } as never);
  };

  const remove = (r: ReminderItem) => {
    cancel.mutate(r.id, {
      onSuccess: () => toast.success("Przypomnienie usunięte"),
      onError: (e) => Alert.alert("Nie udało się usunąć", friendlyError(e, "Spróbuj ponownie.")),
    });
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: B.paper }}>
        <PageHeader title="Moje przypomnienia" subtitle="Komunikator" showBack />
        {query.isLoading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={B.ink} />
          </View>
        ) : query.isError && !items.length ? (
          <EmptyState Icon={AlarmClock} title="Nie udało się wczytać przypomnień" hint={friendlyError(query.error, "Sprawdź internet i spróbuj ponownie.")} actionLabel="Spróbuj ponownie" onAction={() => query.refetch()} />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(r) => r.id}
            contentContainerStyle={{ padding: 16, paddingBottom: 120, flexGrow: 1 }}
            refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} />}
            ListEmptyComponent={
              <EmptyState
                Icon={AlarmClock}
                title="Brak przypomnień"
                hint="Przytrzymaj wiadomość i wybierz „Przypomnij mi” — przypomnimy Ci o niej w wybranym terminie."
              />
            }
            renderItem={({ item: r }) => (
              <View style={{ flexDirection: "row", alignItems: "flex-start", backgroundColor: B.card, borderRadius: 16, marginBottom: 10 }}>
                <Pressable
                  onPress={() => open(r)}
                  disabled={!r.available}
                  accessibilityRole="button"
                  accessibilityLabel={`Przypomnienie: ${whenLabel(r.remind_at)}`}
                  className="active:opacity-70"
                  style={{ flex: 1, padding: 14 }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <AlarmClock size={14} color={B.gold} />
                    <Text style={{ fontSize: 12, color: B.ink3, fontFamily: F.bold }}>{whenLabel(r.remind_at)}</Text>
                    {r.conversation_title ? (
                      <Text numberOfLines={1} style={{ flex: 1, fontSize: 12, color: B.ink4, fontFamily: F.medium }}>
                        {`· ${r.conversation_title}`}
                      </Text>
                    ) : null}
                  </View>
                  {r.available ? (
                    <Text numberOfLines={2} style={{ marginTop: 6, fontSize: 15, lineHeight: 21, color: B.ink, fontFamily: F.medium }}>
                      {r.sender_name ? <Text style={{ fontFamily: F.bold }}>{`${r.sender_name}: `}</Text> : null}
                      {r.preview ?? ""}
                    </Text>
                  ) : (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
                      <MessageSquare size={14} color={B.ink4} />
                      <Text style={{ fontSize: 14, color: B.ink4, fontFamily: F.medium }}>Wiadomość jest niedostępna</Text>
                    </View>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => remove(r)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Usuń przypomnienie"
                  className="active:opacity-60"
                  style={{ margin: 10, width: 32, height: 32, borderRadius: 16, backgroundColor: B.paper2, alignItems: "center", justifyContent: "center" }}
                >
                  <X size={16} color={B.ink2} />
                </Pressable>
              </View>
            )}
          />
        )}
      </View>
    </>
  );
}
