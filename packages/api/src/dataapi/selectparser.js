// Parser stringów select w stylu supabase-js/PostgREST:
//   "*"                          -> wszystkie kolumny
//   "id, title"                  -> lista kolumn
//   "*, forms:form_id (id, x)"   -> embed aliasowany hintem kolumny FK
//   "attachments:mail_attachments(id), labels:mail_message_labels(label:mail_labels(id))"
//                                -> embed to-many z zagnieżdżeniem
// Zwraca { columns: string[], embeds: [{ alias, target, columns, embeds }] }.

export function parseSelect(select) {
  const src = String(select || '*').trim();
  return parseList(src);
}

function parseList(src) {
  const columns = [];
  const embeds = [];
  let depth = 0;
  let token = '';
  const parts = [];
  for (const ch of src) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(token);
      token = '';
    } else {
      token += ch;
    }
  }
  if (token.trim()) parts.push(token);

  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part) continue;
    const parenIdx = findTopLevelParen(part);
    if (parenIdx === -1) {
      columns.push(part);
      continue;
    }
    const head = part.slice(0, parenIdx).trim();
    const inner = part.slice(parenIdx + 1, part.lastIndexOf(')'));
    // head: "alias:target" lub samo "target"
    let alias = head;
    let target = head;
    const colon = head.indexOf(':');
    if (colon !== -1) {
      alias = head.slice(0, colon).trim();
      target = head.slice(colon + 1).trim();
    }
    const nested = parseList(inner);
    embeds.push({ alias, target, columns: nested.columns, embeds: nested.embeds });
  }
  return { columns, embeds };
}

function findTopLevelParen(part) {
  // Pierwszy nawias otwierający (może być po spacji: "forms:form_id (id)")
  return part.indexOf('(');
}
