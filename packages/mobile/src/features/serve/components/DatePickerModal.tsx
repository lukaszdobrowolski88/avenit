import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isBefore,
  isSameDay,
  parseISO,
  startOfDay,
  startOfMonth,
  subMonths,
} from 'date-fns';
import { pl } from 'date-fns/locale';

interface Props {
  visible: boolean;
  value: string | null; // YYYY-MM-DD
  minDate?: string | null; // YYYY-MM-DD — dni przed są nieaktywne
  title?: string;
  onSelect: (iso: string) => void;
  onClose: () => void;
}

const WEEKDAYS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];

export const DatePickerModal = ({ visible, value, minDate, title, onSelect, onClose }: Props) => {
  const initial = value ? parseISO(value) : new Date();
  const [cursor, setCursor] = useState(startOfMonth(initial));

  const selected = value ? parseISO(value) : null;
  const min = minDate ? startOfDay(parseISO(minDate)) : null;

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  // Przesunięcie: tydzień zaczyna się od poniedziałku (getDay: 0=niedz).
  const firstDow = (monthStart.getDay() + 6) % 7;
  const leading = Array.from({ length: firstDow }, () => null as Date | null);
  const cells: (Date | null)[] = [...leading, ...days];

  const monthLabel = format(cursor, 'LLLL yyyy', { locale: pl });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', padding: 24 }}
        onPress={onClose}
      >
        <Pressable
          style={{ backgroundColor: '#F6F4EE', borderRadius: 20, padding: 16 }}
          onPress={(e) => e.stopPropagation()}
        >
          {title ? (
            <Text style={{ fontSize: 15, color: '#2A2312', fontFamily: 'Manrope_700Bold', marginBottom: 10 }}>
              {title}
            </Text>
          ) : null}

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Pressable onPress={() => setCursor((c) => subMonths(c, 1))} hitSlop={10} style={navBtn}>
              <ChevronLeft size={18} color="#2A2312" />
            </Pressable>
            <Text style={{ fontSize: 15, color: '#2A2312', fontFamily: 'Manrope_600SemiBold', textTransform: 'capitalize' }}>
              {monthLabel}
            </Text>
            <Pressable onPress={() => setCursor((c) => addMonths(c, 1))} hitSlop={10} style={navBtn}>
              <ChevronRight size={18} color="#2A2312" />
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', marginBottom: 4 }}>
            {WEEKDAYS.map((w) => (
              <Text
                key={w}
                style={{ flex: 1, textAlign: 'center', fontSize: 11, color: '#857F70', fontFamily: 'Manrope_600SemiBold' }}
              >
                {w}
              </Text>
            ))}
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {cells.map((d, i) => {
              if (!d) return <View key={`e-${i}`} style={{ width: `${100 / 7}%`, height: 40 }} />;
              const isSel = selected && isSameDay(d, selected);
              const disabled = min != null && isBefore(startOfDay(d), min);
              return (
                <View key={d.toISOString()} style={{ width: `${100 / 7}%`, height: 40, padding: 2 }}>
                  <Pressable
                    onPress={() => {
                      if (disabled) return;
                      onSelect(format(d, 'yyyy-MM-dd'));
                      onClose();
                    }}
                    disabled={disabled}
                    style={{
                      flex: 1,
                      borderRadius: 10,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isSel ? '#2A2312' : 'transparent',
                      opacity: disabled ? 0.3 : 1,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        color: isSel ? '#ffffff' : '#2A2312',
                        fontFamily: isSel ? 'Manrope_700Bold' : 'Manrope_500Medium',
                      }}
                    >
                      {format(d, 'd')}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const navBtn = {
  width: 34,
  height: 34,
  borderRadius: 17,
  backgroundColor: '#F1EEE6',
  borderWidth: 1,
  borderColor: '#E6E1D5',
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};
