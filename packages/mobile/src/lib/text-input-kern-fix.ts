import { TextInput } from 'react-native';

// Obejście błędu iOS 26 + nowej architektury RN (0.76): natywne widoki pól tekstowych są
// używane ponownie (recykling Fabric), a UITextField zachowuje odstęp liter (NSKern) z
// poprzedniego pola, jeśli nowe pole go nie ustawia. Pole kodu 2FA ma letterSpacing 8 →
// kolejne pola w apce dostawały podpowiedź „r o z s t r z e l o n ą” (np. „n p .  1 8 : 0 0”).
// Jawne letterSpacing: 0 nadpisuje odziedziczoną wartość. Styl pola ma pierwszeństwo,
// więc pola z własnym odstępem (kod 2FA, kod rodzica) działają jak dotąd.
const BASE = { letterSpacing: 0 };

type ForwardRefLike = {
  render?: (props: { style?: unknown }, ref: unknown) => unknown;
  __kernFix?: boolean;
};

const input = TextInput as unknown as ForwardRefLike;
if (typeof input.render === 'function' && !input.__kernFix) {
  const original = input.render;
  input.render = function render(this: unknown, props, ref) {
    return original.call(this, { ...props, style: [BASE, props.style] }, ref);
  };
  input.__kernFix = true;
}
