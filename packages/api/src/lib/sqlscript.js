// Wykonywanie wielo-instrukcyjnych skryptów SQL instrukcja-po-instrukcji.
// Powód: node-postgres pool.query(multiStatement) przerywa na pierwszym błędzie
// (inaczej niż psql). Szablon tenanta z założenia zawiera łagodne błędy seedów
// (duplikaty ON CONFLICT, seedy zależne od kolumn), które nie mogą przerwać
// tworzenia całej struktury.

// Dollar-quote-aware podział na instrukcje (identyczny jak w builderze schematu).
export function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let i = 0;
  let dollarTag = null;
  while (i < sql.length) {
    const ch = sql[i];
    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        current += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      current += ch;
      i++;
      continue;
    }
    if (ch === '$') {
      const m = sql.slice(i).match(/^\$[a-zA-Z_]*\$/);
      if (m) {
        dollarTag = m[0];
        current += dollarTag;
        i += dollarTag.length;
        continue;
      }
    }
    if (ch === '-' && sql[i + 1] === '-') {
      const nl = sql.indexOf('\n', i);
      const end = nl === -1 ? sql.length : nl;
      current += sql.slice(i, end);
      i = end;
      continue;
    }
    if (ch === ';') {
      statements.push(current.trim());
      current = '';
      i++;
      continue;
    }
    current += ch;
    i++;
  }
  if (current.trim()) statements.push(current.trim());
  return statements.filter(Boolean);
}

// Wykonuje skrypt; błędy zbiera zamiast przerywać. Zwraca { ok, failed, errors }.
export async function runSqlScript(pool, sql, { onError } = {}) {
  const statements = splitSqlStatements(sql);
  let ok = 0;
  const errors = [];
  for (const stmt of statements) {
    try {
      await pool.query(stmt);
      ok++;
    } catch (err) {
      errors.push({ message: err.message, statement: stmt.slice(0, 120) });
      onError?.(err, stmt);
    }
  }
  return { ok, failed: errors.length, errors };
}
