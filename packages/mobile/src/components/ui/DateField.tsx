import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, X } from 'lucide-react-native';

// Pola daty i godziny bez natywnego pickera (ten wymagałby nowego buildu).
// Data: siatka miesiąca w okienku (stuknięcie w nagłówek → wybór miesiąca i roku);
// godzina: kółka godzin i minut jak w iOS, w arkuszu od dołu. Nic nie wpisuje się z ręki.

export const toYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromYmd = (s: string) => {
  const [y, m, d] = String(s || '').split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
};

const INK = '#2A2312';
const INK2 = '#4A463E';
const INK3 = '#6B6557';
const INK4 = '#857F70';
const PAPER = '#F6F4EE';
const WELL = '#ECE8DE';
const KURKUMA = '#FFBE0B';
const KURKUMA_SOFT = '#FFF1C2';
const GOLD = '#8A6606';

const WEEK = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
const MONTHS = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const fieldStyle = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 10,
  height: 46,
  borderRadius: 14,
  paddingHorizontal: 14,
  backgroundColor: WELL,
};

const ClearButton = ({ onPress }: { onPress: () => void }) => (
  <Pressable onPress={onPress} hitSlop={10} accessibilityLabel="Wyczyść" className="active:opacity-60">
    <X size={16} color={INK4} />
  </Pressable>
);

const Pill = ({ label, onPress, active }: { label: string; onPress: () => void; active?: boolean }) => (
  <Pressable
    onPress={onPress}
    className="active:opacity-70"
    style={{ paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, backgroundColor: active ? INK : WELL }}
  >
    <Text style={{ fontSize: 13, color: active ? '#fff' : INK, fontFamily: 'Manrope_600SemiBold' }}>{label}</Text>
  </Pressable>
);

// ── Data ────────────────────────────────────────────────────────────────────

