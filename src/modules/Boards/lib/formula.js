// Bezpieczny ewaluator formuł kolumny „formula".
// Wyrażenie odwołuje się do innych kolumn po nazwie w klamrach: {Budżet} * 2 + {Ocena}
// Obsługiwane: liczby, + - * / ( ), oraz funkcje sum/avg/min/max nie są potrzebne
// (formuła działa na wartościach JEDNEGO elementu).

// Zbuduj mapę nazwa→wartość liczbowa z komórek elementu.
function numericValues(item, columns) {
  const map = {};
  for (const col of columns) {
    const v = item.cells?.[col.id];
    let num = 0;
    if (typeof v === 'number') num = v;
    else if (col.type === 'checkbox') num = v ? 1 : 0;
    else if (col.type === 'rating' || col.type === 'progress') num = Number(v) || 0;
    map[col.name] = num;
  }
  return map;
}

export function evalFormula(expression, item, columns) {
  if (!expression) return null;
  const values = numericValues(item, columns);
  // Podstaw {Nazwa} → wartość
  let expr = expression.replace(/\{([^}]+)\}/g, (_, name) => {
    const key = name.trim();
    return String(values[key] ?? 0);
  });
  // Sanityzacja: tylko liczby, operatory, kropki, nawiasy, spacje
  if (!/^[\d.+\-*/()%\s]*$/.test(expr)) return null;
  if (!expr.trim()) return null;
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('"use strict"; return (' + expr + ');');
    const res = fn();
    if (typeof res !== 'number' || !isFinite(res)) return null;
    return Math.round(res * 100) / 100;
  } catch {
    return null;
  }
}
