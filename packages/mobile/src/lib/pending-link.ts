// Link, który czeka na zalogowanie (np. słuchanie tłumaczenia z konta otwarte linkiem przed
// zalogowaniem). Ustawia go ekran linku przed przejściem do logowania; po zalogowaniu układ (app)
// zabiera go raz i otwiera. Tylko w pamięci — zamknięcie aplikacji go kasuje (to celowe).
let pending: string | null = null;

export const setPendingLink = (route: string | null) => {
  pending = route && route.startsWith('/') ? route : null;
};

export const takePendingLink = (): string | null => {
  const r = pending;
  pending = null;
  return r;
};
