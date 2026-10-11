// Ile linii dać podpisowi w wąskim miejscu, żeby NIGDY nie łamać słowa w środku (FitLabel).
// Jedno słowo albo słowo dłuższe, niż mieści się w linii → 1 linia (z lekkim zmniejszeniem
// czcionki); kilka krótszych słów → łamanie między słowami, najwyżej maxLines linii.
// Szacunek szerokości znaku: ~0.56 × fontSize (Manrope), z zapasem — lepiej zmniejszyć niż złamać.
export function fitLabelLines(
  text: string,
  { width, fontSize, maxLines = 2 }: { width: number; fontSize: number; maxLines?: number },
): number {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return 1;
  const perLine = Math.max(1, Math.floor(width / (fontSize * 0.56)));
  const longest = Math.max(...words.map((w) => Array.from(w).length));
  if (longest > perLine) return 1;
  return Math.max(1, Math.min(maxLines, words.length));
}
