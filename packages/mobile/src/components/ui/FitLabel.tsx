import { Text, type TextProps } from 'react-native';
import { fitLabelLines } from '../../lib/fitLabel';

export { fitLabelLines };

// Podpis w wąskim miejscu (kafelki, etykiety pól), który NIGDY nie łamie słowa w środku
// („Nieobecnośc/i”, „Udostępnion/e”). React Native łamie zbyt długie słowo po literach, gdy
// ma do dyspozycji kilka linii — dlatego: słowo dłuższe, niż mieści się w linii, albo jedno
// słowo → jedna linia z lekkim zmniejszeniem czcionki; kilka krótszych słów → łamanie
// między słowami (do maxLines linii).
//   width     — szerokość miejsca na tekst (pt), fontSize — rozmiar czcionki (do oszacowania).
//   Szacunek: ~0.56 × fontSize na znak (Manrope); z zapasem, żeby lepiej zmniejszyć niż złamać.
type Props = Omit<TextProps, 'numberOfLines' | 'adjustsFontSizeToFit'> & {
  children: string;
  width: number;
  fontSize: number;
  maxLines?: number;
  minimumFontScale?: number;
};

export function FitLabel({ children, width, fontSize, maxLines = 2, minimumFontScale = 0.7, style, ...rest }: Props) {
  const lines = fitLabelLines(children, { width, fontSize, maxLines });
  return (
    <Text
      numberOfLines={lines}
      adjustsFontSizeToFit
      minimumFontScale={minimumFontScale}
      style={[{ fontSize, maxWidth: width }, style]}
      {...rest}
    >
      {children}
    </Text>
  );
}
