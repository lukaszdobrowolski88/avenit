import { useMemo, useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from 'lucide-react-native';

// Pola daty i godziny bez natywnego pickera (ten wymagałby nowego buildu).
// Data: siatka miesiąca w okienku; godzina: pole HH:MM z automatycznym dwukropkiem.

export const toYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromYmd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : new Date();
};

const WEEK = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];

const fieldStyle = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 10,
  height: 46,
  borderRadius: 14,
  paddingHorizontal: 14,
  backgroundColor: '#ECE8DE',
};

export const DateField = ({ value, onChange }: { value: string; onChange: (ymd: string) => void }) => {
  const [open, setOpen] = useState(false);
  const selected = fromYmd(value);
  const [anchor, setAnchor] = useState(new Date(selected.getFullYear(), selected.getMonth(), 1));

  const grid = useMemo(() => {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [anchor]);

  const label = format(selected, 'EEEE, d MMMM yyyy', { locale: pl });
  const title = format(anchor, 'LLLL yyyy', { locale: pl });
  const todayKey = toYmd(new Date());

  return (
    <>
      <Pressable
        onPress={() => {
          setAnchor(new Date(selected.getFullYear(), selected.getMonth(), 1));
          setOpen(true);
        }}
        className="active:opacity-70"
        style={fieldStyle}
      >
        <CalendarDays size={17} color="#4A463E" />
        <Text style={{ flex: 1, fontSize: 15, color: '#2A2312', fontFamily: 'Manrope_500Medium' }}>
          {label.charAt(0).toUpperCase() + label.slice(1)}
        </Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          onPress={() => setOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(12,10,9,0.35)', justifyContent: 'center', padding: 20 }}
        >
          <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: '#F6F4EE', borderRadius: 22, padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <Pressable
                onPress={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))}
                hitSlop={10}
                className="active:opacity-60"
                style={{ padding: 6 }}
              >
                <ChevronLeft size={20} color="#2A2312" />
              </Pressable>
              <Text style={{ flex: 1, textAlign: 'center', fontSize: 16, color: '#2A2312', fontFamily: 'Manrope_700Bold' }}>
                {title.charAt(0).toUpperCase() + title.slice(1)}
              </Text>
              <Pressable
                onPress={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))}
                hitSlop={10}
                className="active:opacity-60"
                style={{ padding: 6 }}
              >
                <ChevronRight size={20} color="#2A2312" />
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row' }}>
              {WEEK.map((w) => (
                <Text key={w} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: '#857F70', fontFamily: 'Manrope_700Bold' }}>
                  {w}
                </Text>
              ))}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
              {grid.map((d) => {
                const key = toYmd(d);
                const inMonth = d.getMonth() === anchor.getMonth();
                const isSel = key === value;
                const isToday = key === todayKey;
                return (
                  <Pressable
                    key={key}
                    onPress={() => {
                      onChange(key);
                      setOpen(false);
                    }}
                    style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}
                  >
                    <View
                      style={{
                        flex: 1,
                        borderRadius: 12,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: isSel ? '#2A2312' : isToday ? '#FFF1C2' : 'transparent',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          fontFamily: 'Manrope_600SemiBold',
                          color: isSel ? '#ffffff' : !inMonth ? '#9A9586' : isToday ? '#8A6606' : '#2A2312',
                        }}
                      >
                        {d.getDate()}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

// Godzina HH:MM — dwukropek dopisuje się sam; puste dozwolone gdy `optional`.
export const TimeField = ({
  value,
  onChange,
  placeholder = '19:00',
}: {
  value: string;
  onChange: (hm: string) => void;
  placeholder?: string;
}) => (
  <View style={fieldStyle}>
    <Clock size={17} color="#4A463E" />
    <TextInput
      value={value}
      onChangeText={(t) => {
        const digits = t.replace(/\D/g, '').slice(0, 4);
        onChange(digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits);
      }}
      placeholder={placeholder}
      placeholderTextColor="#857F70"
      keyboardType="number-pad"
      maxLength={5}
      style={{ flex: 1, fontSize: 15, color: '#2A2312', fontFamily: 'Manrope_500Medium' }}
    />
  </View>
);

export const isValidTime = (hm: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(hm);
