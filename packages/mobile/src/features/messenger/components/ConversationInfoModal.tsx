import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, Text, View } from "react-native";
import { LogOut, Trash2, X } from "lucide-react-native";
import {
  conversationTitle,
  memberDisplayName,
  memberInitials,
  memberPhotoUrl,
  useDeleteConversation,
  useLeaveConversation,
  type ConversationDetails,
  type MemberMap,
} from "../api";
import { sameEmail } from "../logic";
import { friendlyError } from "../../../lib/errors";
import { toast } from "../../../lib/toast";

// „Szczegóły rozmowy” — skład z rolami, opuszczenie grupy/kanału, usunięcie rozmowy 1:1.
// Te same zasady co web (GroupSettingsModal / ConversationHeader): z kanału służby się nie
// wychodzi (skład wynika z zespołu), jedyny administrator najpierw przekazuje uprawnienia,
// rozmowę 1:1 usuwa jej administrator (obie strony nimi są) — znika u obu osób.

interface Props {
  visible: boolean;
  onClose: () => void;
  details: ConversationDetails | null;
  members: MemberMap;
  myEmail: string | null;
  /** Prawo do opuszczania rozmów (res:conversation_participants:delete). */
  canLeave: boolean;
  /** Prawo do usuwania rozmów (res:conversations:delete). */
  canDelete: boolean;
  /** Po opuszczeniu/usunięciu — powrót do listy. */
  onGone: () => void;
}

