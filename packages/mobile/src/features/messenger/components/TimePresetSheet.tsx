import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { CalendarClock, ChevronRight } from "lucide-react-native";
import { Sheet, FormLabel, PrimaryButton } from "../../../components/ui/Sheet";
import { DateField, TimeField } from "../../../components/ui/DateField";
import { B } from "../../../components/ui/brand";
import {
  PRESET_LABELS,
  fromWarsawYmdHm,
  isValidChatTime,
  warsawYmdHm,
  whenLabel,
  type ChatPreset,
} from "../schedule";

// Arkusz wyboru terminu (zaplanowana wysyłka, „Przypomnij mi”): gotowe terminy + własna data
// i godzina — tylko kółkami (DateField / TimeField), nic nie wpisuje się z ręki. Czas polski.

const F = { medium: "Manrope_500Medium", semibold: "Manrope_600SemiBold", bold: "Manrope_700Bold" } as const;

// Domyślny własny termin: za godzinę, w górę do 5 minut.
const defaultCustom = () => warsawYmdHm(Math.ceil((Date.now() + 60 * 60_000) / (5 * 60_000)) * 5 * 60_000);

interface Props {
  visible: boolean;
  title: string;
  subtitle?: string | null;
  presets: ChatPreset[];
  /** Przy których gotowych terminach pokazać dokładny czas (np. „Za 1 godzinę” → „Dziś 11:00”). */
  detailKeys?: string[];
  confirmLabel: string;
  busy?: boolean;
  onPick: (iso: string) => unknown;
  onClose: () => void;
}

export const TimePresetSheet = ({ visible, title, subtitle, presets, detailKeys = [], confirmLabel, busy, onPick, onClose }: Props) => {
  const [custom, setCustom] = useState(false);
  const [value, setValue] = useState(defaultCustom);
  useEffect(() => {
    if (visible) {
      setCustom(false);
      setValue(defaultCustom());
    }
  }, [visible]);
  const at = useMemo(() => fromWarsawYmdHm(value.ymd, value.hm), [value]);
  const valid = !!at && isValidChatTime(at);

  return (
    <Sheet
      visible={visible}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        custom ? (
          <PrimaryButton
            label={valid && at ? `${confirmLabel} · ${whenLabel(at)}` : confirmLabel}
            disabled={!valid || busy}
            busy={busy}
            onPress={() => (valid && at ? onPick(at.toISOString()) : undefined)}
          />
        ) : null
      }
    >
      <View style={{ backgroundColor: B.card, borderRadius: 16, overflow: "hidden", marginTop: 6 }}>
        {presets.map((p, i) => (
          <Pressable
            key={p.key}
            onPress={() => onPick(p.at.toISOString())}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={PRESET_LABELS[p.key] ?? p.key}
            className="active:opacity-70"
            style={{
              flexDirection: "row",
              alignItems: "center",
              minHeight: 52,
              paddingHorizontal: 16,
              borderTopWidth: i > 0 ? 1 : 0,
              borderTopColor: B.line,
            }}
          >
            <Text style={{ flex: 1, fontSize: 15, color: B.ink, fontFamily: F.semibold }}>{PRESET_LABELS[p.key] ?? p.key}</Text>
            {detailKeys.includes(p.key) ? (
              <Text style={{ fontSize: 13, color: B.ink4, fontFamily: F.medium }}>{whenLabel(p.at)}</Text>
            ) : null}
          </Pressable>
        ))}
        <Pressable
          onPress={() => setCustom((v) => !v)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ expanded: custom }}
          className="active:opacity-70"
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            minHeight: 52,
            paddingHorizontal: 16,
            borderTopWidth: presets.length ? 1 : 0,
            borderTopColor: B.line,
          }}
        >
          <CalendarClock size={18} color={B.ink2} />
          <Text style={{ flex: 1, fontSize: 15, color: B.ink, fontFamily: F.semibold }}>Wybierz datę i godzinę</Text>
          <View style={{ transform: [{ rotate: custom ? "90deg" : "0deg" }] }}>
            <ChevronRight size={18} color={B.ink4} />
          </View>
        </Pressable>
      </View>

      {busy && !custom ? (
        <View style={{ paddingVertical: 16 }}>
          <ActivityIndicator color={B.ink} />
        </View>
      ) : null}

      {custom ? (
        <View>
          <FormLabel>Termin (czas polski)</FormLabel>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <DateField value={value.ymd} onChange={(ymd) => setValue((v) => ({ ...v, ymd }))} />
            </View>
            <View style={{ width: 120 }}>
              <TimeField value={value.hm} onChange={(hm) => setValue((v) => ({ ...v, hm }))} title="Godzina" />
            </View>
          </View>
          {!valid ? (
            <Text style={{ marginTop: 10, fontSize: 13, color: B.danger, fontFamily: F.medium }}>
              Wybierz termin w przyszłości (najwyżej rok naprzód).
            </Text>
          ) : null}
        </View>
      ) : null}
    </Sheet>
  );
};
