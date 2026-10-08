// Kolory tablic = paleta aplikacji (STATUS_COLORS z DataTable): sukces / ostrzeżenie / błąd / info /
// neutralny / musztarda marki. Tablice powstały z paletą Monday (#00c875, #fdab3d, #e2445c…) i takie
// kolory siedzą w bazie (settings.labels[].color, board_groups.color) — zamiast migracji mapujemy je
// przy wyświetlaniu, a nowe etykiety i grupy dostają już kolory z palety aplikacji.
import { STATUS_COLORS as APP } from '../../../components/ui/DataTable';

const MONDAY_TO_APP = {
  '#00c875': APP.success, '#037f4c': APP.success, '#9cd326': APP.success,
  '#fdab3d': APP.warning, '#ff642e': APP.warning,
  '#e2445c': APP.danger, '#ff5ac4': APP.danger,
  '#579bfc': APP.info, '#0086c0': APP.info, '#66ccff': APP.info, '#5559df': APP.info,
  '#a25ddc': APP.accent, '#784bd1': APP.accent, '#401694': APP.accent, '#6366f1': APP.accent,
  '#c4c4c4': APP.neutral, '#333333': APP.neutral,
};

export function boardColor(hex) {
  if (!hex) return APP.neutral;
  return MONDAY_TO_APP[String(hex).toLowerCase()] || hex;
}

// Palety do wyboru koloru etykiety/grupy (kolejność = kolejność przydziału nowym etykietom).
export const LABEL_COLORS = [APP.success, APP.warning, APP.danger, APP.info, APP.accent, APP.neutral];
export const GROUP_PALETTE = [APP.accent, APP.info, APP.success, APP.warning, APP.danger, APP.neutral];
