import { Pressable, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { B } from '../../../components/ui/brand';
import { KIND_META, MEDIA_TYPES, fmtDuration, type PlanItem, type ScheduleKind } from '../schedule';

// Plan programu w karcie: nagłówki sekcji jako pasy kurkumy, elementy z osobą, tonacją,
// momentem (przed/po) i czasem trwania. W trybie edycji wiersz otwiera edytor elementu.

const F = { medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold' } as const;

export const PlanList = ({
  items,
  songs,
  onPressItem,
}: {
  items: PlanItem[];
  songs?: Record<string, { title: string; key: string | null }>;
  onPressItem?: (index: number) => void;
}) => (
  <View style={{ backgroundColor: B.card, borderRadius: 22, overflow: 'hidden' }}>
    {items.map((it, idx) => {
      const kind = ((it?.type as ScheduleKind) in KIND_META ? it.type : 'item') as ScheduleKind;
      const press = onPressItem ? () => onPressItem(idx) : undefined;
      if (kind === 'header') {
        return (
          <Pressable
            key={String(it.id ?? idx)}
            onPress={press}
            disabled={!press}
            className="active:opacity-70"
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: B.kurkumaSoft }}
          >
            <Text style={{ flex: 1, fontSize: 11, letterSpacing: 1.1, textTransform: 'uppercase', color: B.goldDeep, fontFamily: F.bold }}>
              {it.title || 'Sekcja'}
            </Text>
            {press ? <ChevronRight size={15} color={B.goldDeep} /> : null}
          </Pressable>
        );
      }
      const { Icon } = KIND_META[kind];
      const song = kind === 'song' && it.songId != null ? songs?.[String(it.songId)] : null;
      const title = it.title || song?.title || (kind === 'song' ? 'Pieśń' : 'Element');
      const key = it.songKey || song?.key;
      const sub = [
        kind === 'media' ? MEDIA_TYPES.find((m) => m.value === (it.mediaType ?? 'video'))?.label : null,
        it.person,
        key ? `tonacja ${key}` : null,
        it.timing === 'before' ? 'przed' : it.timing === 'after' ? 'po' : null,
        Array.isArray(it.customAttachments) && it.customAttachments.length ? `PDF: ${it.customAttachments.length}` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      return (
        <Pressable
          key={String(it.id ?? idx)}
          onPress={press}
          disabled={!press}
          className="active:opacity-70"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderTopWidth: idx === 0 ? 0 : 1,
            borderTopColor: B.line,
          }}
        >
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: kind === 'song' ? B.kurkumaSoft : B.paper,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon size={15} color={kind === 'song' ? B.gold : B.ink3} strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={2} style={{ fontSize: 15, color: B.ink, fontFamily: F.semibold }}>
              {title}
            </Text>
            {sub ? (
              <Text numberOfLines={1} style={{ marginTop: 1, fontSize: 12, color: B.ink3, fontFamily: F.medium }}>
                {sub}
              </Text>
            ) : null}
            {it.details ? (
              <Text numberOfLines={2} style={{ marginTop: 2, fontSize: 12, color: B.ink4, fontFamily: F.medium }}>
                {it.details}
              </Text>
            ) : null}
          </View>
          {it.duration ? (
            <Text style={{ fontSize: 12, color: B.ink4, fontFamily: F.semibold, fontVariant: ['tabular-nums'] }}>{fmtDuration(it.duration)}</Text>
          ) : null}
          {press ? <ChevronRight size={15} color={B.ink4} /> : null}
        </Pressable>
      );
    })}
  </View>
);
