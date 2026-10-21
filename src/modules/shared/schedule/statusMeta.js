import { Check, Clock, X as XIcon, CircleDashed, AlertTriangle } from 'lucide-react';
import { tr } from '../../../i18n';

// Status osoby w grafiku (legenda Grafiku) — wspólny dla siatki grafiku (ScheduleTab) i karty
// „Tłumaczenie na żywo” (tłumacze z grafiku Tłumaczeń), żeby oba miejsca mówiły tym samym językiem.
// Kolorowy jest tylko znak, pigułka zostaje neutralna (bez „tęczy”).
export const SCHEDULE_STATUS = {
  accepted: { icon: Check, cls: 'text-green-700 dark:text-green-400', label: () => tr('potwierdzone') },
  pending: { icon: Clock, cls: 'text-amber-700 dark:text-amber-400', label: () => tr('czeka na odpowiedź') },
  rejected: { icon: XIcon, cls: 'text-red-600 dark:text-red-400', label: () => tr('odmowa') },
  draft: { icon: CircleDashed, cls: 'text-gray-400 dark:text-gray-500', label: () => tr('jeszcze nie powiadomiono') },
  noemail: { icon: AlertTriangle, cls: 'text-amber-700 dark:text-amber-400', label: () => tr('brak e-maila — bez powiadomienia') },
};
