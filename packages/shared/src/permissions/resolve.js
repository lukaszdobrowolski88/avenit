// Resolver uprawnień — wspólny dla web i api.
//
// Granty: tablica { role, user_id, capability, allowed }.
//   - grant roli:  { role: 'lider', user_id: null, capability, allowed }
//   - override usera: { role: null, user_id, capability, allowed }
// Subject: { role, userId, isAdmin }.
//
// Precedencja: override użytkownika > grant roli; w obrębie tego samego poziomu
// wygrywa grant BARDZIEJ szczegółowy (exact bije wildcard), a przy równej
// szczegółowości — zakaz (allowed=false) wygrywa (bezpieczniej). Brak grantu = deny.

// Czy grant `grantCap` (może zawierać '*') pasuje do żądanego `wantCap`.
function matchCap(grantCap, wantCap) {
  if (grantCap === '*') return true;
  if (grantCap === wantCap) return true;
  const g = grantCap.split(':');
  const w = wantCap.split(':');
  if (g.length !== w.length) return false;
  for (let i = 0; i < g.length; i++) {
    if (g[i] !== '*' && g[i] !== w[i]) return false;
  }
  return true;
}

// Szczegółowość: liczba segmentów bez '*' (więcej = bardziej szczegółowy).
function specificity(grantCap) {
  if (grantCap === '*') return 0;
  return grantCap.split(':').filter((s) => s !== '*').length;
}

// Zwraca boolean dla capability wg precedencji. Domyślnie deny.
export function can(grants, subject, capability) {
  if (subject && subject.isAdmin) return true;
  const role = subject && subject.role;
  const userId = subject && subject.userId;

  // Zbierz decyzje z override usera i z roli.
  let userBest = null; // { spec, allowed }
  let roleBest = null;
  for (const grantRow of grants || []) {
    if (!matchCap(grantRow.capability, capability)) continue;
    const spec = specificity(grantRow.capability);
    const isUser = grantRow.user_id != null && userId != null && grantRow.user_id === userId;
    const isRole = grantRow.role != null && grantRow.role === role;
    if (!isUser && !isRole) continue;
    const bucket = isUser ? 'user' : 'role';
    const cur = bucket === 'user' ? userBest : roleBest;
    // wybierz bardziej szczegółowy; przy remisie deny (false) wygrywa
    let take = false;
    if (!cur) take = true;
    else if (spec > cur.spec) take = true;
    else if (spec === cur.spec && cur.allowed === true && grantRow.allowed === false) take = true;
    if (take) {
      const next = { spec, allowed: grantRow.allowed === true };
      if (bucket === 'user') userBest = next; else roleBest = next;
    }
  }
  if (userBest) return userBest.allowed;
  if (roleBest) return roleBest.allowed;
  return false;
}

// Fabryka: zamyka granty+subject; zwraca szybki can() + pomocniki pól.
export function makeResolver(grants, subject) {
  const g = grants || [];
  return {
    can: (capability) => can(g, subject, capability),
    // Pola: model OPT-OUT — kolumna widoczna/edytowalna dopóki nie ma jawnego zakazu.
    fieldReadable: (resource, column) => !fieldDenied(g, subject, resource, column, 'read'),
    fieldWritable: (resource, column) => !fieldDenied(g, subject, resource, column, 'write'),
  };
}

// Czy pole jest JAWNIE zabronione (grant field:...:read|write = false z precedencją).
export function fieldDenied(grants, subject, resource, column, mode) {
  if (subject && subject.isAdmin) return false;
  const cap = `field:${resource}:${column}:${mode}`;
  const role = subject && subject.role;
  const userId = subject && subject.userId;
  let userBest = null, roleBest = null;
  for (const grantRow of grants || []) {
    if (!matchCap(grantRow.capability, cap)) continue;
    const spec = specificity(grantRow.capability);
    const isUser = grantRow.user_id != null && userId != null && grantRow.user_id === userId;
    const isRole = grantRow.role != null && grantRow.role === role;
    if (!isUser && !isRole) continue;
    const cur = isUser ? userBest : roleBest;
    let take = false;
    if (!cur) take = true;
    else if (spec > cur.spec) take = true;
    else if (spec === cur.spec && cur.allowed === true && grantRow.allowed === false) take = true;
    if (take) { const next = { spec, allowed: grantRow.allowed === true }; if (isUser) userBest = next; else roleBest = next; }
  }
  const best = userBest || roleBest;
  // brak grantu → nie zabronione (widoczne/edytowalne); grant allowed=false → zabronione
  return best ? best.allowed === false : false;
}
