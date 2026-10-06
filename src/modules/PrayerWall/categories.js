import { Activity, Users, Wallet, HeartHandshake, Sparkles } from 'lucide-react';
import { tr } from '../../i18n';

// Kategorie intencji (Ściana modlitwy + widżet „Moje modlitwy”). Rozróżnia je ikona, nie kolor —
// bez „tęczy” plakietek i emoji.
export const CATEGORY_CHIP = 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200';
export const CATEGORIES = {
  zdrowie: { label: tr('Zdrowie'), color: CATEGORY_CHIP, Icon: Activity },
  rodzina: { label: tr('Rodzina'), color: CATEGORY_CHIP, Icon: Users },
  finanse: { label: tr('Finanse'), color: CATEGORY_CHIP, Icon: Wallet },
  duchowe: { label: tr('Duchowe'), color: CATEGORY_CHIP, Icon: HeartHandshake },
  inne: { label: tr('Inne'), color: CATEGORY_CHIP, Icon: Sparkles },
};
