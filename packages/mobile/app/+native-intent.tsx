import { appDomainFromApiUrl, appLinkFromUrl, appRouteForLink } from '../src/features/interpretation/logic';

const APP_DOMAIN = appDomainFromApiUrl(process.env.EXPO_PUBLIC_API_URL);

// Linki systemowe przed dopasowaniem trasy. Przepisujemy WYŁĄCZNIE linki tłumaczenia na żywo:
//   • Universal Link / App Link https://<kościół>.avenit.pl/tlumaczenie/<token> (kod QR, plakat)
//     i …/tlumaczenie/sluchaj/<id> — host = kościół z linku;
//   • avenit://tlumaczenie/<token>[?tenant=<kościół>], avenit://tlumaczenie/sluchaj/<id>.
// Cel to publiczne ekrany /listen/… (poza (app), działają bez logowania); avenit://tlumaczenie/
// konsola/<id> → /listen/console/<id> (bramka logowania, potem konsola w aplikacji); „Oryginał”
// i konsola z linku https (wykluczona z Universal/App Links) → /listen/web (przeglądarka).
// Każdy inny adres wraca bez zmian.
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string | null {
  try {
    const link = appLinkFromUrl(path, APP_DOMAIN);
    return link ? appRouteForLink(link) : path;
  } catch {
    return path;
  }
}
