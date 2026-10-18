import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { FileText } from 'lucide-react-native';
import { Sheet } from '../../../components/ui/Sheet';
import { EmptyState } from '../../../components/ui/EmptyState';
import { B } from '../../../components/ui/brand';
import { FONT as F } from '../../../lib/fonts';
import { useTemplates, type CampaignKind, type TemplateRow } from '../api';
import { EncodingBadge } from './Previews';

// Szablony z push_campaign_templates / sms_campaign_templates (jak TemplateGallery na webie —
// tu tylko wybór; tworzenie i edycja szablonów zostaje na webie).
export const TemplateSheet = ({
  visible,
  onClose,
  kind,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  kind: CampaignKind;
  onPick: (t: TemplateRow) => void;
}) => {
  const templates = useTemplates(kind);
  const list: TemplateRow[] = templates.data ?? [];
  return (
    <Sheet visible={visible} onClose={onClose} title="Szablony" eyebrow={kind === 'sms' ? 'Kampania SMS' : 'Kampania push'} subtitle="Wybierz szablon, a treść trafi do kampanii.">
      {templates.isLoading ? <ActivityIndicator color={B.ink} style={{ marginTop: 28 }} /> : null}
      {!templates.isLoading && list.length === 0 ? (
        <EmptyState Icon={FileText} title="Brak szablonów" hint="Szablony dodasz na webie w zakładce Szablony." />
      ) : null}
      <View style={{ gap: 10, marginTop: 6 }}>
        {list.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => {
              onPick(t);
              onClose();
            }}
            accessibilityRole="button"
            accessibilityLabel={`Użyj szablonu ${t.name}`}
            className="active:opacity-70"
            style={{ borderRadius: 20, backgroundColor: B.card, padding: 14 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, color: B.ink, letterSpacing: -0.3, fontFamily: F.bold }}>
                {t.name}
              </Text>
              {t.is_system ? (
                <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: B.paper2 }}>
                  <Text style={{ fontSize: 11, color: B.ink3, fontFamily: F.bold }}>Systemowy</Text>
                </View>
              ) : null}
            </View>
            {kind === 'push' && t.title ? (
              <Text numberOfLines={1} style={{ marginTop: 4, fontSize: 14, color: B.ink2, fontFamily: F.semibold }}>
                {t.title}
              </Text>
            ) : null}
            {kind === 'sms' && t.default_sender ? (
              <Text numberOfLines={1} style={{ marginTop: 4, fontSize: 12, color: B.ink3, fontFamily: F.semibold }}>
                Nadawca: {t.default_sender}
              </Text>
            ) : null}
            <Text numberOfLines={3} style={{ marginTop: 3, fontSize: 13, lineHeight: 18, color: B.ink3, fontFamily: F.medium }}>
              {t.body}
            </Text>
            {kind === 'sms' ? (
              <View style={{ marginTop: 8 }}>
                <EncodingBadge text={t.body ?? ''} />
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
};
