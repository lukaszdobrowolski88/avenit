import { useRouter } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Baby,
  Calendar,
  Clock,
  ExternalLink,
  Home,
  Image as ImageIcon,
  ListChecks,
  MapPin,
  Music,
  Sparkles,
  X,
} from 'lucide-react-native';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import type { AgendaEvent, EventSource } from '../api';

const SOURCE_META: Record<
  EventSource,
  { label: string; tint: string; bg: string; Icon: typeof Calendar }
> = {
  program: { label: 'Program', tint: '#be185d', bg: '#fce7f3', Icon: ListChecks },
  event: { label: 'Wydarzenie', tint: '#0e7490', bg: '#cffafe', Icon: Calendar },
  worship: { label: 'Zespół Uwielbienia', tint: '#9d174d', bg: '#fce7f3', Icon: Music },
  media: { label: 'Media Team', tint: '#1d4ed8', bg: '#dbeafe', Icon: ImageIcon },
  atmosfera: { label: 'Atmosfera Team', tint: '#b45309', bg: '#fef3c7', Icon: Sparkles },
  kids: { label: 'Dzieci', tint: '#047857', bg: '#d1fae5', Icon: Baby },
  homegroups: { label: 'Grupy Domowe', tint: '#6d28d9', bg: '#ede9fe', Icon: Home },
};

interface Props {
  event: AgendaEvent | null;
  onClose: () => void;
}

export const EventDetailSheet = ({ event, onClose }: Props) => {
  const router = useRouter();
  const visible = event != null;
  if (!event) {
    return (
      <Modal visible={false} transparent>
        <View />
      </Modal>
    );
  }

  const meta = SOURCE_META[event.source];
  const start = event.startsAt instanceof Date ? event.startsAt : new Date(event.startsAt);
  const end =
    event.endsAt instanceof Date
      ? event.endsAt
      : event.endsAt
        ? new Date(event.endsAt)
        : null;
  const hasTime = start.getHours() !== 0 || start.getMinutes() !== 0;

  const dateLabel = format(start, 'EEEE, d MMMM yyyy', { locale: pl });
  const dateLabelCap = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);
  const timeRange = hasTime
    ? end
      ? `${format(start, 'HH:mm')} – ${format(end, 'HH:mm')}`
      : format(start, 'HH:mm')
    : 'Cały dzień';

  const goToProgram = () => {
    if (event.source === 'program' && event.programId) {
      onClose();
      setTimeout(() => {
        router.push({
          pathname: '/(app)/programs/[id]',
          params: { id: String(event.programId) },
        });
      }, 220);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={[styles.iconLg, { backgroundColor: meta.bg }]}>
              <meta.Icon size={22} color={meta.tint} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={[styles.tag, { backgroundColor: meta.bg }]}>
                <Text style={[styles.tagText, { color: meta.tint }]}>
                  {meta.label.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.title} numberOfLines={3}>
                {event.title}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <X size={18} color="#1c1917" />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{ paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.row}>
              <View style={styles.iconSm}>
                <Calendar size={16} color="#78716c" strokeWidth={2.2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>DATA</Text>
                <Text style={styles.rowValue}>{dateLabelCap}</Text>
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.iconSm}>
                <Clock size={16} color="#78716c" strokeWidth={2.2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>GODZINA</Text>
                <Text style={styles.rowValue}>{timeRange}</Text>
              </View>
            </View>

            {event.location ? (
              <View style={styles.row}>
                <View style={styles.iconSm}>
                  <MapPin size={16} color="#78716c" strokeWidth={2.2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>LOKALIZACJA</Text>
                  <Text style={styles.rowValue}>{event.location}</Text>
                </View>
              </View>
            ) : null}

            {event.description ? (
              <View style={styles.descBlock}>
                <Text style={styles.rowLabel}>OPIS</Text>
                <Text style={styles.descText}>{event.description}</Text>
              </View>
            ) : null}

            {event.isMine ? (
              <View style={styles.mineBanner}>
                <Text style={styles.mineBannerText}>Masz przypisanie w tym programie.</Text>
              </View>
            ) : null}

            {event.source === 'program' && event.programId ? (
              <Pressable onPress={goToProgram} style={styles.primaryBtn}>
                <ExternalLink size={16} color="#ffffff" strokeWidth={2.4} />
                <Text style={styles.primaryBtnText}>Otwórz program</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    paddingHorizontal: 20,
    paddingBottom: 28,
    maxHeight: '85%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e7e5e4',
    marginBottom: 12,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  iconLg: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fafaf9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tag: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tagText: { fontSize: 10, letterSpacing: 0.8, fontFamily: 'Inter_700Bold' },
  title: {
    marginTop: 6,
    fontSize: 19,
    color: '#0c0a09',
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.4,
    lineHeight: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#f5f5f4',
  },
  iconSm: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#fafaf9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    fontSize: 10,
    letterSpacing: 0.8,
    color: '#78716c',
    fontFamily: 'Inter_700Bold',
    marginBottom: 2,
  },
  rowValue: { fontSize: 14, color: '#0c0a09', fontFamily: 'Inter_500Medium' },
  descBlock: { paddingTop: 12, paddingBottom: 4, borderTopWidth: 1, borderTopColor: '#f5f5f4' },
  descText: {
    marginTop: 6,
    fontSize: 14,
    color: '#1c1917',
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
  },
  mineBanner: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#fdf2f8',
    borderWidth: 1,
    borderColor: '#fbcfe8',
  },
  mineBannerText: { fontSize: 13, color: '#be185d', fontFamily: 'Inter_600SemiBold' },
  primaryBtn: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#ec4899',
    shadowColor: '#ec4899',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryBtnText: {
    fontSize: 14,
    color: '#ffffff',
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.2,
  },
});