export const DateField = ({
  value,
  onChange,
  optional,
  placeholder = 'Wybierz datę',
  style,
}: {
  value: string;
  onChange: (ymd: string) => void;
  // Puste dozwolone (np. termin zadania, data urodzenia) — krzyżyk w polu i „Wyczyść”.
  optional?: boolean;
  placeholder?: string;
  // Wygląd pola dopasowany do formularza (np. białe pola z ramką).
  style?: ViewStyle;
}) => {
  const [open, setOpen] = useState(false);
  const selected = fromYmd(value);
  const base = selected ?? new Date();
  const [anchor, setAnchor] = useState(new Date(base.getFullYear(), base.getMonth(), 1));
  // Okienko: dni miesiąca → miesiące roku → lata (szybki skok, np. do daty urodzenia).
  const [mode, setMode] = useState<'days' | 'months' | 'years'>('days');

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

  const thisYear = new Date().getFullYear();
  const years = useMemo(() => Array.from({ length: thisYear + 6 - 1920 }, (_, i) => thisYear + 5 - i), [thisYear]);

  const todayKey = toYmd(new Date());
  const pick = (ymd: string) => {
    onChange(ymd);
    setOpen(false);
  };
  const shift = (delta: number) =>
    setAnchor(
      mode === 'days'
        ? new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1)
        : new Date(anchor.getFullYear() + delta, anchor.getMonth(), 1),
    );

  return (
    <>
      <Pressable
        onPress={() => {
          setAnchor(new Date(base.getFullYear(), base.getMonth(), 1));
          setMode('days');
          setOpen(true);
        }}
        className="active:opacity-70"
        style={[fieldStyle, style]}
      >
        <CalendarDays size={17} color={INK2} />
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: selected ? INK : INK4, fontFamily: 'Manrope_500Medium' }}>
          {selected ? cap(format(selected, 'EEEE, d MMMM yyyy', { locale: pl })) : placeholder}
        </Text>
        {optional && selected ? <ClearButton onPress={() => onChange('')} /> : null}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          onPress={() => setOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(12,10,9,0.35)', justifyContent: 'center', padding: 20 }}
        >
          <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: PAPER, borderRadius: 22, padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              {mode !== 'years' ? (
                <Pressable onPress={() => shift(-1)} hitSlop={10} className="active:opacity-60" style={{ padding: 6 }}>
                  <ChevronLeft size={20} color={INK} />
                </Pressable>
              ) : (
                <View style={{ width: 32 }} />
              )}
              <Pressable
                onPress={() => setMode(mode === 'days' ? 'months' : mode === 'months' ? 'years' : 'days')}
                className="active:opacity-60"
                style={{ flex: 1, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 16, color: INK, fontFamily: 'Manrope_700Bold' }}>
                  {mode === 'days'
                    ? cap(format(anchor, 'LLLL yyyy', { locale: pl }))
                    : mode === 'months'
                      ? String(anchor.getFullYear())
                      : 'Wybierz rok'}
                </Text>
                <Text style={{ fontSize: 11, color: INK4, fontFamily: 'Manrope_500Medium' }}>
                  {mode === 'days' ? 'Stuknij, by zmienić miesiąc lub rok' : mode === 'months' ? 'Stuknij, by zmienić rok' : 'Stuknij, by wrócić'}
                </Text>
              </Pressable>
              {mode !== 'years' ? (
                <Pressable onPress={() => shift(1)} hitSlop={10} className="active:opacity-60" style={{ padding: 6 }}>
                  <ChevronRight size={20} color={INK} />
                </Pressable>
              ) : (
                <View style={{ width: 32 }} />
              )}
            </View>

            {mode === 'days' ? (
              <>
                <View style={{ flexDirection: 'row' }}>
                  {WEEK.map((w) => (
                    <Text key={w} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: INK4, fontFamily: 'Manrope_700Bold' }}>
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
                      <Pressable key={key} onPress={() => pick(key)} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}>
                        <View
                          style={{
                            flex: 1,
                            borderRadius: 12,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: isSel ? INK : isToday ? KURKUMA_SOFT : 'transparent',
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 14,
                              fontFamily: 'Manrope_600SemiBold',
                              color: isSel ? '#ffffff' : !inMonth ? '#9A9586' : isToday ? GOLD : INK,
                            }}
                          >
                            {d.getDate()}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 10 }}>
                  <Pill label="Dziś" onPress={() => pick(todayKey)} />
                  {optional && value ? <Pill label="Wyczyść" onPress={() => pick('')} /> : null}
                </View>
              </>
            ) : mode === 'months' ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {MONTHS.map((m, i) => {
                  const on = !!selected && selected.getFullYear() === anchor.getFullYear() && selected.getMonth() === i;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => {
                        setAnchor(new Date(anchor.getFullYear(), i, 1));
                        setMode('days');
                      }}
                      style={{ width: '33.33%', padding: 4 }}
                    >
                      <View style={{ height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? INK : WELL }}>
                        <Text style={{ fontSize: 14, color: on ? '#fff' : INK, fontFamily: 'Manrope_600SemiBold' }}>{m}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {years.map((y) => {
                  const on = y === anchor.getFullYear();
                  return (
                    <Pressable
                      key={y}
                      onPress={() => {
                        setAnchor(new Date(y, anchor.getMonth(), 1));
                        setMode('months');
                      }}
                      style={{ width: '25%', padding: 4 }}
                    >
                      <View
                        style={{
                          height: 44,
                          borderRadius: 14,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: on ? INK : y === thisYear ? KURKUMA_SOFT : WELL,
                        }}
                      >
                        <Text style={{ fontSize: 14, color: on ? '#fff' : INK, fontFamily: 'Manrope_600SemiBold' }}>{y}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

// ── Godzina ─────────────────────────────────────────────────────────────────

const ITEM_H = 44;
const VISIBLE = 5;
const pad = (n: number) => String(n).padStart(2, '0');
const parseHm = (hm: string | null | undefined): [number, number] | null => {
  const m = String(hm ?? '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h <= 23 && mi <= 59 ? [h, mi] : null;
};
const toHm = (h: number, m: number) => `${pad(h)}:${pad(m)}`;
const addMinutes = (hm: string, minutes: number) => {
  const p = parseHm(hm);
  if (!p) return hm;
  const total = Math.min(23 * 60 + 55, Math.max(0, p[0] * 60 + p[1] + minutes));
  return toHm(Math.floor(total / 60), total % 60);
};
// Propozycja w siatce co 5 minut.
const roundTo5 = (hm: string) => {
  const [h, m] = parseHm(hm) ?? [18, 0];
  return toHm(h, Math.min(55, Math.round(m / 5) * 5));
};
const nextFullHour = () => toHm(Math.min(23, new Date().getHours() + 1), 0);
const span = (from: string, to: string) => {
  const a = parseHm(from);
  const b = parseHm(to);
  if (!a || !b) return null;
  const d = b[0] * 60 + b[1] - (a[0] * 60 + a[1]);
  if (d <= 0) return null;
  const h = Math.floor(d / 60);
  const m = d % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
};

// Kółko wartości (jak UIPickerView): przewijanie z przyciąganiem, środkowy wiersz = wybór.
const Wheel = ({ values, index, onChange }: { values: string[]; index: number; onChange: (i: number) => void }) => {
  const ref = useRef<ScrollView>(null);
  const [live, setLive] = useState(index);
  const liveRef = useRef(index);
  const momentum = useRef(false);
  const committed = useRef(index);

  // Zmiana z zewnątrz (np. „+1 h”) — przewiń do nowej wartości.
  useEffect(() => {
    if (index === committed.current) return;
    committed.current = index;
    liveRef.current = index;
    setLive(index);
    ref.current?.scrollTo({ y: index * ITEM_H, animated: true });
  }, [index]);

  const clamp = (i: number) => Math.max(0, Math.min(values.length - 1, i));
  const select = (i: number) => {
    committed.current = i;
    liveRef.current = i;
    setLive(i);
    onChange(i);
  };
  const commit = (y: number) => {
    const i = clamp(Math.round(y / ITEM_H));
    if (Math.abs(y - i * ITEM_H) > 1) ref.current?.scrollTo({ y: i * ITEM_H, animated: true });
    select(i);
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = clamp(Math.round(e.nativeEvent.contentOffset.y / ITEM_H));
    if (i !== liveRef.current) {
      liveRef.current = i;
      setLive(i);
    }
  };

  return (
    <ScrollView
      ref={ref}
      style={{ height: ITEM_H * VISIBLE, flexGrow: 0 }}
      contentContainerStyle={{ paddingVertical: ITEM_H * Math.floor(VISIBLE / 2) }}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_H}
      decelerationRate="fast"
      scrollEventThrottle={16}
      onLayout={() => ref.current?.scrollTo({ y: committed.current * ITEM_H, animated: false })}
      onScroll={onScroll}
      onScrollBeginDrag={() => {
        momentum.current = false;
      }}
      onMomentumScrollBegin={() => {
        momentum.current = true;
      }}
      onScrollEndDrag={(e) => {
        const y = e.nativeEvent.contentOffset.y;
        setTimeout(() => {
          if (!momentum.current) commit(y);
        }, 90);
      }}
      onMomentumScrollEnd={(e) => {
        momentum.current = false;
        commit(e.nativeEvent.contentOffset.y);
      }}
    >
      {values.map((v, i) => {
        const d = Math.abs(i - live);
        return (
          <Pressable
            key={v}
            onPress={() => {
              ref.current?.scrollTo({ y: i * ITEM_H, animated: true });
              select(i);
            }}
            style={{ height: ITEM_H, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text
              style={{
                fontSize: d === 0 ? 26 : 21,
                color: d === 0 ? INK : d === 1 ? INK3 : '#B5AE9E',
                fontFamily: d === 0 ? 'Manrope_700Bold' : 'Manrope_500Medium',
                fontVariant: ['tabular-nums'],
              }}
            >
              {v}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
};

export const TimeField = ({
  value,
  onChange,
  placeholder = 'Wybierz',
  title = 'Godzina',
  optional,
  from,
  suggest,
  style,
}: {
  value: string;
  onChange: (hm: string) => void;
  placeholder?: string;
  // Nagłówek arkusza, np. „Początek”, „Koniec”.
  title?: string;
  // Puste dozwolone — krzyżyk w polu i „Wyczyść” w arkuszu.
  optional?: boolean;
  // Godzina początku (dla pola końca): szybkie „+30 min / +1 h…” i czas trwania.
  from?: string | null;
  // Propozycja przy pustym polu (domyślnie: początek + 1 h albo najbliższa pełna godzina).
  suggest?: string;
  style?: ViewStyle;
}) => {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('18:00');
  const valid = !!parseHm(value);
  const fromValid = !!from && !!parseHm(from);

  const openSheet = () => {
    setDraft(valid ? value.slice(0, 5) : roundTo5(suggest ?? (fromValid ? addMinutes(from!, 60) : nextFullHour())));
    setOpen(true);
  };

  const [h, m] = parseHm(draft) ?? [18, 0];
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => pad(i)), []);
  // Minuty co 5; zapisana wartość spoza siatki (np. 18:07) dochodzi do listy.
  const minuteValues = useMemo(() => {
    const base = Array.from({ length: 12 }, (_, i) => i * 5);
    if (!base.includes(m)) base.push(m);
    return base.sort((a, b) => a - b);
  }, [m]);
  const duration = fromValid ? span(from!, draft) : null;

  return (
    <>
      <Pressable onPress={openSheet} className="active:opacity-70" style={[fieldStyle, style]} accessibilityLabel={title}>
        <Clock size={17} color={INK2} />
        <Text
          numberOfLines={1}
          style={{ flex: 1, fontSize: 15, color: valid ? INK : INK4, fontFamily: 'Manrope_500Medium', fontVariant: ['tabular-nums'] }}
        >
          {valid ? value.slice(0, 5) : placeholder}
        </Text>
        {optional && value ? <ClearButton onPress={() => onChange('')} /> : null}
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(12,10,9,0.35)', justifyContent: 'flex-end' }}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: PAPER,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              paddingHorizontal: 20,
              paddingTop: 10,
              paddingBottom: Math.max(insets.bottom, 16) + 4,
            }}
          >
            <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#DDD6C6', marginBottom: 14 }} />
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <View>
                <Text style={{ fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: GOLD, fontFamily: 'Manrope_700Bold' }}>
                  {title}
                </Text>
                <Text
                  style={{
                    marginTop: 2,
                    fontSize: 34,
                    lineHeight: 40,
                    color: INK,
                    fontFamily: 'Manrope_800ExtraBold',
                    letterSpacing: -1,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {draft}
                </Text>
              </View>
              {duration ? (
                <Text style={{ marginBottom: 8, fontSize: 13, color: INK3, fontFamily: 'Manrope_600SemiBold' }}>trwa {duration}</Text>
              ) : null}
            </View>

            <View style={{ marginTop: 12 }}>
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: ITEM_H * Math.floor(VISIBLE / 2),
                  height: ITEM_H,
                  borderRadius: 14,
                  backgroundColor: KURKUMA_SOFT,
                }}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Wheel values={hours} index={h} onChange={(i) => setDraft(toHm(i, m))} />
                </View>
                <Text style={{ fontSize: 26, color: INK, fontFamily: 'Manrope_700Bold', marginTop: -4 }}>:</Text>
                <View style={{ flex: 1 }}>
                  <Wheel
                    values={minuteValues.map(pad)}
                    index={Math.max(0, minuteValues.indexOf(m))}
                    onChange={(i) => setDraft(toHm(h, minuteValues[i]))}
                  />
                </View>
              </View>
            </View>

            {fromValid ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
                {[
                  { label: '+30 min', min: 30 },
                  { label: '+1 h', min: 60 },
                  { label: '+1,5 h', min: 90 },
                  { label: '+2 h', min: 120 },
                  { label: '+3 h', min: 180 },
                ].map((o) => {
                  const v = addMinutes(from!, o.min);
                  return <Pill key={o.label} label={o.label} active={v === draft} onPress={() => setDraft(v)} />;
                })}
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
              {optional && value ? (
                <Pressable
                  onPress={() => {
                    onChange('');
                    setOpen(false);
                  }}
                  className="active:opacity-80"
                  style={{ flex: 1, height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: WELL }}
                >
                  <Text style={{ fontSize: 15, color: INK, fontFamily: 'Manrope_700Bold' }}>Wyczyść</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => {
                  onChange(draft);
                  setOpen(false);
                }}
                className="active:opacity-80"
                style={{ flex: 2, height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: KURKUMA }}
              >
                <Text style={{ fontSize: 15, color: INK, fontFamily: 'Manrope_700Bold' }}>Gotowe</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

export const isValidTime = (hm: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(hm);
