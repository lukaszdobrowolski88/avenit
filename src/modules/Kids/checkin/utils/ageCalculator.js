/**
 * Oblicza wiek na podstawie roku urodzenia
 */
export function calculateAge(birthYear) {
  if (!birthYear) return null;
  const currentYear = new Date().getFullYear();
  return currentYear - birthYear;
}

/**
 * Znajduje najlepszą lokalizację (salę) dla dziecka na podstawie wieku
 */
export function getSuggestedLocation(birthYear, locations) {
  if (!birthYear || !locations || locations.length === 0) {
    return locations?.[0] || null;
  }

  const age = calculateAge(birthYear);
  if (age === null) return locations[0];

  // Znajdź salę pasującą do zakresu wiekowego
  const match = locations.find(loc =>
    loc.is_active !== false &&
    (loc.min_age === null || loc.min_age === undefined || age >= loc.min_age) &&
    (loc.max_age === null || loc.max_age === undefined || age <= loc.max_age)
  );

  // Jeśli nie znaleziono dopasowania, zwróć pierwszą aktywną lokalizację
  return match || locations.find(loc => loc.is_active !== false) || locations[0];
}

/**
 * Formatuje wiek do wyświetlenia
 */
export function formatAge(birthYear) {
  const age = calculateAge(birthYear);
  if (age === null) return 'Nieznany wiek';

  if (age === 0) return 'Niemowlę';
  if (age === 1) return '1 rok';
  if (age >= 2 && age <= 4) return `${age} lata`;
  return `${age} lat`;
}

/**
 * Sprawdza czy dziecko pasuje do danej lokalizacji
 */
export function isAgeInRange(birthYear, location) {
  if (!birthYear || !location) return true;

  const age = calculateAge(birthYear);
  if (age === null) return true;

  const minOk = location.min_age === null || location.min_age === undefined || age >= location.min_age;
  const maxOk = location.max_age === null || location.max_age === undefined || age <= location.max_age;

  return minOk && maxOk;
}

/**
 * Zwraca opis zakresu wiekowego lokalizacji
 */
export function formatAgeRange(location) {
  if (!location) return '';

  const min = location.min_age;
  const max = location.max_age;

  if ((min === null || min === undefined) && (max === null || max === undefined)) {
    return 'Wszystkie wieki';
  }

  if (min === null || min === undefined) {
    return `Do ${max} lat`;
  }

  if (max === null || max === undefined) {
    return `Od ${min} lat`;
  }

  return `${min}-${max} lat`;
}
