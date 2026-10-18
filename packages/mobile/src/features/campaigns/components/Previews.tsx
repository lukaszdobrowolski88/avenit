import { Image, Text, View } from 'react-native';
import { Bell, MessageSquare } from 'lucide-react-native';
import { B } from '../../../components/ui/brand';
import { FONT as F } from '../../../lib/fonts';
import { PUSH_CATEGORIES, type PushAction } from '../api';
import { partsLabel, smsAnalysis } from '../smsEncoding';

// Podgląd jak PushPreview / SmsPreview na webie — powiadomienie na ekranie blokady i dymek SMS.

export const PushPreview = ({
  title,
  body,
  icon,
  categoryId,
  actions,
}: {
  title: string;
  body: string;
  icon?: string | null;
  categoryId?: string | null;
  actions: PushAction[];
}) => {
  const category = PUSH_CATEGORIES.find((c) => c.id === categoryId);
  // Przyciski kategorii z własnymi podpisami z edytora weba (jak effectiveActions na webie).
  const buttons = (category?.actions ?? []).map((a, i) => ({
    label: actions[i]?.label || a.label,
    destructive: actions[i]?.destructive || a.destructive,
  }));
  return (
    <View style={{ borderRadius: 24, backgroundColor: B.paper2, padding: 14 }}>
      <View style={{ borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.92)', overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', gap: 10, padding: 12 }}>
          <View style={{ width: 36, height: 36, borderRadius: 9, backgroundColor: B.kurkuma, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {icon ? <Image source={{ uri: icon }} style={{ width: 36, height: 36 }} /> : <Bell size={18} color={B.ink} />}
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ flex: 1, fontSize: 11, color: B.ink3, letterSpacing: 0.6, textTransform: 'uppercase', fontFamily: F.bold }}>Avenit</Text>
              <Text style={{ fontSize: 11, color: B.ink4, fontFamily: F.medium }}>teraz</Text>
            </View>
            <Text numberOfLines={2} style={{ marginTop: 2, fontSize: 14, color: title ? B.ink : B.ink4, fontFamily: F.bold }}>
              {title || 'Tytuł powiadomienia'}
            </Text>
            <Text numberOfLines={4} style={{ marginTop: 1, fontSize: 13, lineHeight: 18, color: body ? B.ink2 : B.ink4, fontFamily: F.medium }}>
              {body || 'Treść powiadomienia…'}
            </Text>
          </View>
        </View>
        {buttons.slice(0, 3).map((a, i) => (
          <View key={i} style={{ borderTopWidth: 1, borderTopColor: B.line, paddingVertical: 10, alignItems: 'center' }}>
            <Text style={{ fontSize: 14, color: a.destructive ? B.danger : B.ink, fontFamily: F.semibold }}>{a.label}</Text>
          </View>
        ))}
      </View>
      {category && category.id !== 'cm_dismiss_only' ? (
        <Text style={{ marginTop: 8, marginLeft: 4, fontSize: 12, color: B.ink3, fontFamily: F.medium }}>
          Przyciski: {category.label} (zmiana przycisków na webie)
        </Text>
      ) : null}
    </View>
  );
};

export const EncodingBadge = ({ text }: { text: string }) => {
  const a = smsAnalysis(text);
  const unicode = a.encoding === 'unicode';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: unicode ? B.kurkumaSoft : B.okBg }}>
        <Text style={{ fontSize: 11, color: unicode ? B.goldDeep : B.okFg, fontFamily: F.bold }}>{unicode ? 'Unicode' : 'GSM-7'}</Text>
      </View>
      <Text style={{ fontSize: 12, color: B.ink3, fontFamily: F.semibold }}>
        {a.charCount} zn. · {partsLabel(a.parts || 1)}
      </Text>
    </View>
  );
};

export const SmsPreview = ({ sender, body }: { sender: string; body: string }) => (
  <View style={{ borderRadius: 24, backgroundColor: B.card, overflow: 'hidden' }}>
    <View style={{ alignItems: 'center', paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: B.line }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: B.paper2, alignItems: 'center', justifyContent: 'center' }}>
        <MessageSquare size={18} color={B.ink2} />
      </View>
      <Text numberOfLines={1} style={{ marginTop: 4, fontSize: 13, color: B.ink, fontFamily: F.bold }}>
        {sender || 'INFO'}
      </Text>
      <Text style={{ fontSize: 11, color: B.ink4, fontFamily: F.medium }}>SMS</Text>
    </View>
    <View style={{ padding: 14, minHeight: 110 }}>
      <View style={{ alignSelf: 'flex-start', maxWidth: '85%', borderRadius: 18, borderBottomLeftRadius: 6, backgroundColor: B.paper2, paddingHorizontal: 13, paddingVertical: 9 }}>
        <Text style={{ fontSize: 14, lineHeight: 20, color: body ? B.ink : B.ink4, fontFamily: F.medium }}>
          {body || 'Treść SMS pojawi się tutaj…'}
        </Text>
      </View>
      <Text style={{ marginTop: 4, fontSize: 11, color: B.ink4, fontFamily: F.medium }}>teraz</Text>
    </View>
    <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
      <EncodingBadge text={body} />
    </View>
  </View>
);
