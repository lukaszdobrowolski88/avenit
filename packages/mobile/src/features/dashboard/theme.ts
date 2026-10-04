// Język wizualny pulpitu = księga znaku Avenit (grafiki_avenit): papier jako tło, białe
// karty, tekst w kolorze słodu i jeden akcent — kurkuma (pigułki CTA, liczniki, kropki,
// kropka na końcu nagłówka). Musztarda tylko dla tekstu, który ma być „złoty” (kurkuma na
// jasnym tle jest nieczytelna). Karty bez ramek, cieni i pasków.
export const D = {
  page: '#F6F4EE', // papier
  card: '#FFFFFF',
  // Tło kółek z ikonami i wierszy-pigułek na białej karcie.
  well: '#F6F4EE',
  ink: '#2A2312', // słód
  // Meta (godzina, miejsce, liczniki).
  ink2: '#7A7466',
  // Podpisy, nieaktywne zakładki.
  ink3: '#A8A59E',
  hair: '#ECE8DE',
  accent: '#FFBE0B', // kurkuma
  accentSoft: '#FFF1C2',
  // Musztarda — etykiety wersalikami i „złoty” tekst.
  gold: '#8A6606',
  radius: 26,
} as const;

export const F = {
  light: 'Manrope_300Light',
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extrabold: 'Manrope_800ExtraBold',
} as const;