export const ConversationInfoModal = ({
  visible,
  onClose,
  details,
  members,
  myEmail,
  canLeave,
  canDelete,
  onGone,
}: Props) => {
  const leave = useLeaveConversation(myEmail);
  const remove = useDeleteConversation(myEmail);
  const [busy, setBusy] = useState(false);

  const people = useMemo(() => {
    const list = details?.participants ?? [];
    // Najpierw administratorzy, potem alfabetycznie; ja na początku swojej grupy.
    return [...list].sort((a, b) => {
      const ra = a.role === "admin" ? 0 : 1;
      const rb = b.role === "admin" ? 0 : 1;
      if (ra !== rb) return ra - rb;
      if (sameEmail(a.email, myEmail)) return -1;
      if (sameEmail(b.email, myEmail)) return 1;
      return memberDisplayName(members, a.email).localeCompare(memberDisplayName(members, b.email), "pl");
    });
  }, [details?.participants, members, myEmail]);

  if (!details) return null;
  const title = conversationTitle(
    { ...details, peer_email: details.participant_emails.find((e) => !sameEmail(e, myEmail)) ?? null },
    members,
  );
  const isDirect = details.type === "direct";
  const isMinistry = details.type === "ministry";
  const amAdmin = details.my_role === "admin";
  const otherAdmins = people.filter((p) => p.role === "admin" && !sameEmail(p.email, myEmail)).length;
  const others = people.filter((p) => !sameEmail(p.email, myEmail)).length;

  const showLeave = canLeave && details.is_participant && !isDirect && !isMinistry;
  const showDelete = canDelete && isDirect && amAdmin;

  const handleLeave = () => {
    if (amAdmin && others > 0 && otherAdmins === 0) {
      Alert.alert(
        "Najpierw przekaż uprawnienia",
        "Jesteś jedynym administratorem. Nadaj komuś uprawnienia administratora w Komunikatorze w przeglądarce, potem opuść rozmowę.",
      );
      return;
    }
    Alert.alert(
      `Opuścić „${title}”?`,
      "Przestaniesz widzieć tę rozmowę i nie dostaniesz nowych wiadomości. Wrócić możesz tylko, jeśli administrator doda Cię ponownie.",
      [
        { text: "Anuluj", style: "cancel" },
        {
          text: "Opuść rozmowę",
          style: "destructive",
          onPress: async () => {
            if (busy) return;
            setBusy(true);
            try {
              await leave.mutateAsync(details.id);
              toast.success(`Opuszczono rozmowę „${title}”`);
              onClose();
              onGone();
            } catch (e) {
              Alert.alert("Nie udało się opuścić rozmowy", friendlyError(e, "Spróbuj ponownie."));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const handleDelete = () => {
    Alert.alert(
      `Usunąć rozmowę z ${title}?`,
      "Rozmowa i wszystkie wiadomości zostaną trwale usunięte u obu osób. Tego nie można cofnąć.",
      [
        { text: "Anuluj", style: "cancel" },
        {
          text: "Usuń rozmowę",
          style: "destructive",
          onPress: async () => {
            if (busy) return;
            setBusy(true);
            try {
              await remove.mutateAsync(details.id);
              toast.success("Rozmowa usunięta");
              onClose();
              onGone();
            } catch (e) {
              Alert.alert("Nie udało się usunąć rozmowy", friendlyError(e, "Spróbuj ponownie."));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#F6F4EE" }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingTop: 16,
            paddingBottom: 12,
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: "#E6E1D5",
          }}
        >
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Zamknij">
            <X size={22} color="#2A2312" />
          </Pressable>
          <Text style={{ flex: 1, fontSize: 16, color: "#2A2312", fontFamily: "Manrope_700Bold", letterSpacing: -0.3 }}>
            Szczegóły rozmowy
          </Text>
          {busy ? <ActivityIndicator color="#2A2312" /> : null}
        </View>

        <FlatList
          data={people}
          keyExtractor={(p) => p.email}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          ListHeaderComponent={
            <View style={{ paddingTop: 16, paddingBottom: 8 }}>
              <Text style={{ fontSize: 20, color: "#2A2312", fontFamily: "Manrope_700Bold", letterSpacing: -0.4 }}>
                {title}
              </Text>
              <Text style={{ fontSize: 13, color: "#6B6557", fontFamily: "Manrope_500Medium", marginTop: 2 }}>
                {isDirect
                  ? "Prywatna rozmowa"
                  : isMinistry
                    ? "Kanał służby — skład wynika z zespołu"
                    : details.type === "announcement"
                      ? "Kanał ogłoszeń — piszą tylko administratorzy"
                      : "Grupa"}
              </Text>
              {!isDirect && !isMinistry && amAdmin ? (
                <Text style={{ fontSize: 12, color: "#6E685A", fontFamily: "Manrope_400Regular", marginTop: 8, lineHeight: 17 }}>
                  Nazwę, skład i role zmienisz w Komunikatorze w przeglądarce.
                </Text>
              ) : null}
              <Text
                style={{
                  fontSize: 11,
                  color: "#6B6557",
                  letterSpacing: 1.4,
                  textTransform: "uppercase",
                  fontFamily: "Manrope_700Bold",
                  marginTop: 18,
                }}
              >
                Uczestnicy ({people.length})
              </Text>
            </View>
          }
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: "#ECE8DE" }} />}
          renderItem={({ item }) => {
            const photo = memberPhotoUrl(members, item.email);
            const me = sameEmail(item.email, myEmail);
            return (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 }}>
                {photo ? (
                  <Image source={{ uri: photo }} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#ECE8DE" }} />
                ) : (
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: "#FFF1C2",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: "#8A6606", fontFamily: "Manrope_700Bold", fontSize: 12 }}>
                      {memberInitials(members, item.email)}
                    </Text>
                  </View>
                )}
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: "#2A2312", fontFamily: "Manrope_600SemiBold" }}>
                  {memberDisplayName(members, item.email)}
                  {me ? " (Ty)" : ""}
                </Text>
                {item.role === "admin" && !isDirect ? (
                  <Text style={{ fontSize: 12, color: "#8A6606", fontFamily: "Manrope_600SemiBold" }}>Administrator</Text>
                ) : null}
              </View>
            );
          }}
          ListFooterComponent={
            showLeave || showDelete ? (
              <View style={{ marginTop: 24, gap: 10 }}>
                {showLeave ? (
                  <Pressable
                    onPress={handleLeave}
                    disabled={busy}
                    accessibilityRole="button"
                    className="active:opacity-70"
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      height: 48,
                      borderRadius: 14,
                      backgroundColor: "#FFFFFF",
                      borderWidth: 1,
                      borderColor: "#E6E1D5",
                      opacity: busy ? 0.5 : 1,
                    }}
                  >
                    <LogOut size={17} color="#B42318" />
                    <Text style={{ fontSize: 15, color: "#B42318", fontFamily: "Manrope_600SemiBold" }}>Opuść rozmowę</Text>
                  </Pressable>
                ) : null}
                {showDelete ? (
                  <Pressable
                    onPress={handleDelete}
                    disabled={busy}
                    accessibilityRole="button"
                    className="active:opacity-70"
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      height: 48,
                      borderRadius: 14,
                      backgroundColor: "#FFFFFF",
                      borderWidth: 1,
                      borderColor: "#E6E1D5",
                      opacity: busy ? 0.5 : 1,
                    }}
                  >
                    <Trash2 size={17} color="#B42318" />
                    <Text style={{ fontSize: 15, color: "#B42318", fontFamily: "Manrope_600SemiBold" }}>Usuń rozmowę</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null
          }
        />
      </View>
    </Modal>
  );
};
