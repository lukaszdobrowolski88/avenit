import { interpretationTargetFromPath } from '../src/features/interpretation/logic';

// Linki systemowe (avenit://…) przed dopasowaniem trasy. Przepisujemy WYŁĄCZNIE ścieżki weba
// tłumaczenia na żywo (avenit://tlumaczenie/<token>, avenit://tlumaczenie/sluchaj/<id>) na ekran
// słuchacza; każdy inny adres wraca bez zmian (dotychczasowe zachowanie).
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string | null {
  try {
    const bare = String(path ?? '').replace(/^(?:avenit|schtomy):\/\//i, '/');
    if (!/^\/*tlumaczenie\//i.test(bare)) return path;
    const t = interpretationTargetFromPath(bare);
    if (t?.kind === 'event') return `/interpretation/${encodeURIComponent(t.eventId)}`;
    if (t?.kind === 'token') return `/interpretation/link/${t.token}`;
    return path;
  } catch {
    return path;
  }
}
